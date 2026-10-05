-- ============================================================
-- Tests: Multi-role + QC mode (Phase 3)
-- Chạy thủ công trong SQL editor sau khi seed data test.
-- ============================================================

-- Giả định có sẵn:
--   :tenant   uuid
--   :hotel    uuid (qc_mode sẽ được set trong từng test)
--   :staff    uuid (assignee)
--   :peer     uuid (cùng tenant, có manage_housekeeping, ≠ staff)
--   :manager  uuid (user_level_code='manager')
--   :task     uuid (housekeeping_tasks ở trạng thái pending, assigned_to=:staff)

-- =====================================================
-- TEST 1: qc_mode='self' → complete_task → status=completed
-- =====================================================
UPDATE public.hotels SET qc_mode='self' WHERE id = :hotel;

-- Mô phỏng staff:
SELECT set_config('request.jwt.claim.sub', :'staff', true);
SELECT public.complete_task(:'task', 'tự đóng');
-- Expect: status='completed', completed_at NOT NULL.

-- =====================================================
-- TEST 2: qc_mode='peer' → complete → completed_pending_review
--          → staff TỰ duyệt → PEER_REVIEW_SELF_FORBIDDEN
--          → peer khác duyệt → approved
-- =====================================================
UPDATE public.hotels SET qc_mode='peer' WHERE id = :hotel;
UPDATE public.housekeeping_tasks SET status='pending', completed_at=null WHERE id=:task;

SELECT set_config('request.jwt.claim.sub', :'staff', true);
SELECT public.complete_task(:'task');
-- Expect: status='completed_pending_review'

-- staff tự duyệt phải fail
DO $$ BEGIN
  PERFORM public.approve_task(:'task');
  RAISE EXCEPTION 'TEST_FAIL_should_have_thrown_PEER_REVIEW_SELF_FORBIDDEN';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%PEER_REVIEW_SELF_FORBIDDEN%' THEN RAISE NOTICE 'OK: blocked self-approve';
  ELSE RAISE; END IF;
END $$;

-- peer khác duyệt thành công
SELECT set_config('request.jwt.claim.sub', :'peer', true);
SELECT public.approve_task(:'task');
-- Expect: status='approved', approved_by=:peer

-- =====================================================
-- TEST 3: qc_mode='strict' → peer (không phải manager) duyệt → fail
--          → manager duyệt → ok
-- =====================================================
UPDATE public.hotels SET qc_mode='strict' WHERE id = :hotel;
UPDATE public.housekeeping_tasks SET status='completed_pending_review' WHERE id=:task;

SELECT set_config('request.jwt.claim.sub', :'peer', true);
DO $$ BEGIN
  PERFORM public.approve_task(:'task');
  RAISE EXCEPTION 'TEST_FAIL_strict_should_block_non_manager';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%NO_PERMISSION_QC_STRICT%' THEN RAISE NOTICE 'OK: strict blocks non-manager';
  ELSE RAISE; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', :'manager', true);
SELECT public.approve_task(:'task');

-- =====================================================
-- TEST 4: reject_task bắt buộc reason ≥ 3 ký tự
-- =====================================================
UPDATE public.housekeeping_tasks SET status='completed_pending_review' WHERE id=:task;
DO $$ BEGIN
  PERFORM public.reject_task(:'task', 'no');
  RAISE EXCEPTION 'TEST_FAIL_short_reason_should_throw';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%REJECTION_REASON_REQUIRED%' THEN RAISE NOTICE 'OK: short reason rejected';
  ELSE RAISE; END IF;
END $$;
SELECT public.reject_task(:'task', 'sàn còn tóc, gối lệch');
-- Expect: status='rejected_rework', rework_count tăng 1, rejection_reason set

-- =====================================================
-- TEST 5: Multi-role union
-- =====================================================
INSERT INTO public.user_roles(user_id, role) VALUES (:'staff', 'department_manager')
  ON CONFLICT DO NOTHING;
SELECT count(*) AS perm_count FROM public.get_effective_permissions(:'staff');
-- Expect: > số quyền lúc chỉ có role staff

-- =====================================================
-- TEST 6: Audit log
-- =====================================================
SELECT count(*) AS audit_rows
FROM public.state_transition_log
WHERE entity_type='housekeeping_tasks' AND entity_id=:'task';
-- Expect: ≥ 5 (mỗi transition trong các test trên đều phải có log)
