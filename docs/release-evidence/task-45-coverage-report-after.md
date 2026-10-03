# i18n coverage report (Todo 38)

Measured from the `i18n-coverage.json` snapshot each Playwright spec attached. Only hashes and ids are
recorded; this report reverse-maps hashes against open-source literals and prints `file:line`, never the text.

- specs with a snapshot: 7
- specs where the hook was unavailable (shell never booted): 0
- keys rejected by the recorder (not an id or hash, discarded): 0

## Counts per kind

| kind | distinct keys | total occurrences |
|---|---:|---:|
| ui-unmapped | 11 | 246 |
| vendor-unmapped | 0 | 0 |
| talk-unmapped | 2 | 10 |
| resolve-fallback | 0 | 0 |
| arg-passthrough | 0 | 0 |

## ui-unmapped (reverse-mapped)

| hash | count | source |
|---|---:|---|
| 195c9389 | 1 | vendor/xu4/src/event.cpp:864 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 36b9b7f9 | 176 | vendor/xu4/src/screen.cpp:369, vendor/xu4/src/script_boron.cpp:293 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 470f9a00 | 4 | vendor/xu4/src/cheat.cpp:189 (format literal) |
| 5be482d6 | 1 | vendor/xu4/src/discourse_castle.cpp:438, vendor/xu4/src/game.cpp:1723 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 74f66881 | 1 | vendor/xu4/src/discourse_castle.cpp:592, vendor/xu4/src/event.cpp:872, vendor/xu4/src/shrine.cpp:226 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 79843a19 | 1 | vendor/xu4/src/cheat.cpp:288, vendor/xu4/src/cheat.cpp:299, vendor/xu4/src/combat.cpp:894, vendor/xu4/src/combat.cpp:1148 (+6 more) (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 8c19a815 | 44 | vendor/xu4/src/game.cpp:1475 (string literal; CONTROL-ONLY: no text, no arguments (line break or cursor control)) |
| a4793a3c | 6 | vendor/xu4/src/cheat.cpp:119 (format literal) |
| aae692d1 | 6 | vendor/xu4/src/cheat.cpp:129, vendor/xu4/src/cheat.cpp:139 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| cd876cd3 | 4 | vendor/xu4/src/cheat.cpp:87 (format literal) |
| e5a529ed | 2 | vendor/xu4/module/Ultima-IV/vendors.b:96, vendor/xu4/module/Ultima-IV/vendors.b:342 (string literal) |

## vendor-unmapped (reverse-mapped)

(none)

## talk-unmapped (reverse-mapped)

| hash | count | source |
|---|---:|---|
| 0f0c6cdd | 8 | vendor/xu4/src/cheat.cpp:407, vendor/xu4/src/codex.cpp:97, vendor/xu4/src/combat.cpp:294, vendor/xu4/src/event.cpp:868 (+6 more) (format literal; CONTROL-ONLY: no text, no arguments (line break or cursor control)) |
| 46b9d129 | 2 | vendor/xu4/src/codex.cpp:427, vendor/xu4/src/codex.cpp:437 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |

## resolve-fallback (ids with no Korean translation)

(none)

## arg-passthrough (a `%s` argument that was shown raw)

(none)

## Unknown hashes (possible bug)

Hashes that match no open-source literal. Since Todo 24 castle and codex text arrives as ids, so an unknown
hash is a possible bug (a format built at run time, or text that bypassed an id channel).

(none)

## Audit gap cross-reference (docs/GOAL_GAP_AUDIT.md)

| gap | topic | observed | occurrences | locations |
|---|---|---|---:|---|
| #3 | virtue adjectives (getVirtueAdjective) | no | 0 | - |
| #5 | death / spell-failure messages | no | 0 | - |
| #6 | entry messages (screenMessageCenter, cityTypeStr) | no (screenMessageCenter itself has no hook: not observable) | 0 | - |
| #7 | creature names in combat lines | no | 0 | - |

## Blind spots

- Canvas-only text: every `TextView::textAt*` / `screenMessageCenter` draw has no web hook, so English drawn only
  on the canvas is invisible to this measurement (screenMessageCenter: town, shrine and dungeon entry text).
- The 8x8 bitmap text of screens that never reach a hook (e.g. intro/menu screens not covered by an overlay).
- Screens no spec reaches: anything past what the e2e suite plays (late dungeons, Abyss, Codex, most combat).
- `arg-passthrough` only sees `%s` arguments of known templates; text inside an unmapped template is counted once per hash, not per word.
- A spec that opens a second page or reloads loses the earlier page's counters (one snapshot per test, taken at its end).
- A hash match is equality with an open-source literal; a short player-chosen name can coincide with one (so a match is a hint, not proof).
- Talk-channel (`composeTalkLine`) `%s` arguments that are not TLK ids (for example the virtue adjective) are not instrumented, so gap #3 is unobservable here.
- Counts depend on which keys the suite happens to press; absence of a key is not proof of full Korean coverage.
