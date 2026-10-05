
-- Fix view: dùng security_invoker để RLS của user áp dụng
ALTER VIEW public.v_user_conversations SET (security_invoker = true);

-- Set search_path cho trigger function
CREATE OR REPLACE FUNCTION public.chat_guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.parent_message_id IS DISTINCT FROM OLD.parent_message_id
  THEN
    RAISE EXCEPTION 'CHAT_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.deleted_at IS NULL THEN
    IF OLD.created_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'CHAT_EDIT_WINDOW_EXPIRED' USING ERRCODE = 'check_violation';
    END IF;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;
