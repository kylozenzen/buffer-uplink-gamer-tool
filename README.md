# Uplink — Streamer Broadcast Deck v3

Uplink is a local-first launch console for streamers. It connects to Buffer, lets a creator arm multiple social channels, pulls optional live Twitch context, and publishes either a reusable announcement or a one-off post from one focused deck.

## What is new in v3

### First-run landing and credential safety

- Added a full public-facing landing page before the Buffer connection screen.
- Added high-resolution CSS previews of the actual launch-deck workflow.
- Reframed the Buffer API key in language streamers already understand: treat it like a stream key.
- Added clear guidance to never show the token on stream, paste it into chat, include it in screenshots, or leave it in public code.
- Kept the connection flow explicit: the token is stored in this browser and sent through the included stateless Netlify proxy when Uplink calls Buffer.

### Guided onboarding

- Added a six-step first-run tour that walks through:
  1. The live intelligence panel.
  2. Twitch and stream-link setup.
  3. Buffer channel targeting.
  4. Saved Loadouts versus Quick Compose.
  5. The pre-flight and transmit controls.
  6. Recent post links and engagement.
- The walkthrough automatically runs after the first successful connection.
- It can be replayed from the `?` button or the Systems tab.
- Tour completion is stored locally.

### Quick Compose

- Added a manual composer directly to the Launch Deck.
- Creators can switch between a reusable Loadout and a one-off post without leaving the page.
- Quick Compose supports `{{game}}`, `{{title}}`, and `{{link}}` tokens.
- Draft copy is saved locally so it survives an accidental refresh.
- The existing pre-flight, keyboard shortcut, and multi-channel send logic works for both modes.

### Clickable recent posts

- New transmissions store the Buffer post ID and destination details locally.
- Uplink requests Buffer's `externalLink` field for the published social post.
- When a permalink is not available immediately, Uplink polls the post briefly and updates the local history when the link appears.
- Each recent transmission exposes direct “Open [network] post” buttons when available.
- A channel link or Buffer review link is used as a graceful fallback.

### Sharper transmission sequence

- Added a full-screen tactical HUD above the existing rings and flash.
- The routing state now shows target count, acknowledgement status, scan lines, a targeting reticle, and a deployment result.
- The success state reports how many posts were deployed.
- The failure state switches the HUD to a rejected-route treatment.
- Reduced-motion preferences still disable the full animation treatment.

## Existing v2 systems preserved

- Responsive streamer-focused command-center UI.
- Live Twitch game, title, viewer count, uptime, and thumbnail.
- Dynamic Loadout tokens:
  - `{{game}}`
  - `{{title}}`
  - `{{viewers}}`
  - `{{link}}`
- Loadout creation, editing, duplication, deletion, and visual assets.
- Multi-channel Buffer publishing.
- Image uploads through Netlify Blobs.
- Optional launch confirmation, generated signal sounds, and supported-device haptics.
- Keyboard controls:
  - `1–9` selects a Loadout.
  - `Ctrl/Command + Enter` transmits.
  - `Escape` closes the Loadout editor or guided tour.

## Project structure

```text
index.html
app.js
netlify.toml
package.json
package-lock.json
netlify/
  functions/
    buffer-proxy.js
    image.js
    twitch-proxy.js
    upload-image.js
qa/
  landing-desktop-v3.png
  landing-mobile-v3.png
  launch-deck-desktop-v3.png
  launch-deck-mobile-v3.png
  transmission-overlay-v3.png
```

## Deploy to Netlify

1. Deploy this folder as the site root or connect it to a Git repository.
2. Netlify will use the included `netlify.toml` and install `@netlify/blobs`.
3. Add these environment variables in Netlify:
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
4. Deploy the site.
5. Open Uplink, review the credential-safety notes, and enter a valid Buffer API key.

## Security notes

- The Buffer key is saved in the browser's local storage.
- Requests pass through the included Netlify function and are forwarded to Buffer as a bearer token.
- The included function does not intentionally log or persist the token.
- Anyone deploying Uplink should inspect the function source and control the Netlify project receiving requests.
- If a key is ever exposed on stream, in public code, or in a screenshot, revoke it and create a new one.

## QA completed

The v3 build was checked in a browser harness at desktop and mobile viewport sizes. The verification covered:

- Landing-page rendering.
- Connection-modal behavior.
- First-run tour navigation across tabs.
- Loadout and Quick Compose switching.
- Manual-draft persistence logic.
- Pre-flight readiness.
- Multi-channel mocked Buffer publishing.
- Direct social permalink rendering through `externalLink`.
- Local transmission history.
- Full-screen success animation.
- Desktop and mobile responsive layouts.
- JavaScript syntax and DOM ID/reference consistency.

## Publication status and recovery

Each launch now saves a delivery for every destination before contacting Buffer. Expand **Submitted payload** in history to see the exact resolved text, image URL, destination ID, and scheduling input. Retries use that saved input even if you subsequently change the composer, platform variants, channels, or launch mode.

Creation acceptance is separate from publication. Buffer's `published` or `sent` lifecycle state confirms publication (`sent` is also the status filter used by this app's existing recent-post query). Pending, queued, scheduled, draft, failed, and unrecognized statuses remain distinct. A missing permalink does not mean a post failed, and a permalink alone does not confirm publication. Mode badges describe the requested launch mode; each destination's status describes the returned outcome. Older history entries lack reliable delivery data and are marked unverified.

Status checks run immediately, then after 1.5, 4, and 9 seconds. Unresolved post IDs remain in browser storage and are checked again when Uplink reopens. **Check delivery status** also refreshes existing post IDs, including drafts and failures. Published posts are not recreated. History with unfinished deliveries cannot be cleared accidentally.

**Retry failed destinations** only resubmits destinations with a definite creation rejection and no Buffer post ID. Rate-limit retry delays are respected. If Buffer returned a post ID, Uplink checks that post instead of creating another one; manage any retry of that existing post in Buffer. A timeout, interrupted response, unexpected response, or server error may hide a successful creation. Those outcomes stay **unresolved** and cannot be retried automatically. Review the destination, launch time, and saved payload in Buffer before deciding whether to send again manually.

The proxy performs one upstream request per client request. Neither the proxy nor the client automatically replays a create mutation. The previous error-message-based field-selection retry has been removed. Upstream idempotency and mutation retry semantics could not be verified against Buffer's current documentation in this environment, so Uplink does not assume either capability or call an undocumented retry mutation.

Delivery history and Buffer credentials remain local to this browser. Recovery requires the same browser data; clearing site data or explicitly disconnecting and wiping Uplink removes it. Web Locks on HTTPS (or localhost during development) coordinate launch/recovery updates across tabs; use a current browser. This is not server-side deduplication across devices or protection against an intentionally repeated new launch.

### Reliability checks

Run the dependency-free state-machine and Netlify proxy tests:

```sh
node --test tests/*.test.js
```

For browser integration checks, install Playwright or playwright-core outside the checkout if needed. With Chromium available:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core CHROMIUM_PATH=/usr/bin/chromium node tests/browser.cjs
```

The browser harness tests both the source HTML and an isolated Netlify-style V4 build, uses mocked Buffer responses, and does not send real posts. It covers partial failure recovery, saved payload reuse, interrupted sessions, uncertain creation outcomes, queue/schedule/draft states, and mobile layout. It also verifies that V4 injection is repeatable. No live social publication is performed by these checks.
