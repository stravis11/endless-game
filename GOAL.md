# endless-game — Goal

**One-sentence goal:** a browser game built with three.js where you roam freely through an
endless, procedurally generated world that stays calm and cozy to explore — every area is
generated fresh, there are friendly entities to meet and interact with, and there are
surprises waiting anywhere you go, no matter how long you play.

**Vibe:** the satisfying, low-pressure feel of a cozy simulator (supermarket-simulator-style
"just potter around and enjoy it"), but a wild outdoor world instead of a shop. No fail
state, no timers, no pressure — you wander, you notice things, you say hello to whoever
lives there.

## Acceptance criteria

Each criterion is verified by a real run; the evidence is recorded in README.md.

| id | criterion | how it is verified |
| --- | --- | --- |
| G1 | **Endless & seamless.** Walking any direction keeps generating new land forever; no walls, no loading screens, no gaps. | Walk across ≥ 40 chunk boundaries in all 4 directions; assert chunk count grows, every requested chunk resolves, no chunk is empty/fallback, and unloaded chunks are culled behind you. |
| G2 | **Procedurally varied.** ≥ 8 distinct area types with their own terrain, palette, props and inhabitants; areas cluster into large zones that drift as you travel. | Biome-coverage statistics over a wide sample plus a long traverse; assert ≥ 8 biomes are hit and that consecutive chunks are not a repeating pattern. |
| G3 | **Surprises everywhere.** Rare, procedurally placed discoveries (oddities and landmarks) with a real rarity curve: common small finds, uncommon landmarks, rare singular wonders. | Rarity-distribution tests over thousands of chunks (assert all three tiers exist and rare ones are genuinely rare), plus at least one discovery found by actually walking and logged in the journal. |
| G4 | **Entities to meet.** ≥ 6 species with distinct looks and behaviour, spawning near you as you roam. Approaching one offers an interaction that produces a visible reaction, a line of dialogue, sometimes a gift or a companion that follows you. | Drive the debug API: spawn-check every species, interact with one, assert reaction + dialogue + journal entry; assert at least one gift/follow path exists. |
| G5 | **Calm & cozy.** Soft palette, gentle motion, no lose condition, nothing hostile, ambient events (fireflies, rain, birds, falling leaves, aurora) that come and pass peacefully; slow day/night drift. | Assert there is no fail state or damage mechanic in the engine; sample ambient-event scheduling and day/night phase over simulated time; visual render check. |
| G6 | **Cool graphics.** Stylized low-poly 3D: gradient sky, distance fog, soft shadows, water, particles, per-biome vertex colours, glow effects. | Render frames headlessly with a live WebGL context; assert non-blank, multi-colour output and that scene objects (chunks, props, entities, sky, water) exist. |
| G7 | **Free roam.** WASD + pointer-lock mouse look, terrain-following walk, smooth pacing. | Simulated key/mouse input moves the player and camera; frame-time sampling shows stable pacing. |
| G8 | **Runs clean.** No console errors or warnings through a multi-minute session. | Capture console output headlessly across a session that walks, streams, and interacts. |

## Non-goals

- No build step, no bundler, no backend, no accounts, no network calls at runtime.
- No combat, no death, no score, no timers, no inventory management.

## Definition of done

Every criterion G1–G8 has been exercised against the running game (not just reasoned about),
and the evidence is written up in README.md. Anything not achieved is stated plainly there.
