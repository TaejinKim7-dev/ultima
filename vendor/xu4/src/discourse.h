/*
 * discourse.h
 */

#ifndef DISCOURSE_H
#define DISCOURSE_H

#include <stdint.h>

enum DiscourseSystem {
    DISCOURSE_UNSET,
    DISCOURSE_CASTLE,       // Original Ultima 4 data for LB & Hawkwind
    DISCOURSE_U4_TLK,       // Original Ultima 4 data
    DISCOURSE_XU4_TALK,     // Boron specification
    DISCOURSE_VENDOR        // Boron/XML script
};

struct Discourse {
    union {
        void*    table;
        uint32_t id;
    } conv;
    uint8_t  system;
    uint8_t  _pad;
    uint16_t convCount;
#ifdef __EMSCRIPTEN__
    // Todo 22: the loaded .TLK resource's uppercase basename ("MOONGLOW"),
    // the MAP part of locales/ko/tlk.json's MAP:npcIndex:field ids.
    char     webTlkName[12];
#endif
};

class Person;

void        discourse_init(Discourse*);
const char* discourse_load(Discourse*, const char* resource);
void        discourse_free(Discourse*);
bool        discourse_run(const Discourse*, uint16_t entry, Person*);
int         discourse_findName(const Discourse*, const char* name);
const char* discourse_name(const Discourse*, uint16_t entry);

#endif
