-- W1 remediation: chat object keys must use the canonical conversation UUID
-- as the first path segment.  The former policy only cast the segment to uuid,
-- which also accepted a hyphen-less 32-character UUID and allowed an object
-- path that the chat attachment trigger would never accept.

DROP POLICY IF EXISTS "chat_att_select_scoped" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_insert_scoped" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_delete_scoped" ON storage.objects;

CREATE POLICY "chat_att_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "chat_att_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "chat_att_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
