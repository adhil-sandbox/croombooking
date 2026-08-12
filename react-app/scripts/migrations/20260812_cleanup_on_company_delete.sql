-- Migration: make monthly usage recompute safe and clean related data on company delete
-- - Replaces recompute_monthly_usage to no-op if company is missing
-- - Adds triggers to clean profiles and monthly_usage before company delete
-- - Removes any orphaned monthly_usage rows

BEGIN;

-- 1) Make recompute_monthly_usage safe when company no longer exists
CREATE OR REPLACE FUNCTION recompute_monthly_usage(p_company_id uuid, p_year_month text)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RETURN;
  END IF;

  INSERT INTO monthly_usage (company_id, year_month, hours_used, extra_hours_used, updated_at)
  SELECT
    p_company_id,
    p_year_month,
    COALESCE(SUM(hours) FILTER (WHERE status IN ('confirmed','completed')), 0),
    COALESCE(SUM(extra_hours) FILTER (WHERE status IN ('confirmed','completed')), 0),
    now()
  FROM bookings
  WHERE company_id = p_company_id
    AND to_char(booking_date, 'YYYY-MM') = p_year_month
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET hours_used = EXCLUDED.hours_used,
                extra_hours_used = EXCLUDED.extra_hours_used,
                updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- 2) Trigger to set linked profiles to pending and null company before deleting a company
CREATE OR REPLACE FUNCTION cleanup_profiles_on_company_delete()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles
  SET role = 'pending', company_id = NULL
  WHERE company_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_before_company_delete ON companies;
CREATE TRIGGER trg_profiles_before_company_delete
BEFORE DELETE ON companies
FOR EACH ROW
EXECUTE FUNCTION cleanup_profiles_on_company_delete();

-- 3) Trigger to remove monthly_usage rows for a company before it's deleted
CREATE OR REPLACE FUNCTION cleanup_monthly_usage_on_company_delete()
RETURNS trigger AS $$
BEGIN
  DELETE FROM monthly_usage WHERE company_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_usage_before_company_delete ON companies;
CREATE TRIGGER trg_monthly_usage_before_company_delete
BEFORE DELETE ON companies
FOR EACH ROW
EXECUTE FUNCTION cleanup_monthly_usage_on_company_delete();

-- 4) Cleanup: remove any orphaned monthly_usage rows that reference missing companies
DELETE FROM monthly_usage mu
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = mu.company_id);

COMMIT;

-- Note: run this migration in Supabase SQL editor. Review delete step before running in production.
