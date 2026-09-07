# Golfolio design refresh — September 7, 2026

## Implementation

All ten client routes load the shared `clubhouse.css` and `experience.js`: home, My Game, Golf Crew, listing detail, settings, company settings, listings moderation, listing editing, plus the account and review redirect routes. Homepage composition lives in `homepage.css`. Existing data, authentication, moderation and optional profile fields remain in place.

The shared palette uses graphite/titanium surfaces, warm ivory, and muted emerald. Buttons, forms, account menus, dialogs, statistics, reviews, admin controls, empty states and navigation inherit the same styling. The bottom navigation keeps the actual available features: Explore, My Game, Golf Crew, Account. Homepage category tiles open sign-in and retain the selected category. The homepage no longer promotes Sherman; backend discovery boundaries remain unchanged and visible in Company Settings.

`experience.js` renders a locally shaded golf ball with recessed dimples through WebGL, with a CSS fallback. The stationary sphere carries the existing Golfolio wordmark, including its CSS fallback and loading/transition appearances. It draws only on initialization or element resize; there is no continuous animation/render loop. A nonblocking ball indicator appears for first-party requests lasting over 450 ms, clears on resolution/error, and stops displaying after 15 seconds while the page's own operation status remains. Same-app navigation uses a 190 ms drive; modified clicks, downloads, external links, same-page anchors and reduced motion retain ordinary behavior. Dialogs support focus entry/return, Tab containment, and Escape.

No image or AI service is called for the ball. Venue imagery continues to come from existing approved official photos. The concept's illustrative landscape was not inserted as a real venue photo. No records or remote settings were changed.

Native launch now uses a dark Golfolio wordmark screen and matching webview background. Dark native appearance and `CADisableMinimumFrameDurationOnPhone` are enabled. The latter is an [Apple ProMotion opt-in](https://developer.apple.com/documentation/bundleresources/information-property-list/cadisableminimumframedurationonphone), not a guarantee of 120 fps in WKWebView. Actual refresh rate, battery use and physical-device animation quality still need device observation. App icon assets are unchanged. Pricing uses warm ivory text and a neutral separator rather than a green highlight. Category filters, empty states and the verification footer now use matching dark surfaces.

## Validation

- Seven motion/loader tests: initial and concurrent requests on web/native origins, errors, unmodified request and response semantics, external requests, reduced motion, back/forward restoration, and special link behavior.
- Three mobile integration tests and existing venue/community checks pass. Live Supabase RLS probes remain skipped without local credentials.
- Visual review of home, sign-in, account creation, round entry, settings, player search, company/admin pages, listing editor, and listing details, including 320 and 390 pixel checks. Initial layouts were tested using an isolated fixture server. The connected local preview was subsequently reviewed with the real signed-in admin account and approved listings, including My Game, settings, Golf Crew, course details, listings, listing editing and company settings.
- Xcode built the iPhone target successfully with no issues. The updated assets were synced to Capacitor.

## Review commands

From `outputs/the-golfer`:

```sh
npm run check:experience
npm run check:mobile
node scripts/check-venue-community.mjs
npm run ios:sync
npm run preview:design
```

The design preview runs on `http://127.0.0.1:8766/hub`. It is visibly labelled, uses empty layout fixtures, blocks network connections through CSP, rejects writes, and cannot access live APIs. Its source transformations exist only inside this local test server. It is excluded from mobile assets. For listing layouts use `/listing?id=layout-only` and `/listings/edit?id=layout-only`. Never treat these fixture counts or placeholders as live records.

The normal source preview at port 8765 has no local backend. A production sign-in cannot be validated there. The phone continues to use the existing production backend. The September 7 release is authorized for the existing production branch, `cursor/venue-community-reviews-20b8`; deployment verification is recorded in the repository handoff.

## Device handoff

Xcode confirmed the final refreshed build running on the connected iPhone (Trent Wolfe) at 12:14 PM. The category tile tap fix is included. The native console still emits the pre-existing generic Capacitor startup JavaScript-evaluation message and remote WebP decoding warnings; the webview proceeds to load. Those messages are not a clean native runtime validation, and actual phone visuals/performance should be reviewed before any public release. Existing image-error handlers preserve fallback covers.

## Connected browser preview

Use `npm run preview:live` and `http://127.0.0.1:8767/` for the refreshed UI with real sign-in and existing live data. Port 8765 was a static-only preview and cannot serve `/api/config`; do not direct the user there for account testing. The new localhost server proxies only `/api/` to the fixed existing HTTPS app origin, preserves bearer authentication, rejects cross-site requests, and serves only client assets. It stores no credentials and uses no server key. Normal in-app saves affect the existing live account/data. Verified config returns 200, signed-out listings return 401, client routes return 200, and server-file/cross-site requests are blocked. The user completed password sign-in successfully. The connected preview loads the actual account and 14 approved listings.
