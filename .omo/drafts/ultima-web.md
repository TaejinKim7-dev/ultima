---
slug: ultima-web
status: plan-written
intent: clear
review_required: false
pending-action: optional high-accuracy review or execute with start-work; no implementation has begun
approach: Web-first xu4/Emscripten/WASM port with static GitHub Pages hosting, user-provided original ZIP, browser saves, Korean UI/input/translation, and TDD.
---

# Draft: ultima-web

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome | status | evidence |
|---|---|---|---|
| native | Reproducible native engine build and playable baseline | active, confirmed | project.md:224-233; user interview 1 |
| web | Browser WASM game, responsive event loop and rendering | active, confirmed | project.md:235-245; user interview 1 |
| storage | User-provided game data and persistent saves | active, confirmed | project.md:146-154; user interview 1 |
| korean | Korean glyphs, readable text layout and input behavior | active, confirmed | project.md:247-269; user interview 1 |
| translation | Assistant-authored Korean translations shipped with the game for all three text sources | active, confirmed | user interview 3 overrides project.md:177,285 |
| audio | Browser audio restored after initial silent port | active, confirmed | project.md:275; user interview 1 |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)
The requested PROJECT.md exists as lowercase project.md and was read completely (305 lines).
Workspace inspection found only project.md and the .codegraph symlink before draft generation; no product code, tests, engine or xu4-hangul-poc. CodeGraph returned no relevant code.
The document describes earlier measurements, not measurements reproduced in this workspace. Source-level port assumptions remain unverified.
https://github.com/xu4-engine/u4 reports archived August 16, 2025. README says DOS game data and optional upgraded VGA assets; this differs from a literal Apple II emulation interpretation of project.md:17.
Primary references consulted: https://emscripten.org/docs/porting/asyncify.html and https://emscripten.org/docs/api_reference/Filesystem-API.html. No compilation performed.
2026-09-07 user requested that the assistant find original game data on the web. GOG official product listing found at https://www.gog.com/en/game/ultima_iv_quest_of_the_avatar; xu4 download page recommends it. Direct DOS ZIP located at https://ultima.thatfleminggent.com/ultima4.zip via https://ultima.thatfleminggent.com/u4download.html. Host describes a magazine CD release and publishes Origin correspondence at https://ultima.thatfleminggent.com/boomer.txt; this is not a verified GOG-identical archive or a general redistribution grant.
Downloaded research input outside repository to /tmp/ultima4-source-aeN4qd/ultima4.zip (temporary, may require re-download on resume). HTTP 200; 529099 bytes; SHA-256 94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74. unzip -t passed all 160 files. Verified WORLD.MAP (65536 bytes), SHAPES.EGA (32768 bytes), AVATAR.EXE, and all 16 named TLK files (4608 bytes each). No archive extraction, executable launch, or engine compatibility claim. Original data stays out of GitHub and Pages artifacts.

## Decisions (with rationale)
intent: clear because user explicitly requests additional confirmation/interview. review_required: false. classification: architecture.
Preserve documented GLFW + Emscripten + xu4 base decisions unless user changes them. Archived status alone does not authorize replacing the upstream.
Actual application collaboration mode remains Default; work is restricted to planning by the user request and ulw-plan workflow.
User interview 1: full documented scope including audio confirmed. Desktop browsers and keyboard only; mobile/touch not requested. User has game data only, no Hangul PoC; plan to reconstruct the renderer as needed. Data location and format remain unknown. User prefers multiple-choice questions.
User interview 2: all recommended choices accepted. Preserve xu4 DOS default graphics and original game rules (not Apple II visual emulation). Display dialogue in an HTML panel below the game canvas; retain in-game status areas. Support both Korean and English NPC keywords while preserving original command keys. The layout is decided now; no post-Phase-2 owner decision gate is needed for A/B/C selection.
User interview 3: assistant writes Korean translations in advance during implementation; users must not need external translation tools or APIs. Include translation resources in the game distribution. This explicit scope change supersedes document requirements for local user generation and non-distribution of translation results; it does not authorize distributing original game data or establish a legal conclusion. No translation provider selection, runtime API, user API key, or local-model setup is needed. Hosting target: GitHub Pages. Test strategy: TDD, with actual browser QA in addition. Planning only remains active.
User follow-up: final GitHub target is https://github.com/TaejinKim7-dev/ultima. Plan now pins Pages base `/ultima/` and expected project URL `https://taejinkim7-dev.github.io/ultima/`. Read-only `git ls-remote` returned without an access error but no HEAD line, so execution must verify default branch/permissions before claiming publish readiness.
User follow-up: public key is registered and write permission is expected. Execution should use SSH remote `git@github.com:TaejinKim7-dev/ultima.git`, verify authentication non-mutating before first push, then publish only after release checks prove no original game data is included.

## Scope IN
Native baseline, web port, data import/saves, Korean rendering/layout/input, full pre-authored Korean translations, final audio, GitHub Pages deployment setup, and TDD, confirmed by user. Do not invent an MVP restriction.

## Scope OUT (Must NOT have)
No product implementation in planning. No original game-data commits or distribution. No external translation tools/API requirements for players. No direct TLK patching. Undefined gameplay modifications need explicit specification.

## Open questions
Original game data path/format resolved by direct download and archive inspection; do not ask user for their local path again. Real engine compatibility still requires execution-phase native QA.
Discoverable remaining facts: upstream source contracts and dependencies; GitHub Pages hosting constraints; repository/deployment configuration if present. No need to ask about translation providers. Undefined custom modifications need concrete requests before inclusion.

## Approval gate
status: plan-written
The plan file exists at `.omo/plans/ultima-web.md` and has been rewritten for the user's clarified direction: browser/WASM app hosted as static HTML on GitHub Pages. No product implementation has begun. Next valid actions are optional high-accuracy plan review or execution in a worker session.
