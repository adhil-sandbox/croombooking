# Sandbox Conference Room Booking

A single-file, no-build-step web app for booking SB1/SB2 conference rooms, with
admin quota management, approval workflow, and an analytics dashboard.

Stack: **Supabase** (Postgres + Auth + RLS) as the backend, **vanilla HTML/JS**
+ Chart.js on the frontend — one HTML file, no framework, no build tooling.
This matches the architecture used for the other Sandbox internal tools.

---

## 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste the entire contents of `schema.sql` → Run.
   This creates all tables, the overlap-prevention constraint, triggers that
   keep `monthly_usage` in sync automatically, and all RLS policies.
3. Go to **Project Settings → API** and copy your **Project URL** and
   **anon public key**.
4. Open `app.html` and fill in:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";
   ```

## 2. Create the admin account

Everyone who uses this app signs in — admins with their own account, each
company with its own account (see "Trust model" below).

1. In Supabase → **Authentication → Users → Add user**, create your own
   admin account with an email + password.
2. Copy that user's UUID.
3. In **SQL Editor**, run:
   ```sql
   insert into profiles (id, role, full_name)
   values ('<paste-uuid-here>', 'admin', 'Your Name');
   ```
4. Open `app.html` in a browser and sign in on the login screen — Approvals /
   Members / Dashboard show up once you're in.

Repeat step 3 for any other admins; there's no separate "add admin" screen
in the app on purpose, since it's a rare, high-trust action.

## 3. Add companies & members, and give each company a login (as admin)

Use **Members** in the sidebar to add each company: company name, contact
person, category (Member / Virtual Office), and monthly hour allocation
(10h / 20h, or 4h which is the Virtual Office default). This creates a row in
`companies` and a linked row in `members`.

To give that company a login of its own:

1. In Supabase → **Authentication → Users → Add user**, create an account
   for the company (any email/password you'll share with them works — it
   doesn't need to be a real inbox).
2. Copy that user's UUID.
3. Paste it into the **"Login user UUID"** field on that company in the
   Members screen and save. That links the auth account to the company
   (`profiles.role = 'member'`, `profiles.company_id = <that company>`).

You can also add a company first and link the login later — the field is
optional and a company without a login just won't be able to sign in yet.
Share the email/password with the company; that's what they'll use to sign
into `app.html`.

## 4. Run it

`app.html` is a static file — open it directly, or host it anywhere static
(Vercel, Netlify, Cloudflare Pages, a plain S3 bucket, or your own server).
There's no build step and no server code to deploy beyond Supabase itself.

---

## What's implemented

- **Two rooms** (SB1/6-seat, SB2/8-seat) with independent, overlap-safe
  schedules — enforced at the database level with a Postgres exclusion
  constraint (`no_overlapping_room_bookings`), not just in the UI.
- **Admin**: add/edit/deactivate members (company + contact), set category
  and monthly allocation (10h/20h, Virtual Office defaults to 4h).
- **Members**: book rooms, edit/cancel their own bookings, see remaining
  quota, view booking history with filters (status, date range).
- **Business rules enforced server-side via RLS + constraints, and
  client-side for instant feedback**:
  - Max 4 hours/day per member (across both rooms).
  - Monthly quota per company; Virtual Office fixed at 4h unless overridden.
  - Over-quota bookings go to `pending_approval` instead of auto-confirming;
    admin can approve (confirms + tracks `extra_hours` separately) or reject.
  - Bookings snap to 30-minute slots, 9:30 AM–6:00 PM only.
  - Cancelling a booking automatically frees up its quota (the
    `monthly_usage` rollup recomputes via a DB trigger the moment status
    changes, so there's nothing to keep in sync manually).
- **Calendar**: day/week views, sticky time column, click-and-drag slot
  selection, color-coded rooms, a visually distinct pattern for
  pending-approval bookings.
- **Dashboard**: hours/utilization per room, a time-of-day popularity
  heatmap, most/least active companies, per-company usage table with
  extra-hours called out, pending/rejected counts.
- **Notifications**: in-app notification center (bell icon) for booking
  confirmed/cancelled/approved/rejected and admin approval-needed alerts.
  Rows are written by the app whenever a relevant action happens.
- **Light/dark mode**, responsive layout, Notion/Linear-style visual design.
- **Audit-log table** (`audit_log`) is included in the schema, ready for you
  to write into from any admin action if/when you want a full audit trail —
  not yet wired into the UI actions themselves.

## What's intentionally left as a next step

A few items from the original spec need a small server-side component
(a Supabase Edge Function, or any tiny cron-capable backend) because a
static HTML file has no way to run code when nobody has the tab open:

- **30-minutes-before reminder notifications** — needs a scheduled job
  (Supabase Cron + an Edge Function that queries upcoming bookings and
  inserts/sends reminders) rather than client-side code.
- **Email / WhatsApp delivery of notifications** — the `notifications`
  table already captures every event; wiring it to Resend/SendGrid (email)
  or the WhatsApp Business API is a matter of adding a Postgres webhook or
  Edge Function that fires on insert.
- **Outlook/Google Calendar sync, QR check-in, visitor management, catering
  and equipment booking, multi-location support, recurring bookings** — all
  called out as future enhancements in the spec. The schema is deliberately
  normalized (separate `companies`/`members`/`rooms`/`bookings` tables,
  enum-typed status) so these extend it rather than requiring a rework —
  e.g. recurring bookings would add a `recurrence_rule` column and a small
  generator function; equipment booking would add an `equipment` table and
  a join table against `bookings`.
- **Monthly view** on the calendar — day/week are implemented; a month
  overview (bookings-per-day summary rather than a full time grid) is a
  smaller follow-up.

## Trust model — please read before you deploy this

**Every company signs in.** There's no anonymous access at all — the app
shows a login screen until someone signs in, either as their own company
(`profiles.role = 'member'`, linked to exactly one `company_id`) or as an
admin (`profiles.role = 'admin'`). A signed-in company sees the full
calendar (so it can tell which slots are free), but can only create or
cancel bookings under its **own** `company_id` — enforced both by RLS
policies and, for the cancel path specifically, by a database trigger that
also blocks changing any field other than `status -> 'cancelled'`. Concretely,
with the `schema.sql` policies as written:

- A company can't create a booking for another company, and can't cancel
  another company's booking — Postgres checks this on every write,
  regardless of what the client sends.
- The daily limit, monthly quota, business-hours window, and no-overlap
  rules are still enforced by the database on top of that, so nobody can
  double-book a room or blow through a quota either by mistake or on
  purpose.
- Everything that could actually damage the system — deleting a company,
  changing someone's quota, approving an over-quota request, deactivating a
  member — is admin-only and requires a real Supabase Auth admin session.

The trade-off versus a kiosk-style no-login flow: every company now needs a
login (email + password) instead of just picking their name from a dropdown.
See "Add companies & members, and give each company a login" above for how
to set that up — it's a one-time thing per company, not per booking.

## Notes on the approach

- **Quota math lives in Postgres**, not just the client: `monthly_usage` is
  a rollup table kept in sync by an `AFTER INSERT/UPDATE/DELETE` trigger on
  `bookings`, so it's always correct even if multiple people book
  concurrently or a booking is edited/cancelled later. The client also
  does a pre-check before submitting so people get instant feedback instead
  of waiting on a round trip that fails.
- **Overlap prevention** uses a Postgres `EXCLUDE` constraint on a
  generated `tsrange` column — this is race-condition-safe in a way that
  "check then insert" in application code never fully is.
