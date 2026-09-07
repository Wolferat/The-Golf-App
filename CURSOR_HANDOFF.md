# Golfolio — Mac handoff

Updated September 7, 2026.

## Open this local repository

`/Users/howlingsolutions/Documents/Codex/The-Golf-App`

GitHub: https://github.com/Wolferat/The-Golf-App

The local branch is `codex/capacitor-ios`, based on `bb1f548` from `cursor/venue-community-reviews-20b8`. Vercel production tracks `cursor/venue-community-reviews-20b8` (confirmed in its dashboard September 7). Main is older; do not deploy main or discard local changes. The user authorized committing and publishing the complete design refresh to the existing production app. See the release section below for the current state.

## What exists on this Mac

- Cursor is installed. Its Agents screen lists `the-golf-app`, with Cloud selected for a new chat. That alone does not prove it has opened this local folder.
- Xcode 26.6 is installed and initial setup is complete.
- Node.js 24.20.0 and npm 11.19.0 are installed under `~/.local`; new login terminals include `~/.local/bin` through `~/.zprofile`. If an IDE terminal cannot find Node, restart the terminal/IDE or use a login shell.
- The user opened the generated Xcode project and reported "got it working." Treat this as user-reported success, not a complete independent test of login, uploads, or production APIs.

## Current integration

App directory: `outputs/the-golfer`.

- Capacitor core/ios/cli 8.5.1, Browser 8.0.4, Geolocation 8.2.2.
- `capacitor.config.json`: app name Golfolio; initial bundle ID `com.whackfuckgolf.golfolio`; bundled web directory `mobile-dist`; native HTTP enabled.
- `scripts/build-mobile.mjs`: packages explicitly selected client assets and pages, rewrites directory routes, injects the native runtime, and points auth email redirects at the web origin. It excludes API code, SQL, dependencies, and environment files.
- `mobile/runtime.js`: routes relative API fetches to the configured HTTPS server, supplies native location calls, and opens external HTTPS links in a browser sheet.
- `ios/App/App.xcodeproj`: generated iOS project with permission descriptions.
- `MOBILE.md`: detailed setup, limitations, commands and pre-release checklist.
- `scripts/mobile.test.mjs`: bundle and API routing checks.

From the app directory:

```sh
npm ci
npm run check:mobile
node scripts/check-venue-community.mjs
npm run ios:sync
npm run ios:open
```

Only run npm ci when dependencies need installation. Repeat sync after source changes. Never edit generated copied screens directly.

## Verified versus unresolved

Mobile tests, the existing venue-community checks, and Capacitor iOS sync passed. Live Supabase probes were skipped because local credentials were not configured. An agent-side compile was blocked by cache permissions; the user subsequently reported success running through Xcode.

The default API origin is `https://www.whakfukgolf.com`. An HTTPS connection attempt failed during setup. Recheck current availability; do not assume it is still broken or claim login works. Override only with a confirmed approved HTTPS origin using `GOLFOLIO_MOBILE_API_URL` during sync.

Email confirmation and password reset currently finish on the website. Native auth deep links are not implemented. Users return to the app and sign in afterward. Real native login/logout, photo uploads, all routes, keyboard behavior and permission-denial flows remain to be tested.

Default Capacitor icon/splash assets remain. Signing/team selection and App Store registration are not completed here. App Store readiness requires separate work on final assets, privacy/support information, account deletion, moderation, and device testing.

npm reported three moderate findings in the development-only CLI/xcode/uuid chain with no upstream fix reported; do not blindly force major overrides. Production dependencies had no reported audit findings at setup.

## Product context and important distinction

Golfolio helps ordinary golfers find courses, tournaments, simulators and public lessons/clinics, with profiles, play history, community features and real official venue photos. Keep the language welcoming to beginners and weekend players.

The shared conversation discussed a 15-mile user-location/ZIP search, up to three new listings per category, automatic publishing only after source/location/photo checks, and player flags going to in-app admin alerts. These are product intentions, not confirmed features in this checkout. Current source still uses the Sherman area and admin-led discovery. Do not silently implement that larger workflow as part of the mobile setup.

New users should be ordinary players; privileged access belongs to admins. Preserve source/photo verification and private data boundaries. No fake or demo records. Venue-owner profile claiming is a future feature, not part of this integration.

## Suggested next work

First inspect the local diff and confirm the native app's core flows on the running simulator against a working backend. Report concrete failures before making broad changes. Keep the web app working. Discuss the next feature with the user after the baseline is understood. Do not push, merge, deploy, run SQL or alter production configuration without the appropriate explicit scope from the user.

## Corrected live domain

The user supplied https://www.whakfukgolf.com on September 7, 2026. Its /api/config returns Supabase public configuration and /api/listings returns HTTP 401 when signed out. The previous parked-domain observations concerned a different spelling. The native default now uses the corrected domain. Authenticated login and listings still require user testing. The existing bundle identifier is unchanged.

## Player design refresh

A shared clubhouse.css now styles the client pages with bold system typography, cream/green/orange colors, a shorter service-area note, larger real listing media, and Golf Crew navigation. Home has signed-in shortcuts to /hub?log=1 and /players; the first opens the existing round form after the player page loads. No catalog or account records were added. Existing UI-copy assertions were updated for the new labels; mobile and venue-community checks passed. The client bundle is synced to iOS; rebuild on the physical phone to view the refresh.

## Current visual direction — supersedes the earlier player design refresh

The user approved the titanium/ivory/emerald concept and requested it across every page. `outputs/the-golfer/DESIGN_REFRESH.md` records the implementation and validation. Shared `clubhouse.css` is now the premium dark design; `homepage.css` provides the home composition. `experience.js` supplies the local WebGL golf ball, loading indicator, drive transitions, and modal focus behavior. Legacy runtime CSS moved into base stylesheets so shared styles win consistently. Every route includes the experience script before page code; programmatic navigation uses `window.golfolioNavigate`.

The local `scripts/preview-design.mjs` server is isolated from production and displays empty test layouts only. It must never be used as a source of real listing counts. It is not bundled into iOS. Seven experience tests, three mobile tests and venue/community checks pass. Xcode successfully built the refreshed iPhone target with no issues. No website deployment has occurred. Native launch appearance is dark and ProMotion support opted in; physical frame-rate measurement is still outstanding.

Connected browser preview: run `npm run preview:live` from the app directory and use `http://127.0.0.1:8767/`. This serves the local redesign against the existing production API, with real sign-in and data. Port 8765 is static-only and its login does not work. Port 8766 is only an isolated fixture review. Do not confuse these environments or report fixture data as live records.

Accessibility/design preference: pricing must use neutral, high-contrast text and dividers, without green highlight blocks. Avoid color-only distinctions in future refinements; pair state colors with clear text/icons. Shared `.listing-price` now uses warm ivory text on the card surface with a gray separator. Verified in the signed-in connected browser; iOS assets synced, device not relaunched for this CSS-only change.

## September 7 permanent design release

Release scope: shared dark design across all ten routes, neutral pricing, corrected filter/footer/empty-state surfaces, stationary locally rendered golf ball printed with the existing Golfolio wordmark, preserved brief drive navigation, and the native Capacitor integration. The ball has no continuous render loop; it redraws on resize. Google API integration is still pending; the user has configured its key in Vercel, but this release adds no Google requests or listing-population runs.

The connected local preview at port 8767 has been checked with the real signed-in admin account across home, My Game, round entry, settings, Golf Crew, course detail, admin listings, listing editor, and company settings. No records were changed during this review. Sign-in and account creation retain their existing flows; completed player profiles and score tracking remain optional. Seven experience tests, three mobile tests and the venue-community source checks pass; live database RLS probes are not configured locally.

Vercel project: `wolferat-s-projects/the-golf-app`; live site: https://www.whakfukgolf.com. Production source before the release was bb1f548. No backend source, database schema, API keys, service-area settings, or cron configuration changed. Vercel runs `npm run web:build` and publishes the client allowlist in `web-dist`; API functions are bundled separately from `api/`. Native projects, local test tools and markdown are also excluded via `.vercelignore`. Source is shared by web and native; run `npm run ios:sync` after changes, then build/run in Xcode to update an installed phone.
