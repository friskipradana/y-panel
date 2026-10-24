package database_test

import (
	"reflect"
	"testing"
)

// Who may reach a user database from outside, and whether it should be running: stored, read back, and the mode kept to its two values.
func TestManagedDatabaseAccessAndAutostart(t *testing.T) {
	m := newIntegrationManager(t)
	owner := testUser(t, m, "dbowner")
	other := testUser(t, m, "dbother")

	db, err := m.CreateManagedDatabase(owner.ID, "shop", "mysql", "8.4", "shop", "shop", "enc", 20001)
	if err != nil {
		t.Fatal(err)
	}
	if db.AccessMode != "local" || len(db.AccessIPs) != 0 || !db.Autostart {
		t.Fatalf("a new database is local, has no addresses and should run: %+v", db)
	}

	ips := []string{"203.0.113.7", "10.0.0.0/24"}
	if err := m.SetManagedDatabaseAccess(db.ID, owner.ID, "ips", ips); err != nil {
		t.Fatal(err)
	}
	got, err := m.GetManagedDatabase(db.ID, owner.ID)
	if err != nil || got == nil {
		t.Fatalf("read back: %v %v", got, err)
	}
	if got.AccessMode != "ips" || !reflect.DeepEqual(got.AccessIPs, ips) {
		t.Fatalf("stored access: %s %v", got.AccessMode, got.AccessIPs)
	}

	// another account cannot change it
	if err := m.SetManagedDatabaseAccess(db.ID, other.ID, "local", nil); err != nil {
		t.Fatal(err)
	}
	if got, _ = m.GetManagedDatabase(db.ID, owner.ID); got.AccessMode != "ips" {
		t.Fatal("the access of a database belongs to its owner")
	}

	if err := m.SetManagedDatabaseAutostart(db.ID, false); err != nil {
		t.Fatal(err)
	}
	if got, _ = m.GetManagedDatabase(db.ID, owner.ID); got.Autostart {
		t.Fatal("autostart must be off after a stop")
	}

	// only the two modes exist
	if err := m.SetManagedDatabaseAccess(db.ID, owner.ID, "anywhere", nil); err == nil {
		t.Fatal("a third mode must be refused by the table")
	}

	if err := m.SetManagedDatabaseAccess(db.ID, owner.ID, "local", []string{}); err != nil {
		t.Fatal(err)
	}
	if got, _ = m.GetManagedDatabase(db.ID, owner.ID); got.AccessMode != "local" || len(got.AccessIPs) != 0 {
		t.Fatalf("back to local: %+v", got)
	}
	if all, err := m.ListManagedDatabases(0, true); err != nil || len(all) != 1 || all[0].AccessMode != "local" {
		t.Fatalf("list: %v %v", all, err)
	}
}
