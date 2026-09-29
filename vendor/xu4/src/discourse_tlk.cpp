// Discourse for U4 Tlk

#include "game.h"
#include "party.h"
#include "screen.h"
#include "utils.h"
#include "web_talk.h"

enum DialogueString {
    DS_NAME,
    DS_PRONOUN,
    DS_LOOK,
    DS_KEYWORD,
    DS_QUESTION,
    DS_ANSWER_Y,
    DS_ANSWER_N
};

enum TalkOpcode {
    OP_NOP,
    OP_PAUSE_ASK = DS_QUESTION
};

enum VoicePart {
    VP_I_AM,
    VP_BYE,
    VP_GIVE,
    VP_JOIN,
    VP_KEYWORD
};

struct TalkState {
    Person* person;
    int16_t turnAway;
    int16_t nextOp;
    uint16_t voiceStream;
    uint16_t startVoiceLn;
    uint16_t askVoiceLn;
#ifdef __EMSCRIPTEN__
    // Todo 22: set only for U4 .TLK conversations (talkRunU4Tlk); NULL
    // webStrings disables the web talk channel (e.g. Boron dialogue).
    const char* webStrings;         // U4Talk::strings
    const uint16_t* webOffsets;     // &U4Talk::name .. &U4Talk::topic2
    const char* webMap;             // Discourse::webTlkName
    int webConv;                    // .TLK record index
#endif
};

typedef const char* (*TalkFunc)(TalkState*, int, const char*);

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <stdarg.h>

/*
 * Todo 22: the web shell shows each talk line in Korean in its HTML
 * dialogue panel (src/dialogue/talk-compose.ts). Every line is sent as its
 * printf format literal (xu4's own code string) plus its %s arguments;
 * arguments that point into the loaded .TLK record are sent as
 * "@MAP:npcIndex:field" ids, so the original English TLK text never leaves
 * the engine. The canvas output is unchanged.
 */
EM_JS(void, u4_web_talk_line, (const char* fmt, const char* a0, const char* a1), {
    if (Module.u4Text)
        Module.u4Text.talk(UTF8ToString(fmt), a0 ? UTF8ToString(a0) : null,
                           a1 ? UTF8ToString(a1) : null);
});
EM_JS(void, u4_web_talk_input, (const char* text), {
    if (Module.u4Text)
        Module.u4Text.input(UTF8ToString(text));
});

static const char* const webTlkFields[12] = {
    "name", "pronoun", "look", "job", "health", "response1", "response2",
    "question", "yes", "no", "topic1", "topic2"
};

/*
 * Return "@MAP:conv:field" in out if str is one of the conversation's TLK
 * fields, "?" if it points elsewhere into the record, or str itself.
 */
static const char* webTalkArg(const TalkState* ts, const char* str, char* out,
                              size_t outLen) {
    const int tlkRecordSize = 288;
    if (str >= ts->webStrings && str < ts->webStrings + tlkRecordSize) {
        for (int i = 0; i < 12; ++i) {
            if (ts->webOffsets[i] && str == ts->webStrings + ts->webOffsets[i]) {
                snprintf(out, outLen, "@%s:%d:%s", ts->webMap, ts->webConv,
                         webTlkFields[i]);
                return out;
            }
        }
        return "?";
    }
    return str;
}

static void webTalkEmit(const TalkState* ts, const char* fmt, va_list args) {
    char id0[40], id1[40];
    const char* arg[2] = { NULL, NULL };
    int argc = 0;

    if (! ts->webStrings)
        return;
    if (fmt >= ts->webStrings && fmt < ts->webStrings + 288) {
        // A TLK reply printed directly as the format (message(reply)).
        u4_web_talk_line("%s", webTalkArg(ts, fmt, id0, sizeof(id0)), NULL);
        return;
    }
    for (const char* cp = fmt; *cp; ++cp) {
        if (cp[0] != '%')
            continue;
        if (cp[1] == '%') {
            ++cp;
        } else if (cp[1] == 's' && argc < 2) {
            arg[argc] = va_arg(args, const char*);
            ++argc;
            ++cp;
        } else {
            // No other conversions occur in these talk lines; send the
            // literal alone rather than misread the arguments.
            u4_web_talk_line(fmt, NULL, NULL);
            return;
        }
    }
    u4_web_talk_line(fmt,
        arg[0] ? webTalkArg(ts, arg[0], id0, sizeof(id0)) : NULL,
        arg[1] ? webTalkArg(ts, arg[1], id1, sizeof(id1)) : NULL);
}

static void talkMessage(const TalkState* ts, const char* fmt, ...) {
    char buffer[1024];     // screen.cpp MsgBufferSize
    va_list args;

    va_start(args, fmt);
    va_list webArgs;
    va_copy(webArgs, args);
    webTalkEmit(ts, fmt, webArgs);
    va_end(webArgs);
    int len = vsnprintf(buffer, sizeof(buffer), fmt, args);
    va_end(args);
    if (len > 0)
        screenMessageN(buffer, len < (int) sizeof(buffer) ? len : (int) sizeof(buffer) - 1);
}

static void talkCrLf(const TalkState* ts) {
    screenCrLf();
    if (ts->webStrings)
        u4_web_talk_line("\n", NULL, NULL);
}

static void talkInputEcho(const TalkState* ts, const std::string& input) {
    if (ts->webStrings && ! input.empty())
        u4_web_talk_input(input.c_str());
}

#define TALK_MSG(...)       talkMessage(ts, __VA_ARGS__)
#define TALK_CRLF()         talkCrLf(ts)
#define TALK_INPUT(IN)      talkInputEcho(ts, IN)
#else
#define TALK_MSG            screenMessage
#define TALK_CRLF           screenCrLf
#define TALK_INPUT(IN)
#endif

static void talkYNResponse(TalkFunc func, TalkState* ts)
{
    std::string input;
    int ans;

    while (1) {
        input = gameGetInput(3);
        TALK_INPUT(input);
        TALK_CRLF();
        if (input.empty())
            return;
        ans = input[0];
        if (ans == 'y' || ans == 'Y') {
            ans = DS_ANSWER_Y;
            break;
        }
        if (ans == 'n' || ans == 'N') {
            ans = DS_ANSWER_N;
            break;
        }
        TALK_MSG("Yes or no!\n");
    }

    const char* reply = func(ts, ans, NULL);
    TALK_MSG(reply);
    TALK_CRLF();
}

static void runTalkDialogue(TalkFunc func, TalkState* ts)
{
    std::string input;
    const char* in;
    const char* reply;

#define DSTRING(V)  func(ts, V, NULL)
#define message     TALK_MSG
#define inputEq(K)  (strncasecmp(K, in, 4) == 0)

    message("\nYou meet %s\n", DSTRING(DS_LOOK));

    // 50% of the time they introduce themselves.
    if (xu4_random(2)) {
        TALK_CRLF();
        goto tell_name;
    }

    while (xu4.stage == StagePlay) {
        message("\nYour Interest:\n");
        input = gameGetInput(16);
        TALK_INPUT(input);
        TALK_CRLF();
        TALK_CRLF();
        in = input.c_str();
        if (input.empty() || strncasecmp("bye", in, 3) == 0) {
            soundSpeakLine(ts->voiceStream, ts->startVoiceLn + VP_BYE);
            message("Bye.\n");
            break;
        }

        /* Does the person turn away from/attack you? */
        if (ts->turnAway) {
            int prob = xu4_random(0x100);
            if (prob < ts->turnAway) {
                if (ts->turnAway - prob < 0x40) {
                    message("%s turns away!\n", DSTRING(DS_PRONOUN));
                } else {
                    message("%s says: On guard! Fool!\n", DSTRING(DS_PRONOUN));
                    ts->person->movement = MOVEMENT_ATTACK_AVATAR;
                }
                break;
            }
        }

        reply = func(ts, DS_KEYWORD, input.c_str());
        if (reply) {
            message(reply);
            TALK_CRLF();

            if (ts->nextOp == OP_PAUSE_ASK) {
                ts->nextOp = OP_NOP;

                EventHandler::waitAnyKey();

                reply = func(ts, DS_QUESTION, input.c_str());
                message("\n%s\n\nYou say: ", reply);
                talkYNResponse(func, ts);
            }
        } else {
            // Standard responses.
            if (inputEq("look")) {
                message("You see %s\n", DSTRING(DS_LOOK));
            } else if (inputEq("name")) {
tell_name:
                soundSpeakLine(ts->voiceStream, ts->startVoiceLn + VP_I_AM);
                message("%s says: I am %s\n",
                        DSTRING(DS_PRONOUN), DSTRING(DS_NAME));
            } else if (inputEq("give")) {
                if (ts->person->getNpcType() == NPC_TALKER_BEGGAR) {
                    message("How much? ");
                    int gold = EventHandler::readInt(2);
                    TALK_CRLF();
                    if (gold > 0) {
                        if (c->party->donate(gold)) {
                            soundSpeakLine(ts->voiceStream,
                                           ts->startVoiceLn + VP_GIVE);
                            message("%s says: Oh Thank thee! I shall never "
                                    "forget thy kindness!\n",
                                    DSTRING(DS_PRONOUN));
                        } else
                            message("\n\nThou hast not that much gold!\n");
                    }
                } else {
                    soundSpeakLine(ts->voiceStream,
                                   ts->startVoiceLn + VP_GIVE);
                    message("%s says: I do not need thy gold.  Keep it!\n",
                            DSTRING(DS_PRONOUN));
                }
            } else if (inputEq("join")) {
                Virtue virt;
                const char* name = DSTRING(DS_NAME);
                if (c->party->canPersonJoin(name, &virt)) {
                    CannotJoinError join = c->party->join(name);
                    if (join == JOIN_SUCCEEDED) {
                        soundSpeakLine(ts->voiceStream,
                                       ts->startVoiceLn + VP_JOIN);
                        message("I am honored to join thee!\n");
                        c->location->map->removeObject(ts->person);
                        break;
                    }
                    message("Thou art not %s enough for me to join thee.\n",
                            (join == JOIN_NOT_VIRTUOUS) ?
                                getVirtueAdjective(virt) : "experienced");
                } else {
                    // Here we suppress the voice for the one companion of
                    // the player's class that cannot join.
                    if (ts->person->getNpcType() != NPC_TALKER_COMPANION) {
                        soundSpeakLine(ts->voiceStream,
                                       ts->startVoiceLn + VP_JOIN);
                    }
                    message("%s says: I cannot join thee.\n",
                            DSTRING(DS_PRONOUN));
                }
#if 1
            } else if (inputEq("ojna")) {
                /*
                 * This little easter egg appeared in the Amiga version of
                 * Ultima IV.  I've never figured out what the number means.
                 * "Banjo" Bob Hardy was the programmer for the Amiga version.
                 */
                message("Hi Banjo Bob!\nYour secret\nnumber is\n4F4A4E0A\n");
#endif
            } else
                message("That I cannot\nhelp thee with.\n");
        }
    }
}

// discourse_castle.cpp (included after this file) keeps the original meaning.
#undef message
#define message     screenMessage

//---------------------------------------------------------------------------

struct U4Talk {
    const char* strings;
    uint8_t  askAfter;
    uint8_t  questionHumility;
    uint8_t  turnAway;
    uint8_t  _pad;
    uint16_t name;
    uint16_t pronoun;
    uint16_t look;
    uint16_t job;
    uint16_t health;
    uint16_t response1;
    uint16_t response2;
    uint16_t question;
    uint16_t yes;
    uint16_t no;
    uint16_t topic1;
    uint16_t topic2;
};

enum QuestionTrigger {
    QT_NONE,
    QT_JOB = 3,
    QT_HEALTH = 4,
    QT_KEYWORD1 = 5,
    QT_KEYWORD2 = 6
};

/*
 * Return the number of bytes used for count strings.
 */
int U4Talk_setOffsets(uint16_t* offset, const char* strings, int initOff,
                      int count) {
    const char* ptr = strings + initOff;
    for (int i = 0; i < count; ++i) {
        *offset++ = ptr - strings;
        ptr += strlen(ptr) + 1;
    }
    return ptr - strings;
}

/*
 * Replace any trailing spaces with NUL.
 * If the keyword is "A   " then set the offset to zero to mark it as unused.
 */
static void trimKeyword(char* str, uint16_t* off) {
    char* cp = str + off[0];
    if (strcmp(cp, "A   ") == 0) {
        off[0] = 0;
    } else {
        while (*cp)
            ++cp;
        while (cp[-1] == ' ') {
            --cp;
            *cp = '\0';
        }
    }
}

/*
 * Return byte count of all strings.
 */
int U4Talk_load(U4FILE *file, U4Talk* tlk, char* tlkBuf)
{
    const int tlkSize = 288;
    const char* ptr;
    char* cp;
    int len;

    /* there's no dialogues left in the file */
    if (u4fread(tlkBuf, 1, tlkSize, file) != tlkSize)
        return 0;

    tlk->strings = tlkBuf;
    tlk->askAfter = tlkBuf[0];
    tlk->questionHumility = tlkBuf[1];
    tlk->turnAway = tlkBuf[2];

    len = U4Talk_setOffsets(&tlk->name, tlkBuf, 3, 12);

    // Fix the description string, converting the first character to lower-case.
    cp = tlkBuf + tlk->look;
    cp[0] = tolower(cp[0]);

    // ... then replace any newlines in the string with spaces
    while (*cp) {
        if (*cp == '\n')
            *cp = ' ';
        ++cp;
    }

    {
    const int EDIT_A = 1;
    const int EDIT_PERIOD = 2;

    // ... then append a period to the string if one does not already exist
    int edit = ispunct(cp[-1]) ? 0 : EDIT_PERIOD;

    // ... and finally, a few characters in the game have descriptions
    // that do not begin with a definite (the) or indefinite (a/an)
    // article.  On those characters, insert the appropriate article.
    ptr = tlkBuf + tlk->name;
    if (strcmp(ptr, "Iolo") == 0 ||
        strcmp(ptr, "Tracie") == 0 ||
        strcmp(ptr, "Dupre") == 0 ||
        strcmp(ptr, "Traveling Dan") == 0)
        edit |= EDIT_A;

    if (edit) {
        // Move look to the end of the loaded TLK data if there is room.
        int extLen = len + (tlk->job - tlk->look) + 3;
        if (extLen < tlkSize) {
            cp = tlkBuf + len;
            if (edit & EDIT_A) {
                *cp++ = 'a';
                *cp++ = ' ';
            }
            ptr = tlkBuf + tlk->look;
            while (*ptr)
                *cp++ = *ptr++;
            if (edit & EDIT_PERIOD)
                *cp++ = '.';
            *cp = '\0';

            tlk->look = len;
            len = cp - tlkBuf;
        }
    }
    }

    trimKeyword(tlkBuf, &tlk->topic1);
    trimKeyword(tlkBuf, &tlk->topic2);

    return len;
}

struct U4TalkState {
    TalkState state;
    const U4Talk* tlk;
};

static const char* U4Talk_dialogue(TalkState* ts, int value, const char* input)
{
    const U4Talk* tlk = ((U4TalkState*) ts)->tlk;

#define USTR(off)   (tlk->strings + tlk->off)
#define QUEUE_ASK(TRIGGER) \
    if (tlk->askAfter == TRIGGER) \
        ts->nextOp = OP_PAUSE_ASK;

    if (value == DS_KEYWORD) {
        const char* topic;

        if (tlk->topic1) {
            topic = USTR(topic1);
            if (strncasecmp(topic, input, strlen(topic)) == 0) {
                QUEUE_ASK(QT_KEYWORD1);
                return USTR(response1);
            }
        }

        if (tlk->topic2) {
            topic = USTR(topic2);
            if (strncasecmp(topic, input, strlen(topic)) == 0) {
                QUEUE_ASK(QT_KEYWORD2);
                return USTR(response2);
            }
        }

        if (strncasecmp("job", input, 3) == 0) {
            QUEUE_ASK(QT_JOB)
            return USTR(job);
        }
        if (strncasecmp("heal", input, 4) == 0) {
            QUEUE_ASK(QT_HEALTH)
            return USTR(health);
        }
    } else {
        switch(value) {
            case DS_NAME:
                return USTR(name);
            case DS_PRONOUN:
                return USTR(pronoun);
            case DS_LOOK:
                return USTR(look);
            case DS_QUESTION:
                return USTR(question);
            case DS_ANSWER_Y:
                if (tlk->questionHumility)
                    c->party->adjustKarma(KA_BRAGGED);
                return USTR(yes);
            case DS_ANSWER_N:
                if (tlk->questionHumility)
                    c->party->adjustKarma(KA_HUMBLE);
                return USTR(no);
        }
    }
    return NULL;
}

void talkRunU4Tlk(const Discourse* disc, int conv, Person* person)
{
    U4TalkState ts;

    ts.tlk = ((const U4Talk*) disc->conv.table) + conv;
    ts.state.person = person;
    ts.state.turnAway = ts.tlk->turnAway;
    ts.state.nextOp = OP_NOP;
    ts.state.voiceStream = 0;
    ts.state.startVoiceLn = 0;
#ifdef __EMSCRIPTEN__
    ts.state.webStrings = ts.tlk->strings;
    ts.state.webOffsets = &ts.tlk->name;
    ts.state.webMap = disc->webTlkName;
    ts.state.webConv = conv;
#endif

    runTalkDialogue(U4Talk_dialogue, &ts.state);
}

//---------------------------------------------------------------------------

#ifdef USE_BORON
#include <boron/urlan.h>

enum BoronDialogueIndex {
    DI_NAME,
    DI_PRONOUN,
    DI_LOOK,
    DI_DATA,        // turn-away, voice-stream, voice-line
    DI_TOPICS,
    DI_COUNT
};

struct BoronDialogue {
    TalkState state;
    UThread* ut;
    const UCell* values;
    const UCell* askCell;
    UBlockIt topics;
};

static inline bool wordQuestionHumility(UThread* ut, const UCell* cell)
{
    return strcmp(ur_wordCStr(cell), "ask-humility") == 0;
}

static const char* dialogueBoron(TalkState* ts, int value, const char* input)
{
    BoronDialogue* bd = (BoronDialogue*) ts;
    UThread* ut = bd->ut;
    USeriesIter si;
    UIndex n;

    if (value == DS_KEYWORD) {
        int voiceLine = ts->startVoiceLn + VP_KEYWORD;
        const UCell* cell = bd->topics.it;
        const UCell* end  = bd->topics.end;

        while (cell != end) {
            if (ur_is(cell, UT_STRING)) {
                ur_seriesSlice(ut, &si, cell);
                n = si.end - si.it;
                if (strncasecmp(si.buf->ptr.c + si.it, input, n) == 0) {
                    ur_seriesSlice(ut, &si, ++cell);

                    // Queue up any following question.
                    ++cell;
                    if (cell != end && ur_is(cell, UT_WORD)) {
                        bd->askCell = cell;
                        ts->askVoiceLn = voiceLine + 1;
                        ts->nextOp = OP_PAUSE_ASK;
                    }
                    soundSpeakLine(ts->voiceStream, voiceLine);
                    goto reply;
                }
                cell += 2;
                voiceLine += 1;
            } else if (ur_is(cell, UT_WORD)) {
                // Skip (ask "Question?" ["Yes reply" "No reply"])
                cell += 3;
                voiceLine += 3;
            }
        }
        return NULL;
    }

    switch (value) {
        case DS_QUESTION:
            if (! bd->askCell)
                return NULL;
            soundSpeakLine(ts->voiceStream, ts->askVoiceLn);
            ur_seriesSlice(ut, &si, bd->askCell + 1);
            break;
        case DS_ANSWER_Y:
            n = 0;
            goto answer;
        case DS_ANSWER_N:
            n = 1;
answer:
            if (! bd->askCell)
                return NULL;
            if (wordQuestionHumility(ut, bd->askCell))
                c->party->adjustKarma(n ? KA_HUMBLE : KA_BRAGGED);
            soundSpeakLine(ts->voiceStream, ts->askVoiceLn + n + 1);
            {
            const UBuffer* blk = ur_bufferSer(bd->askCell + 2);
            ur_seriesSlice(ut, &si, blk->ptr.cell + n);
            }
            bd->askCell = NULL;
            break;
        default:
            ur_seriesSlice(ut, &si, bd->values + value);
            break;
    }

reply:
    //assert(si.buf->form != UR_ENC_UCS2);
    return si.buf->ptr.c + si.it;
}

void talkRunBoron(int32_t discBlkN, int conv, Person* person)
{
    BoronDialogue bd;
    UThread* ut = xu4.config->boronThread();
    const UBuffer* blk = ur_buffer(discBlkN);

    bd.ut = ut;
    bd.values = blk->ptr.cell + conv * DI_COUNT;
    bd.askCell = NULL;
    ur_blockIt(ut, &bd.topics, bd.values + DI_TOPICS);

    {
    const UCell* data = bd.values + DI_DATA;
    TalkState* ts = &bd.state;

    ts->person = person;
    ts->turnAway = data->coord.n[0];
    ts->nextOp = OP_NOP;
    ts->voiceStream = data->coord.n[1];
    if (ts->voiceStream)
        ts->voiceStream++;       // Config::musicFile() id is one based.
    ts->startVoiceLn = data->coord.n[2];
#ifdef __EMSCRIPTEN__
    ts->webStrings = NULL;      // Boron dialogue: no web talk channel yet.
#endif
    }

    runTalkDialogue(dialogueBoron, &bd.state);
}

const char* talkNameBoron(int32_t discBlkN, int conv)
{
    UThread* ut = xu4.config->boronThread();
    const UBuffer* blk = ur_buffer(discBlkN);
    const UCell* values = blk->ptr.cell + conv * DI_COUNT;

    USeriesIter si;
    ur_seriesSlice(ut, &si, values + DI_NAME);
    return si.buf->ptr.c + si.it;
}
#endif
