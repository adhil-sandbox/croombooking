-- Inserts members for profiles that are role='member' but don't have
-- a matching members row with the same company and contact name.
-- Run this in the Supabase SQL editor for your project.

-- Safety: this only inserts rows when there is no existing member with
-- the same `company_id` and `contact_name` matching the profile's full_name.
INSERT INTO members (company_id, contact_name, email, phone, is_active, created_at)
SELECT p.company_id,
       coalesce(p.full_name, 'Primary Contact') as contact_name,
       NULL as email,
       NULL as phone,
       true as is_active,
       now() as created_at
FROM profiles p
WHERE p.role = 'member'
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM members m
    WHERE m.company_id = p.company_id
      AND p.full_name IS NOT NULL
      AND m.contact_name = p.full_name
  );

-- Optional: inspect what would be inserted first by running the SELECT alone:
-- SELECT p.company_id, coalesce(p.full_name,'Primary Contact') as contact_name
-- FROM profiles p
-- WHERE p.role = 'member' AND p.company_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM members m WHERE m.company_id = p.company_id
--       AND p.full_name IS NOT NULL AND m.contact_name = p.full_name
--   );
