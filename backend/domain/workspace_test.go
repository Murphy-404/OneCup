package domain

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestTypeScriptContractParity(t *testing.T) {
	source, err := os.ReadFile("testdata/contracts.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name     string
		Input    json.RawMessage
		Valid    bool
		Expected json.RawMessage
	}
	if err := json.Unmarshal(source, &cases); err != nil {
		t.Fatal(err)
	}
	for _, entry := range cases {
		t.Run(entry.Name, func(t *testing.T) {
			actual, err := Normalize(entry.Input)
			if (err == nil) != entry.Valid {
				t.Fatalf("valid=%v, error=%v", entry.Valid, err)
			}
			if !entry.Valid {
				return
			}
			var got, want any
			json.Unmarshal(actual, &got)
			json.Unmarshal(entry.Expected, &want)
			if !reflect.DeepEqual(got, want) {
				t.Fatal("normalization differs from TypeScript")
			}
		})
	}
}
