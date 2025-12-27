package k8s

import (
	"context"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/pso013/kube-ops-view-ng/internal/model"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/metrics/pkg/client/clientset/versioned"
)

// Watcher watches Kubernetes resources and maintains a local cache
type Watcher struct {
	client        *kubernetes.Clientset
	metricsClient *versioned.Clientset
	factory       informers.SharedInformerFactory

	// Local cache
	mu    sync.RWMutex
	nodes map[string]*model.Node
	pods  map[string]*model.Pod

	// Event broadcasting
	subscribersMu    sync.RWMutex
	subscribers      []chan model.ClusterState
	pendingBroadcast bool
	timer            *time.Timer

	active        bool
	pending       bool
	lastSent      time.Time
	interval      time.Duration
	shortInterval time.Duration
}

// NewWatcher creates a new Watcher
func NewWatcher(client *kubernetes.Clientset, metricsClient *versioned.Clientset) *Watcher {
	return &Watcher{
		client:        client,
		metricsClient: metricsClient,
		factory:       informers.NewSharedInformerFactory(client, time.Minute*10),
		nodes:         make(map[string]*model.Node),
		pods:          make(map[string]*model.Pod),
		subscribers:   make([]chan model.ClusterState, 0),
		timer:         nil,
		interval:      time.Second / 5,  // Wait before sending a broadcast after the last sent
		shortInterval: time.Second / 20, // Wait before sending a broadcast after the first received
	}
}

// Subscribe returns a channel that receives cluster state updates
func (w *Watcher) Subscribe() chan model.ClusterState {
	w.subscribersMu.Lock()
	defer w.subscribersMu.Unlock()

	ch := make(chan model.ClusterState, 10)
	w.subscribers = append(w.subscribers, ch)
	return ch
}

// Unsubscribe removes a subscriber channel
func (w *Watcher) Unsubscribe(ch chan model.ClusterState) {
	w.subscribersMu.Lock()
	defer w.subscribersMu.Unlock()

	for i, sub := range w.subscribers {
		if sub == ch {
			close(ch)
			w.subscribers = append(w.subscribers[:i], w.subscribers[i+1:]...)
			break
		}
	}
}

// scheduleBroadcast schedules a broadcast after the throttle interval
func (w *Watcher) scheduleBroadcast() {
	w.subscribersMu.Lock()
	defer w.subscribersMu.Unlock()

	if w.active {
		w.pending = true
		return
	} else {
		w.active = true
		now := time.Now()
		timeSinceLastShipment := now.Sub(w.lastSent)
		if timeSinceLastShipment > w.interval {
			// Send broadcast
			w.lastSent = now
			w.timer = time.AfterFunc(w.shortInterval, func() {
				w.subscribersMu.Lock()
				w.pending = false
				w.subscribersMu.Unlock()
				state := w.GetSnapshot()
				w.subscribersMu.RLock()
				for _, ch := range w.subscribers {
					select {
					case ch <- state:
					default:
						// Skip if channel is full
					}
				}
				w.subscribersMu.RUnlock()
			})
		}
		w.timer = time.AfterFunc(w.interval, func() {
			w.subscribersMu.Lock()
			isPending := w.pending
			if isPending {
				w.lastSent = time.Now()
			} else {
			}
			w.subscribersMu.Unlock()
			if isPending {
				state := w.GetSnapshot()
				w.subscribersMu.RLock()
				for _, ch := range w.subscribers {
					select {
					case ch <- state:
					default:
						// Skip if channel is full
					}
				}
				w.subscribersMu.RUnlock()
			}
			w.subscribersMu.Lock()
			w.active = false
			w.subscribersMu.Unlock()
		})
	}
}

// broadcast schedules sending the current state to all subscribers
func (w *Watcher) broadcast() {
	w.scheduleBroadcast()
}

// Start starts the watcher
func (w *Watcher) Start(stopCh <-chan struct{}) {
	nodeInformer := w.factory.Core().V1().Nodes().Informer()
	podInformer := w.factory.Core().V1().Pods().Informer()

	nodeInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    w.addNode,
		UpdateFunc: w.updateNode,
		DeleteFunc: w.deleteNode,
	})

	podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    w.addPod,
		UpdateFunc: w.updatePod,
		DeleteFunc: w.deletePod,
	})

	w.factory.Start(stopCh)
	w.factory.WaitForCacheSync(stopCh)

	if w.metricsClient != nil {
		go w.pollMetrics(stopCh)
	}
}

func (w *Watcher) pollMetrics(stopCh <-chan struct{}) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	// Initial poll
	w.updateMetrics()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			w.updateMetrics()
		}
	}
}

func (w *Watcher) updateMetrics() {
	ctx := context.Background()

	// Node metrics
	nodeMetrics, err := w.metricsClient.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Error fetching node metrics: %v", err)
	} else {
		w.mu.Lock()
		for _, m := range nodeMetrics.Items {
			if node, ok := w.nodes[m.Name]; ok {
				node.Metrics = &model.Metrics{
					CPU:    m.Usage.Cpu().String(),
					Memory: m.Usage.Memory().String(),
				}
			}
		}
		w.mu.Unlock()
		w.broadcast()
	}

	// Pod metrics
	podMetrics, err := w.metricsClient.MetricsV1beta1().PodMetricses(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Error fetching pod metrics: %v", err)
	} else {
		w.mu.Lock()
		for _, m := range podMetrics.Items {
			if pod, ok := w.pods[m.Name]; ok {
				cpu := resource.NewQuantity(0, resource.DecimalSI)
				mem := resource.NewQuantity(0, resource.BinarySI)

				for _, c := range m.Containers {
					cpu.Add(*c.Usage.Cpu())
					mem.Add(*c.Usage.Memory())
				}

				pod.Metrics = &model.Metrics{
					CPU:    cpu.String(),
					Memory: mem.String(),
				}
			}
		}
		w.mu.Unlock()
		w.broadcast()
	}
}

// GetSnapshot returns a snapshot of the current cluster state
func (w *Watcher) GetSnapshot() model.ClusterState {
	w.mu.RLock()
	defer w.mu.RUnlock()

	nodes := make([]model.Node, 0, len(w.nodes))
	for _, n := range w.nodes {
		nodes = append(nodes, *n)
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Name < nodes[j].Name })

	pods := make([]model.Pod, 0, len(w.pods))
	for _, p := range w.pods {
		pods = append(pods, *p)
	}
	sort.Slice(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })

	return model.ClusterState{
		Nodes: nodes,
		Pods:  pods,
	}
}

// Event Handlers

func (w *Watcher) addNode(obj interface{}) {
	node := obj.(*corev1.Node)
	w.mu.Lock()
	w.nodes[node.Name] = w.convertNode(node)
	w.mu.Unlock()
	w.broadcast()
}

func (w *Watcher) updateNode(old, new interface{}) {
	node := new.(*corev1.Node)
	w.mu.Lock()
	newNode2 := w.convertNode(node)
	existing2, exists := w.nodes[node.Name]
	toBroadcast := false
	if exists {
		if existing2.Metrics != nil {
			newNode2.Metrics = existing2.Metrics
		}
		if !newNode2.Equals(existing2) {
			toBroadcast = true
		}
	}
	w.nodes[node.Name] = newNode2
	w.mu.Unlock()
	if toBroadcast {
		w.broadcast()
	}
}

func (w *Watcher) deleteNode(obj interface{}) {
	node, ok := obj.(*corev1.Node)
	if !ok {
		// Could be DeletedFinalStateUnknown
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			return
		}
		node, ok = tombstone.Obj.(*corev1.Node)
		if !ok {
			return
		}
	}
	w.mu.Lock()
	delete(w.nodes, node.Name)
	w.mu.Unlock()
	w.broadcast()
}

func (w *Watcher) addPod(obj interface{}) {
	pod := obj.(*corev1.Pod)
	w.mu.Lock()
	w.pods[pod.Name] = w.convertPod(pod)
	w.mu.Unlock()
	w.broadcast()
}

func (w *Watcher) updatePod(old, new interface{}) {
	pod := new.(*corev1.Pod)
	w.mu.Lock()
	// Preserve metrics
	newPod2 := w.convertPod(pod)
	existing2, exists := w.pods[pod.Name]
	toBroadcast := false
	if exists {
		if existing2.Metrics != nil {
			newPod2.Metrics = existing2.Metrics
		}
		if !newPod2.Equals(existing2) {
			toBroadcast = true
		}
	}
	w.pods[pod.Name] = newPod2
	w.mu.Unlock()
	if toBroadcast {
		w.broadcast()
	}
}

func (w *Watcher) deletePod(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			return
		}
		pod, ok = tombstone.Obj.(*corev1.Pod)
		if !ok {
			return
		}
	}
	w.mu.Lock()
	delete(w.pods, pod.Name)
	w.mu.Unlock()
	w.broadcast()
}

// Converters

func (w *Watcher) convertNode(n *corev1.Node) *model.Node {
	roles := []string{}
	// Simple role detection logic (can be improved)
	for k := range n.Labels {
		if k == "node-role.kubernetes.io/control-plane" || k == "node-role.kubernetes.io/master" {
			roles = append(roles, "control-plane")
		}
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	capacity := make(map[string]string)
	for k, v := range n.Status.Capacity {
		capacity[string(k)] = v.String()
	}

	allocatable := make(map[string]string)
	for k, v := range n.Status.Allocatable {
		allocatable[string(k)] = v.String()
	}

	status := "NotReady"
	for _, condition := range n.Status.Conditions {
		if condition.Type == corev1.NodeReady {
			if condition.Status == corev1.ConditionTrue {
				status = "Ready"
			} else {
				status = "NotReady"
			}
			break
		}
	}
	if status != "NotReady" {
		if n.Spec.Unschedulable {
			status = "Cordoned"
		}
	}

	return &model.Node{
		Name:                    n.Name,
		Status:                  status,
		Roles:                   roles,
		Labels:                  n.Labels,
		Capacity:                capacity,
		Allocatable:             allocatable,
		Version:                 n.Status.NodeInfo.KubeletVersion,
		KernelVersion:           n.Status.NodeInfo.KernelVersion,
		OSImage:                 n.Status.NodeInfo.OSImage,
		ContainerRuntimeVersion: n.Status.NodeInfo.ContainerRuntimeVersion,
	}
}

func (w *Watcher) convertPod(p *corev1.Pod) *model.Pod {
	restarts := 0
	containers := []model.ContainerInfo{}

	cpuReq := resource.NewQuantity(0, resource.DecimalSI)
	cpuLim := resource.NewQuantity(0, resource.DecimalSI)
	memReq := resource.NewQuantity(0, resource.BinarySI)
	memLim := resource.NewQuantity(0, resource.BinarySI)

	// Process containers
	for _, c := range p.Spec.Containers {
		// Resources
		if q := c.Resources.Requests.Cpu(); q != nil {
			cpuReq.Add(*q)
		}
		if q := c.Resources.Limits.Cpu(); q != nil {
			cpuLim.Add(*q)
		}
		if q := c.Resources.Requests.Memory(); q != nil {
			memReq.Add(*q)
		}
		if q := c.Resources.Limits.Memory(); q != nil {
			memLim.Add(*q)
		}
	}

	for _, cs := range p.Status.ContainerStatuses {
		restarts += int(cs.RestartCount)

		state := "unknown"
		if cs.State.Running != nil {
			state = "running"
		} else if cs.State.Waiting != nil {
			state = "waiting"
		} else if cs.State.Terminated != nil {
			state = "terminated"
		}

		containers = append(containers, model.ContainerInfo{
			Name:     cs.Name,
			State:    state,
			Ready:    cs.Ready,
			Restarts: int(cs.RestartCount),
		})
	}

	startTime := ""
	if p.Status.StartTime != nil {
		startTime = p.Status.StartTime.Time.Format(time.RFC3339)
	}

	// Calculate detailed status
	status := string(p.Status.Phase)
	if p.DeletionTimestamp != nil {
		status = "Terminating"
	} else {
		// Check for init container failures/waiting
		for _, statusInfo := range p.Status.InitContainerStatuses {
			if statusInfo.State.Terminated != nil && statusInfo.State.Terminated.ExitCode != 0 {
				status = "Init:Error"
				break
			}
			if statusInfo.State.Waiting != nil && statusInfo.State.Waiting.Reason != "" {
				status = "Init:" + statusInfo.State.Waiting.Reason
				break
			}
		}

		// Check for container failures/waiting if init containers are fine
		if status == string(p.Status.Phase) {
			for _, statusInfo := range p.Status.ContainerStatuses {
				if statusInfo.State.Waiting != nil && statusInfo.State.Waiting.Reason != "" {
					status = statusInfo.State.Waiting.Reason
					break
				}
				if statusInfo.State.Terminated != nil && statusInfo.State.Terminated.Reason != "" {
					status = statusInfo.State.Terminated.Reason
					break
				}
				if statusInfo.State.Terminated != nil && statusInfo.State.Terminated.Reason == "" {
					if statusInfo.State.Terminated.Signal != 0 {
						status = "Signal:" + string(statusInfo.State.Terminated.Signal)
					} else {
						status = "ExitCode:" + string(statusInfo.State.Terminated.ExitCode)
					}
					break
				}
			}
		}
	}

	// Determine controller type from OwnerReferences
	controllerType := "Standalone"
	if len(p.OwnerReferences) > 0 {
		owner := p.OwnerReferences[0]
		controllerType = owner.Kind
		// Map ReplicaSet to Deployment if possible (most ReplicaSets are owned by Deployments)
		if owner.Kind == "ReplicaSet" {
			controllerType = "Deployment"
		}
	}
	// Check for static pods (no owner and specific annotation)
	if len(p.OwnerReferences) == 0 {
		if _, ok := p.Annotations["kubernetes.io/config.source"]; ok {
			controllerType = "Static"
		}
	}

	return &model.Pod{
		Name:           p.Name,
		Namespace:      p.Namespace,
		Status:         status,
		NodeName:       p.Spec.NodeName,
		Labels:         p.Labels,
		IP:             p.Status.PodIP,
		StartTime:      startTime,
		Restarts:       restarts,
		Containers:     containers,
		ControllerType: controllerType,
		Resources: &model.PodResources{
			CPURequested:    cpuReq.String(),
			CPULimit:        cpuLim.String(),
			MemoryRequested: memReq.String(),
			MemoryLimit:     memLim.String(),
		},
	}
}
