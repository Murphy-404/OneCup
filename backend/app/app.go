package app

import (
	"context"
	"errors"
	"fmt"
	"github.com/Murphy-404/OneCup/backend/httpapi"
	"github.com/Murphy-404/OneCup/backend/storage"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Host, Port, DatabasePath, StaticDirectory, Origin, BackupDirectory string
	BackupHours                                                        int
}

func LoadConfig(get func(string) string) (Config, error) {
	value := func(key, fallback string) string {
		if text := get(key); text != "" {
			return text
		}
		return fallback
	}
	config := Config{Host: value("HOST", "127.0.0.1"), Port: value("PORT", "8080"), DatabasePath: value("DATABASE_PATH", "data/onecup.sqlite"), StaticDirectory: value("STATIC_DIRECTORY", "dist"), Origin: get("ONECUP_ORIGIN")}
	port, err := strconv.Atoi(config.Port)
	if err != nil || port < 1 || port > 65535 {
		return config, errors.New("PORT 需为 1–65535")
	}
	config.BackupHours, err = strconv.Atoi(value("ONECUP_AUTO_BACKUP_HOURS", "24"))
	if err != nil || config.BackupHours < 0 || config.BackupHours > 168 {
		return config, errors.New("备份间隔需为 0–168 小时")
	}
	if config.StaticDirectory == "-" {
		config.StaticDirectory = ""
	}
	config.BackupDirectory = value("BACKUP_DIRECTORY", filepath.Join(filepath.Dir(config.DatabasePath), "backups"))
	if config.Origin != "" {
		parsed, err := url.Parse(config.Origin)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return config, errors.New("ONECUP_ORIGIN 需为完整 HTTP(S) 来源，不带路径")
		}
	}
	return config, nil
}
func Run(ctx context.Context, args []string) error {
	config, err := LoadConfig(os.Getenv)
	if err != nil {
		return err
	}
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	if command == "healthcheck" {
		client := http.Client{Timeout: 2 * time.Second}
		response, err := client.Get("http://127.0.0.1:" + config.Port + "/healthz")
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return errors.New("healthcheck failed")
		}
		return nil
	}
	if command == "verify" {
		if len(args) != 2 {
			return errors.New("usage: onecup verify <backup.sqlite>")
		}
		_, err := storage.ReadBackup(args[1])
		if err == nil {
			fmt.Println("Backup integrity and workspace validation passed.")
		}
		return err
	}
	if command != "serve" && command != "backup" && command != "restore" {
		return errors.New("usage: onecup [serve|backup <new.sqlite>|verify <backup.sqlite>|restore <backup.sqlite> --confirm-replace|healthcheck]")
	}
	if command != "serve" && len(args) < 2 {
		return errors.New("缺少备份文件路径")
	}
	if command == "restore" && (len(args) != 3 || args[2] != "--confirm-replace") {
		return errors.New("恢复会替换工作区，请先备份并使用 --confirm-replace")
	}
	if command == "restore" {
		if _, err := storage.ReadBackup(args[1]); err != nil {
			return err
		}
	}
	if command == "backup" {
		if _, err := os.Stat(config.DatabasePath); err != nil {
			return err
		}
	}
	store, err := storage.Open(config.DatabasePath)
	if err != nil {
		return err
	}
	defer store.Close()
	switch command {
	case "backup":
		err = store.Backup(args[1])
		if err == nil {
			fmt.Println("Consistent SQLite backup created.")
		}
		return err
	case "restore":
		err = store.Restore(args[1], config.BackupDirectory)
		if err == nil {
			fmt.Println("Restored workspace; before-restore snapshot retained.")
		}
		return err
	}
	handler := httpapi.New(store, httpapi.Options{Origin: config.Origin, StaticDirectory: config.StaticDirectory})
	return Serve(ctx, config, handler, func(destination string) error { return store.Backup(destination) })
}

// Serve is shared with the account edition, while handlers and database ownership
// remain separate. Shutdown waits for requests and the current backup to finish.
func Serve(ctx context.Context, config Config, handler http.Handler, backup func(string) error) error {
	server := &http.Server{Addr: net.JoinHostPort(config.Host, config.Port), Handler: handler, ReadHeaderTimeout: 15 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 64 * 1024}
	failures := make(chan error, 1)
	go func() { log.Printf("OneCup Go API listening on %s", server.Addr); failures <- server.ListenAndServe() }()
	background, cancel := context.WithCancel(ctx)
	var jobs sync.WaitGroup
	if config.BackupHours > 0 {
		jobs.Add(1)
		go func() {
			defer jobs.Done()
			snapshot := func() {
				name := fmt.Sprintf("auto-%s-%d.sqlite", strings.ReplaceAll(time.Now().UTC().Format(time.RFC3339Nano), ":", "-"), time.Now().UnixNano())
				if err := backup(filepath.Join(config.BackupDirectory, name)); err != nil {
					log.Print("Automatic backup failed; check backup directory and disk space")
				}
			}
			snapshot()
			ticker := time.NewTicker(time.Duration(config.BackupHours) * time.Hour)
			defer ticker.Stop()
			for {
				select {
				case <-background.Done():
					return
				case <-ticker.C:
					snapshot()
				}
			}
		}()
	}
	var result error
	select {
	case <-ctx.Done():
	case result = <-failures:
	}
	cancel()
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(shutdown); err != nil {
		server.Close()
	}
	jobs.Wait()
	if errors.Is(result, http.ErrServerClosed) {
		return nil
	}
	return result
}
