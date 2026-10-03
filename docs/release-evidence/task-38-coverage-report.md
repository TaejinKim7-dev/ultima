# i18n coverage report (Todo 38)

Measured from the `i18n-coverage.json` snapshot each Playwright spec attached. Only hashes and ids are
recorded; this report reverse-maps hashes against open-source literals and prints `file:line`, never the text.

- specs with a snapshot: 46
- specs where the hook was unavailable (shell never booted): 2
- keys rejected by the recorder (not an id or hash, discarded): 0

## Counts per kind

| kind | distinct keys | total occurrences |
|---|---:|---:|
| ui-unmapped | 6 | 1018 |
| vendor-unmapped | 0 | 0 |
| talk-unmapped | 2 | 39 |
| resolve-fallback | 0 | 0 |
| arg-passthrough | 4 | 152 |

## ui-unmapped (reverse-mapped)

| hash | count | source |
|---|---:|---|
| 36b9b7f9 | 418 | vendor/xu4/src/screen.cpp:369, vendor/xu4/src/script_boron.cpp:293 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 79843a19 | 505 | vendor/xu4/src/cheat.cpp:288, vendor/xu4/src/cheat.cpp:299, vendor/xu4/src/combat.cpp:894, vendor/xu4/src/combat.cpp:1148 (+6 more) (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 8c19a815 | 71 | UNKNOWN |
| a4793a3c | 11 | vendor/xu4/src/cheat.cpp:119 (format literal) |
| aae692d1 | 11 | vendor/xu4/src/cheat.cpp:129, vendor/xu4/src/cheat.cpp:139 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| cd876cd3 | 2 | vendor/xu4/src/cheat.cpp:87 (format literal) |

## vendor-unmapped (reverse-mapped)

(none)

## talk-unmapped (reverse-mapped)

| hash | count | source |
|---|---:|---|
| 0f0c6cdd | 24 | vendor/xu4/src/cheat.cpp:407, vendor/xu4/src/codex.cpp:97, vendor/xu4/src/combat.cpp:294, vendor/xu4/src/event.cpp:868 (+6 more) (format literal; FORMAT-ONLY: the text rides in unmeasured args) |
| 46b9d129 | 15 | vendor/xu4/src/codex.cpp:427, vendor/xu4/src/codex.cpp:437 (format literal; FORMAT-ONLY: the text rides in unmeasured args) |

## resolve-fallback (ids with no Korean translation)

(none)

## arg-passthrough (a `%s` argument that was shown raw)

`template id | position | argument hash`. A match means the argument equals an open-source literal;
unmatched hashes are computed or player-supplied values (names, numbers).

| key | count | open-source source |
|---|---:|---|
| ui:combat:11|0|223449c4 | 17 | vendor/xu4/src/location.cpp:527, vendor/xu4/src/screen.cpp:170, vendor/xu4/src/tile.cpp:25 |
| ui:combat:6|0|223449c4 | 127 | vendor/xu4/src/location.cpp:527, vendor/xu4/src/screen.cpp:170, vendor/xu4/src/tile.cpp:25 |
| ui:portal:1|0|9ac2a459 | 2 | vendor/xu4/src/discourse.cpp:64, vendor/xu4/src/game.cpp:2754 |

Unmatched argument hashes (computed or player data): 1 distinct, 6 occurrences.

## Unknown hashes (possible bug)

Hashes that match no open-source literal. Since Todo 24 castle and codex text arrives as ids, so an unknown
hash is a possible bug (a format built at run time, or text that bypassed an id channel).

- ui-unmapped 8c19a815 x71

## Audit gap cross-reference (docs/GOAL_GAP_AUDIT.md)

| gap | topic | observed | occurrences | locations |
|---|---|---|---:|---|
| #3 | virtue adjectives (getVirtueAdjective) | no | 0 | - |
| #5 | death / spell-failure messages | no | 0 | - |
| #6 | entry messages (screenMessageCenter, cityTypeStr) | yes (screenMessageCenter itself has no hook: not observable) | 8 | ui:portal:1|0|3fba5760, ui:portal:1|0|9ac2a459 |
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
