//go:build windows

package main

// requireRoot does nothing on Windows: the agent runs there for development only, with no accounts of its own
func requireRoot() error { return nil }
