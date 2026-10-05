
-- Drop old anonymous-only policies
DROP POLICY IF EXISTS "Anonymous can view scan session by id" ON document_scan_sessions;
DROP POLICY IF EXISTS "Anonymous can complete scan sessions" ON document_scan_sessions;

-- Allow anyone (authenticated or anonymous) to view scan sessions by UUID
CREATE POLICY "Anyone can view scan session by id"
  ON document_scan_sessions FOR SELECT
  USING (true);

-- Allow anyone to update pending sessions to completed
CREATE POLICY "Anyone can complete pending scan sessions"
  ON document_scan_sessions FOR UPDATE
  USING (status = 'pending')
  WITH CHECK (status = 'completed');
