/*
  Script: sync_profiles_to_members.js
  Purpose: For each profile with role='member' and a company_id, ensure there
  is a corresponding row in `members` with the profile's full name as contact_name.

  Usage (from react-app/):
    npm install @supabase/supabase-js dotenv
    node scripts/sync_profiles_to_members.js

  The script reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
  react-app/.env (via dotenv). It will print a summary of inserts.
*/

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in react-app/.env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('Fetching profiles (role=member) ...');
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id, full_name, company_id').eq('role', 'member').not('company_id', 'is', null);
  if (pErr) { console.error('Failed to fetch profiles:', pErr.message); process.exit(1); }

  let inserted = 0;
  for (const p of profiles || []) {
    const contactName = p.full_name || 'Primary Contact';
    // Check for existing member with same company and name
    const { data: existing, error: e1 } = await sb.from('members').select('id').eq('company_id', p.company_id).eq('contact_name', contactName).limit(1).maybeSingle();
    if (e1) { console.error('Lookup error for profile', p.id, e1.message); continue; }
    if (existing) {
      console.log(`Skipping ${contactName} (company ${p.company_id}) — already exists.`);
      continue;
    }

    const { data: ins, error: insErr } = await sb.from('members').insert({ company_id: p.company_id, contact_name: contactName, is_active: true }).select().single();
    if (insErr) {
      console.error('Insert failed for', contactName, insErr.message);
    } else {
      console.log('Inserted member', ins.id, 'for profile', p.id, contactName);
      inserted += 1;
    }
  }

  console.log(`Done. Inserted ${inserted} new members.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(2); });
