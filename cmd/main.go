package main

import (
	"log"
	"net/http"
	"os"

	"github.com/pso013/kube-ops-view-ng/internal/k8s"
	"github.com/pso013/kube-ops-view-ng/internal/server"
)

func main() {
	log.Println("Starting kube-ops-view-ng...")

	// Initialize Kubernetes client
	client, err := k8s.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}

	// Initialize Metrics client
	metricsClient, err := k8s.NewMetricsClient()
	if err != nil {
		log.Printf("Failed to create Metrics client (metrics will be disabled): %v", err)
	}

	// Start watcher
	watcher := k8s.NewWatcher(client, metricsClient)
	stopCh := make(chan struct{})
	defer close(stopCh)

	go watcher.Start(stopCh)

	// Start HTTP server
	srv := server.NewServer(watcher)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server listening on port %s", port)
	if err := http.ListenAndServe(":"+port, srv); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
