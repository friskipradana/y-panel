//go:build !linux

package accountusage

// Process accounting reads /proc; elsewhere only the containers are counted.
func processUsage(string) Usage { return Usage{} }
