# Todo 45: classification of the format-only call sites (hashes and file:line only)

Source: the Todo 38 coverage report (`.omo/evidence/ultima-web/task-38/coverage-report.md`). Each hash below was
recomputed from the open-source format literal; no English text and no argument value is recorded here.

Hash to format shape (computed with `scripts/lib/ui-templates.mjs` fnv1a32):

| hash | format shape |
|---|---|
| 36b9b7f9 | single char conversion |
| 46b9d129 | bare string conversion |
| 79843a19 | string conversion plus newline |
| 0f0c6cdd | bare newline (no conversion) |
| aae692d1 | newline, string conversion, newline |

Classes: **debug** = cheat/debug-mode only; **chrome** = UI chrome (prompt glyph, line break, cursor control; carries no
translatable text); **game-text** = player-visible game text; **player-data** = a name the player (or the save file) chose.

| hash | file:line | class | reason | action |
|---|---|---|---|---|
| 36b9b7f9 | screen.cpp:369 | chrome | the prompt glyph (CHARSET_PROMPT) | none |
| 36b9b7f9 | script_boron.cpp:293 | chrome | Boron `>>` of a character (line breaks in vendor scripts); vendor text itself goes through `web-say` | none |
| 79843a19 | cheat.cpp:288 | debug | tile name echo in the debug "create transport" cheat | none (see note 1) |
| 79843a19 | cheat.cpp:299 | debug | direction echo in the same cheat | none (see note 1) |
| 79843a19 | combat.cpp:894 | game-text | direction echoed after a combat move | typed argument (direction names) |
| 79843a19 | combat.cpp:1148 | game-text | direction echoed after a combat attack aim | typed argument (direction names) |
| 79843a19 | game.cpp:1456 | player-data | the chosen party member's name after the "Player" prompt (a save-file/player name) | none: not translatable by id; documented |
| 79843a19 | game.cpp:1482 | game-text | direction echoed by the shared direction prompt (talk, get chest, open, ...) | typed argument (direction names) |
| 79843a19 | game.cpp:2197 | game-text | direction echoed after every overworld/town step | typed argument (direction names) |
| 79843a19 | game.cpp:2468 | game-text | weapon name echoed after the weapon-ready prompt | typed argument (config.b weapon names, already in the module-name table) |
| 79843a19 | game.cpp:2803 | game-text | armour name after "Wear armour" | typed argument (config.b armour names) |
| 79843a19 | game.cpp:3528 | debug | spell name inside `mixReagentsSuper()`; its only call is commented out (dead code) | none |
| aae692d1 | cheat.cpp:129 | debug | destination name echo of the debug "Goto" cheat | none |
| aae692d1 | cheat.cpp:139 | debug | destination label echo of the same cheat | none |
| 0f0c6cdd | cheat.cpp:407 | debug | empty-input newline of the debug "summon" cheat | none |
| 0f0c6cdd | codex.cpp:97 | chrome | newline in `codexSlightPause` | none (control-only) |
| 0f0c6cdd | combat.cpp:294 | chrome | newline when a combat "enter" has no portal | none (control-only) |
| 0f0c6cdd | event.cpp:868 | chrome | newline after a cancelled alpha-choice prompt | none (control-only) |
| 0f0c6cdd | game.cpp:1334 | chrome | newline after the quit-to-menu answer | none (control-only) |
| 0f0c6cdd | game.cpp:1744 | chrome | newline after the phase-spell destination choice | none (control-only) |
| 0f0c6cdd | game.cpp:1779 | chrome | newline after an energy-field choice | none (control-only) |
| 0f0c6cdd | game.cpp:2463 | chrome | newline when a weapon id is not found | none (control-only) |
| 0f0c6cdd | game.cpp:2798 | chrome | newline when an armour id is not found | none (control-only) |
| 0f0c6cdd | shrine.cpp:168 | chrome | newline after the mantra input | none (control-only) |
| 46b9d129 | codex.cpp:427 | game-text | Codex endgame text 1; **already routed by id**: `u4WebTalkId("%s", "avatar.exe:endgameText1", i)` runs on the previous line, so the talk channel shows the Korean line | none: this ui-hook entry is the duplicate screenMessage and stays dropped on purpose |
| 46b9d129 | codex.cpp:437 | game-text | Codex endgame text 2; same id channel as above | none, same reason |

Notes

1. The debug cheats print the same formats as normal play, so a hash cannot tell them apart. After the fix a debug-mode
   direction echo is translated like a normal one; that is harmless and no cheat-only string is newly translated.
2. Misclassification check (QA failure scenario): the rows classed debug or dead code are only reachable with debug mode
   on (cheat.cpp is only reached through game.cpp:951 `if (settings.debug)`) or not at all (`mixReagentsSuper` is commented out at
   game.cpp:2523). Normal-play snapshots (`korean-game-messages`, `korean-shop`) contain no such site; see
   `misclassified.log`.
3. Not caused by these formats: the unknown hash `8c19a815` (see the Todo 45 report) is a seventh shape, a four-backspace
   cursor-erase literal, which is control-only.
