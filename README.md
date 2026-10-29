# Uplink — Streamer Broadcast Deck v5

Announce the stream, find the moments your community clipped, and send the good ones to Buffer.

## What is new

- **Discord launch target:** a separate webhook destination alongside Buffer channels. Custom Discord copy supports the same live Twitch tokens. Only a deliberately selected role can be pinged; `@everyone` and other mentions are suppressed.
- **Post-stream handoff:** update the latest Discord announcement with an optional replay URL, without sending another role notification.
- **Clips inbox:** published clips from your Twitch channel, whether created by you or a viewer. Browse the last 24 hours, 7 days, or 30 days; sort by creation time or views; preview with Twitch's embedded player; see who clipped each moment.
- **Live refresh:** check for new clips every 45 seconds while the Clips tab is visible. Opening Uplink later still retrieves clips already stored by Twitch. The date filter uses clip creation time, not an exact broadcast/session match.
- **Batch handoff:** select up to ten clips, edit each caption, and save links and viewer credit as Buffer Ideas. With optional Twitch authorization, attach actual video to Buffer drafts or add it to your queue.
- **Delivery tracking:** successful Ideas and channel destinations are remembered per Buffer organization. Retrying a partial failure skips prior successes. An ambiguous response is held for manual review in Buffer before a deliberate retry.
- **Updated landing and onboarding:** explains the entire before/during/after workflow and the actual connection and media requirements.

The existing platform-specific copy, Now / Queue / Schedule / Draft modes, reusable Loadouts, Quick Compose, image hosting, live Twitch data, post links, and optional experimental metrics remain available. Discord sends only with **Live now**; Buffer handles the other launch modes.

## Deploy on Netlify

Keep the existing repository integration. The build command is `node scripts/inject-v4.js`, with the repository root as the publish directory. The source HTML also references both feature layers directly, so local previews match deployed builds. Netlify uses Node 22 and esbuild for the functions.

### Twitch configuration

Set these environment variables on Netlify (Functions scope):

| Variable | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID` | Twitch application client ID; needed for public stream and clip lookup. |
| `TWITCH_CLIENT_SECRET` | Twitch application secret; used only on the server. |
| `UPLINK_PUBLIC_URL` | Optional canonical HTTPS origin for this deployment. Defaults to `DEPLOY_PRIME_URL`, then `URL`. Must match the origin users are visiting. |
| `UPLINK_SESSION_SECRET` | Optional separate encryption secret (use a long random value). Defaults to deriving the encryption key from `TWITCH_CLIENT_SECRET`. Changing it requires reconnecting Twitch. |

For **video import**, register this exact redirect URL in your Twitch application's OAuth Redirect URLs:

```text
https://YOUR-UPLINK-DOMAIN/.netlify/functions/twitch-auth
```

Use the actual production domain. Register a separate matching callback if testing an authorized flow on a deploy preview. No callback or streamer login is needed for public clip browsing and saving Ideas.

Connect Twitch from **Systems → Twitch video connection**. The OAuth code flow requests `channel:manage:clips` and `editor:manage:clips`. Twitch checks the connected broadcaster/editor's permission for the clip's actual channel before each download, including reuse of an imported copy. A public username lookup alone does not authorize video downloads.

### Video hosting

The default requires no extra hosting account: small MP4s are copied to the `uplink-videos` Netlify Blobs store and served through a streaming function. **The default import cap is 18 MiB**, safely under Netlify's 20 MB streamed response limit. Larger clips remain usable as Ideas.

For larger videos, optionally set all three server-only variables:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Uplink then signs a server-side Cloudinary upload from Twitch's temporary download URL and saves Cloudinary's permanent HTTPS delivery URL. Cloudinary's account limits and quota apply (the UI describes up to 100 MB); failed imports produce an actionable error. No API secret or temporary Twitch download URL is returned to the browser.

Hosted videos use public, unlisted URLs, because Buffer must retrieve the actual media when a post publishes. **Do not delete them while drafts or queued/scheduled posts still reference them.** There is no automatic seven-day deletion. Disconnecting Twitch removes the stored authorization, not media already needed by posts. Operators can remove unused media in Netlify Blobs or Cloudinary after confirming that posts no longer need it.

Landscape imports preserve the landscape file. Portrait imports require a portrait edit already created in Twitch; Uplink does not crop, transcode, select highlights with AI, or invent a missing portrait version. Instagram imports require the portrait option. YouTube posts include a title and Gaming category. Supported video destinations are Instagram, Facebook, X/Twitter, YouTube, TikTok, Threads, Bluesky, LinkedIn, and Mastodon, subject to Buffer/network restrictions. Pinterest and Google Business clips can be saved as Ideas and finished in Buffer.

### Discord setup

1. In your Discord channel, open **Edit Channel → Integrations → Webhooks** and copy a webhook URL. You need permission to manage that channel's webhooks.
2. In **Systems → Discord announcements**, save the webhook, optional notification role ID, and optional Discord-specific copy. Treat the webhook like a publishing credential.
3. On the Launch Deck, arm Discord and choose **Live now**. Other modes only affect Buffer channels; they never send an immediate Discord message accidentally.
4. After streaming, optionally enter a replay URL and choose **Update Discord** to edit the latest announcement from this browser.

## Credentials and privacy

- Buffer keys and Discord webhooks are stored in browser local storage and sent in request bodies only to this deployment's proxy functions, then to the corresponding provider. Deployments should use HTTPS and never log request bodies.
- Optional Twitch access and refresh tokens are encrypted with AES-256-GCM in the private Blobs store. Only an opaque HttpOnly, Secure, SameSite=Lax session cookie reaches the browser. OAuth state is verified before exchanging an authorization code.
- Sessions expire after 30 days. Access tokens are validated at connection time and hourly during use; a 401 triggers a single refresh and retry. Disconnect removes the encrypted session and makes a best-effort access-token revocation.
- State-changing Discord, import, and disconnect endpoints reject requests whose Origin does not match the deployment's canonical origin. Webhook and clip URLs are validated before outbound requests.
- Captions, local delivery history, and selected destinations stay in this browser. Local tracking does not synchronize across devices and cannot detect posts manually deleted from Buffer.
- **Disconnect + wipe local data** disconnects Twitch and clears Uplink's browser data, including the v4 and v5 layers. It does not delete external posts or already hosted videos.

## Development and verification

```sh
npm ci
npm test
npm run build
npm run dev
```

The small development server previews the UI; it does not emulate Netlify services. `/qa/deck` injects synthetic fixtures and browser-side network stubs, so QA actions cannot publish to real services. For real functions and OAuth, use a configured Netlify deployment or Netlify Dev.

Tests cover community clip discovery, Ideas without video authorization, partial-failure retries, Discord's launch-mode boundary, hostile clip titles, Origin and webhook validation, role mention controls, OAuth state and encrypted token storage, refresh/retry, stable video imports, permission checks on cached imports, missing portrait files, media size limits, and multi-cookie responses.

Live end-to-end publishing still needs real Buffer/Twitch/Discord credentials and the registered Twitch callback. The development tests use mocked provider responses and storage; they do not validate a live account's permissions, plan limits, or network-specific publishing restrictions.

## Previous v3 release notes

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

