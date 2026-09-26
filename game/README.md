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

**Babylon.js + Havok** was selected for its integrated browser renderer, camera controls, GPU instancing, lighting, shadows, and rigid-body physics. Babylon is a complete game-oriented engine; it fits this procedural, destructible 3D world better than assembling a renderer and physics bridge separately. The current renderer uses WebGL2 for broad browser support.

- `components/world.tsx`: procedural island, shelter/castle growth, orbit camera, ballistic projectiles and destruction. Real masonry instances detach into Havok rigid bodies. Gravity, off-centre impulses, mass, friction and collision shapes govern debris motion. Nearby surviving structures and the terrain receive collisions. Active debris is bounded for predictable performance; settled pieces retain their visual mesh.
- `components/game-client.tsx`: responsive game interface, guest portraits, sound synthesis, turn controls, room invitations and reconnection.
- `lib/game.ts`: shared, deterministic rule evaluation, seeded defection rolls, bot decisions and victory logic.
- `app/api/game/route.ts`: authenticated, authoritative multiplayer commands. D1 revisions enforce compare-and-swap writes. Receipt IDs make resubmitted orders idempotent. A profile points to one active realm. Enemy resources and guest loyalty remain hidden unless compromised; the RNG state is never exposed.
- `db/`, `drizzle/`: persistent room state and player profiles in Sites D1. No server process runs on the developer's Mac in production.

Multiplayer synchronizes authoritative outcomes through short polling (2.5–4 seconds), rather than synchronizing every debris body over the network. Clients replay the same attack outcome with local physics. This keeps bandwidth and hosting requirements small. Visual rubble is session-local; saved health and progression are authoritative. Fracture is authored piece separation, not an engineering-grade structural stress simulation.

## Art and performance

Generated source art and exact generation prompts are in `assets/masters/`, `assets/art-prompts.json`, and `assets/extra-texture-prompts.json`. The available built-in image generator was used; it did not expose an Imagen 2.5 model selector. `public/art/` contains compressed WebP derivatives. No video is used for gameplay or attacks.

The world combines generated stone, timber and roof textures with deterministic painted meadow/foliage textures and original SVG building miniatures. `components/world-atmosphere.ts` supplies a procedural sky and animated water with analytic reflection, avoiding a second scene render. The river has a carved bed, trade paths connect the clearings, and the overview shows clickable castle names and health bars. Rain blends the sky, sunlight and fog. Buildings include gables, shutters, door trim, cloth pennants and turret details.

The 3D engine loads separately from the interface. Static props are merged by material; vegetation and masonry remain instanced. High quality renders at up to 1.6 device pixels per CSS pixel, Performance at 1, with fewer grass instances and a smaller shadow/glow budget. Resolution follows canvas resizing. Physics pauses when no rubble bodies are active; Havok initialization and the audio context are reused. Disposed animation and shadow handles are pruned after rebuilds. Reduced-motion preferences skip automatic siege replays and stop ambient animation. Audio starts only after a user's sound toggle. The canvas exposes `data-fps`, `data-active-meshes`, `data-quality` and `data-physics` for lightweight diagnostics; these are current samples, not benchmark results.

### Mobile controls and verification

The layout follows the dynamic viewport and device safe areas. Compact touch layouts use 44px primary controls, a collapsible visitors panel, scrollable cards and a side-mounted order dock in short landscape viewports. The guide scrolls independently with its close button kept visible. Form fields use 16px text to avoid focus zoom on iOS. Touch devices default to Performance graphics; explicit graphics and sound choices persist when browser storage is available.

Drag the scene to orbit, pinch to zoom, or use the camera buttons. Before settling, tap a clearing or its card to move the Borg Meister. Pointer tracking prevents orbiting, pinching and cancelled touches from also selecting a plot. `check:controls` exercises those gesture boundaries.

Verified on 22 September 2026 in desktop Safari's responsive mode at 375×667 and 667×375: choose land, settle, build the guide's three purchases, end turn, attack and scroll the English guide. Chromium viewport checks also cover 390×664, 844×390 and 375×548, including the visitors panel and Havok initialization. These are browser and viewport checks; physical iPhone touch gestures, sustained performance and thermal behaviour have not been measured.

Verified again on 26 September 2026 in the local production Worker: cold 3D/Havok initialization, settlement, timber hall and quarry construction, stone-keep upgrade, bot attacks and rubble, weather transitions, and camera controls. Development-browser checks also covered a player siege, overview labels, High/Performance switching, and portrait/landscape mobile layouts. These checks do not establish performance on physical phones or a multiplayer load benchmark.

Useful primary references: [Babylon.js](https://www.babylonjs.com/), [Havok integration](https://github.com/BabylonJS/havok), [Babylon physics documentation](https://doc.babylonjs.com/features/featuresDeepDive/physics/).

## Sites deployment

This project is attached to Sites ID `appgprj_6ab29b89b1ec819180544a0a53115f5d` in `.openai/hosting.json`. Reuse it; do not create a duplicate. The requested audience is public.

Publish the exact source commit to the site's source repository, build that commit, archive `dist/` together with a top-level `.openai/` directory copied from `dist/.openai/` (hosting configuration and generated migrations), save a Sites version with that commit SHA, then deploy the saved version and check its terminal status. Keep source credentials in process memory/stdin only. Never put them in Git remotes, files, shell arguments, logs or the public bundle.

`npm run build` produces `dist/server/index.js`, the client assets, and `.openai` hosting/migration metadata. The platform supplies production bindings and applies the packaged migrations. `npm start` is local preview only and never deploys.

The outer development repository keeps the application in `game/`. Its Sites source branch, `codex/sites-source`, contains that directory at the repository root; its tree must match the development commit’s `game` tree. Future source publications must retain the Sites branch’s previous commit as their parent.
