package hostops

import (
	"strings"
	"testing"
)

func TestValidateUnitAndAction(t *testing.T) {
	if !ValidUnitName("nginx.service") || ValidUnitName("nginx;rm -rf") || ValidUnitName("nginx") {
		t.Fatal("ValidUnitName check failed")
	}
	if !ValidServiceAction("restart") || ValidServiceAction("mask") {
		t.Fatal("ValidServiceAction check failed")
	}
}

func TestCronScheduleAndRoundTrip(t *testing.T) {
	if err := ValidateCronSchedule("*/15 * * * *"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := ValidateCronSchedule("@daily"); err != nil {
		t.Fatalf("unexpected error for @daily: %v", err)
	}
	if err := ValidateCronSchedule("bad cron"); err == nil {
		t.Fatal("expected invalid cron error")
	}

	base := "# existing comment\n0 2 * * * /usr/local/bin/other.sh\n"
	withJob := RenderCrontabWithUpsert(base, CronJob{
		ID:       "clean-tmp",
		Name:     "Cleanup Temp",
		Schedule: "0 3 * * *",
		Command:  "/usr/bin/find /tmp -mtime +7 -delete",
		Enabled:  true,
	})
	jobs := ParseCrontab(withJob)
	if len(jobs) != 2 {
		t.Fatalf("expected 2 jobs, got %d: %+v", len(jobs), jobs)
	}
	if !jobs[1].Managed || jobs[1].ID != "clean-tmp" || !jobs[1].Enabled {
		t.Fatalf("unexpected managed job: %+v", jobs[1])
	}

	disabled := RenderCrontabWithUpsert(withJob, CronJob{
		ID:       "clean-tmp",
		Name:     "Cleanup Temp",
		Schedule: "0 3 * * *",
		Command:  "/usr/bin/find /tmp -mtime +7 -delete",
		Enabled:  false,
	})
	jobs2 := ParseCrontab(disabled)
	if len(jobs2) != 2 || jobs2[1].Enabled {
		t.Fatalf("expected job disabled: %+v", jobs2)
	}

	deleted := RenderCrontabWithDelete(disabled, "clean-tmp")
	if strings.Contains(deleted, "clean-tmp") || !strings.Contains(deleted, "other.sh") {
		t.Fatalf("unexpected crontab after delete:\n%s", deleted)
	}
}
