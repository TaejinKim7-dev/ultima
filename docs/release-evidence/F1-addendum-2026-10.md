# F1 addendum — plan compliance for the post-completion wave (Todos 34–46)

Date: 2026-10-03. Scope: Todos 34–46 added after the 37/37 sign-off of 2026-10-02. This addendum does not replace `F1-plan-compliance.md`; it covers only the new Todos.
Tree: main `e1625af` (code identical to the tree of the wave8 integration gate `ea3bd8d`; later commits are docs only).

## Release gate on the final tree
`ULTIMA4_DATA=<zip> npm run verify:release` — all 18 steps exit 0, `EXIT=0`. Log: `F1-addendum-verify-release.log`.
Steps: deps:host, build:modules, deps:wasm, build:wasm, build:native, check:build-fresh, cmake:configure, cmake:build, typecheck, test:unit (55 files / 675 tests), test:native, i18n:check --strict (4634 entries), verify:repo-sources, build:site --base=/ultima/, audit:dist --require-engine, verify:workflow, verify:release-docs, test:e2e chromium (55 passed, 55.3m, 0 connection-refused).
`npm run verify:integration` (13 steps) also passed solo on the same code (`task-45/../integration/verify-integration-wave8.log`, e2e 55 passed 55.4m).

## Todo → evidence (all under `.omo/evidence/ultima-web/`)
| Todo | Result | Evidence | Verified how |
|---|---|---|---|
| 34 repo cleanup | done | `task-34/{before,after,removal,dirty-refused}.log` | worktrees 27→2 (+ harness-locked agent worktrees), 0 evidence content lost (sha256 union 1183, missing 0), root on main = origin/main, plain `git worktree remove` on a dirty tree refused (exit 128) |
| 35 focus return | done | `task-35/*`, `integration/verify-integration.log` | unit RED→GREEN, e2e RED (without fix) →GREEN, regression 6/6, integration 47/47 |
| 36 placeholder order | done | `task-36/*` | 95 multi-placeholder entries compared with true source order: 0 reordered; checker now enforces order; planted swap rejected (exit 1) |
| 37 LB aliases | done | `task-37/*` | 23 aliases; e2e same response line for English keyword and Korean alias |
| 38 coverage | done | `task-38/coverage-report.md` | recorder rejects non id/hash keys; full e2e snapshots 46 |
| 39 adjectives/creatures | done | `task-39/*` | adjectives: unit-verified only; creature names already translated (reproduced) |
| 40 death/spell/entry | done | `task-40/*` | entry line + spell error observed in e2e; death messages unit-only |
| 41 shops + Codex | done | `task-41/*` | 6 vendor types; Codex 11 questions + 11 ending ids observed in Korean; logs contain no English game text (checked) |
| 42 wasm memory | done | `task-42/*` | 16,973,824 bytes flat, cap 64 MiB; cap-exceeded run fails; Chromium/Firefox/WebKit |
| 43 mod scope | proposal only | `.omo/drafts/mod-scope.md` | awaiting user decision (not implemented, by design) |
| 45 hash + format-only | done | `task-45/*` | `8c19a815` = four backspaces (hash recomputed independently); reagent line fixed |
| 46 save import accept | done | `task-46/*` | unit RED→GREEN; real OS file chooser needs a person |

## Must NOT checks re-run
- No original game data or English source text in tracked files: `audit:dist --require-engine` exit 0 (9 files, no leaks); coverage recorder stores only ids/hashes; new evidence logs contain labels only.
- Native behaviour unchanged outside `__EMSCRIPTEN__` (Todo 40 `screen.cpp` hook): `test:native` 4/4.
- No test deleted or weakened: one assertion in `i18n-lib-selftest` ("reordered placeholders accepted") was replaced because it asserted the behaviour Todo 36 reverses; `knownLeaks:[188]` removed after the underlying leak was fixed.

## Not covered / open
- Real macOS Safari cannot be tested here (WSL2). WebKit via Playwright is not Safari evidence.
- Death messages, virtue adjectives: unit coverage only (no e2e path reached them).
- The practical IME feel of Todo 35/37 and the OS file chooser of Todo 46 need a person in a real browser.
