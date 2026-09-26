/*
 * u4_i18n_lookup.h — Todo 14 localization runtime boundary (native side).
 *
 * The engine never parses JSON at runtime. `scripts/i18n-generate.mjs`
 * flattens the locales-ko JSON files into the static table compiled from
 * `native/i18n/u4_i18n_table.inc`; display call sites resolve through the
 * SAME semantic IDs the web UI uses:
 *   - C++ display calls: the `screenMessageN` funnel
 *     (`vendor/xu4/src/screen.cpp:449`) looks up outgoing text by ID;
 *   - TLK lookup: `map:npcIndex:field` keys (`scripts/lib/tlk-codec.mjs`);
 *   - binary text lookup: `resource:table:index` keys
 *     (`scripts/lib/binary-strings.mjs`, TITLE.EXE/AVATAR.EXE surfaces);
 *   - Boron translation overlay: `native/i18n/ko-overlay.b` (config_boron
 *     overlay path) carries the same IDs.
 *
 * Lookup returns NULL for untranslated (pending) IDs and for internal
 * command keys: the caller falls back to English, so game logic,
 * printf/command keys, and fixed `.SAV` byte fields stay English/ASCII.
 * Self-contained C99; no engine includes.
 */
#ifndef U4_I18N_LOOKUP_H
#define U4_I18N_LOOKUP_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *id;           /* semantic ID, e.g. "BRITAIN:0:job" */
    const char *translation;  /* Korean display text (UTF-8), never empty */
    const char *placeholders; /* space-joined sorted placeholder signature, or "" */
    int is_command;           /* nonzero: internal command key, never localized */
    int max_width_cols;       /* status-column budget, or 0 when not applicable */
} U4I18nEntry;

/* Static table emitted by `npm run i18n:generate` (pending entries omitted). */
extern const U4I18nEntry U4_I18N_STATIC_TABLE[];
extern const int U4_I18N_STATIC_COUNT;

/*
 * Returns the Korean display text for `id`, or NULL when there is no
 * Korean yet (unknown/pending id) or when `id` is an internal command key.
 * NULL table/id is safe and returns NULL.
 */
const char *u4_i18n_lookup(const U4I18nEntry *table, int count, const char *id);

/* Nonzero when `id` is an internal command key that must stay ASCII. */
int u4_i18n_is_command_key(const char *id);

/*
 * Nonzero when `translation` carries exactly the `expected_sig`
 * placeholder multiset (sorted-multiset compare, so reordered Korean word
 * order still matches; a dropped/duplicated %s/%d fails).
 */
int u4_i18n_placeholders_match(const char *expected_sig, const char *translation);

/* Display-column width of UTF-8 text (Hangul/wide chars = 2 columns). */
int u4_i18n_display_width(const char *utf8);

/* Nonzero when `utf8` fits `budget_cols` display columns. */
int u4_i18n_fits_status(const char *utf8, int budget_cols);

/*
 * Nonzero when Korean display text may appear in `field`. Fixed
 * `.SAV`/prompt byte fields ("avatar-name", "number", "command",
 * "direction", "save") never accept Korean; only "dialogue" and
 * "ui-label" do. Unknown/NULL fields default to 0 (stay ASCII).
 */
int u4_i18n_allows_korean(const char *field);

#ifdef __cplusplus
}
#endif

#endif /* U4_I18N_LOOKUP_H */
