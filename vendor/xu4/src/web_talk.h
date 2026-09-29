/*
 * web_talk.h -- web-only dialogue panel channel shared by the U4 talk
 * sources (discourse_tlk.cpp defines the EM_JS functions; discourse_castle.cpp
 * and codex.cpp only use them).
 *
 * Todo 22/24: the web shell shows each engine text line in Korean in its HTML
 * dialogue panel (src/dialogue/talk-compose.ts). A line is sent as its printf
 * format literal (open-source xu4 code) plus up to two %s arguments; an
 * argument that is original game data is sent as an "@table:index" id, never
 * as text. The canvas output is unchanged, and native builds compile all of
 * this away.
 */
#ifndef WEB_TALK_H
#define WEB_TALK_H

#ifdef __EMSCRIPTEN__
#include <stdio.h>

extern "C" {
void u4_web_talk_line(const char* fmt, const char* a0, const char* a1);
}

// Send a code literal (or a "%s"-style template with a plain/id argument).
static inline void u4WebTalkText(const char* text) {
    u4_web_talk_line(text, NULL, NULL);
}

// Send fmt with one original-data argument, as the id "@<table>:<index>".
static inline void u4WebTalkId(const char* fmt, const char* table, int index) {
    char id[80];
    snprintf(id, sizeof(id), "@%s:%d", table, index);
    u4_web_talk_line(fmt, id, NULL);
}

// Send a number as plain digits.
static inline void u4WebTalkNumber(int value) {
    char digits[16];
    snprintf(digits, sizeof(digits), "%d", value);
    u4_web_talk_line("%s", digits, NULL);
}
#else
#define u4WebTalkText(TEXT)         ((void) 0)
#define u4WebTalkId(FMT, T, I)      ((void) 0)
#define u4WebTalkNumber(N)          ((void) 0)
#endif

#endif
