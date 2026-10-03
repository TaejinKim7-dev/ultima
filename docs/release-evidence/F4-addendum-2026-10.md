# F4 addendum — scope fidelity after the post-completion wave (Todos 34–46)

Date: 2026-10-03. Tree: main code identical to `ea3bd8d` (later commits docs only). Does not replace `F4-scope-fidelity.md` (2026-10-02, APPROVE_WITH_DEVIATIONS).

## Deviations from the earlier F4, now
| Earlier deviation | Now |
|---|---|
| 1. Todo 29–33 not in the plan | Resolved 2026-10-02 (included, denominator 37) |
| 2. Remaining English on screen not measured | **Measured** by Todo 38 (coverage report); the main player-visible gaps were fixed in Todos 39/40/45; residual categories documented in `docs/WEB_PORT.md` "알려진 한계" (control-only, debug-only, player-data echoes, canvas-only text with no hook) |
| 3. Firefox/WebKit not run | Done in F3 (2026-10-02, 46/46 each); re-run for the specs changed in this wave: **Firefox 15 passed (35.5m), WebKit 15 passed (34.5m)**, 0 failed, 0 connection-refused (`F3-addendum-firefox-webkit.log`). Playwright 1.52.0, Firefox 137.0, WebKit 18.4 |
| 4. PR policy | Unchanged (user-approved direct merge) |
| Translation publication (goal.md vs plan) | **Decided by the user 2026-10-03: translations stay public**; `docs/TRANSLATION_POLICY.md`, README notice; English source text still never committed/shipped |

## Static hosting / data checks on the final tree
- `npm run verify:release` 18/18 exit 0, `audit:dist -- --require-engine` exit 0 (9 files, no leaks), `verify:workflow` exit 0, base `/ultima/`; Pages deploys of every push succeeded (latest checked: Todo 45 / docs commits).
- Original game data: none tracked, none in dist (audit), none in the new evidence logs (labels only).

## Not verified / needs a person
- Real macOS Safari (WSL2 has no Safari; WebKit automation is not Safari evidence).
- Real Korean IME feel (Todo 35/37) and the OS file chooser for save import (Todo 46); the Codex/ending panel shows a whole paragraph while the canvas pages (user to judge).
- Death messages and virtue adjectives are unit-verified only.
- Todo 43 (modding scope) is a proposal awaiting the user's decision, by design.

## Verdict
APPROVE_WITH_DEVIATIONS — blocking deviations 0; open items above are non-blocking and listed.
