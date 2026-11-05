package storage

import (
	"encoding/json"
	"errors"
	"github.com/Murphy-404/OneCup/backend/domain"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestExistingAndCorruptDatabasesAreNotReset(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.sqlite")
	db, err := OpenDatabase(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE workspace(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL); PRAGMA user_version=1;`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	if store, err := Open(path); err == nil {
		store.Close()
		t.Fatal("missing committed row was silently replaced")
	}
	db, _ = OpenDatabase(path)
	defer db.Close()
	var count int
	if err := db.QueryRow("SELECT count(*) FROM workspace").Scan(&count); err != nil || count != 0 {
		t.Fatal("database changed", count, err)
	}
	broken := filepath.Join(t.TempDir(), "broken.sqlite")
	os.WriteFile(broken, []byte("not a database"), 0600)
	if store, err := Open(broken); err == nil {
		store.Close()
		t.Fatal("opened invalid database")
	}
	data, _ := os.ReadFile(broken)
	if string(data) != "not a database" {
		t.Fatal("corrupt file replaced")
	}
}

func TestBackupRejectsFutureSchemaAndAccountTables(t *testing.T) {
	for _, statement := range []string{"PRAGMA user_version=99", "CREATE TABLE users(id TEXT PRIMARY KEY)"} {
		t.Run(statement, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "backup.sqlite")
			store, err := Open(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := store.DB.Exec(statement); err != nil {
				t.Fatal(err)
			}
			store.Close()
			if _, err := ReadBackup(path); err == nil {
				t.Fatal("accepted incompatible backup")
			}
		})
	}
}

func TestPersistenceConflictAndRetry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.sqlite")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	data := json.RawMessage(`{"schemaVersion":1,"favorites":["matcha"],"stock":{},"versions":[]}`)
	saved, err := store.Write(data, 0)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 1 {
		t.Fatal(saved.Revision)
	}
	if _, err := store.Write(data, 0); err != nil {
		t.Fatal("retry:", err)
	}
	if _, err := store.Write(domain.Fresh(), 0); !errors.Is(err, ErrConflict) {
		t.Fatal("expected conflict:", err)
	}
	store.Close()
	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	restored, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if string(restored.Data) != string(saved.Data) || restored.Revision != 1 {
		t.Fatal("record lost on reopen")
	}
}

func TestConcurrentWritersAndSnapshots(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(filepath.Join(dir, "data.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	var results = make(chan error, 2)
	var group sync.WaitGroup
	for _, theme := range []string{"slate", "clay"} {
		group.Add(1)
		go func(theme string) {
			defer group.Done()
			var data map[string]any
			json.Unmarshal(domain.Fresh(), &data)
			data["theme"] = theme
			payload, _ := json.Marshal(data)
			_, err := store.Write(payload, 0)
			results <- err
		}(theme)
	}
	group.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatal(success, conflicts)
	}
	backup := filepath.Join(dir, "backup.sqlite")
	if err := store.Backup(backup); err != nil {
		t.Fatal(err)
	}
	if err := store.Backup(backup); err == nil {
		t.Fatal("overwrote backup")
	}
	before, _ := ReadBackup(backup)
	current, _ := store.Read()
	if _, err := store.Write(domain.Fresh(), current.Revision); err != nil {
		t.Fatal(err)
	}
	if err := store.Restore(backup, filepath.Join(dir, "history")); err != nil {
		t.Fatal(err)
	}
	after, _ := store.Read()
	if string(after.Data) != string(before) || after.Revision != 3 {
		t.Fatal("invalid restore", after.Revision)
	}
}
