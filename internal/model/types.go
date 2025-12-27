package model

// Metrics represents resource usage
type Metrics struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}

// Node represents a Kubernetes node
type Node struct {
	Name                    string            `json:"name"`
	Status                  string            `json:"status"`
	Roles                   []string          `json:"roles"`
	Labels                  map[string]string `json:"labels"`
	Capacity                map[string]string `json:"capacity"`
	Allocatable             map[string]string `json:"allocatable"`
	Metrics                 *Metrics          `json:"metrics,omitempty"`
	Version                 string            `json:"version"`
	KernelVersion           string            `json:"kernel_version"`
	OSImage                 string            `json:"os_image"`
	ContainerRuntimeVersion string            `json:"container_runtime_version"`
}

// ContainerInfo represents detailed container information
type ContainerInfo struct {
	Name     string `json:"name"`
	State    string `json:"state"`
	Ready    bool   `json:"ready"`
	Restarts int    `json:"restarts"`
}

// PodResources represents aggregated resource requests and limits
type PodResources struct {
	CPURequested    string `json:"cpu_requested"`
	CPULimit        string `json:"cpu_limit"`
	MemoryRequested string `json:"memory_requested"`
	MemoryLimit     string `json:"memory_limit"`
}

// Pod represents a Kubernetes pod
type Pod struct {
	Name           string            `json:"name"`
	Namespace      string            `json:"namespace"`
	Status         string            `json:"status"`
	NodeName       string            `json:"node_name"`
	Labels         map[string]string `json:"labels"`
	Metrics        *Metrics          `json:"metrics,omitempty"`
	IP             string            `json:"ip"`
	StartTime      string            `json:"start_time"`
	Restarts       int               `json:"restarts"`
	Containers     []ContainerInfo   `json:"containers"`
	Resources      *PodResources     `json:"resources"`
	ControllerType string            `json:"controller_type"`
}

// ClusterState represents the current state of the cluster
type ClusterState struct {
	Nodes []Node `json:"nodes"`
	Pods  []Pod  `json:"pods"`
}

func (p PodResources) Equals(other PodResources) bool {
	return p.CPURequested == other.CPURequested && p.CPULimit == other.CPULimit && p.MemoryRequested == other.MemoryRequested && p.MemoryLimit == other.MemoryLimit
}

func (p Pod) Equals(other *Pod) bool {
	if p.Name != other.Name {
		return false
	}
	if p.Namespace != other.Namespace {
		return false
	}
	if p.Status != other.Status {
		return false
	}
	if p.NodeName != other.NodeName {
		return false
	}
	if len(p.Labels) != len(other.Labels) {
		return false
	}
	for k, v := range p.Labels {
		if other.Labels[k] != v {
			return false
		}
	}
	if p.Metrics != nil && other.Metrics != nil {
		if !p.Metrics.Equals(*other.Metrics) {
			return false
		}
	}
	if p.IP != other.IP {
		return false
	}
	if p.StartTime != other.StartTime {
		return false
	}
	if p.Restarts != other.Restarts {
		return false
	}
	if len(p.Containers) != len(other.Containers) {
		return false
	}
	for i := range p.Containers {
		if p.Containers[i] != other.Containers[i] {
			return false
		}
	}
	if p.Resources != nil && other.Resources != nil {
		if !p.Resources.Equals(*other.Resources) {
			return false
		}
	}
	if p.ControllerType != other.ControllerType {
		return false
	}
	return true
}

func (m Metrics) Equals(other Metrics) bool {
	return m.CPU == other.CPU && m.Memory == other.Memory
}

func (n Node) Equals(other *Node) bool {
	if n.Name != other.Name {
		return false
	}
	if n.Status != other.Status {
		return false
	}
	if len(n.Roles) != len(other.Roles) {
		return false
	}
	for i := range n.Roles {
		if n.Roles[i] != other.Roles[i] {
			return false
		}
	}
	if len(n.Labels) != len(other.Labels) {
		return false
	}
	for k, v := range n.Labels {
		if other.Labels[k] != v {
			return false
		}
	}
	if len(n.Capacity) != len(other.Capacity) {
		return false
	}
	for k, v := range n.Capacity {
		if other.Capacity[k] != v {
			return false
		}
	}
	if len(n.Allocatable) != len(other.Allocatable) {
		return false
	}
	for k, v := range n.Allocatable {
		if other.Allocatable[k] != v {
			return false
		}
	}
	if n.Metrics != nil && other.Metrics != nil {
		if !n.Metrics.Equals(*other.Metrics) {
			return false
		}
	}
	if n.Version != other.Version {
		return false
	}
	if n.KernelVersion != other.KernelVersion {
		return false
	}
	if n.OSImage != other.OSImage {
		return false
	}
	if n.ContainerRuntimeVersion != other.ContainerRuntimeVersion {
		return false
	}
	return true
}
