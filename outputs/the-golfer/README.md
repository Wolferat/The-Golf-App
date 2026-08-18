# Golfolio launch setup

## Environment variables in Vercel

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (safe to return to the browser; it is the public key)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose it in browser code)
- `OPENAI_API_KEY` (server-only; used only by admin-triggered AI search/research)
- `CRON_SECRET` (server-only; used by `/api/expire`, never by public pages)
- `GOLFOLIO_APP_URL` (optional; approved origin for email redirects)

There is **no scheduled AI listing search**. Manual AI search and research run only when an admin clicks a button. The only cron is `/api/expire`, which expires dated events and never calls OpenAI.

## SQL to run in Supabase

Run these in the SQL Editor if they have not already been applied:

1. `supabase/schema.sql`
2. `supabase/player-hub-migration.sql`
3. `supabase/user-settings-migration.sql`
4. `supabase/company-settings-migration.sql`
5. `supabase/listing-control-migration.sql`

Public pages show only `approved` listings. AI leads and enrichments stay private until an admin approves or applies them.

## Sherman beta area

Current beta search area is a **30-mile radius centered on Sherman, Texas** (`33.6357`, `-96.6089`). Admins can change the label, coordinates, and radius in Company Settings.

SQL for this:

6. `supabase/sherman-beta-area-migration.sql` (additive; does not delete listings)

Destructive, manual-only catalog reset (do not run from the app):

- `supabase/RESET-ALL-LISTINGS.sql`
