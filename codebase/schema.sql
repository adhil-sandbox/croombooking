-- ============================================================
-- Sandbox Conference Room Booking System — Supabase Schema
-- ============================================================
-- Run this whole file in the Supabase SQL editor on a fresh
-- project. Safe to re-run (uses IF NOT EXISTS / DROP guards).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
do $$ begin
  create type company_category as enum ('member', 'virtual_office');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('confirmed', 'pending_approval', 'cancelled', 'completed', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_recipient as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

-- ---------- Companies ----------
create table if not exists companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category company_category not null default 'member',
  -- monthly allocation in hours. Virtual Office is fixed at 4 and locked
  -- unless an admin explicitly overrides it.
  monthly_hours_allocation numeric not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce Virtual Office default of 4 hours at insert time (admin can still edit later)
create or replace function set_virtual_office_default()
returns trigger as $$
begin
  if new.category = 'virtual_office' and (tg_op = 'INSERT') then
    new.monthly_hours_allocation := coalesce(new.monthly_hours_allocation, 4);
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_company_defaults on companies;
create trigger trg_company_defaults
before insert or update on companies
for each row execute function set_virtual_office_default();

-- ---------- Members (contacts within a company) ----------
-- No login/auth of their own — members are selected from a dropdown in the
-- app, not authenticated. Only admins have real accounts (see `profiles`).
create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Profiles ----------
-- Supports 'admin', 'member', and 'pending' roles.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending',
  full_name text,
  -- set only for role='member' logins: which company this login acts as.
  -- null for admins and pending users.
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Keep company_id/role consistent
do $$ begin
  alter table profiles add constraint chk_profile_role_company check (
    (role = 'admin' and company_id is null) or
    (role = 'member' and company_id is not null) or
    (role = 'pending')
  );
exception when duplicate_object then null; end $$;

-- ---------- Conference Rooms ----------
create table if not exists rooms (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  seats integer not null,
  is_active boolean not null default true
);

insert into rooms (name, seats)
  select 'SB1', 6 where not exists (select 1 from rooms where name = 'SB1');
insert into rooms (name, seats)
  select 'SB2', 8 where not exists (select 1 from rooms where name = 'SB2');

-- ---------- Bookings ----------
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete restrict,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  hours numeric not null,
  -- hours that fall outside the monthly quota (0 unless approved-over-quota)
  extra_hours numeric not null default 0,
  status booking_status not null default 'confirmed',
  notes text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_time_order check (end_time > start_time),
  constraint chk_business_hours check (
    start_time >= time '09:30' and end_time <= time '18:00'
  ),
  constraint chk_half_hour_grid check (
    (extract(minute from start_time)::int % 30 = 0) and
    (extract(minute from end_time)::int % 30 = 0)
  ),
  constraint chk_max_daily_hours check (hours <= 4)
);

create index if not exists idx_bookings_room_date on bookings(room_id, booking_date);
create index if not exists idx_bookings_company on bookings(company_id);
create index if not exists idx_bookings_status on bookings(status);

-- Prevent overlapping bookings on the same room for active (confirmed / pending / completed) statuses.
-- Uses an exclusion constraint over a computed tsrange.
create extension if not exists btree_gist;

alter table bookings add column if not exists time_range tsrange
  generated always as (
    tsrange(booking_date + start_time, booking_date + end_time, '[)')
  ) stored;

do $$ begin
  alter table bookings add constraint no_overlapping_room_bookings
    exclude using gist (
      room_id with =,
      time_range with &&
    ) where (status in ('confirmed', 'pending_approval', 'completed'));
exception when duplicate_object then null; end $$;

-- ---------- Monthly usage (materialized rollup, refreshed by trigger) ----------
create table if not exists monthly_usage (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  year_month char(7) not null, -- 'YYYY-MM'
  hours_used numeric not null default 0,
  extra_hours_used numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (company_id, year_month)
);

create or replace function recompute_monthly_usage(p_company_id uuid, p_year_month char(7))
returns void as $$
begin
  insert into monthly_usage (company_id, year_month, hours_used, extra_hours_used, updated_at)
  select
    p_company_id,
    p_year_month,
    coalesce(sum(hours) filter (where status in ('confirmed','completed')), 0),
    coalesce(sum(extra_hours) filter (where status in ('confirmed','completed')), 0),
    now()
  from bookings
  where company_id = p_company_id
    and to_char(booking_date, 'YYYY-MM') = p_year_month
  on conflict (company_id, year_month)
  do update set hours_used = excluded.hours_used,
                extra_hours_used = excluded.extra_hours_used,
                updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function trg_bookings_usage_sync()
returns trigger as $$
declare
  affected_company uuid;
  affected_month char(7);
begin
  if tg_op = 'DELETE' then
    affected_company := old.company_id;
    affected_month := to_char(old.booking_date, 'YYYY-MM');
  else
    affected_company := new.company_id;
    affected_month := to_char(new.booking_date, 'YYYY-MM');
  end if;

  perform recompute_monthly_usage(affected_company, affected_month);

  if tg_op = 'UPDATE' and old.booking_date <> new.booking_date then
    perform recompute_monthly_usage(old.company_id, to_char(old.booking_date, 'YYYY-MM'));
  end if;

  new.updated_at := now();
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_bookings_usage on bookings;
create trigger trg_bookings_usage
after insert or update or delete on bookings
for each row execute function trg_bookings_usage_sync();

-- Also touch updated_at on plain updates (the AFTER trigger above can't mutate NEW,
-- so use a BEFORE trigger for that specifically)
create or replace function trg_bookings_touch()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bookings_touch_before on bookings;
create trigger trg_bookings_touch_before
before update on bookings
for each row execute function trg_bookings_touch();

-- ---------- Notifications ----------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_type notification_recipient not null,
  -- for member notifications, recipient_id = members.id; for admin, null (broadcast to all admins)
  recipient_id uuid references members(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  type text not null, -- 'confirmed' | 'cancelled' | 'approved' | 'rejected' | 'reminder' | 'quota_exceeded' | 'approval_needed'
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on notifications(recipient_type, recipient_id);

-- ---------- Audit log ----------
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table companies enable row level security;
alter table members enable row level security;
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table bookings enable row level security;
alter table monthly_usage enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

-- Helper: is the current user an admin?
-- Anonymous visitors (auth.uid() is null) are never admins.
create or replace function is_admin()
returns boolean as $$
  select coalesce((
    select true from profiles where id = auth.uid() and role::text = 'admin'
  ), false);
$$ language sql stable security definer;

-- Helper: which company (if any) does the current login act as?
-- Null for admins and for anyone not signed in.
create or replace function my_company_id()
returns uuid as $$
  select company_id from profiles where id = auth.uid() and role::text = 'member';
$$ language sql stable security definer;

-- ------------------------------------------------------------
-- Trust model: per-company login. Every company that books a room
-- has its own Supabase Auth account (role='member' in `profiles`,
-- linked via profiles.company_id), and admins have their own
-- accounts (role='admin'). There is no anonymous/anon access at
-- all — every policy below is scoped `to authenticated`, so a
-- request with no valid session is refused outright, and a signed-
-- in company can only create/cancel bookings for its own
-- company_id. Everything that could damage the system — deleting a
-- company, changing quotas, approving over-quota requests,
-- deactivating a member — stays admin-only. The one place this
-- matters most (mutating a booking) is additionally locked down by
-- a trigger below so a non-admin request can only flip
-- status -> 'cancelled' on a booking that belongs to their own
-- company, nothing else.
-- ------------------------------------------------------------

-- Rooms: any signed-in login (admin or company) can read active rooms;
-- only admin writes. No anon access.
drop policy if exists rooms_select on rooms;
drop policy if exists rooms_admin_write on rooms;
create policy rooms_select on rooms for select to authenticated using (true);
create policy rooms_admin_write on rooms for all to authenticated using (is_admin()) with check (is_admin());

-- Companies: admin full CRUD; any signed-in user can read companies to display booking owner names.
drop policy if exists companies_admin_all on companies;
drop policy if exists companies_self_read on companies;
drop policy if exists companies_public_read on companies;
create policy companies_admin_all on companies for all to authenticated using (is_admin()) with check (is_admin());
create policy companies_public_read on companies for select to authenticated using (true);

-- Members: admin full CRUD; a company login can read only its own
-- company's members (needed for the "acting contact" dropdown).
drop policy if exists members_admin_all on members;
drop policy if exists members_public_read on members;
create policy members_admin_all on members for all to authenticated using (is_admin()) with check (is_admin());
create policy members_self_read on members for select to authenticated
  using (is_admin() or company_id = my_company_id());

-- Profiles: never touched by anon. A signed-in login can read its own row;
-- admins can read/write any row (needed to link a company's auth user to its
-- company_id from the Members screen).
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for select to authenticated using (id = auth.uid() or is_admin());
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for insert to authenticated with check (is_admin() or id = auth.uid());
drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update to authenticated using (is_admin() or id = auth.uid());

-- Bookings: admin full access. Any signed-in company can read every booking
-- (needed to render room availability across the whole calendar, not just
-- their own), but can only create a booking for its own company_id, and can
-- only cancel a booking that belongs to its own company_id — the trigger
-- below additionally stops that update from changing anything except
-- status -> 'cancelled'.
drop policy if exists bookings_admin_all on bookings;
drop policy if exists bookings_read_all on bookings;
drop policy if exists bookings_public_insert on bookings;
drop policy if exists bookings_public_cancel on bookings;
create policy bookings_admin_all on bookings for all to authenticated using (is_admin()) with check (is_admin());
create policy bookings_read_all on bookings for select to authenticated using (true);
create policy bookings_self_insert on bookings for insert to authenticated
  with check (is_admin() or company_id = my_company_id());
create policy bookings_self_cancel on bookings for update to authenticated
  using (is_admin() or (company_id = my_company_id() and status in ('confirmed','pending_approval')))
  with check (true);

-- Non-admin updates on bookings may only be a cancellation of their OWN
-- company's booking — nothing else about the row may change, and the
-- company_id can't be swapped to someone else's. Admins are exempt.
create or replace function enforce_anon_booking_update()
returns trigger as $$
begin
  if is_admin() then
    return new;
  end if;
  if old.company_id is distinct from my_company_id()
     or new.status is distinct from 'cancelled'
     or new.company_id is distinct from old.company_id
     or new.member_id is distinct from old.member_id
     or new.room_id is distinct from old.room_id
     or new.booking_date is distinct from old.booking_date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.hours is distinct from old.hours
     or new.extra_hours is distinct from old.extra_hours
  then
    raise exception 'You can only cancel a booking that belongs to your own company.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_anon_booking_update on bookings;
create trigger trg_enforce_anon_booking_update
before update on bookings
for each row execute function enforce_anon_booking_update();

-- Monthly usage: admin all; a company login sees only its own usage row.
drop policy if exists usage_admin_all on monthly_usage;
drop policy if exists usage_public_read on monthly_usage;
create policy usage_admin_all on monthly_usage for all to authenticated using (is_admin()) with check (is_admin());
create policy usage_self_read on monthly_usage for select to authenticated
  using (is_admin() or company_id = my_company_id());

-- Notifications: admin sees everything. A company login can read/insert only
-- "member"-targeted notifications addressed to one of its own company's
-- contacts — never another company's, and never the admin-targeted ones.
drop policy if exists notif_admin_all on notifications;
drop policy if exists notif_public_read on notifications;
drop policy if exists notif_public_insert on notifications;
create policy notif_admin_all on notifications for all to authenticated using (is_admin()) with check (is_admin());
create policy notif_self_read on notifications for select to authenticated
  using (
    is_admin() or (
      recipient_type = 'member' and exists (
        select 1 from members m where m.id = recipient_id and m.company_id = my_company_id()
      )
    )
  );
create policy notif_self_insert on notifications for insert to authenticated
  with check (
    is_admin() or recipient_type = 'admin' or (
      recipient_type = 'member' and exists (
        select 1 from members m where m.id = recipient_id and m.company_id = my_company_id()
      )
    )
  );

-- Audit log: admin only.
drop policy if exists audit_admin_only on audit_log;
create policy audit_admin_only on audit_log for all using (is_admin()) with check (is_admin());

-- ============================================================
-- Seed: bootstrap notes
-- ============================================================
-- Admin: after creating a user in Supabase Auth (Authentication -> Users ->
-- Add user), insert their profile once so they're recognized as an admin:
--   insert into profiles (id, role, full_name) values ('<auth-user-uuid>', 'admin', 'Your Name');
--
-- Company login: same idea, but link it to a company instead. Create the
-- auth user the same way, then either run:
--   insert into profiles (id, role, full_name, company_id)
--   values ('<auth-user-uuid>', 'member', '<Company Name>', '<companies.id>');
-- or paste the auth user's UUID into the "Login user UUID" field on that
-- company in the Members screen (as admin) — it does the same insert for
-- you. See README.md.
