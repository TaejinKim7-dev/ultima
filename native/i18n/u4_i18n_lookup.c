/*
 * u4_i18n_lookup.c — Todo 14 localization runtime boundary implementation.
 * Self-contained C99; no engine includes; see u4_i18n_lookup.h.
 */
#include <string.h>

#include "u4_i18n_lookup.h"

#define U4_I18N_CMD_PREFIX "cmd:"
#define U4_I18N_CMD_INFIX ":command:"
#define U4_I18N_MAX_PLACEHOLDERS 16

const char *u4_i18n_lookup(const U4I18nEntry *table, int count, const char *id) {
    int i;

    if (table == NULL || id == NULL || count <= 0)
        return NULL;
    if (u4_i18n_is_command_key(id))
        return NULL;
    for (i = 0; i < count; ++i) {
        if (table[i].id != NULL && strcmp(table[i].id, id) == 0) {
            if (table[i].is_command)
                return NULL;
            if (table[i].translation == NULL || table[i].translation[0] == '\0')
                return NULL;
            return table[i].translation;
        }
    }
    return NULL;
}

int u4_i18n_is_command_key(const char *id) {
    if (id == NULL)
        return 0;
    if (strncmp(id, U4_I18N_CMD_PREFIX, sizeof(U4_I18N_CMD_PREFIX) - 1) == 0)
        return 1;
    return strstr(id, U4_I18N_CMD_INFIX) != NULL ? 1 : 0;
}

static int is_placeholder_char(char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '%';
}

/*
 * Tokenizes one placeholder at `*pp`: printf specs (`%[-+ 0#]*width
 * (.precision)?spec`, same shape as scripts/lib/placeholders.mjs) and
 * `{digits}` forms. Advances `*pp` past the token; returns 1 on success.
 */
static int next_placeholder_token(const char **pp, char *out, int out_size) {
    const char *p = *pp;
    int len = 0;

    if (*p == '{') {
        out[len++] = *p++;
        while (*p >= '0' && *p <= '9' && len + 1 < out_size)
            out[len++] = *p++;
        if (*p != '}' || len <= 1)
            return 0;
        if (len + 1 >= out_size)
            return 0;
        out[len++] = *p++;
        out[len] = '\0';
        *pp = p;
        return 1;
    }
    if (*p != '%')
        return 0;
    out[len++] = *p++;
    while ((*p == '-' || *p == '+' || *p == ' ' || *p == '0' || *p == '#') &&
           len + 1 < out_size)
        out[len++] = *p++;
    while (*p >= '0' && *p <= '9' && len + 1 < out_size)
        out[len++] = *p++;
    if (*p == '.' && len + 1 < out_size) {
        out[len++] = *p++;
        while (*p >= '0' && *p <= '9' && len + 1 < out_size)
            out[len++] = *p++;
    }
    if (!is_placeholder_char(*p) || len + 1 >= out_size)
        return 0;
    out[len++] = *p++;
    out[len] = '\0';
    *pp = p;
    return 1;
}

static int collect_placeholders(const char *text, char tokens[][16], int max_tokens) {
    const char *p;
    int count = 0;
    char tok[16];

    if (text == NULL)
        return 0;
    for (p = text; *p != '\0'; ++p) {
        if (*p != '%' && *p != '{')
            continue;
        if (!next_placeholder_token(&p, tok, (int) sizeof(tok)))
            continue;
        if (count >= max_tokens)
            return -1;
        strcpy(tokens[count++], tok);
        /* next_placeholder_token advanced p past the token; the for-loop's
         * ++p would skip the following byte, so step back one. */
        --p;
    }
    return count;
}

static void sort_tokens(char tokens[][16], int count) {
    int i, j;
    char tmp[16];

    for (i = 1; i < count; ++i) {
        strcpy(tmp, tokens[i]);
        j = i - 1;
        while (j >= 0 && strcmp(tokens[j], tmp) > 0) {
            strcpy(tokens[j + 1], tokens[j]);
            --j;
        }
        strcpy(tokens[j + 1], tmp);
    }
}

int u4_i18n_placeholders_match(const char *expected_sig, const char *translation) {
    char expected[U4_I18N_MAX_PLACEHOLDERS][16];
    char actual[U4_I18N_MAX_PLACEHOLDERS][16];
    int expected_count, actual_count, i;

    if (expected_sig == NULL || translation == NULL)
        return 0;
    expected_count = collect_placeholders(expected_sig, expected, U4_I18N_MAX_PLACEHOLDERS);
    actual_count = collect_placeholders(translation, actual, U4_I18N_MAX_PLACEHOLDERS);
    if (expected_count < 0 || actual_count < 0 || expected_count != actual_count)
        return 0;
    sort_tokens(expected, expected_count);
    sort_tokens(actual, actual_count);
    for (i = 0; i < expected_count; ++i) {
        if (strcmp(expected[i], actual[i]) != 0)
            return 0;
    }
    return 1;
}

static int is_wide_code_point(unsigned int cp) {
    return (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3000 && cp <= 0x303F) ||
           (cp >= 0x3130 && cp <= 0x318F) || (cp >= 0xA960 && cp <= 0xA97F) ||
           (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xD7B0 && cp <= 0xD7FF) ||
           (cp >= 0xFF00 && cp <= 0xFFEF);
}

int u4_i18n_display_width(const char *utf8) {
    const unsigned char *p;
    int width = 0;

    if (utf8 == NULL)
        return 0;
    for (p = (const unsigned char *) utf8; *p != '\0'; ) {
        unsigned int cp;
        if (*p < 0x80) {
            cp = *p++;
        } else if ((*p & 0xE0) == 0xC0) {
            cp = ((unsigned int) (p[0] & 0x1F) << 6) | (p[1] & 0x3F);
            p += 2;
        } else if ((*p & 0xF0) == 0xE0) {
            cp = ((unsigned int) (p[0] & 0x0F) << 12) |
                 ((unsigned int) (p[1] & 0x3F) << 6) | (p[2] & 0x3F);
            p += 3;
        } else if ((*p & 0xF8) == 0xF0) {
            cp = ((unsigned int) (p[0] & 0x07) << 18) |
                 ((unsigned int) (p[1] & 0x3F) << 12) |
                 ((unsigned int) (p[2] & 0x3F) << 6) | (p[3] & 0x3F);
            p += 4;
        } else {
            ++p;
            continue;
        }
        width += is_wide_code_point(cp) ? 2 : 1;
    }
    return width;
}

int u4_i18n_fits_status(const char *utf8, int budget_cols) {
    if (utf8 == NULL)
        return 0;
    return u4_i18n_display_width(utf8) <= budget_cols ? 1 : 0;
}

int u4_i18n_allows_korean(const char *field) {
    if (field == NULL)
        return 0;
    if (strcmp(field, "dialogue") == 0 || strcmp(field, "ui-label") == 0)
        return 1;
    return 0;
}

/* Static table emitted by `npm run i18n:generate` (pending entries omitted). */
#include "u4_i18n_table.inc"
