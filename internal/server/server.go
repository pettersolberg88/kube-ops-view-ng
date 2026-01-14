package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/pprof"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/pso013/kube-ops-view-ng/internal/k8s"
)

type Server struct {
	watcher        *k8s.Watcher
	mux            *http.ServeMux
	lastUpdateTime int64
}

func NewServer(watcher *k8s.Watcher) *Server {
	s := &Server{
		watcher:        watcher,
		mux:            http.NewServeMux(),
		lastUpdateTime: 0,
	}
	s.routes()
	go s.updateReadyStatus()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/alive", s.handleAlive)
	s.mux.HandleFunc("/api/ready", s.handleReady)
	s.mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	s.mux.HandleFunc("/api/stream", s.handleStream)
	s.mux.HandleFunc("/debug/pprof/", pprof.Index)
	s.mux.HandleFunc("/debug/pprof/{action}", pprof.Index)
	s.mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	s.mux.HandleFunc("/debug/pprof/profile", pprof.Profile)

	// Serve static files
	fs := http.FileServer(http.Dir("web/dist"))
	s.mux.Handle("/", fs)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleAlive(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if time.Now().Unix()-s.lastUpdateTime < 30 {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	} else {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(fmt.Sprintf("Last update was %d seconds ago", time.Now().Unix()-s.lastUpdateTime)))
	}
}

func (s *Server) updateReadyStatus() {
	ch := s.watcher.Subscribe()
	defer s.watcher.Unsubscribe(ch)

	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return
			}
			s.lastUpdateTime = time.Now().Unix()
		}
	}
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	snapshot := s.watcher.GetSnapshot()

	w.Header().Set("Content-Type", "application/json")
	acceptEncoding := r.Header.Get("Accept-Encoding")
	supportsBrotil := strings.Contains(acceptEncoding, "br")

	if supportsBrotil {
		w.Header().Set("Content-Encoding", "br")
		bw := brotli.NewWriter(w)
		if err := json.NewEncoder(bw).Encode(snapshot); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := bw.Close(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		if err := json.NewEncoder(w).Encode(snapshot); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	// Set headers for SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	acceptEncoding := r.Header.Get("Accept-Encoding")
	supportsBrotli := strings.Contains(acceptEncoding, "br")

	var writer io.Writer = w
	var brotliWriter *brotli.Writer
	if supportsBrotli {
		w.Header().Set("Content-Encoding", "br")
		brotliWriter = brotli.NewWriter(w)
		writer = brotliWriter
		defer brotliWriter.Close()
	}

	// Subscribe to updates
	ch := s.watcher.Subscribe()
	defer s.watcher.Unsubscribe(ch)

	// Send initial snapshot
	snapshot := s.watcher.GetSnapshot()
	data, err := json.Marshal(snapshot)
	if err == nil {
		writer.Write([]byte("data: "))
		writer.Write(data)
		writer.Write([]byte("\n\n"))
		if supportsBrotli {
			brotliWriter.Flush()
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	// Stream updates

	updateCount := 0
	for {
		select {
		case <-r.Context().Done():
			return
		case state, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(state)
			if err != nil {
				continue
			}
			updateCount++
			writer.Write([]byte(fmt.Sprintf("id: update-%d\n", updateCount)))
			writer.Write([]byte("data: "))
			writer.Write(data)
			writer.Write([]byte("\n\n"))
			if supportsBrotli {
				brotliWriter.Flush()
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}
}
