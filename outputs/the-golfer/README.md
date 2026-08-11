# Golfolio launch setup

## Environment variables in Vercel

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (safe to return to the browser; it is the public key)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose it in browser code)
- `OPENAI_API_KEY` (server-only; already added to Vercel)
- `CRON_SECRET` (a long random value used only by the scheduled discovery job)

Run `supabase/schema.sql` once in the Supabase SQL Editor. In Supabase Authentication, set the site URL to the Golfolio Vercel address and enable email confirmation.

The public board reads only `approved` rows. The daily 6:00 AM Central discovery job uses OpenAI web search, then inserts only `pending` rows. An admin reviews those rows in Supabase before changing their status to `approved`; nothing discovered by AI can appear automatically.
