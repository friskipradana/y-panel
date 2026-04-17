//go:build windows

package system

func readStorageUsagePlatform(target string) UsageStat {
	return UsageStat{}
}
