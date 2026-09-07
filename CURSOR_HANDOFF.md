# Golfolio — Mac and live release handoff

Updated September 7, 2026.

## Current source and deployment

Open `/Users/howlingsolutions/Documents/Codex/The-Golf-App`. The app lives in `outputs/the-golfer`.

Repository: https://github.com/Wolferat/The-Golf-App

Local branch `codex/capacitor-ios` tracks `origin/cursor/venue-community-reviews-20b8`. The release source commit is `2ff15f926b8daf67ef405daa1a764e9e2973cf5e`. Main is older; do not switch to or deploy main, discard local work, or overwrite the Capacitor integration.

Live site: https://www.whakfukgolf.com
Vercel project: `wolferat-s-projects/the-golf-app`

The user authorized publishing the full design refresh. The release was committed through the authenticated GitHub connector because local Git HTTPS push credentials are not configured. Local and GitHub release trees were verified identical. A Git push to the source branch creates a Vercel Preview; production uses an explicit Promote to Production action. Do not confuse the branch used by a production deployment with the project's automatic production-branch setting.

Preview deployment `8iXpowa2nJxJx2eYV5pjfyYe7vQA` built successfully. It was promoted using a fresh production-environment build. All 19 live client assets/pages were then compared byte-for-byte with local `web-dist`: all matched. Live configuration returned 200 and signed-out listings returned 401. Native source, local tooling and server library URLs returned 404. The user also signed into the live site in Chrome; the authenticated company settings page loaded successfully.

## Design and behavior

All ten routes share `clubhouse.css` and `experience.js`: home, My Game, Golf Crew, listing detail, settings, company settings, listings moderation, listing editor, and account/review redirects. Homepage composition is in `homepage.css`.

Use graphite/titanium surfaces, warm ivory text, restrained emerald accents, system body fonts and Georgia headings. Prices use neutral high-contrast text and a gray divider, with no green highlight block. Avoid color-only state distinctions. Category filters, empty states and verification footer use dark surfaces.

The locally rendered golf ball is stationary and printed with the existing Golfolio wordmark, including the CSS fallback and loading/transition versions. It redraws on resize, with no continuous render loop. The brief 190 ms drive navigation remains; reduced motion bypasses it. Loading indicators track existing API requests without changing their results. No image service or AI is used for the ball.

Sign in and Create account remain available. A completed player profile and scorekeeping are optional. Existing authentication, privacy and admin authorization boundaries remain in place. Venue photos come from approved official sources; never fabricate listings, reviews, players, prices, scores or photos.

## Local review and builds

Node 24.20.0/npm are installed under `~/.local`; use a login terminal if an IDE cannot find them. Cursor and Xcode are installed.

From `outputs/the-golfer`:

```sh
npm run preview:live
npm run web:build
npm run check:experience
npm run check:mobile
node scripts/check-venue-community.mjs
npm run ios:sync
npm run ios:open
```

Use http://127.0.0.1:8767/ for the local refresh connected to the real production API. The proxy preserves bearer authentication, rejects cross-site requests and exposes only client assets; it stores no credentials. Saves affect the real account/data. Port 8765 is static-only and cannot sign in. Port 8766 (`preview:design`) is an isolated empty-fixture server; never report fixture counts as live data.

Vercel runs `npm run web:build` and serves the explicit client allowlist in `web-dist`. Vercel bundles `api/` functions and their imports separately. Native projects, markdown and local test tooling are also excluded by `.vercelignore`. Do not expose keys or server files in web/native assets.

Seven experience tests, three mobile tests and venue-community source checks passed. All ten web routes contain the shared theme; inline scripts parse. Signed-in connected review covered home, My Game, round entry, settings, Golf Crew, course details, listings, listing editing and company settings. No data was changed during review. Live Supabase RLS probes remain skipped without local credentials.

## iPhone

Capacitor core/ios/cli 8.5.1, Browser 8.0.4 and Geolocation 8.2.2. App name Golfolio; existing bundle ID `com.whackfuckgolf.golfolio`. Default API origin is https://www.whakfukgolf.com. The differently spelled old domain is incorrect.

Edit source screens, run `npm run ios:sync`, then build/run in Xcode. Never edit `mobile-dist` or `ios/App/App/public` directly. Client packaging excludes API code, SQL and environment files. Native runtime routes local APIs to HTTPS, supports native geolocation and opens external links in a browser sheet.

The final stationary-ball/neutral-price build was installed and launched on the connected iPhone (Trent Wolfe) at 12:48 PM. Xcode reported Running App and WebView loaded. Dark launch screen and native appearance match the design; app icon remains the Capacitor default.

The pre-existing generic Capacitor startup JS-evaluation message and remote WebP decoding warnings remain. Actual frame rate, upload flows, keyboard behavior and permission denial need further device review. ProMotion opt-in is not proof of 120 fps. Email confirmation/password reset complete on the website; native auth deep links are not implemented. This is not an App Store submission.

## Next work and boundaries

Google content integration is paused. The user configured `GOOGLE_MAPS_API_KEY` in Vercel and redeployed; no Google API endpoint or photo/review integration was added by this release. Keep this key server-side and never print its value. Discuss on-demand enrichment, attribution, allowed storage and request limits before implementing. No automatic AI population or new search cron was enabled.

Public homepage copy no longer promotes Sherman, but backend discovery still uses the saved admin service-area center/radius. This release did not expand coverage or change those settings. Company Settings accurately shows them. The user wants eventual player-location discovery; treat that as future work, not an implemented nationwide catalog.

No database migration, backend-source edit, API-key change or cron change was part of this release. Preserve all authorization and source verification rules. Explain the concrete contents and use the user's authorized scope before future deployment or service changes.
