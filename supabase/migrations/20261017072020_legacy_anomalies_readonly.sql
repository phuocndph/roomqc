-- A0: retain legacy history but stop unaudited browser edits of provider facts
-- and resolution state. A2 will introduce a versioned, audited case command.
-- Backend ingestion keeps its existing service_role permissions; this does
-- not settle a payment, change an entitlement or call a provider.
REVOKE ALL ON TABLE public.payment_anomalies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_anomalies TO authenticated;
DROP POLICY IF EXISTS anomalies_update_owner ON public.payment_anomalies;
