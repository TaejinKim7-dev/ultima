/*
 * localization_boundaries_test.c — Todo 14 native CTest for the
 * localization runtime boundary (native/i18n/u4_i18n_lookup.h).
 *
 * The C++ engine never parses JSON at runtime: `scripts/i18n-generate.mjs`
 * flattens `locales/ko/*.json` into the static table in
 * `native/i18n/u4_i18n_table.inc`, and this test exercises the boundary
 * through the lookup API only:
 *   - semantic-ID lookup with English fallback (NULL = untranslated or
 *     command key; the caller keeps running English game logic),
 *   - printf placeholder sorted-multiset match (a dropped %s/%d fails the
 *     build before runtime),
 *   - internal command keys are never localized (stay ASCII),
 *   - status width with Hangul = 2 columns against the 15-column budget
 *     (vendor/xu4/src/stats.h STATS_AREA_WIDTH),
 *   - fixed save/avatar-name fields never accept Korean.
 *
 * Returns 0 on success, 1 on the first failure (message on stderr).
 * No original game data is needed. No engine includes.
 */
#include <stdio.h>
#include <string.h>

#include "u4_i18n_lookup.h"

#define CHECK(cond, msg)                                        \
    do {                                                        \
        if (!(cond)) {                                          \
            fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__,       \
                    __LINE__, (msg));                           \
            return 1;                                           \
        }                                                       \
    } while (0)

static const U4I18nEntry kSampleTable[] = {
    { "ui:intro:0", "시작", "", 0, 0 },
    { "ui:speed:0", "속도: %d", "%d", 0, 0 },
    { "ui:broken:0", "속도 변경됨", "%d", 0, 0 },
    { "ui:status:0", "체력", "", 0, 15 },
    { "cmd:attack:0", "공격", "", 1, 0 },
};
static const int kSampleCount =
    (int) (sizeof(kSampleTable) / sizeof(kSampleTable[0]));

static int test_lookup_ready(void) {
    const char *text =
        u4_i18n_lookup(kSampleTable, kSampleCount, "ui:intro:0");
    CHECK(text != NULL, "ready entry resolves");
    CHECK(strcmp(text, "시작") == 0, "ready entry is the Korean display text");
    return 0;
}

static int test_lookup_fallback_null(void) {
    /* NULL means "no Korean yet": the caller falls back to English and
     * game logic (keys, comparisons, saves) stays English. */
    CHECK(u4_i18n_lookup(kSampleTable, kSampleCount, "ui:missing:0") == NULL,
          "unknown id returns NULL fallback");
    CHECK(u4_i18n_lookup(kSampleTable, kSampleCount, "cmd:attack:0") == NULL,
          "command key is never localized even with a translation row");
    CHECK(u4_i18n_lookup(NULL, 0, "ui:intro:0") == NULL,
          "empty table returns NULL fallback");
    CHECK(u4_i18n_lookup(kSampleTable, kSampleCount, NULL) == NULL,
          "NULL id returns NULL");
    return 0;
}

static int test_command_key_guard(void) {
    CHECK(u4_i18n_is_command_key("cmd:attack:0") == 1, "cmd: prefix is a command key");
    CHECK(u4_i18n_is_command_key("ui:command:3") == 1, "ui:command: prefix is a command key");
    CHECK(u4_i18n_is_command_key("ui:intro:0") == 0, "ordinary UI id is not a command key");
    CHECK(u4_i18n_is_command_key(NULL) == 0, "NULL id is not a command key");
    return 0;
}

static int test_placeholders_match(void) {
    CHECK(u4_i18n_placeholders_match("%d", "속도: %d") == 1, "matching %d accepted");
    CHECK(u4_i18n_placeholders_match("", "시작") == 1, "no placeholders accepted");
    CHECK(u4_i18n_placeholders_match("%d", "속도 변경됨") == 0, "dropped %d rejected");
    CHECK(u4_i18n_placeholders_match("%s %d", "%d 골드를 %s 가 얻었다") == 1,
          "reordered placeholders accepted (sorted multiset)");
    CHECK(u4_i18n_placeholders_match("%s", "%s %s") == 0, "duplicated placeholder rejected");
    return 0;
}

static int test_status_width(void) {
    /* ASCII counts 1 column, Hangul syllables count 2 (same heuristic as
     * scripts/lib/text-width.mjs; conservative, not pixel-accurate). */
    CHECK(u4_i18n_display_width("HP") == 2, "ascii width");
    CHECK(u4_i18n_display_width("체력") == 4, "hangul width is 2 cols each");
    CHECK(u4_i18n_fits_status("체력", 15) == 1, "short label fits");
    CHECK(u4_i18n_fits_status("매우매우매우매우매우긴상태줄문자열입니다", 15) == 0,
          "over-wide label rejected");
    return 0;
}

static int test_save_fields_ascii(void) {
    for (int i = 0; i < 5; ++i) {
        const char *field =
            i == 0 ? "avatar-name" : i == 1 ? "number" : i == 2 ? "command" : i == 3 ? "direction" : "save";
        CHECK(u4_i18n_allows_korean(field) == 0, "fixed/save field stays ASCII");
    }
    CHECK(u4_i18n_allows_korean("dialogue") == 1, "dialogue allows Korean");
    CHECK(u4_i18n_allows_korean("ui-label") == 1, "ui label allows Korean");
    CHECK(u4_i18n_allows_korean(NULL) == 0, "NULL field stays ASCII");
    return 0;
}

static int test_generated_table_consistent(void) {
    /* The committed static table mirrors locales/ko readiness: while
     * Todo 15 has not filled the corpus it may be empty, but it must stay
     * internally consistent (every row has an id; placeholder signatures
     * match their own translations; no command rows). */
    for (int i = 0; i < U4_I18N_STATIC_COUNT; ++i) {
        const U4I18nEntry *row = &U4_I18N_STATIC_TABLE[i];
        CHECK(row->id != NULL && row->id[0] != '\0', "generated row has an id");
        CHECK(row->translation != NULL && row->translation[0] != '\0',
              "generated row has a translation (pending entries are not emitted)");
        CHECK(u4_i18n_placeholders_match(row->placeholders, row->translation) == 1,
              "generated row placeholders match its translation");
        CHECK(u4_i18n_is_command_key(row->id) == 0,
              "generated table never localizes command keys");
    }
    return 0;
}

int main(void) {
    CHECK(test_lookup_ready() == 0, "lookup_ready");
    CHECK(test_lookup_fallback_null() == 0, "lookup_fallback_null");
    CHECK(test_command_key_guard() == 0, "command_key_guard");
    CHECK(test_placeholders_match() == 0, "placeholders_match");
    CHECK(test_status_width() == 0, "status_width");
    CHECK(test_save_fields_ascii() == 0, "save_fields_ascii");
    CHECK(test_generated_table_consistent() == 0, "generated_table_consistent");
    printf("localization-boundaries: all tests passed "
           "(static rows: %d)\n",
           U4_I18N_STATIC_COUNT);
    return 0;
}
