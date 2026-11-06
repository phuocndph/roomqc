-- W1/P0 remediation: chat membership and tenant/hotel integrity.
-- The previous policies allowed a user to self-insert a membership with an
-- arbitrary tenant/role.  This migration keeps chat operations in the
-- authenticated user's tenant and assigned hotel, including direct Data API
-- writes (RPCs remain subject to the same database triggers).

CREATE OR REPLACE FUNCTION public.chat_user_can_hotel(
  p_user_id uuid,
  p_tenant_id uuid,
  p_hotel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.hotels h ON h.id = p_hotel_id AND h.tenant_id = p_tenant_id
    WHERE u.id = p_user_id
      AND u.tenant_id = p_tenant_id
      AND u.status = 'active'
      AND COALESCE(u.account_locked, false) = false
      AND u.deleted_at IS NULL
      AND (
        u.user_level_code IN ('super_admin', 'tenant_owner')
        OR u.role IN ('super_admin', 'owner')
        OR COALESCE(u.is_super_admin, false)
        OR u.hotel_id = p_hotel_id
        OR EXISTS (
          SELECT 1
          FROM public.user_hotels uh
          WHERE uh.user_id = u.id
            AND uh.hotel_id = p_hotel_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.chat_user_can_hotel(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_user_can_hotel(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    JOIN public.conversations c ON c.id = cm.conversation_id
    WHERE cm.conversation_id = _conv_id
      AND cm.user_id = _user_id
      AND cm.left_at IS NULL
      AND cm.tenant_id = c.tenant_id
      AND public.chat_user_can_hotel(_user_id, c.tenant_id, c.hotel_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_is_server_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- `current_user` becomes the SECURITY DEFINER owner inside triggers, so it
  -- cannot be used as the client/server discriminator here.  The JWT role
  -- setting survives SECURITY DEFINER and is the only client-safe signal.
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
         OR (session_user IN ('postgres', 'supabase_admin')
             AND COALESCE(current_setting('request.jwt.claim.role', true), '') = '');
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_conversation_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.chat_is_server_context()
     AND (NEW.created_by IS NULL OR auth.uid() IS DISTINCT FROM NEW.created_by) THEN
    RAISE EXCEPTION 'CHAT_CREATOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NOT public.chat_is_server_context()
     AND NOT public.chat_user_can_hotel(NEW.created_by, NEW.tenant_id, NEW.hotel_id) THEN
    RAISE EXCEPTION 'CHAT_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id) THEN
    RAISE EXCEPTION 'CHAT_SCOPE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.direct_key IS DISTINCT FROM OLD.direct_key
  ) THEN
    RAISE EXCEPTION 'CHAT_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_member_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_hotel uuid;
  v_creator uuid;
  v_type public.conversation_type;
BEGIN
  SELECT tenant_id, hotel_id, created_by INTO v_tenant, v_hotel, v_creator
  FROM public.conversations WHERE id = NEW.conversation_id;
  SELECT type INTO v_type FROM public.conversations WHERE id = NEW.conversation_id;
  IF v_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'CHAT_TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  ) THEN
    RAISE EXCEPTION 'CHAT_MEMBER_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NOT public.chat_is_server_context() AND NOT public.chat_user_can_hotel(NEW.user_id, v_tenant, v_hotel) THEN
    -- An active admin must still be able to remove an inactive/locked user;
    -- otherwise account deactivation would strand the membership forever.
    IF NOT (
      TG_OP = 'UPDATE'
      AND OLD.left_at IS NULL
      AND NEW.left_at IS NOT NULL
      AND (NEW.user_id = auth.uid() OR public.is_conversation_admin(NEW.conversation_id, auth.uid()))
    ) THEN
      RAISE EXCEPTION 'CHAT_MEMBER_SCOPE_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Only the conversation creator may be the initial admin.  All later
  -- additions are members and must go through the admin-only RPC.
  IF NOT public.chat_is_server_context() AND NEW.role = 'admin' AND NEW.user_id IS DISTINCT FROM v_creator THEN
    RAISE EXCEPTION 'CHAT_ADMIN_ROLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'CHAT_ROLE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.left_at IS NOT NULL AND NEW.left_at IS NULL
     AND NOT public.chat_is_server_context()
     AND NOT public.is_conversation_admin(NEW.conversation_id, auth.uid())
     AND (v_type IS DISTINCT FROM 'direct' OR NEW.user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'CHAT_REJOIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_message_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant uuid; v_hotel uuid;
BEGIN
  SELECT tenant_id, hotel_id INTO v_tenant, v_hotel FROM public.conversations WHERE id = NEW.conversation_id;
  IF v_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant
     OR (NOT public.chat_is_server_context() AND auth.uid() IS DISTINCT FROM NEW.sender_id)
     OR NOT public.is_conversation_member(NEW.conversation_id, NEW.sender_id) THEN
    RAISE EXCEPTION 'CHAT_MESSAGE_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NEW.parent_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages p
    WHERE p.id = NEW.parent_message_id AND p.conversation_id = NEW.conversation_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'CHAT_PARENT_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_attachment_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant uuid; v_conv uuid;
BEGIN
  SELECT tenant_id, conversation_id INTO v_tenant, v_conv FROM public.messages WHERE id = NEW.message_id;
  IF v_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant
     OR NEW.conversation_id IS DISTINCT FROM v_conv
     OR NOT public.is_conversation_member(v_conv, auth.uid()) THEN
    RAISE EXCEPTION 'CHAT_ATTACHMENT_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF split_part(NEW.storage_path, '/', 1) IS DISTINCT FROM v_conv::text THEN
    RAISE EXCEPTION 'CHAT_ATTACHMENT_PATH_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_reaction_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant uuid; v_conv uuid;
BEGIN
  SELECT tenant_id, conversation_id INTO v_tenant, v_conv FROM public.messages WHERE id = NEW.message_id;
  IF v_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant
     OR NEW.conversation_id IS DISTINCT FROM v_conv
     OR NEW.user_id IS DISTINCT FROM auth.uid()
     OR NOT public.is_conversation_member(v_conv, auth.uid()) THEN
    RAISE EXCEPTION 'CHAT_REACTION_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_validate_read_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     OR NOT public.is_conversation_member(NEW.conversation_id, auth.uid())
     OR NOT EXISTS (
       SELECT 1 FROM public.messages m
       WHERE m.id = NEW.message_id AND m.conversation_id = NEW.conversation_id
     ) THEN
    RAISE EXCEPTION 'CHAT_READ_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_is_server_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_conversation_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_member_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_message_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_attachment_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_reaction_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_validate_read_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_validate_conversation ON public.conversations;
CREATE TRIGGER trg_chat_validate_conversation
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_conversation_row();

DROP TRIGGER IF EXISTS trg_chat_validate_member ON public.conversation_members;
CREATE TRIGGER trg_chat_validate_member
  BEFORE INSERT OR UPDATE ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_member_row();

DROP TRIGGER IF EXISTS trg_chat_validate_message ON public.messages;
CREATE TRIGGER trg_chat_validate_message
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_message_row();

DROP TRIGGER IF EXISTS trg_chat_validate_attachment ON public.message_attachments;
CREATE TRIGGER trg_chat_validate_attachment
  BEFORE INSERT OR UPDATE ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_attachment_row();

DROP TRIGGER IF EXISTS trg_chat_validate_reaction ON public.message_reactions;
CREATE TRIGGER trg_chat_validate_reaction
  BEFORE INSERT OR UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_reaction_row();

DROP TRIGGER IF EXISTS trg_chat_validate_read ON public.message_reads;
CREATE TRIGGER trg_chat_validate_read
  BEFORE INSERT OR UPDATE ON public.message_reads
  FOR EACH ROW EXECUTE FUNCTION public.chat_validate_read_row();

-- Replace the permissive policies.  Membership is never self-insertable via
-- the Data API; the creator/admin RPCs run as trusted database functions.
DROP POLICY IF EXISTS "conv_insert_self" ON public.conversations;
DROP POLICY IF EXISTS "convm_self_insert" ON public.conversation_members;
DROP POLICY IF EXISTS "convm_self_update" ON public.conversation_members;
DROP POLICY IF EXISTS "convm_admin_delete" ON public.conversation_members;
DROP POLICY IF EXISTS "conv_update_admin" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_scoped" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_admin_scoped" ON public.conversations;
DROP POLICY IF EXISTS "convm_admin_insert_scoped" ON public.conversation_members;
DROP POLICY IF EXISTS "convm_self_update_scoped" ON public.conversation_members;
DROP POLICY IF EXISTS "convm_admin_delete_scoped" ON public.conversation_members;

CREATE POLICY "conv_update_admin_scoped" ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(id, auth.uid()))
  WITH CHECK (tenant_id = public.get_conversation_tenant(id)
             AND hotel_id = public.get_conversation_hotel(id));

-- Conversation creation is exposed through create_direct_conversation and
-- create_group_conversation only; preventing ad-hoc rows also prevents an
-- authenticated client from creating an orphan conversation with no member.
REVOKE INSERT ON public.conversations FROM authenticated;

CREATE POLICY "convm_admin_insert_scoped" ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    role = 'member'
    AND public.is_conversation_admin(conversation_id, auth.uid())
    AND public.chat_user_can_hotel(user_id, tenant_id, public.get_conversation_hotel(conversation_id))
  );

CREATE POLICY "convm_self_update_scoped" ON public.conversation_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()))
  WITH CHECK (tenant_id = public.get_conversation_tenant(conversation_id)
              AND public.chat_user_can_hotel(user_id, tenant_id, public.get_conversation_hotel(conversation_id)));

CREATE POLICY "convm_admin_delete_scoped" ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

-- Storage policies must use the same active membership helper.
DROP POLICY IF EXISTS "chat_att_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_delete" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_select_scoped" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_insert_scoped" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_delete_scoped" ON storage.objects;

CREATE POLICY "chat_att_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "chat_att_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "chat_att_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
