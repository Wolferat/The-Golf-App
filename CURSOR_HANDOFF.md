# Golfolio — Mac and live release handoff

Updated September 7, 2026.

## HTTP photo import — live and verified September 7, 2026

The user authorized importing official photos from older HTTP-only sites such as Calera Golf Center. The previous direct scanner release is `663638e`, promoted to production. New import code retains original image/source URLs in `venue_photos`; rows with HTTP image/source use a private normalized JPEG at `review-photos/venue-imports/<photo UUID>/photo.jpg`. This namespace cannot match the player-owner storage policy. No schema or bucket-policy changes are required; imports explicitly refuse a public or missing bucket. Only authorized API reads sign the private object for 15 minutes. Gallery, detail and cover endpoints resolve these copies after authorization. Removing the row removes its stored copy; failed row inserts clean up their upload. Existing HTTPS photos stay remote.

Import fetches pin DNS-resolved public addresses, constrain redirects, bound bytes/time, and preserve TLS validation. HTTP is an explicit separate fetch for sites with broken TLS, not certificate bypass. Imported bytes must decode as JPEG/PNG/WebP, have at most 16 million pixels, and are re-encoded to metadata-free JPEG at at most 1600 pixels and 2 MB. Original official-page references are checked exactly. Import does not establish a reuse license; source credit is retained and admin approval remains required. No automatic discovery or approval is enabled.

Calera's daytime range image was fetched and normalized locally (130,331 bytes to 15,215 bytes) without uploading during that check. Use `npm run check:photos` for discovery, moderation, import safety and privacy tests. Release `89fa462dbd41743d63e4ca2c9d4b56fc11ef3f1b` is live; Vercel production deployment `4DKn9JPGDXqqt3fAQ1JouoXSZ1cp` is Ready. All 20 client files match local; config 200, signed-out listings/photo APIs 401, server library 404. Thirty automated tests passed (20 photo/discovery/import, 7 experience, 3 mobile); production dependency audit reports zero vulnerabilities. Native assets synced and Xcode reports Running App on Trent Wolfe. In the signed-in live Calera editor (`dbf3e3a6-643f-420e-a2c8-85e07f55f3cc`), Find photos imported 7 real source images, all pending and none selected/approved. Visual QA confirmed the private HTTPS previews load, including the range and equipment shed. Source credits correctly show caleragolfcenter.com. Some candidates are logos/portraits; admin selects the relevant photos. No new listings or published photos were added.

## Photo approval release — live September 7, 2026

The user resumed development here after briefly requesting a Cursor handoff. The photo-approval implementation is being prepared for release on `cursor/venue-community-reviews-20b8`; the local `codex/capacitor-ios` branch tracks it. Open this local repository in Cursor, or select the source branch above in a cloud checkout. Do not use the stale local `cursor/venue-community-reviews-20b8` checkout branch without updating it, and do not use main.

**Photo approval release `3c2e4cdf937426ae34e5bea0d2f9ac48c1cfb852` is now live and installed on the physical iPhone.** GitHub pushes trigger a Vercel Preview; production promotion is separate. Native assets have been regenerated with `npm run ios:sync`.

Implemented: AI research photos and bulk discovery enter the existing private `venue_photos` review queue; manual official image/source URLs can be added; pending listings of every kind support photo discovery; the listing editor provides photo selection and explicit publication with or without selected photos. Approved photos use the existing covers/gallery pipeline. Old one-click listing publication is replaced with a review link, and the API requires explicit photo-review acknowledgment. The legacy bulk action name remains for compatibility but no longer auto-approves. Skipped-source and duplicate reasons are displayed. Existing researched `listings.photos` can be imported into review explicitly. No records were populated or approved during development.

Key files: `lib/photo-approval.js`, `photo-review.js`, `api/admin.js`, `api/proposals.js`, `api/venue-photos.js`, `player-pages.js`, and `scripts/photo-approval.test.mjs` under the app directory.

Latest verification: 11 photo-approval tests, 7 experience tests, 3 mobile tests, venue-community checks, web build, iOS sync, and whitespace checks passed. API tests use isolated in-memory fixtures, not live credentials or real AI calls. An isolated mobile-layout preview verified the empty photo review form and error feedback. Candidate-grid mobile QA confirmed readable previews, no horizontal overflow, and disabled approval when four photos are selected. Mutation behavior was checked with isolated API tests; no live records were changed. Vercel preview `7Rd8kzAJrYxcKdgxkcwpxKJkfShn` was Ready and promoted to production. All 20 live client files match local web-dist byte-for-byte; config returns 200, signed-out listings/photo APIs 401, and server library URLs 404. Xcode installed and launched the synced build on Trent Wolfe at 1:37 PM; WebView loaded. Existing generic startup JS-evaluation warnings remain. Port 8767 proxies to the existing production API, so it cannot validate the new backend until that backend is deployed; use a configured staging environment for mutation checks.

Known implementation limits to review: listing publication and selected-photo approval are separate database writes. A photo-write failure explicitly reports that the listing saved while photos remain pending and can be retried; there is no database transaction. The three-photo maximum is checked before writes and is not a distributed concurrency lock. Review these behaviors before broad multi-admin use. No SQL migration was run. Editable AI settings, source preferences, configurable photo limits, Google content integration, and JavaScript-rendered gallery discovery are still future work; this change focused on photo approval.

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
