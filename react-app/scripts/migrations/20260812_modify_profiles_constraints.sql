-- Migration: modify profiles constraints to avoid delete/update failures
-- - Ensure deleting a company sets profiles.company_id = NULL
-- - Enforce that only 'member' profiles must have a company_id
-- Run this in Supabase SQL editor or via psql in your project DB.

BEGIN;

-- Remove existing check constraint if present
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_profile_role_company;

-- Remove existing FK constraint if present (common default name)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_company_id_fkey;

-- Recreate FK with ON DELETE SET NULL so deleting a company won't fail
ALTER TABLE profiles
  ADD CONSTRAINT profiles_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- Recreate check constraint: if role = 'member' then company_id must be non-null
ALTER TABLE profiles
  ADD CONSTRAINT chk_profile_role_company
  CHECK (role <> 'member' OR company_id IS NOT NULL);

COMMIT;

-- NOTE: If your DB uses different constraint names, inspect and replace
-- the constraint identifiers accordingly before running.
