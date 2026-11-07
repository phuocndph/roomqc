package api

import (
	"testing"

	"github.com/gofrs/uuid"
)

func TestRoomQCPasswordDecision(t *testing.T) {
	for _, raw := range []string{
		`{}`, `null`, `not-json`, `{"allowed":true,"code":"unexpected"}`,
		`{"allowed":false,"status":403,"code":"unknown"}`,
		`{"allowed":false,"status":500,"code":"password_change_forbidden"}`,
	} {
		if roomQCPasswordDecisionError(raw) == nil {
			t.Fatalf("Malformed decision was accepted")
		}
	}
	if roomQCPasswordDecisionError(`{"allowed":true}`) != nil {
		t.Fatal("Explicit allow rejected")
	}
	for _, raw := range []string{
		`{"allowed":false,"status":403,"code":"password_change_forbidden"}`,
		`{"allowed":false,"status":401,"code":"password_change_session_required"}`,
		`{"allowed":false,"status":409,"code":"password_change_conflict"}`,
		`{"allowed":false,"status":409,"code":"password_change_already_completed"}`,
	} {
		if roomQCPasswordDecisionError(raw) == nil {
			t.Fatal("Explicit refusal was accepted")
		}
	}
}

func TestRoomQCPasswordChangeID(t *testing.T) {
	id, err := roomQCPasswordChangeID("")
	if err != nil || id == uuid.Nil {
		t.Fatal("Missing identifier was not generated")
	}
	if same, err := roomQCPasswordChangeID(id.String()); err != nil || same != id {
		t.Fatal("Valid identifier changed")
	}
	for _, value := range []string{"not-a-uuid", uuid.Nil.String()} {
		if _, err := roomQCPasswordChangeID(value); err == nil {
			t.Fatal("Invalid identifier accepted")
		}
	}
}
