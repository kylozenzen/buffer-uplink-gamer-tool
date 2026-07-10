# Uplink — Streamer Broadcast Deck

Uplink is a local-first launch console for streamers. It connects to Buffer, lets a creator arm multiple social channels, loads a reusable announcement, resolves live Twitch data, and publishes the signal immediately.

## What changed in this overhaul

- Rebuilt the UI as a responsive broadcast deck instead of a generic scheduler.
- Added a live Twitch intelligence panel with game, title, viewer count, uptime, thumbnail, and signal state.
- Added dynamic template tokens:
  - `{{game}}`
  - `{{title}}`
  - `{{viewers}}`
  - `{{link}}`
- Added a two-step pre-flight HUD for channel and loadout readiness.
- Upgraded templates into categorized **Loadouts** with create, edit, use, duplicate, and delete actions.
- Added local transmission history with success and failure states.
- Added keyboard controls:
  - `1–9` selects a loadout.
  - `Ctrl/Command + Enter` transmits.
  - `Escape` closes the loadout editor.
- Added optional in-browser signal sounds, haptic feedback where supported, and a launch confirmation setting.
- Added a dedicated mobile layout with bottom navigation and touch-friendly controls.
- Preserved Buffer publishing, image uploads, Twitch lookup, Netlify Blobs, and previous-template compatibility.
- Improved token disclosure language so the setup screen accurately explains the stateless Buffer proxy.

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
```

## Deploy to Netlify

1. Deploy this folder as the site root or connect it to a Git repository.
2. Netlify will use the included `netlify.toml` and install `@netlify/blobs`.
3. Add these environment variables in Netlify:
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
4. Deploy the site.
5. Open Uplink and enter a valid Buffer access token in the setup screen.

The Buffer token is stored in the user’s browser local storage. Requests pass through the included stateless Netlify function and are forwarded to Buffer as a bearer token. The function does not intentionally log or persist the token.

## Notes

- Uploaded visuals are limited to PNG, JPEG, WebP, or GIF files up to 8 MB.
- Uploaded media is stored in the `uplink-images` Netlify Blobs store and served through the included image function.
- The “Past Buffer posts” visual browser introspects the available Buffer `Post` schema. It falls back to a clear empty state when media fields are not exposed.
- Existing Uplink templates remain compatible; older templates are automatically categorized as `Custom`.

## QA completed

The rebuilt interface was checked with automated browser interaction at desktop and mobile sizes. The test covered channel selection, live Twitch rendering, loadout creation, duplication, keyboard selection, modal behavior, Buffer send success, local history, tab navigation, and responsive rendering.
