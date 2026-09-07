# Golfolio iPhone development

Local working branch: `codex/capacitor-ios`, based on `bb1f548` from the venue-community branch. The repository's main branch is older. Production uses `cursor/venue-community-reviews-20b8`; release state is recorded in `CURSOR_HANDOFF.md`. No database migration is part of the design refresh.

## Open and run

From `outputs/the-golfer` in a new Terminal:

```sh
npm ci
npm run ios:sync
npm run ios:open
```

In Xcode choose the App scheme, an installed iPhone simulator, then Run. For a physical iPhone select your Apple team under Signing & Capabilities. The initial identifier is `com.whackfuckgolf.golfolio`; confirm it before registering the app in App Store Connect.

## Architecture

Capacitor 8 bundles only client HTML/CSS/JS into `mobile-dist`. The build injects native support without modifying the website screens. Server APIs, SQL and secrets are excluded. Native HTTP carries existing API requests to the HTTPS backend, while local screens remain packaged. Native geolocation serves the existing location controls; external HTTPS links open in the browser sheet. Do not add server keys to this project or bundle.

The default backend is `https://www.whakfukgolf.com`. To use another approved deployment:

```sh
GOLFOLIO_MOBILE_API_URL=https://your-working-deployment.example npm run ios:sync
```

Only an HTTPS origin is accepted. This value is public configuration, not a secret. Confirmation and password-reset links continue using the website; after confirming/resetting in the browser, return to the app and sign in. Native auth deep links are not implemented in this first integration.

## Validation and remaining work

- `npm run check:mobile` checks asset boundaries, API routing, and password-reset destination.
- `node scripts/check-venue-community.mjs` runs existing permission checks. Live database probes require local configuration and were skipped.
- Capacitor iOS sync succeeded. Xcode subsequently built successfully and ran on the connected iPhone. Full native behavior still needs verification.
- Corrected domain confirmed by the user: https://www.whakfukgolf.com. Its public configuration endpoint works and signed-out listings return HTTP 401. The connected browser preview has verified real sign-in and listing loading. Native uploads and permission-denial flows still need device testing.
- Existing branch still implements the Sherman service area and admin discovery, not the later chat proposal for user-triggered 15-mile discovery.
- npm reports three moderate findings in the Capacitor CLI's development-only xcode/uuid dependency chain, with no upstream fix reported. Production dependencies have no reported findings. No forced major dependency override was applied.

Before TestFlight/App Store: verify sign-in/sign-out, confirmation/reset, all navigation, real API calls, permission denial, review photo selection/upload and keyboard layout on an iPhone. Add a final app icon (the native launch screen already uses the dark Golfolio wordmark), finish account deletion/moderation/privacy/support requirements, review privacy disclosures and signing, and implement native auth return links if desired. This is the native foundation, not an App Store submission.
