-- JSON construction helpers are STABLE in PostgreSQL. Match their declared
-- volatility instead of overstating the wrapper's optimizer guarantees.
ALTER FUNCTION private.validate_subscription_execution_scope(jsonb) STABLE;
