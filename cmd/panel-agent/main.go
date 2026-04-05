package main

import (
	"log"
	"net/http"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/httpserver"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	srv := httpserver.New(cfg)
	defer func() {
		if err := srv.Close(); err != nil {
			log.Printf("ui-panel-agent close warning: %v", err)
		}
	}()

	log.Printf("ui-panel-agent listening on %s", cfg.BindAddr)
	if err := http.ListenAndServe(cfg.BindAddr, srv); err != nil {
		log.Fatalf("listen and serve: %v", err)
	}
}
