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
