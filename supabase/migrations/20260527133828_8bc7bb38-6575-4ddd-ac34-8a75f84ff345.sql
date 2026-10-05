
-- =====================================================
-- CHAT MVP v1: conversations, messages, attachments
-- =====================================================

-- Enum loại hội thoại
DO $$ BEGIN
  CREATE TYPE public.conversation_type AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_member_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 1) conversations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  type public.conversation_type NOT NULL,
  name text,
  created_by uuid NOT NULL,
  -- direct_key = sorted member ids joined by ':' để chống tạo trùng DM
  direct_key text,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_direct_key
  ON public.conversations(tenant_id, hotel_id, direct_key)
  WHERE type = 'direct' AND direct_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_hotel
  ON public.conversations(tenant_id, hotel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations(hotel_id, last_message_at DESC NULLS LAST);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2) conversation_members
-- =====================================================
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  role public.conversation_member_role NOT NULL DEFAULT 'member',
  last_read_message_id uuid,
  last_read_at timestamptz,
  muted_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members(user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_members_tenant ON public.conversation_members(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3) messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text,
  parent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  client_msg_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_msg
  ON public.messages(conversation_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4) message_attachments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  width int,
  height int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON public.message_attachments(conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5) message_reactions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  conversation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON public.message_reactions(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6) message_reads (detailed read receipts cho mention/thread)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER helpers (tránh recursion RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conv_id
      AND user_id = _user_id
      AND left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conv_id
      AND user_id = _user_id
      AND role = 'admin'
      AND left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_tenant(_conv_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.conversations WHERE id = _conv_id;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_hotel(_conv_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hotel_id FROM public.conversations WHERE id = _conv_id;
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- conversations: select nếu là member
CREATE POLICY "conv_select_member" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, auth.uid()));

-- insert qua RPC (security definer), nhưng cho phép self-insert có check
CREATE POLICY "conv_insert_self" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "conv_update_admin" ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(id, auth.uid()));

-- conversation_members: thấy member của conv mình tham gia
CREATE POLICY "convm_select" ON public.conversation_members
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "convm_self_insert" ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

CREATE POLICY "convm_self_update" ON public.conversation_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

CREATE POLICY "convm_admin_delete" ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

-- messages: select nếu là member, insert nếu là member và sender = auth.uid()
CREATE POLICY "msg_select" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
  );

-- update chỉ sender, body và deleted_at (giới hạn 15 phút check trong trigger)
CREATE POLICY "msg_update_sender" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid());

-- attachments
CREATE POLICY "att_select" ON public.message_attachments
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "att_insert" ON public.message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_member(conversation_id, auth.uid()));

-- reactions
CREATE POLICY "react_select" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "react_insert" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "react_delete" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- reads
CREATE POLICY "reads_select" ON public.message_reads
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "reads_insert" ON public.message_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Cập nhật last_message_* trên conversations khi có tin mới
CREATE OR REPLACE FUNCTION public.chat_after_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NEW.body, '[đính kèm]'), 200),
      last_sender_id = NEW.sender_id,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_after_message_insert ON public.messages;
CREATE TRIGGER trg_chat_after_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_after_message_insert();

-- Chặn edit body sau 15 phút
CREATE OR REPLACE FUNCTION public.chat_guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- chỉ cho phép update body, deleted_at, edited_at
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.parent_message_id IS DISTINCT FROM OLD.parent_message_id
  THEN
    RAISE EXCEPTION 'CHAT_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;

  -- Nếu body thay đổi (edit), kiểm tra 15 phút
  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.deleted_at IS NULL THEN
    IF OLD.created_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'CHAT_EDIT_WINDOW_EXPIRED' USING ERRCODE = 'check_violation';
    END IF;
    NEW.edited_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_guard_message_update ON public.messages;
CREATE TRIGGER trg_chat_guard_message_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_guard_message_update();

-- =====================================================
-- RPCs
-- =====================================================

-- Tạo / lấy DM với 1 peer cùng hotel
CREATE OR REPLACE FUNCTION public.create_direct_conversation(
  _hotel_id uuid,
  _peer_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tenant uuid;
  v_key text;
  v_conv_id uuid;
  v_a uuid;
  v_b uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF v_me = _peer_user_id THEN
    RAISE EXCEPTION 'CHAT_CANNOT_DM_SELF';
  END IF;

  -- Lấy tenant từ profile của tôi
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_me;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  -- Validate cả 2 đều thuộc hotel này
  IF NOT EXISTS (
    SELECT 1 FROM public.user_hotels WHERE user_id = v_me AND hotel_id = _hotel_id
  ) THEN
    RAISE EXCEPTION 'CHAT_USER_NOT_IN_HOTEL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_hotels WHERE user_id = _peer_user_id AND hotel_id = _hotel_id
  ) AND NOT EXISTS (
    -- Owner / Manager có thể không có row user_hotels, fallback: peer cùng tenant
    SELECT 1 FROM public.profiles WHERE id = _peer_user_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'CHAT_PEER_NOT_IN_HOTEL';
  END IF;

  -- direct_key sorted
  IF v_me < _peer_user_id THEN
    v_a := v_me; v_b := _peer_user_id;
  ELSE
    v_a := _peer_user_id; v_b := v_me;
  END IF;
  v_key := v_a::text || ':' || v_b::text;

  -- Tìm conv hiện có
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE tenant_id = v_tenant
    AND hotel_id = _hotel_id
    AND type = 'direct'
    AND direct_key = v_key
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    -- Đảm bảo cả 2 còn là member (nếu trước đó leave thì khôi phục)
    UPDATE public.conversation_members
    SET left_at = NULL
    WHERE conversation_id = v_conv_id AND user_id IN (v_a, v_b) AND left_at IS NOT NULL;
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.conversations (tenant_id, hotel_id, type, created_by, direct_key)
  VALUES (v_tenant, _hotel_id, 'direct', v_me, v_key)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
  VALUES
    (v_conv_id, v_me, v_tenant, 'member'),
    (v_conv_id, _peer_user_id, v_tenant, 'member');

  RETURN v_conv_id;
END;
$$;

-- Tạo nhóm
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  _hotel_id uuid,
  _name text,
  _member_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tenant uuid;
  v_conv_id uuid;
  v_member uuid;
  v_all_ids uuid[];
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'CHAT_GROUP_NAME_REQUIRED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_me;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_hotels WHERE user_id = v_me AND hotel_id = _hotel_id) THEN
    -- cho phép Owner/Manager (cùng tenant với hotel)
    IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'CHAT_USER_NOT_IN_HOTEL';
    END IF;
  END IF;

  -- merge creator vào danh sách thành viên, unique
  v_all_ids := ARRAY(SELECT DISTINCT unnest(_member_ids || ARRAY[v_me]));

  -- validate mọi thành viên thuộc tenant
  IF EXISTS (
    SELECT 1 FROM unnest(v_all_ids) m(uid)
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = m.uid AND tenant_id = v_tenant)
  ) THEN
    RAISE EXCEPTION 'CHAT_MEMBER_WRONG_TENANT';
  END IF;

  INSERT INTO public.conversations (tenant_id, hotel_id, type, name, created_by)
  VALUES (v_tenant, _hotel_id, 'group', trim(_name), v_me)
  RETURNING id INTO v_conv_id;

  -- creator là admin
  INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
  VALUES (v_conv_id, v_me, v_tenant, 'admin');

  -- các thành viên khác
  FOREACH v_member IN ARRAY v_all_ids LOOP
    IF v_member <> v_me THEN
      INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
      VALUES (v_conv_id, v_member, v_tenant, 'member')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_conv_id;
END;
$$;

-- Gửi tin nhắn atomic (kèm attachments)
CREATE OR REPLACE FUNCTION public.send_chat_message(
  _conversation_id uuid,
  _body text,
  _parent_message_id uuid DEFAULT NULL,
  _client_msg_id text DEFAULT NULL,
  _mentioned_user_ids uuid[] DEFAULT '{}',
  _attachments jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tenant uuid;
  v_msg_id uuid;
  v_existing uuid;
  v_att jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  IF NOT public.is_conversation_member(_conversation_id, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_MEMBER';
  END IF;

  IF (_body IS NULL OR length(trim(_body)) = 0)
     AND (_attachments IS NULL OR jsonb_array_length(_attachments) = 0)
  THEN
    RAISE EXCEPTION 'CHAT_EMPTY_MESSAGE';
  END IF;

  v_tenant := public.get_conversation_tenant(_conversation_id);

  -- Dedupe theo client_msg_id
  IF _client_msg_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.messages
    WHERE conversation_id = _conversation_id AND sender_id = v_me AND client_msg_id = _client_msg_id
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.messages (
    tenant_id, conversation_id, sender_id, body, parent_message_id,
    mentioned_user_ids, client_msg_id
  ) VALUES (
    v_tenant, _conversation_id, v_me, NULLIF(trim(_body), ''), _parent_message_id,
    COALESCE(_mentioned_user_ids, '{}'), _client_msg_id
  ) RETURNING id INTO v_msg_id;

  IF _attachments IS NOT NULL AND jsonb_array_length(_attachments) > 0 THEN
    FOR v_att IN SELECT * FROM jsonb_array_elements(_attachments) LOOP
      INSERT INTO public.message_attachments (
        message_id, tenant_id, conversation_id, storage_path,
        file_name, mime_type, size_bytes, width, height
      ) VALUES (
        v_msg_id, v_tenant, _conversation_id,
        v_att->>'storage_path',
        v_att->>'file_name',
        v_att->>'mime_type',
        NULLIF(v_att->>'size_bytes','')::bigint,
        NULLIF(v_att->>'width','')::int,
        NULLIF(v_att->>'height','')::int
      );
    END LOOP;
  END IF;

  RETURN v_msg_id;
END;
$$;

-- Đánh dấu đã đọc
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  _conversation_id uuid,
  _up_to_message_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_msg_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_conversation_member(_conversation_id, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_MEMBER';
  END IF;

  IF _up_to_message_id IS NULL THEN
    SELECT id INTO v_msg_id FROM public.messages
    WHERE conversation_id = _conversation_id
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_msg_id := _up_to_message_id;
  END IF;

  UPDATE public.conversation_members
  SET last_read_message_id = v_msg_id,
      last_read_at = now()
  WHERE conversation_id = _conversation_id AND user_id = v_me;
END;
$$;

-- Toggle reaction
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  _message_id uuid,
  _emoji text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv uuid;
  v_tenant uuid;
  v_exists boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT conversation_id, tenant_id INTO v_conv, v_tenant
  FROM public.messages WHERE id = _message_id;

  IF v_conv IS NULL THEN RAISE EXCEPTION 'CHAT_MESSAGE_NOT_FOUND'; END IF;
  IF NOT public.is_conversation_member(v_conv, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_MEMBER';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.message_reactions
    WHERE message_id = _message_id AND user_id = v_me AND emoji = _emoji)
  INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.message_reactions
    WHERE message_id = _message_id AND user_id = v_me AND emoji = _emoji;
    RETURN false;
  ELSE
    INSERT INTO public.message_reactions (message_id, user_id, emoji, conversation_id, tenant_id)
    VALUES (_message_id, v_me, _emoji, v_conv, v_tenant);
    RETURN true;
  END IF;
END;
$$;

-- Set mute
CREATE OR REPLACE FUNCTION public.set_conversation_mute(
  _conversation_id uuid,
  _muted_until timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  UPDATE public.conversation_members
  SET muted_until = _muted_until
  WHERE conversation_id = _conversation_id AND user_id = v_me;
END;
$$;

-- Add member (admin only)
CREATE OR REPLACE FUNCTION public.add_conversation_members(
  _conversation_id uuid,
  _user_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tenant uuid;
  v_uid uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_conversation_admin(_conversation_id, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_ADMIN';
  END IF;
  v_tenant := public.get_conversation_tenant(_conversation_id);

  FOREACH v_uid IN ARRAY _user_ids LOOP
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND tenant_id = v_tenant) THEN
      INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
      VALUES (_conversation_id, v_uid, v_tenant, 'member')
      ON CONFLICT (conversation_id, user_id) DO UPDATE
        SET left_at = NULL;
    END IF;
  END LOOP;
END;
$$;

-- Remove member (admin only) hoặc tự rời
CREATE OR REPLACE FUNCTION public.leave_or_remove_conversation_member(
  _conversation_id uuid,
  _user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _user_id <> v_me AND NOT public.is_conversation_admin(_conversation_id, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_ADMIN';
  END IF;
  UPDATE public.conversation_members
  SET left_at = now()
  WHERE conversation_id = _conversation_id AND user_id = _user_id;
END;
$$;

-- Rename group (admin only)
CREATE OR REPLACE FUNCTION public.rename_chat_group(
  _conversation_id uuid,
  _name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_conversation_admin(_conversation_id, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_ADMIN';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'CHAT_GROUP_NAME_REQUIRED';
  END IF;
  UPDATE public.conversations
  SET name = trim(_name), updated_at = now()
  WHERE id = _conversation_id AND type = 'group';
END;
$$;

-- Soft delete message (sender hoặc admin)
CREATE OR REPLACE FUNCTION public.delete_chat_message(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_sender uuid;
  v_conv uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT sender_id, conversation_id INTO v_sender, v_conv
  FROM public.messages WHERE id = _message_id;
  IF v_sender IS NULL THEN RAISE EXCEPTION 'CHAT_MESSAGE_NOT_FOUND'; END IF;
  IF v_sender <> v_me AND NOT public.is_conversation_admin(v_conv, v_me) THEN
    RAISE EXCEPTION 'CHAT_NOT_ALLOWED';
  END IF;
  UPDATE public.messages
  SET deleted_at = now(), body = NULL
  WHERE id = _message_id;
END;
$$;

-- =====================================================
-- VIEW v_user_conversations
-- =====================================================
CREATE OR REPLACE VIEW public.v_user_conversations AS
SELECT
  c.id,
  c.tenant_id,
  c.hotel_id,
  c.type,
  c.name,
  c.last_message_at,
  c.last_message_preview,
  c.last_sender_id,
  cm.user_id AS viewer_id,
  cm.muted_until,
  cm.last_read_message_id,
  (
    SELECT count(*)::int FROM public.messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> cm.user_id
      AND m.deleted_at IS NULL
      AND (cm.last_read_message_id IS NULL OR m.created_at > (
        SELECT created_at FROM public.messages WHERE id = cm.last_read_message_id
      ))
  ) AS unread_count
FROM public.conversations c
JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.left_at IS NULL;

GRANT SELECT ON public.v_user_conversations TO authenticated;

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Path: {conversation_id}/{...}
CREATE POLICY "chat_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member(
      (storage.foldername(name))[1]::uuid, auth.uid()
    )
  );

CREATE POLICY "chat_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member(
      (storage.foldername(name))[1]::uuid, auth.uid()
    )
  );

CREATE POLICY "chat_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member(
      (storage.foldername(name))[1]::uuid, auth.uid()
    )
  );

-- =====================================================
-- REALTIME
-- =====================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
