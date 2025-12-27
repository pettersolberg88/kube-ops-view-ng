package k8s

import (
	"os"
	"path/filepath"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
	"k8s.io/metrics/pkg/client/clientset/versioned"
)

// NewClient creates a new Kubernetes clientset
func NewClient() (*kubernetes.Clientset, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		// Fallback to local config
		var kubeconfig string
		if home := homedir.HomeDir(); home != "" {
			kubeconfig = filepath.Join(home, ".kube", "config")
		} else {
			kubeconfig = os.Getenv("KUBECONFIG")
		}

		// Allow override via env var
		if envKubeConfig := os.Getenv("KUBECONFIG"); envKubeConfig != "" {
			kubeconfig = envKubeConfig
		}

		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, err
		}
	}

	return kubernetes.NewForConfig(config)
}

// NewMetricsClient creates a new Kubernetes metrics clientset
func NewMetricsClient() (*versioned.Clientset, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		// Fallback to local config
		var kubeconfig string
		if home := homedir.HomeDir(); home != "" {
			kubeconfig = filepath.Join(home, ".kube", "config")
		} else {
			kubeconfig = os.Getenv("KUBECONFIG")
		}

		// Allow override via env var
		if envKubeConfig := os.Getenv("KUBECONFIG"); envKubeConfig != "" {
			kubeconfig = envKubeConfig
		}

		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, err
		}
	}

	return versioned.NewForConfig(config)
}
