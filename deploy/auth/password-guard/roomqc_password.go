// RoomQC extension for the pinned GoTrue UserUpdate transaction only.
// Admin reset is deliberately not a user password-change completion.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/gofrs/uuid"
	"github.com/supabase/auth/internal/api/apierrors"
	"github.com/supabase/auth/internal/storage"
)

type roomQCPasswordDecision struct {
	Allowed bool   `json:"allowed"`
	Code    string `json:"code"`
	Status  int    `json:"status"`
}

func roomQCPasswordDecisionError(raw string) error {
	var result roomQCPasswordDecision
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return apierrors.NewInternalServerError("Password change guard unavailable")
	}
	if result.Allowed && result.Code == "" && result.Status == 0 {
		return nil
	}
	// A broken/missing SQL contract must never silently allow the mutation or
	// turn an unexpected SQL error into a permission-denial test pass.
	expected := map[string]int{
		"password_change_forbidden": http.StatusForbidden,
		"password_change_session_required": http.StatusUnauthorized,
		"password_change_conflict": http.StatusConflict,
		"password_change_already_completed": http.StatusConflict,
	}
	if !result.Allowed && expected[result.Code] != 0 && expected[result.Code] == result.Status {
		return apierrors.NewHTTPError(result.Status, apierrors.ErrorCode(result.Code), "Password change could not be authorized")
	}
	return apierrors.NewInternalServerError("Password change guard unavailable")
}

func roomQCPasswordChangeID(value string) (uuid.UUID, error) {
	if value == "" {
		id, err := uuid.NewV4()
		if err != nil {
			return uuid.Nil, apierrors.NewInternalServerError("Password change identifier unavailable")
		}
		return id, nil
	}
	id, err := uuid.FromString(value)
	if err != nil || id == uuid.Nil {
		return uuid.Nil, apierrors.NewBadRequestError(apierrors.ErrorCodeValidationFailed, "Invalid password change identifier")
	}
	return id, nil
}

func roomQCPasswordGuard(tx *storage.Connection, complete bool, actor uuid.UUID, session *uuid.UUID, oldHash string, change uuid.UUID) error {
	if session == nil || *session == uuid.Nil {
		return apierrors.NewHTTPError(http.StatusUnauthorized, apierrors.ErrorCode("password_change_session_required"), "Active session required")
	}
	query := "SELECT private.begin_password_change(?, ?, ?, ?)::text AS result"
	if complete {
		query = "SELECT private.complete_password_change(?, ?, ?, ?)::text AS result"
	}
	var row struct {
		Result string `db:"result"`
	}
	if err := tx.RawQuery(query, actor.String(), session.String(), oldHash, change.String()).First(&row); err != nil {
		return apierrors.NewInternalServerError("Password change guard unavailable").WithInternalError(err)
	}
	return roomQCPasswordDecisionError(row.Result)
}
