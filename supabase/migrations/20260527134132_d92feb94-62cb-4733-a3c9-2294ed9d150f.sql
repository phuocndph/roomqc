
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
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_me = _peer_user_id THEN RAISE EXCEPTION 'CHAT_CANNOT_DM_SELF'; END IF;

  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = v_me;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;

  -- Validate me thuộc hotel (hoặc cùng tenant với hotel - cho Owner)
  IF NOT EXISTS (SELECT 1 FROM public.user_hotels WHERE user_id = v_me AND hotel_id = _hotel_id)
     AND NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND tenant_id = v_tenant)
  THEN
    RAISE EXCEPTION 'CHAT_USER_NOT_IN_HOTEL';
  END IF;

  -- Validate peer thuộc hotel (hoặc cùng tenant)
  IF NOT EXISTS (SELECT 1 FROM public.user_hotels WHERE user_id = _peer_user_id AND hotel_id = _hotel_id)
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = _peer_user_id AND tenant_id = v_tenant)
  THEN
    RAISE EXCEPTION 'CHAT_PEER_NOT_IN_HOTEL';
  END IF;

  IF v_me < _peer_user_id THEN
    v_a := v_me; v_b := _peer_user_id;
  ELSE
    v_a := _peer_user_id; v_b := v_me;
  END IF;
  v_key := v_a::text || ':' || v_b::text;

  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE tenant_id = v_tenant AND hotel_id = _hotel_id
    AND type = 'direct' AND direct_key = v_key
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
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

  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = v_me;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = _hotel_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'CHAT_HOTEL_WRONG_TENANT';
  END IF;

  v_all_ids := ARRAY(SELECT DISTINCT unnest(_member_ids || ARRAY[v_me]));

  IF EXISTS (
    SELECT 1 FROM unnest(v_all_ids) m(uid)
    WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = m.uid AND tenant_id = v_tenant)
  ) THEN
    RAISE EXCEPTION 'CHAT_MEMBER_WRONG_TENANT';
  END IF;

  INSERT INTO public.conversations (tenant_id, hotel_id, type, name, created_by)
  VALUES (v_tenant, _hotel_id, 'group', trim(_name), v_me)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
  VALUES (v_conv_id, v_me, v_tenant, 'admin');

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
    IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid AND tenant_id = v_tenant) THEN
      INSERT INTO public.conversation_members (conversation_id, user_id, tenant_id, role)
      VALUES (_conversation_id, v_uid, v_tenant, 'member')
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL;
    END IF;
  END LOOP;
END;
$$;
