-- Directory only. The installer checks its independent target inventory against
-- the primary binding. URLs/references are metadata; no credential is exposed.
GRANT SELECT(api_url,credential_ref) ON roomqc_control.clusters TO roomqc_control_release_installer;
