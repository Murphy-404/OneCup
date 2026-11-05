package storage

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Murphy-404/OneCup/backend/domain"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var ErrConflict = errors.New("其他页面或设备已更新记录，请处理版本冲突")

type Record struct {
	Data      json.RawMessage `json:"data"`
	Revision  int64           `json:"revision"`
	UpdatedAt string          `json:"updatedAt"`
}
type Store struct {
	DB   *sql.DB
	Path string
}

// OpenDatabase is shared by the private account adapter. It configures a single
// connection so pragmas and transactions apply consistently to every operation.
func OpenDatabase(path string) (*sql.DB, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
func Open(path string) (*Store, error) {
	db, err := OpenDatabase(path)
	if err != nil {
		return nil, err
	}
	fail := func(err error) (*Store, error) { db.Close(); return nil, err }
	var users, version int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'").Scan(&users); err != nil {
		return fail(err)
	}
	if users != 0 {
		return fail(errors.New("这是账号数据库，请从旧版本导出 JSON 后导入个人实例"))
	}
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return fail(err)
	}
	if version > 1 {
		return fail(errors.New("数据库版本较新，请升级程序"))
	}
	var workspaces, tables int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='workspace'").Scan(&workspaces); err != nil {
		return fail(err)
	}
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tables); err != nil {
		return fail(err)
	}
	if workspaces == 0 && (version != 0 || tables != 0) {
		return fail(errors.New("数据库缺少工作区，未创建空记录"))
	}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),updated_at TEXT NOT NULL);`); err != nil {
		return fail(err)
	}
	if workspaces == 0 {
		if _, err := db.Exec("INSERT INTO workspace VALUES(1,?,0,?)", string(domain.Fresh()), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return fail(err)
		}
	}
	if _, err := db.Exec("PRAGMA user_version=1"); err != nil {
		return fail(err)
	}
	if path != ":memory:" {
		if err := os.Chmod(path, 0600); err != nil {
			return fail(err)
		}
	}
	store := &Store{DB: db, Path: path}
	if _, err := store.Read(); err != nil {
		return fail(err)
	}
	return store, nil
}

type scanner interface{ Scan(...any) error }

func scanRecord(row scanner) (Record, error) {
	var record Record
	var payload string
	if err := row.Scan(&payload, &record.Revision, &record.UpdatedAt); err != nil {
		return record, err
	}
	if record.Revision < 0 || record.Revision > 9007199254740991 {
		return record, errors.New("数据库记录版本无效")
	}
	data, err := domain.Normalize([]byte(payload))
	record.Data = data
	return record, err
}
func (s *Store) Read() (Record, error) {
	return scanRecord(s.DB.QueryRow("SELECT payload,revision,updated_at FROM workspace WHERE id=1"))
}
func (s *Store) Write(data []byte, expected int64) (Record, error) {
	payload, err := domain.Normalize(data)
	if err != nil {
		return Record{}, err
	}
	if expected < 0 || expected >= 9007199254740991 {
		return Record{}, errors.New("记录版本无效")
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return Record{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec("UPDATE workspace SET payload=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?", string(payload), time.Now().UTC().Format(time.RFC3339Nano), expected)
	if err != nil {
		return Record{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return Record{}, err
	}
	current, err := scanRecord(tx.QueryRow("SELECT payload,revision,updated_at FROM workspace WHERE id=1"))
	if err != nil {
		return Record{}, err
	}
	if changed != 1 && !bytes.Equal(payload, current.Data) {
		return Record{}, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return Record{}, err
	}
	return current, nil
}
func BackupDatabase(db *sql.DB, source, destination string) error {
	sourceAbs, _ := filepath.Abs(source)
	destinationAbs, err := filepath.Abs(destination)
	if err != nil {
		return err
	}
	if sourceAbs == destinationAbs {
		return errors.New("备份不能覆盖活动数据库")
	}
	if err := os.MkdirAll(filepath.Dir(destinationAbs), 0700); err != nil {
		return err
	}
	reservation, err := os.OpenFile(destinationAbs, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if err := reservation.Close(); err != nil {
		os.Remove(destinationAbs)
		return err
	}
	if _, err := db.Exec("VACUUM INTO ?", destinationAbs); err != nil {
		os.Remove(destinationAbs)
		return err
	}
	file, err := os.OpenFile(destinationAbs, os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}
func (s *Store) Backup(path string) error { return BackupDatabase(s.DB, s.Path, path) }
func OpenReadOnly(path string) (*sql.DB, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(absolute); err != nil {
		return nil, err
	}
	name := filepath.ToSlash(absolute)
	if !strings.HasPrefix(name, "/") {
		name = "/" + name
	}
	uri := url.URL{Scheme: "file", Path: name, RawQuery: "mode=ro"}
	db, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	var integrity string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		db.Close()
		return nil, errors.New("备份数据库完整性检查失败")
	}
	return db, nil
}
func ReadBackup(path string) (json.RawMessage, error) {
	db, err := OpenReadOnly(path)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var version, users int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil || version > 1 {
		return nil, errors.New("备份数据库版本无效")
	}
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'").Scan(&users); err != nil {
		return nil, err
	}
	if users > 0 {
		return nil, errors.New("账号数据库不能直接恢复到单用户实例")
	}
	record, err := scanRecord(db.QueryRow("SELECT payload,revision,updated_at FROM workspace WHERE id=1"))
	if err != nil {
		return nil, err
	}
	return record.Data, nil
}
func (s *Store) Restore(path, directory string) error {
	data, err := ReadBackup(path)
	if err != nil {
		return err
	}
	current, err := s.Read()
	if err != nil {
		return err
	}
	name := fmt.Sprintf("before-restore-%d-%x.sqlite", time.Now().UnixMilli(), randomBytes())
	if err := s.Backup(filepath.Join(directory, name)); err != nil {
		return err
	}
	_, err = s.Write(data, current.Revision)
	return err
}
func randomBytes() []byte {
	value := make([]byte, 8)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return value
}
func (s *Store) Close() error { return s.DB.Close() }
