-- Dedicated private resources. The probe cannot upload, mutate buckets or join
-- application channels. Object bytes are installed by the release pipeline.
DO $required$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL
    OR to_regclass('realtime.messages') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='realtime.messages'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Storage and Realtime must be initialized with RLS before installing canaries';
  END IF;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='roomqc-control-probe') THEN
    RAISE EXCEPTION 'Canary bucket already exists; installer must verify ownership rather than adopt data';
  END IF;
END
$required$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('roomqc-control-probe','roomqc-control-probe',false,4096,ARRAY['application/octet-stream']);

GRANT USAGE ON SCHEMA storage,realtime TO roomqc_control_probe;
GRANT SELECT ON storage.buckets,storage.objects TO roomqc_control_probe;
CREATE POLICY roomqc_probe_bucket_read ON storage.buckets FOR SELECT TO roomqc_control_probe
  USING (id='roomqc-control-probe');
CREATE POLICY roomqc_probe_object_read ON storage.objects FOR SELECT TO roomqc_control_probe
  USING (bucket_id='roomqc-control-probe' AND name='health.bin');

GRANT SELECT,INSERT ON realtime.messages TO roomqc_control_probe;
GRANT EXECUTE ON FUNCTION realtime.topic() TO roomqc_control_probe;
CREATE POLICY roomqc_probe_broadcast_read ON realtime.messages FOR SELECT TO roomqc_control_probe
  USING (extension='broadcast' AND (SELECT realtime.topic())='roomqc-control-probe');
CREATE POLICY roomqc_probe_broadcast_write ON realtime.messages FOR INSERT TO roomqc_control_probe
  WITH CHECK (extension='broadcast' AND (SELECT realtime.topic())='roomqc-control-probe');

NOTIFY pgrst, 'reload schema';
