REVOKE EXECUTE ON FUNCTION public.submit_room_check_for_qc(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.qc_approve_task(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.qc_reject_task(UUID, TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.qc_force_approve(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.qc_escalate_overdue() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_qc_settings(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_write_audit_log() FROM PUBLIC, anon, authenticated;