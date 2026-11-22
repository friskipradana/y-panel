//go:build windows

package system

func readStorageUsagePlatform(_ string) UsageStat {
	return UsageStat{}
}
