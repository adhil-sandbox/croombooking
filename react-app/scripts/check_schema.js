const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log('--- ROOMS SCHEMA ---');
  const { data: rooms } = await sb.from('rooms').select('*').limit(1);
  console.log(rooms);

  console.log('--- COMPANIES SCHEMA ---');
  const { data: companies } = await sb.from('companies').select('*').limit(1);
  console.log(companies);

  console.log('--- MEMBERS SCHEMA ---');
  const { data: members } = await sb.from('members').select('*').limit(1);
  console.log(members);

  console.log('--- PROFILES SCHEMA ---');
  const { data: profiles } = await sb.from('profiles').select('*').limit(1);
  console.log(profiles);
}

check().catch(console.error);
