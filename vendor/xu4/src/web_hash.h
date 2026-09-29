/*
 * Todo 23: hash of a screenMessage() format for the web build's Korean
 * dialogue panel. Kept in its own header so tests/unit/screen-hash-parity
 * can compile it with the host compiler and compare it against
 * scripts/lib/ui-templates.mjs fnv1a32 (the table the shell looks up).
 */
#ifndef WEB_HASH_H
#define WEB_HASH_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

/* 32-bit FNV-1a over `len` raw bytes, written as 8 lowercase hex digits + NUL. */
static inline void webBytesHash(const char* bytes, size_t len, char out[9]) {
    uint32_t hash = 0x811c9dc5u;
    const uint8_t* cp = (const uint8_t*) bytes;
    for (size_t i = 0; i < len; ++i) {
        hash ^= cp[i];
        hash *= 0x01000193u;
    }
    snprintf(out, 9, "%08x", (unsigned int) hash);
}

/* Same over a NUL-terminated format's bytes. */
static inline void webFormatHash(const char* fmt, char out[9]) {
    size_t len = 0;
    while (fmt[len])
        ++len;
    webBytesHash(fmt, len, out);
}

#endif
