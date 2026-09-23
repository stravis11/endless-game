# endless-game

A calm, endless, procedurally generated world to roam — built with three.js,
no build step, no backend, no fail state.

## Play

```bash
npm start          # serves http://localhost:8087
```

Open the URL in a browser, click "Step outside", and wander.

- **WASD** walk · **mouse** look (pointer lock) · **Shift** stroll faster
- **E** greet the nearest creature · **J** field journal
- Everything you see is generated from one seed (`src/worldData.js`): the same
  world every visit, but different in every direction, forever.

## What's inside

| file | role |
| --- | --- |
| `src/main.js` | renderer, chunk streamer, player controller, HUD, journal, debug API |
| `src/worldData.js` | tuning tables: 10 biomes, 8 species, 18 surprises, 10 ambient events |
| `src/terrain.js` | climate cells + bilinear biome blending, height field, vertex colours |
| `src/chunks.js` | chunk builder: terrain mesh, water, instanced props, surprise landmarks |
| `src/props.js` | shared geometries/materials, per-chunk instanced prop meshes |
| `src/entities.js` | creatures: wander/curiosity behaviours, interactions, gifts, companions |
| `src/atmosphere.js` | day/night sky shader, sun/hemisphere lights, ambient-event scheduler |
| `src/particles.js` | fireflies, rain, snow, leaves, birds, aurora, shooting stars |
| `src/rng.js` | deterministic hash/value-noise/fBm — same seed, same world |

## Verification

`node tests/verify.cjs` (or `npm test`) boots the real game in headless
Chromium over the DevTools Protocol, walks it around, and asserts the
GOAL.md acceptance criteria. Latest full run: **11/11 checks passed** —
evidence in `verification/results.json`, screenshot in `verification/frame.png`.

| id | criterion | result |
| --- | --- | --- |
| G1 | Endless & seamless streaming | PASS — 231 chunks streamed across 4 directions, 0 failed/fallback, culled behind player |
| G2 | ≥ 8 distinct biomes in zones | PASS — 10 distinct biomes hit in a wide sample (meadow 177, sakuraHills 81, birchGrove 81, pineHighlands 75, lavenderFlats 69, amberDesert 69, mossyFen 48, frostVale 33, coralShore 30, starPlateau 12) |
| G3 | Surprise rarity curve | PASS — of 1204 surveyed chunks: 884 common / 271 uncommon / 49 rare (rare share 4.07 %, genuinely rare) |
| G4 | ≥ 6 species + interactions | PASS — all 8 species spawn-check positive; interaction yields reaction + dialogue + journal entry; gift path (`a piece of amber…`) and companion path (`decides to tag along`) both exercised |
| G5 | Calm & cozy | PASS — no damage/fail mechanic exists in the engine; 10 ambient event systems scheduled; day/night phase drifting (dawn at sample time) |
| G6 | Cool graphics, live WebGL | PASS — live context, 1388 meshes / 203 groups on screen (terrain, props, creatures, sky, water); frame captured and visually reviewed |
| G7 | Free roam controls | PASS — synthetic WASD input moved the player across the session; avg frame 49 ms headless (software GL) |
| G8 | Clean console | PASS — 0 page errors/warnings through the full session (browser-internal extension noise excluded, documented in the harness) |

### Verification notes

- Headless runs on SwiftShader (software GL); on a real GPU expect far better
  than the 49 ms/frame recorded there. The 1280×633 canvas is the default
  headless window.
- The two `chrome-extension://…/ERR_FILE_NOT_FOUND` log lines seen in raw
  console capture are 1Password's extension injecting into the throwaway
  browser profile — not page output. The harness filters them and says so.
- Day/night, ambient events, and gifts are randomized per session; the
  *world shape* (biomes, terrain, surprises, landmarks) is fully deterministic
  from the seed.

## Not achieved / known limits

- Token-level graphics (reflections, shadows, bloom) are intentionally absent:
  the target machine runs software GL in tests and the aesthetic is flat-shaded
  low-poly by design.
- Creature behaviours are ambient only — no quests, no objectives, by design.
- The screen is keyboard+mouse; touch/pointer-lock-free play (drag look) is a
  natural next step but unimplemented.
