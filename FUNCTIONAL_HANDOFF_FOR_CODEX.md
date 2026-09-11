# Functional Handoff for Codex

## Branch and state

- **Branch:** `cursor/mobile-beta-integration-20b8`
- **Base branch:** `cursor/functional-launch-foundation-20b8`
- **Integrated sources:**
  - `cursor/functional-launch-foundation-20b8` @ `37ed2b8` (functional baseline)
  - Visual references only from `codex/golfolio-player-pages` (functional branch is superset)
- **Production:** not changed — no deploy, no production migrations, no Supabase production edits, no Apple submission

---

## What changed in this integration

### Mobile foundation
- Five-tab player shell: **Explore, Saved, My Game, Crew, Profile** (`app-nav.js`, `mobile-shell.css`)
- Safe-area padding, bottom-nav clearance, auth sheet styling, accessible dialogs (`mobile-ui.js`)
- Shared saved-listing state across Explore, detail, and Saved (`saved-listings-client.js`)
- Scroll-position restoration per tab/page via `sessionStorage`
- Back navigation confirms when an in-app sheet/dialog is open

### Welcome / authentication
- Mobile-friendly auth sheet styling on Explore (`index.html` + `mobile-shell.css`)
- Login autocomplete attributes, show/hide password, duplicate-submit guard
- Success copy only after auth succeeds
- Legacy **Follow** discovery removed from home hub modal; Crew uses exact-username flow only

### Explore
- Compact signed-in header (marketing hero hidden when signed in)
- Search across listing title, city, and venue name
- Persisted category filter + search term
- Save buttons on cards with shared state
- Category label **Lessons** (charity/corporate grouped under Tournaments)
- Distance sort when coordinates available; event date sort when dated
- No invented prices — only verified `price_note` when present

### Saved
- Dedicated `/saved` screen with empty state, open/remove, unavailable handling

### Listing details
- Swipeable approved photo gallery when photos exist
- Placeholder copy: “No photos yet. Share a few from your next visit.”
- Venues omit empty event-date fields; events show verified schedule
- Honest action labels: Visit website / Register
- Review form opens on demand; no duplicate empty-review messaging
- Saved toggle uses shared client module
- Report flow uses accessible select/prompt dialogs (no `window.prompt`)

### My Game
- Private rounds only; legacy visibility selectors removed from hub round form
- Optional par/putts/notes collapsed under expandable section
- Local calendar date default via `localToday()` (not UTC midnight drift)
- Edit round reuses full round form instead of prompts

### Crew / safety
- `prompt`/`alert`/`confirm` replaced with `golfolioUI` dialogs in player pages
- Social gate and exact-username lookup preserved

### Profile / settings
- Reorganized sections: Profile, Location and discovery, Privacy and safety, Help, Legal, Account deletion, Sign out
- Labeled avatar choices (Golfer, Putter, Fairway, Back nine, Club)
- Notification preferences hidden (no delivery implementation)
- Saved listings moved out of Profile into Saved tab

### Admin
- `/admin` overview with pending listings/photos/reports counts
- Company settings forms for support links, social gate, deletion gate, evidence retention (`api/company.js` + `mountCompany`)
- Photo approval grouped by listing with bulk approve/reject selected
- Moderation/report prompts replaced with accessible dialogs

### Builds
- `saved/` and `admin/` added to web + mobile bundles

---

## Migration status

Migrations **09–16** remain **prepare-only** in this workspace. Do not rerun blindly on production.

| Migration | Purpose | Applied here |
|-----------|---------|--------------|
| 09 | Event timezone | No |
| 10 | Saved listings | No |
| 11 | Private rounds | No |
| 12 | Social foundation | No |
| 13 | Photo contributions | No |
| 14 | Account lifecycle | No |
| 15 | Social moderation completion | No |
| 16 | Deletion retry (`pending_storage_objects`) | No |

Verify live DB state separately from API 404s before applying.

---

## Required environment variable names

Do not print secret values in logs or UI.

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Client auth / RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `CRON_SECRET` | Protects `/api/deletion-cleanup`, `/api/purge-evidence`, `/api/expire` |
| `GOOGLE_GEOCODING_API_KEY` | Optional manual city/ZIP enrichment |
| `GOLFOLIO_MOBILE_API_URL` | Capacitor bundle HTTPS backend origin |
| `SUPABASE_FUNCTIONAL_TEST_URL` | Isolated integration test project URL |
| `SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY` | Test fixture setup |
| `SUPABASE_FUNCTIONAL_TEST_ANON_KEY` | RLS tests with user JWTs |

---

## Feature-gate assumptions

- `social_features_enabled` defaults false until owner enables in Company settings
- `account_deletion_enabled` defaults false until owner enables + retention configured
- Player support/legal links read from `app_settings` via `/api/social?view=support`
- Guest signed-out Explore preview remains; authenticated actions require sign-in
- Maps, push notifications, tee-time booking, DMs, handicap integrations: **not built** (documented below)

---

## Test results

Run from `outputs/the-golfer`:

| Command | Result |
|---------|--------|
| `npm run check:functional` | **42 pass, 4 skipped** |
| `npm run check:photos` | **21 pass** |
| `npm run check:experience` | **7 pass** |
| `npm run check:mobile` | **7 pass** (includes `scripts/mobile-beta.test.mjs`) |
| `npm run web:build` | **Pass** (25 assets/pages) |
| `npm run mobile:build` | **Pass** |
| `npm run ios:sync` | **Not run on Linux** — use Mac/Xcode checklist below |

**Skipped integration tests (4):** require `SUPABASE_FUNCTIONAL_TEST_URL`, `SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY`, and `SUPABASE_FUNCTIONAL_TEST_ANON_KEY` pointing at an isolated test/staging database — not configured in this workspace.

**New regression coverage:** `scripts/mobile-beta.test.mjs` — Lessons label, saved client, five-tab nav, mobile UI bootstrap.

---

## Preview

Local preview:

```bash
cd outputs/the-golfer
npm run preview:live
```

No production preview URL was deployed from this task.

---

## Remaining blockers

1. Apply migrations 09–16 on staging/production in order after verifying current schema state
2. Configure support/social/deletion gates in Company settings on a migrated environment
3. Mac/Xcode device pass for safe-area, keyboard, haptics, and Capacitor external links
4. Live page-by-page review on iPhone widths (see checklist below)
5. Photo approval bulk actions should be exercised against real pending queue (~64 photos reported on live audit)

---

## Mac / Xcode / iPhone checklist

- [ ] `npm run ios:sync` on Mac after pulling branch
- [ ] Open Xcode workspace, build to simulator + physical device
- [ ] Verify bottom tab bar never covers primary actions
- [ ] Verify auth sheet keyboard and autofill
- [ ] Verify Capacitor external link handling (Register / Visit website)
- [ ] Verify reduced motion (no blocking navigation animation)
- [ ] Verify session restore after app kill

---

## Page-by-page review checklist for Codex

Status key: **Implemented and tested** | **Implemented, awaiting environment verification** | **Deferred future feature**

| Page | Status | Notes |
|------|--------|-------|
| Welcome / authentication | Implemented and tested | Sheet styling + web flows; native autofill needs device QA |
| Explore | Implemented and tested | Search, save, filters, compact signed-in header |
| Saved | Implemented and tested | Dedicated tab + API |
| Listing — courses/venues | Implemented and tested | No fake event dates on venues |
| Listing — events | Implemented and tested | Event date + Register when verified |
| My Game | Implemented and tested | Private only, collapsed optional fields |
| Crew | Implemented and tested | Gates + dialogs; needs live social flag |
| Profile | Implemented and tested | Reorganized settings |
| Admin overview | Implemented and tested | `/admin` |
| Company settings | Implemented, awaiting environment verification | New support/social/deletion forms need migrated DB |
| Listing editor / AI | Implemented and tested | Unchanged approval contract |
| Photo approval | Implemented, awaiting environment verification | Grouped UI; verify against live queue |
| Moderation | Implemented, awaiting environment verification | Dialog-based; needs migrated moderation tables |

---

## Deferred future features (document only — do not add controls)

- Real tee-time / booking integrations
- Group scheduling polls
- Working push notifications
- Advanced maps provider
- Weather and GPS scoring
- Handicap integrations
- Business ownership claims
- Richer friend activity feed
- Open direct messaging

---

## Commands reference

```bash
cd outputs/the-golfer
npm install
npm run check:functional
npm run check:photos
npm run check:experience
npm run check:mobile
npm run web:build
npm run mobile:build
npm run preview:live
# Mac only:
npm run ios:sync
```
