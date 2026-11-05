package app

import "testing"

func TestConfigurationRejectsInvalidDeploymentValues(t *testing.T) {
	for key, value := range map[string]string{"PORT": "0", "ONECUP_ORIGIN": "https://example.test/path", "ONECUP_AUTO_BACKUP_HOURS": "-1"} {
		if _, err := LoadConfig(func(name string) string {
			if name == key {
				return value
			}
			return ""
		}); err == nil {
			t.Errorf("accepted %s=%s", key, value)
		}
	}
}
