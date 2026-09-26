# Castle Chaos

A turn-based multiplayer siege game for 2–4 Borg Meisters. Fall from the sky, claim one clearing, grow a shelter into a citadel, and cultivate a deeply unreliable court. Public visitors can immediately play against computer rivals. Sign in with ChatGPT for cloud saves and invitation-code multiplayer.

## Run locally

Node.js 22.13+ is required. From this directory:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_puzzling_captain_cross.sql
npm run dev
```

Apply the initial migration once per fresh local database. The development URL is printed by Vite (normally `http://localhost:5173`). `npm start -- --port 8787` previews the production Worker against the same local database.

The portable starter provides **local-only mock sign-in** at `/signin-with-chatgpt?return_to=/`. It is excluded from production. Production identity comes from Sites dispatch headers; the app stores the site-scoped user ID, never an email address.

```sh
npm run typecheck
npm run check:rules
npm run check:controls
npm run check:audio
npm run check:physics
# Requires the production Worker running locally on port 8787:
npm run check:api
```

The API check uses separate disposable local identities. It refuses non-loopback origins. It checks simultaneous writes, one active castle, turn ownership, idempotency, private intelligence, joining, settlement and surrender.

## How to play

Open **How to play** in the game, or read the shareable English guide at `/guide`. The guide includes a verified first-turn build order, touch controls, building and weapon progression, guest loyalty, multiplayer setup and victory conditions. The entire game remains in English regardless of the browser language.

- Choose a clearing: meadow grants 15 morale, ridge 40 health, grove 50 timber. Each ruler settles exactly once.
- Spend three orders per turn. Build, upgrade, recruit, repair, feast or send guests on quests.
- Build a workshop before a siege engine. Upgrade the workshop to level two for the goatapult and hex mortar. A castle can fire one siege shot per turn; each shot also costs ammunition and one order.
- Keep guests in residence for ongoing bonuses or risk their loyalty on sabotage missions. Defectors reveal weaknesses and increase incoming damage for two of the betrayed ruler's turns.
- Build a tavern and hold feasts to keep morale and loyalty high. Weather affects siege damage and guest loyalty.
- The last castle standing wins. After round 30 the highest health + gold/4 + 50 per guest wins.
- Online rulers have 90 seconds per turn and three minutes to settle. An active client's next poll advances an expired turn. Offline practice has no time limit.

## Architecture

**PixiJS 8** renders an isometric 2D world with WebGL. Babylon.js and Havok have been removed. The camera, sprite animation and lightweight debris simulation run independently of the authoritative game rules.

- `components/world.tsx`: React lifecycle and error/retry handling for the renderer.
- `components/pixi-world.ts`: depth-sorted scenery, castle progression, character movement, projectiles, picking, LOD and scene disposal.
- `components/pixi-art.ts`: atlas frames, a cached painted terrain texture and shared isometric masonry shapes.
- `lib/debris-physics.ts`: bounded fixed-step 2.5D debris, gravity, damped bounces, simple building/ground contacts and sphere contacts between fragments. This deliberately replaces Havok's general rigid-body solver with a small visual simulation; it does not model angular inertia or structural stresses.
- `components/game-client.tsx`: responsive game interface, guest portraits, sound synthesis, turn controls, room invitations and reconnection.
- `lib/game.ts`: shared, deterministic rule evaluation, seeded defection rolls, bot decisions and victory logic.
- `app/api/game/route.ts`: authenticated, authoritative multiplayer commands. D1 revisions enforce compare-and-swap writes. Receipt IDs make resubmitted orders idempotent. A profile points to one active realm. Enemy resources and guest loyalty remain hidden unless compromised; the RNG state is never exposed.
- `db/`, `drizzle/`: persistent room state and player profiles in Sites D1. No server process runs on the developer's Mac in production.

Multiplayer synchronizes authoritative outcomes through short polling (2.5–4 seconds), rather than synchronizing every debris body over the network. Clients replay the same attack outcome with local physics. This keeps bandwidth and hosting requirements small. Visual rubble is session-local; saved health and progression are authoritative. Fracture is authored piece separation, not an engineering-grade structural stress simulation.

## Art and performance

Generated source art and exact generation prompts are in `assets/masters/`, `assets/art-prompts.json`, and `assets/extra-texture-prompts.json`. The available built-in image generator was used; it did not expose an Imagen 2.5 model selector. `public/art/` contains compressed WebP derivatives. No video is used for gameplay or attacks.

The renderer uses a fixed isometric projection. `components/isometric-camera.ts` handles mouse/touch panning, cursor-anchored wheel/pinch zoom, keyboard navigation and aspect-aware framing of the realm or a siege trajectory. Overview clears side panels so castle labels remain usable.

Trees, rocks, cottages, workshops, taverns and keeps share the original 496 KB transparent village atlas. `components/character-sprites.ts` provides four-frame king and porter walks and a four-frame hammer animation from a shared 305 KB atlas. Walk phase follows distance travelled; facing mirrors left/right. Original masters and generation prompts remain in `assets/masters/` and the sprite JSON files. No new art download is needed for the engine migration.

A seeded terrain canvas is drawn once and uploaded as one background texture. Masonry uses shared 2D Graphics shapes; individual pieces detach at impact. Invisible box colliders preserve building contacts. Decorative workers, chimney smoke, flags, ripples and birds animate independently of resource rules. Props and characters are sorted by their ground position for isometric overlap.

Performance graphics default to one device pixel per CSS pixel, sparse scenery, simpler masonry and 30 fps at rest. Camera motion, landing, attacks and moving rubble can use 60 fps. High adds denser scenery, finer masonry and up to 1.6 device pixels per CSS pixel at 60 fps. Hidden pages stop rendering. Settled rubble stops simulation. Active debris is capped at 60/100 fragments for Performance/High. Reduced motion disables ambient animation and automatic siege replays.

LOD follows projected size (viewport height / camera span), with hysteresis around thresholds. Near detail includes flowers, birds and smoke with up to 12 character frame changes per second. Middle reduces decoration and character animation to 6 changes per second. Far hides workers, smoke and small trim, retaining castles, selection and an idle king. Offscreen characters skip frame updates. Gameplay continues independently of visual detail.

The canvas exposes `data-engine`, `data-renderer`, `data-lod`, `data-characters`, `data-projection`, `data-camera-target`, `data-view-span`, `data-frame-budget`, `data-fps`, `data-active-sprites`, `data-rubble`, `data-quality` and `data-physics`. These are current samples, not hardware benchmarks.

### Sound effects

`lib/game-audio.ts` provides layered procedural Web Audio effects with no downloaded samples: wooden construction, stonework, smithing, footsteps, recruitment, feasts, turn chimes and weapon-specific launches. Projectile impact audio is triggered by the renderer at collision time. Visible characters emit quiet, stereo-positioned steps and hammer strikes; far LOD and offscreen workers are silent. Sound is off by default. Settings expose a persisted 0–100% volume control independent of mute.

The shared master bus has a compressor and a 40-voice cap. Repeated cues are throttled, completed nodes disconnect, mute stops scheduled tails, and hidden pages suspend audio. Stored preferences cannot start an AudioContext without a pointer/key gesture; another gesture resumes audio after returning to a hidden tab. The audio check covers lifecycle guards and cue mapping using a graph stub. Browser verification covers context startup, the worker cue, volume, immediate mute and absence of console errors; it does not constitute subjective listening on physical speakers.

### Mobile controls and verification

The layout follows the dynamic viewport and device safe areas. Compact touch layouts use 44px primary controls, a collapsible visitors panel, scrollable cards and a side-mounted order dock in short landscape viewports. The guide scrolls independently with its close button kept visible. Form fields use 16px text to avoid focus zoom on iOS. All devices default to Performance graphics; explicit graphics and sound choices persist when browser storage is available.

Drag the map to pan, pinch to zoom, or use the camera buttons and arrow keys. Before settling, tap a clearing or its card to move the Borg Meister. Pointer tracking prevents panning, pinching and cancelled touches from also selecting a plot. `check:controls` exercises those gesture boundaries.

The control checks exercise taps, drag/pinch cancellation, projection, aspect-aware framing, LOD hysteresis and offscreen bounds. The physics check covers gravity, bounce, sleep, wall/roof contacts and fragment collisions. Browser viewport checks do not establish performance on physical phones or a multiplayer load benchmark.

PixiJS migration verified on 26 September 2026 in the local production Worker: fresh startup, direct clearing and rival-sprite picking, drag without changing selection, settlement, hall/workshop construction, trebuchet firing with sound and 18 debris fragments, return to 30 fps idle, High/Performance switching, and portrait/landscape layouts at 390×844 and 844×390. Near/middle/far LOD diagnostics were observed. No console errors or warnings were captured in these flows. Physical-device GPU/battery performance and subjective sound quality were not measured.

Primary reference: [PixiJS application and renderer](https://pixijs.com/8.x/guides/components/application).

## Sites deployment

This project is attached to Sites ID `appgprj_6ab29b89b1ec819180544a0a53115f5d` in `.openai/hosting.json`. Reuse it; do not create a duplicate. The requested audience is public.

Publish the exact source commit to the site's source repository, build that commit, archive `dist/` together with a top-level `.openai/` directory copied from `dist/.openai/` (hosting configuration and generated migrations), save a Sites version with that commit SHA, then deploy the saved version and check its terminal status. Keep source credentials in process memory/stdin only. Never put them in Git remotes, files, shell arguments, logs or the public bundle.

`npm run build` produces `dist/server/index.js`, the client assets, and `.openai` hosting/migration metadata. The platform supplies production bindings and applies the packaged migrations. `npm start` is local preview only and never deploys.

The outer development repository keeps the application in `game/`. Its Sites source branch, `codex/sites-source`, contains that directory at the repository root; its tree must match the development commit’s `game` tree. Future source publications must retain the Sites branch’s previous commit as their parent.
