-- Evaluate Supabase auth helpers once per statement instead of once per row.
-- The policy predicates remain unchanged; only the evaluation strategy changes.
DO $$
DECLARE
  policy_row record;
  using_expression text;
  check_expression text;
  statement text;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'private')
      AND (
        coalesce(qual, '') LIKE '%auth.uid()%'
        OR coalesce(qual, '') LIKE '%auth.role()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.role()%'
      )
  LOOP
    using_expression := CASE
      WHEN policy_row.qual IS NULL THEN NULL
      ELSE replace(
        replace(policy_row.qual, 'auth.uid()', '(select auth.uid())'),
        'auth.role()', '(select auth.role())'
      )
    END;

    check_expression := CASE
      WHEN policy_row.with_check IS NULL THEN NULL
      ELSE replace(
        replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())'),
        'auth.role()', '(select auth.role())'
      )
    END;

    statement := format(
      'ALTER POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );

    IF using_expression IS NOT NULL THEN
      statement := statement || format(' USING (%s)', using_expression);
    END IF;

    IF check_expression IS NOT NULL THEN
      statement := statement || format(' WITH CHECK (%s)', check_expression);
    END IF;

    EXECUTE statement;
  END LOOP;
END;
$$;
