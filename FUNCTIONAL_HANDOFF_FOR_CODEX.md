# Functional Handoff for Codex

## Branch and state

- **Branch:** `cursor/functional-launch-foundation-20b8`
- **Baseline:** `3d775c86c2ab35fb2bd08b1781f7638feb1047f0` (from `origin/cursor/venue-community-reviews-20b8`)
- **Production:** not changed — no deploy, no production migrations, no Supabase production edits, no Apple submission

## Completed functionality

### Discovery, categories, location, event dates
- Shared category mapping: All Golf | Courses (`course`) | Tournaments (`tournament`, `charity`, `corporate`) | Simulators (`simulator`) | Practice & Lessons (`training`)
- Explore board applies user kind prefs and grouped tournament filter
- Manual US city/ZIP lookup via `/api/location` with local TX ZIP index; optional `GOOGLE_GEOCODING_API_KEY` for unresolved ZIPs (cached, rate-limited)
- Distant locations resolve honestly but do not expand the Sherman launch catalog; listings without coordinates remain visible when location filtering would hide everything
- Event timezone utilities with `America/Chicago` default, date-only support, unchanged-save preservation, DST/date-only expiration tests
- Admin listing save uses timezone-aware parsing instead of raw UTC `datetime-local` shift

### Saved listings and private rounds
- `saved_listings` table/API with ownership, uniqueness, graceful unavailable targets
- All existing rounds migrated to `private`; RLS enforces owner-only access
- Round creation forced to `private` in API and hub UI
- One-time rounds privacy notice in Settings

### Social foundation
- Adult-only **self-attestation** (`social_eligibility_status`, timestamp, policy version) — not identity verification
- `social_features_enabled` app setting default **false**
- Legacy `player_follows` preserved as inactive historical data; no auto-friendship conversion
- Consent-based `player_friendships` (request/accept/decline)
- `player_blocks`, `player_reports` with rate limits
- Reporting/blocking available without social eligibility; ineligible users excluded from discovery
- `/api/social` endpoints; Players page wired to attestation + friend requests

### Photo contributions
- Separate `listing_photo_contributions` table and `player-contributions` private bucket
- `/api/photo-contributions` for player submit + admin review
- Reuses existing validation/storage patterns; no auto-publish or cover promotion

### Account lifecycle
- Self-service deletion via `/api/account` gated by `account_deletion_enabled` (default false)
- Removes auth access and ordinary account-owned data; cleans friendships/blocks/reports/follows/rounds/reviews/saved listings
- Narrow `moderation_evidence` retention with configurable `moderation_evidence_retention_days`
- Test mode via `GOLFOLIO_DELETION_TEST_MODE=true` with explicit retention fallback

### Support/community configuration fields
Added to `app_settings` (unset by default except where noted):
- `player_support_email`
- `player_support_url`
- `community_standards_url`
- `safety_help_url`

## Ordered migrations (prepare only — do not run in production from this handoff)

Run in Supabase SQL Editor after existing migrations through `signed-in-data-gate-migration.sql`:

1. `supabase/09-event-timezone-migration.sql`
2. `supabase/10-saved-listings-migration.sql`
3. `supabase/11-private-rounds-migration.sql`
4. `supabase/12-social-foundation-migration.sql`
5. `supabase/13-photo-contributions-migration.sql`
6. `supabase/14-account-lifecycle-migration.sql`

## Environment variable names (never values)

Required existing:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOLFOLIO_APP_URL`
- `CRON_SECRET`

Optional/new for this release:
- `GOOGLE_GEOCODING_API_KEY` — optional distant ZIP/city resolution; local TX index used first
- `GOLFOLIO_DELETION_TEST_MODE` — enables local deletion flow testing without production owner gates
- `MODERATION_EVIDENCE_RETENTION_DAYS_TEST` — overrides test retention days (default 30 in test mode)

Owner-configured in `app_settings` (not env vars):
- `social_features_enabled` (default false)
- `social_eligibility_policy_version`
- `account_deletion_enabled` (default false)
- `moderation_evidence_retention_days` (null until owner decides)
- `player_support_email`, `player_support_url`, `community_standards_url`, `safety_help_url`

## Feature gates and defaults

| Gate | Default | Notes |
|------|---------|-------|
| `social_features_enabled` | false | Enable after policy review + functional tests |
| `social_eligibility_status` | unknown | Existing accounts must self-attest before social discovery/requests |
| `account_deletion_enabled` | false | Enable after retention decision |
| `moderation_evidence_retention_days` | null | Must be set before production deletion |
| Round visibility | private only | Migration + API enforcement |
| Legacy follows | inactive | Historical only |

## Test results (this cloud workspace)

| Suite | Result |
|-------|--------|
| `npm run check:functional` | **21/21 pass** |
| `npm run check:photos` | **21/21 pass** (after `npm install`) |
| `npm run check:experience` | **7/7 pass** |
| `npm run check:mobile` | **3/3 pass** |
| `npm run web:build` | **pass** |
| `npm run ios:sync` | **pass** (Linux — validates sync only, not Xcode/device) |

## Tests not run

- Supabase RLS/storage policy integration against a live database (**NOT RUN** — no confirmed isolated Supabase project in this workspace)
- End-to-end API tests against production or staging Supabase (**NOT RUN**)
- Physical iPhone / Xcode validation (**NOT RUN** on Linux cloud agent)

To run database integration later:
1. Boot isolated local Supabase or confirmed dev project
2. Apply migrations 09–14 in order on a fresh schema through 08
3. Set `SUPABASE_FUNCTIONAL_TEST_URL` and add executable DB integration tests (placeholder documents current NOT RUN state)

## Outstanding policy/configuration decisions (owner)

1. Set real player support contact URLs/emails in Company Settings (do not use placeholders)
2. Decide `moderation_evidence_retention_days` before enabling production deletion
3. Enable `account_deletion_enabled` only after retention testing
4. Enable `social_features_enabled` only after policy review and device testing
5. Expand local ZIP index or enable `GOOGLE_GEOCODING_API_KEY` if full-US manual lookup is required beyond bundled TX/national sample ZIPs
6. Codex visual/copy pass for attestation language, empty states, report UX (currently functional prompts)

## Local startup

```bash
cd outputs/the-golfer
npm install
npm run web:build
npm run check:functional
npm run check:photos
npm run preview:live   # or deploy preview via Vercel with env vars configured
```

For Capacitor sync after web changes:

```bash
npm run ios:sync
npm run ios:open   # Mac only
```

Deletion flow local test:

```bash
export GOLFOLIO_DELETION_TEST_MODE=true
# Optionally: export MODERATION_EVIDENCE_RETENTION_DAYS_TEST=30
# Run against isolated Supabase with migrations 09–14 applied
```

## Native/device checks remaining for Codex (Mac/iPhone)

- [ ] Sign in / sign up / email verification / password reset deep links
- [ ] Location permission prompt on “Use location” and manual city/ZIP fallback
- [ ] Keyboard behavior on auth forms and round logging
- [ ] External links (official website, registration, directions, tel:) open correctly in Capacitor Browser/Safari
- [ ] App resume and session expiry handling
- [ ] Adult self-attestation gate before social discovery
- [ ] Friend request send/accept/decline
- [ ] Report listing flow (replace prompt UI with polished copy)
- [ ] Save listing from detail page
- [ ] Account deletion in test configuration
- [ ] Photo contribution upload to private bucket
- [ ] Verify listing covers and official photo approval still work on device

## Visual work deferred to Codex

This pass intentionally preserved existing visual direction. Codex should finish:
- Copy for self-attestation, privacy notice, empty/distant-location states
- Report/block UI (replace `prompt()` flows)
- Saved listings affordance polish on cards/detail
- Settings layout for social/support/deletion sections
- Complete display/interaction finish without changing functional contracts above

## Conflict notes vs stale handoff docs

- `CURSOR_HANDOFF.md` describes photo-approval work already at baseline `3d775c86`; this branch extends rather than replaces that system
- Do not follow older `cursor/settings-page-20b8` instructions; this branch is from venue-community baseline only
