# Functional Handoff for Codex

## Branch and state

- **Branch:** `cursor/functional-launch-foundation-20b8`
- **Baseline:** `3d775c86c2ab35fb2bd08b1781f7638feb1047f0` (from `origin/cursor/venue-community-reviews-20b8`)
- **Production:** not changed — no deploy, no production migrations, no Supabase production edits, no Apple submission

**This branch is not ready for visual-only finishing.** Core functional flows are implemented end-to-end in code, but several owner-configuration surfaces remain SQL-only, database integration tests were skipped in this workspace, and prompt-based moderation/report UX still needs Codex polish.

---

## Requirement audit (original scope)

Status key: **Implemented** = working API + wired UI in this branch. **Partial** = backend/schema exists but admin UI, device QA, or owner config is incomplete. **Blocked** = depends on production migration, owner decision, or external service not configured here.

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Shared discovery categories (All Golf / Courses / Tournaments / Simulators / Practice) | **Implemented** | `lib/catalog-categories.js`, explore board in `index.html`, tests in `scripts/catalog-categories.test.mjs` |
| Manual US city/ZIP lookup with honest distant handling | **Implemented** | `/api/location`, `lib/us-location.js`, TX ZIP index, optional `GOOGLE_GEOCODING_API_KEY` |
| Event timezone + date-only support | **Implemented** | `lib/event-timezone.js`, migration `09-event-timezone-migration.sql`, admin listing editor |
| Saved listings (ownership, uniqueness, unavailable targets) | **Implemented** | migration `10`, `/api/saved-listings`, Settings saved list + listing detail Save button |
| Private rounds only (migration + API + UI copy) | **Implemented** | migration `11`, API forces `visibility: private`, round modal copy updated, Settings privacy notice |
| Round owner edit/delete + stats beyond 50-row history | **Implemented** | `lib/rounds.js`, `api/player.js` `update_round`/`delete_round`, hub edit/delete buttons, `scripts/rounds.test.mjs` |
| Close legacy player discovery bypass | **Implemented** | `api/player.js` `view=players` requires exact username, routes through `lib/social-discovery.js`, empty search returns 400 |
| Exact-username discovery (no wildcards, no empty directory) | **Implemented** | `lib/social-discovery.js`, `/api/social?view=discovery`, rate limits via `social_rate_events` + `lib/rate-limit.js` |
| Adult self-attestation before social features | **Implemented** | migration `12`, `/api/social` `attest_adult`, Players page gate in `player-pages.js` |
| Consent-based friendships (request/accept/decline) | **Implemented** | `player_friendships`, `/api/social`, Players page panels |
| Cancel request, remove friend, block management | **Implemented** | `/api/social` `cancel_friend_request`, `remove_friend`, `block`/`unblock`, `view=blocks`, UI in `player-pages.js` |
| Unguessable revocable invitations | **Implemented** | migration `15`, `lib/invitations.js`, `/api/social` invitation create/revoke/accept, UI in `player-pages.js` |
| Duplicate/simultaneous request prevention + block recheck on accept | **Implemented** | `existingFriendshipPair` checks in `api/social.js`, `blockedEitherWay` on accept |
| Reporting/blocking without social eligibility | **Implemented** | `canReportOrBlock()` in `lib/social.js`, listing detail report, `/api/social` report/block actions |
| Moderation queue, actions, evidence history, account restrictions | **Partial** | `/api/moderation.js`, migration `15`, admin section in `player-pages.js` listings page — **UI uses prompts**; owner must apply migration before live use |
| Restriction enforcement across endpoints | **Partial** | `account_restricted` enforced on rounds, reviews, photo submit, social discovery; report/block exempt — **not every legacy write path audited on device** |
| Photo contributions (separate from reviews/official photos) | **Implemented** | migration `13`, `/api/photo-contributions`, listing detail form + status list |
| Photo decode/validate/resize/strip metadata + storage rollback | **Implemented** | `lib/contribution-photos.js` (sharp pipeline), MIME rejection, rollback on DB failure |
| Admin contribution review queue | **Implemented** | `/api/photo-contributions?view=admin_queue`, admin button in listings moderation section |
| Account deletion lifecycle (reauth, steps, retry, retention purge) | **Partial** | `lib/account-deletion.js`, `/api/account`, `/api/deletion-cleanup` cron, persisted `pending_storage_objects` (migration `16`) — **server-side retry after auth removal; requires migrations 14–16 + owner gates before production** |
| Support/community configuration surfaced to players | **Partial** | Schema + `/api/social?view=support` + Settings “Help and safety” links — **admin Company settings UI does not edit `player_support_*` / `community_standards_url` / `safety_help_url` (SQL/app_settings only)** |
| Share listing + calendar export on detail page | **Implemented** | `listing-page.js` Share + ICS download handlers |
| Authentication / email change / password reset | **Implemented** (web) | `index.html` sign-in/sign-up/forgot/reset flows; Settings email change via `/api/settings` — **native deep links not implemented** |
| Saved-listings presentation | **Partial** | Settings list + detail save work — **no saved badge on explore cards** |
| Player/admin flows (hub, rounds, listings moderation, company settings) | **Partial** | `player-pages.js` routes exist and call APIs — **prompt-based report/moderation UX; index.html hub still has legacy follow UI in embedded modal path** |
| Executable DB integration tests | **Partial** | `scripts/functional-db.integration.test.mjs` uses disposable test users + user JWTs for RLS/API checks; service role for fixture setup/cleanup only — **4 integration cases skipped here (no isolated test Supabase with anon key configured)** |
| Visual polish | **Deferred to Codex** | Functional contracts above; keep current styling direction |

---

## Working end-to-end (code complete in branch)

### Discovery, categories, location, event dates
- Shared category mapping and explore filters
- `/api/location` with local TX ZIP index; optional Google geocoding
- Event timezone utilities; admin listing save preserves timezone semantics

### Saved listings and private rounds
- `saved_listings` CRUD with graceful unavailable targets
- All rounds private; owner edit/delete; stats from full history (`fetchRoundStats`)

### Social foundation (Phase 2 completion)
- Legacy `/api/player?view=players` no longer browsable; exact username only
- `/api/social?view=discovery` — empty search returns `{ players: [] }`, wildcard rejected, rate limited
- Friendship lifecycle: request, accept, decline, cancel, remove, block/unblock, invitations
- Reporting available without attestation; discovery requires attestation + owner flag

### Moderation
- `/api/moderation` — queue, open/close report, restrict/clear account, action history
- `moderation_actions` table; `account_restricted` on profiles
- Admin moderation section on listings page (reports + photo contribution queue)

### Photo contributions
- Player submit with sharp normalization (rotate, resize max 1600px, JPEG output, metadata stripped)
- MIME declared in data URL validated; corrupt bytes rejected
- Storage rollback if DB insert fails; signed preview URLs; admin review API

### Account lifecycle
- Password reauthentication before deletion
- Storage paths persisted to `pending_storage_objects` before owned-data cleanup (migration `16`)
- Storage enumeration fails closed (query errors abort deletion before auth removal)
- Step-tracked deletion with `cleanup_pending` vs `completed`; cannot complete while required steps unfinished
- Server-side retry via `/api/deletion-cleanup` cron (`CRON_SECRET`); no user-session retry after auth removal
- `/api/purge-evidence` cron for moderation evidence retention purge

### Listing detail actions
- Save listing, share/copy link, ICS calendar export, report listing, photo contribution form + status

---

## API / schema scaffolding (needs migration + owner config before production)

These exist in code/SQL but are **not live** until migrations run and owner toggles are set:

| Item | Default | Notes |
|------|---------|-------|
| `social_features_enabled` | false | Enable after policy review |
| `account_deletion_enabled` | false | Enable after retention decision |
| `moderation_evidence_retention_days` | null | Required before production deletion |
| `player_support_email/url`, `community_standards_url`, `safety_help_url` | null | Set in `app_settings`; no Company settings form fields yet |
| Migrations 09–16 | not applied here | See ordered list below |

---

## Ordered migrations (prepare only — do not run in production from this handoff)

Run in Supabase SQL Editor after existing migrations through `signed-in-data-gate-migration.sql`:

1. `supabase/09-event-timezone-migration.sql`
2. `supabase/10-saved-listings-migration.sql`
3. `supabase/11-private-rounds-migration.sql`
4. `supabase/12-social-foundation-migration.sql`
5. `supabase/13-photo-contributions-migration.sql`
6. `supabase/14-account-lifecycle-migration.sql`
7. `supabase/15-social-moderation-completion-migration.sql` — invitations, rate events, moderation actions, account restrictions, expanded deletion requests
8. `supabase/16-account-deletion-retry-migration.sql` — persisted `pending_storage_objects` for server-side cleanup retry

---

## Environment variables (names only)

Required existing:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOLFOLIO_APP_URL`, `CRON_SECRET`

Optional/new:
- `GOOGLE_GEOCODING_API_KEY` — distant ZIP/city resolution
- `GOLFOLIO_DELETION_TEST_MODE` — local deletion testing without production owner gates
- `MODERATION_EVIDENCE_RETENTION_DAYS_TEST` — test retention override
- `SUPABASE_FUNCTIONAL_TEST_URL` + `SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY` + `SUPABASE_FUNCTIONAL_TEST_ANON_KEY` — isolated DB integration tests with real user JWTs

---

## Test results (this cloud workspace)

| Suite | Result |
|-------|--------|
| `npm run check:functional` | **42 pass, 4 skipped** (DB integration skipped — no test Supabase + anon key) |
| `npm run check:photos` | **21/21 pass** |
| `npm run check:experience` | **7/7 pass** |
| `npm run check:mobile` | **3/3 pass** |
| `npm run web:build` | **pass** |

### Tests actually run (unit/isolated)
- Category mapping, event timezone, US location, social gates, exact username rules
- Account lifecycle helpers, **deletion retry architecture** (`scripts/account-deletion-retry.test.mjs`)
- **API handler import smoke** for all functional-launch handlers (`scripts/api-handlers.test.mjs`)
- Round stats (>50 rounds), contribution photo pipeline

### Tests skipped (not proof of integration)
- `functional-db.integration.test.mjs` — **4 RLS/API cases skipped** without `SUPABASE_FUNCTIONAL_TEST_URL`, `SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY`, and `SUPABASE_FUNCTIONAL_TEST_ANON_KEY`
- Skip notice test documents missing config; does not validate live RLS/storage

### Tests not run
- End-to-end against staging/production Supabase
- Physical iPhone / Xcode device QA
- `npm run ios:sync` on this Linux agent turn

To run DB integration later:
1. Boot isolated Supabase project; apply migrations 09–16
2. Export all three `SUPABASE_FUNCTIONAL_TEST_*` variables (URL, service role key, anon key)
3. Re-run `npm run check:functional`

---

## Outstanding dependencies (owner / Codex)

1. Apply migrations 09–15 on isolated/staging Supabase before functional QA
2. Set `player_support_*`, `community_standards_url`, `safety_help_url` in `app_settings` (or add Company settings fields)
3. Decide retention days; enable `account_deletion_enabled` only after testing
4. Enable `social_features_enabled` only after policy review
5. Replace prompt-based report/moderation UX with polished components (keep API contracts)
6. Add Company settings UI for social/deletion/support toggles (currently SQL-only)
7. Remove or update legacy follow UI in `index.html` embedded hub modal (`renderPlayers` still references follow)
8. Device QA: auth deep links, keyboard, Capacitor Browser external links, photo upload to private bucket

---

## Local startup

```bash
cd outputs/the-golfer
npm install
npm run web:build
npm run check:functional
npm run check:photos
npm run preview:live
```

Deletion flow local test:

```bash
export GOLFOLIO_DELETION_TEST_MODE=true
# Optionally: export MODERATION_EVIDENCE_RETENTION_DAYS_TEST=30
# Run against isolated Supabase with migrations 09–15 applied
```

---

## Visual work deferred to Codex

Preserve current styling direction. Codex should finish copy, empty states, and replace prompt flows — **without changing the functional API contracts above**. Do not mark launch-ready until migrations are applied on staging and device QA passes.

## Conflict notes

- `CURSOR_HANDOFF.md` describes photo-approval baseline work; this branch extends it
- Do not follow `cursor/settings-page-20b8`; this branch is from venue-community baseline only
