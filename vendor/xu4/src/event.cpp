/*
 * event.cpp
 */

#include <cassert>
#include <cctype>
#include <cstring>
#include <list>

#include "event.h"

#include "config.h"
#include "context.h"
#include "location.h"
#include "savegame.h"
#include "screen.h"
#include "sound.h"
#include "textview.h"
#include "u4.h"
#include "xu4.h"

#ifdef __EMSCRIPTEN__
// Step 8 browser-safe input queue (C ABI home). Only the per-frame yield
// is referenced here; queue drain/snapshot wiring lands in Step 9's web
// input path. Never retains Controller pointers.
#include "web_bridge.h"
#include <emscripten.h>

// Todo 18: the shell's #korean-keyword-input (src/shell.ts) must reject a
// submission whose native text prompt has already closed. Every
// readInt/readString/readStringView (intro name prompt, NPC talk, ...)
// goes through ReadStringController, so its lifetime is the prompt epoch.
//
// Todo 30: a native readChoice() prompt is a prompt epoch too. Without it the
// shell's Korean answer field could never reach a choice prompt at all, so
// every progression-critical question asked through readChoice() -- Lord
// British's "Art thou well?" (discourse_castle.cpp), the intro sex prompt and
// the gypsy's A)/B) virtue question (intro.cpp) -- rejected Korean input.
// The epoch id space is shared by both controllers on purpose: the shell
// keys its open-prompt stack by id, so two independent counters would hand
// the same id to a string prompt and a choice prompt and a close() would pop
// the wrong one.
enum {
    U4_WEB_PROMPT_TEXT  = 0,   // ReadStringController
    U4_WEB_PROMPT_CHOICE = 1   // ReadChoiceController
};

static int nextWebPromptId = 1;

static int allocWebPromptId() {
    return nextWebPromptId++;
}

EM_JS(void, u4_web_text_prompt_opened, (int id, int kind), {
    if (Module.u4TextPrompt) Module.u4TextPrompt.opened(id, kind);
});
EM_JS(void, u4_web_text_prompt_closed, (int id), {
    if (Module.u4TextPrompt) Module.u4TextPrompt.closed(id);
});
/*
 * User report 2026-10-05: the shell must tell a native "press any key" pause
 * (e.g. discourse_tlk.cpp's OP_PAUSE_ASK) from the end of a conversation.
 */
EM_JS(void, u4_web_key_wait, (int on), {
    if (Module.u4TextPrompt && typeof Module.u4TextPrompt.keyWait === "function") Module.u4TextPrompt.keyWait(on !== 0);
});

/*
 * Todo 49: the in-game message-area overlay echoes what the player is typing
 * at the current native prompt. ReadStringController's value is always ASCII
 * here (its accepted-chars bitset is single-byte), so UTF8ToString over the C
 * string is exact. ESC erases the whole value, which is sent as empty text so
 * the overlay clears its echo.
 */
EM_JS(void, u4_web_screen_input, (int id, const char* text), {
    if (Module.u4Screen) Module.u4Screen.input(id, text ? UTF8ToString(text) : "");
});
EM_JS(void, u4_web_screen_choice, (const char* ch), {
    if (Module.u4Screen) Module.u4Screen.choice(ch ? UTF8ToString(ch) : "");
});
#endif

using std::string;

#ifdef DEBUG
#include "irecord.c"
#endif

static void frameSleepInit(FrameSleep* fs, int frameDuration) {
    fs->frameInterval = frameDuration;
    fs->realTime = 0;
    for (int i = 0; i < 8; ++i)
        fs->ftime[i] = frameDuration;
    fs->ftimeSum = frameDuration * 8;
    fs->ftimeIndex = 0;
    fs->fsleep = frameDuration - 6;
}

/**
 * Constructs the event handler object.
 */
EventHandler::EventHandler(int gameCycleDuration, int frameDuration) :
    timerInterval(gameCycleDuration),
    runRecursion(0),
    updateScreen(NULL)
{
    controllerDone = ended = paused = false;
    anim_init(&flourishAnim, 64, NULL, NULL);
    anim_init(&fxAnim, 32, NULL, NULL);
    frameSleepInit(&fs, frameDuration);

#ifdef DEBUG
    irec_init(&inputRec);
#endif
}

EventHandler::~EventHandler() {
#ifdef DEBUG
    irec_endRecording(&inputRec);
#endif
    anim_free(&flourishAnim);
    anim_free(&fxAnim);
}

void EventHandler::setTimerInterval(int msecs) {
    timerInterval = msecs;
}

void EventHandler::runController(Controller* con) {
    if (con->present()) {
        pushController(con);
        run();
        popController();
        setControllerDone(false);
        con->conclude();
    }
}

/** Sets the controller exit flag for the event handler */
void EventHandler::setControllerDone(bool done)
{
    controllerDone = done;
}

/** Returns the current value of the controller exit flag */
bool EventHandler::getControllerDone() {
    return controllerDone;
}

/** Signals that the game should immediately exit. */
void EventHandler::quitGame() {
    ended = true;
    xu4.stage = StageExitGame;
}

TimedEventMgr* EventHandler::getTimer() { return &timedEvents; }

Controller *EventHandler::pushController(Controller *c) {
    controllers.push_back(c);
    int interval = c->getTimerInterval();
    if (interval)
        timedEvents.add(&Controller::timerCallback, interval, c);
    return c;
}

Controller *EventHandler::popController() {
    if (controllers.empty())
        return NULL;

    Controller* con = controllers.back();
    if (con->getTimerInterval())
        timedEvents.remove(&Controller::timerCallback, con);

    controllers.pop_back();
    if (con->deleteOnPop())
        delete con;

    return getController();
}

Controller *EventHandler::getController() const {
    if (controllers.empty())
        return NULL;

    return controllers.back();
}

void EventHandler::setController(Controller *c) {
    while (popController() != NULL) {}
    pushController(c);
}

const MouseArea* EventHandler::mouseAreaForPoint(int x, int y) const {
    int i;
    const MouseArea *areas = getMouseAreaSet();

    if (!areas)
        return NULL;

    screenPointToMouseArea(&x, &y);
    for (i = 0; areas[i].npoints != 0; i++) {
        if (pointInMouseArea(x, y, &(areas[i]))) {
            return &(areas[i]);
        }
    }
    return NULL;
}

void EventHandler::setScreenUpdate(void (*updateFunc)(void)) {
    updateScreen = updateFunc;
}

#define GPU_PAUSE

void EventHandler::togglePause() {
    if (paused) {
        paused = false;
    } else {
#ifdef GPU_PAUSE
        // Don't pause if Game Browser (or other LAYER_TOP_MENU user) is open.
        if (screenLayerUsed(LAYER_TOP_MENU))
            return;
#endif
        paused = true;
        // Set ended to break the run loop.  runPause() resets it so that
        // the game does not end.
        ended = true;
    }
}

void EventHandler::expose() {
    if (paused)
        screenSwapBuffers();
}

#include "support/getTicks.c"

#ifdef GPU_PAUSE
#include "gpu.h"
#include "gui.h"

static void renderPause(ScreenState* ss, void* data)
{
    gpu_drawGui(xu4.gpu, GPU_DLIST_GUI, WID_NONE, 0);
}
#endif

// Return true if game should end.
bool EventHandler::runPause() {
    Controller waitCon;

    soundSuspend(1);
    screenSetMouseCursor(MC_DEFAULT);
#ifdef GPU_PAUSE
    static uint8_t pauseGui[] = {
        LAYOUT_V, BG_COLOR_CI, 128,
        MARGIN_V_PER, 42, FONT_VSIZE, 38, LABEL_DT_S,
        LAYOUT_END
    };
    const void* guiData[1];
    guiData[0] = "\x13\xAPaused";
    TxfDrawState ds;
    ds.fontTable = screenState()->fontTable;
    float* attr = gpu_beginTris(xu4.gpu, GPU_DLIST_GUI);
    attr = gui_layout(attr, NULL, &ds, pauseGui, guiData);
    gpu_endTris(xu4.gpu, GPU_DLIST_GUI, attr);

    screenSetLayer(LAYER_TOP_MENU, renderPause, this);
#else
    screenTextAt(16, 12, "( Paused )");
    screenUploadToGPU();
#endif
    screenSwapBuffers();

    ended = false;
    do {
        msecSleep(333);
        handleInputEvents(&waitCon, NULL);
    } while (paused && ! ended);

#ifdef GPU_PAUSE
    screenSetLayer(LAYER_TOP_MENU, NULL, NULL);
#endif
    soundSuspend(0);
    return ended;
}

/*
 * Return non-zero if waitTime has been reached or passed.
 */
static int frameSleep(FrameSleep* fs, uint32_t waitTime) {
    uint32_t now;
    int32_t elapsed, elapsedLimit, frameAdjust;
    int i;

    now = getTicks();
    elapsed = now - fs->realTime;
    fs->realTime = now;

    elapsedLimit = fs->frameInterval * 8;
    if (elapsed > elapsedLimit)
        elapsed = elapsedLimit;

    i = fs->ftimeIndex;
    fs->ftimeSum += elapsed - fs->ftime[i];
    fs->ftime[i] = elapsed;
    fs->ftimeIndex = i ? i - 1 : FS_SAMPLES - 1;

    frameAdjust = int(fs->frameInterval) - fs->ftimeSum / FS_SAMPLES;
#if 0
    // Adjust by 1 msec.
    if (frameAdjust > 0) {
        if (fs->fsleep < fs->frameInterval - 1)
            ++fs->fsleep;
    } else if (frameAdjust < 0) {
        if (fs->fsleep)
            --fs->fsleep;
    }
#else
    // Adjust by 2 msec.
    if (frameAdjust > 0) {
        if (frameAdjust > 2)
            frameAdjust = 2;
        int sa = int(fs->fsleep) + frameAdjust;
        int limit = fs->frameInterval - 1;
        fs->fsleep = (sa > limit) ? limit : sa;
    } else if (frameAdjust < 0) {
        if (frameAdjust < -2)
            frameAdjust = -2;
        int sa = int(fs->fsleep) + frameAdjust;
        fs->fsleep = (sa < 0) ? 0 : sa;
    }
#endif

    if (waitTime && now >= waitTime)
        return 1;
#if 0
    printf("KR fsleep %d ela:%d avg:%d adj:%d\n",
           fs->fsleep, elapsed, fs->ftimeSum / FS_SAMPLES, frameAdjust);
#endif
    if (fs->fsleep)
        msecSleep(fs->fsleep);
#ifdef __EMSCRIPTEN__
    // Step 8: yield to the browser every foreground frame even when
    // fsleep==0, so DOM input callbacks can run and Asyncify can unwind.
    // Asyncify-safe sleep(0); never dispatches controllers directly.
    if (!fs->fsleep)
        u4_web_frame_yield();
#endif
    return 0;
}

/**
 * Delays program execution for the specified number of milliseconds.
 * This doesn't actually stop events, but it stops the user from interacting
 * while some important event happens (e.g., getting hit by a cannon ball or
 * a spell effect).
 *
 * This method is not expected to handle msec values of less than the display
 * refresh interval.
 *
 * \return true if game should exit.
 */
bool EventHandler::wait_msecs(unsigned int msec) {
    Controller waitCon;     // Base controller consumes key events.
    EventHandler* eh = xu4.eventHandler;
    uint32_t waitTime = getTicks() + msec;

    while (! eh->ended) {
        eh->handleInputEvents(&waitCon, NULL);
#ifdef DEBUG
        int key;
        while ((key = eh->recordedKey()))
            waitCon.notifyKeyPressed(key);
        eh->recordTick();
#endif
        if (eh->runTime >= eh->timerInterval) {
            eh->runTime -= eh->timerInterval;
            eh->timedEvents.tick();
        }
        eh->runTime += eh->fs.frameInterval;

        screenSwapBuffers();
        if (frameSleep(&eh->fs, waitTime))
            break;
    }

    return eh->ended;
}

/*
 * Execute the game with a deterministic loop until the current controller
 * is done or the game exits.
 *
 * \return true if game should exit.
 */
bool EventHandler::run() {
    if (updateScreen)
        (*updateScreen)();

    if (! runRecursion) {
        runTime = 0;
        fs.realTime = getTicks();
    }
    ++runRecursion;

resume:
    while (! ended && ! controllerDone) {
        handleInputEvents(NULL, updateScreen);
#ifdef DEBUG
        int key;
        while ((key = recordedKey())) {
            if (getController()->notifyKeyPressed(key) && updateScreen)
                (*updateScreen)();
        }
        recordTick();
#endif
        if (runTime >= timerInterval) {
            runTime -= timerInterval;
            timedEvents.tick();
        }
        runTime += fs.frameInterval;

        screenSwapBuffers();
        frameSleep(&fs, 0);
    }

    if (paused && ! runPause())
        goto resume;

    --runRecursion;
    return ended;
}

//----------------------------------------------------------------------------

/* TimedEvent functions */
TimedEvent::TimedEvent(TimedEvent::Callback cb, int i, void *d) :
    callback(cb),
    data(d),
    interval(i),
    current(0)
{}

TimedEvent::Callback TimedEvent::getCallback() const    { return callback; }
void *TimedEvent::getData()                             { return data; }

/**
 * Advances the timed event forward a tick.
 * When (current >= interval), then it executes its callback function.
 */
void TimedEvent::tick() {
    if (++current >= interval) {
        (*callback)(data);
        current = 0;
    }
}

/**
 * Destructs a timed event manager object.
 */
TimedEventMgr::~TimedEventMgr() {
    while(! events.empty()) {
        delete events.front(), events.pop_front();
    }
    while(! deferredRemovals.empty()) {
        delete deferredRemovals.front(), deferredRemovals.pop_front();
    }
}

/**
 * Adds a timed event to the event queue.
 */
void TimedEventMgr::add(TimedEvent::Callback callback, int interval, void *data) {
    events.push_back(new TimedEvent(callback, interval, data));
}

/**
 * Removes a timed event from the event queue.
 */
TimedEventMgr::List::iterator TimedEventMgr::remove(List::iterator i) {
    if (isLocked()) {
        deferredRemovals.push_back(*i);
        return i;
    }
    else {
        delete *i;
        return events.erase(i);
    }
}

void TimedEventMgr::remove(TimedEvent* event) {
    List::iterator i;
    for (i = events.begin(); i != events.end(); i++) {
        if ((*i) == event) {
            remove(i);
            break;
        }
    }
}

void TimedEventMgr::remove(TimedEvent::Callback callback, void *data) {
    List::iterator i;
    for (i = events.begin(); i != events.end(); i++) {
        if ((*i)->getCallback() == callback && (*i)->getData() == data) {
            remove(i);
            break;
        }
    }
}

/**
 * Runs each of the callback functions of the TimedEvents associated with this manager.
 */
void TimedEventMgr::tick() {
    List::iterator i;

    // Lock the event list so it cannot be modified during iteration.
    locked = true;

    for (i = events.begin(); i != events.end(); i++)
        (*i)->tick();

    locked = false;

    // Remove events that have been deferred for removal
    for (i = deferredRemovals.begin(); i != deferredRemovals.end(); i++)
        events.remove(*i);
}

void EventHandler::pushMouseAreaSet(const MouseArea *mouseAreas) {
    mouseAreaSets.push_front(mouseAreas);
}

void EventHandler::popMouseAreaSet() {
    if (mouseAreaSets.size())
        mouseAreaSets.pop_front();
}

/**
 * Get the currently active mouse area set off the top of the stack.
 */
const MouseArea* EventHandler::getMouseAreaSet() const {
    if (mouseAreaSets.size())
        return mouseAreaSets.front();
    else
        return NULL;
}

//----------------------------------------------------------------------------

/**
 * A controller to read a string, terminated by the enter key.
 */
class ReadStringController : public WaitableController<string> {
public:
    ReadStringController(int maxlen, int screenX, int screenY,
                         TextView* view = NULL,
                         const char* accepted_chars = NULL);

    virtual bool keyPressed(int key);
#ifdef __EMSCRIPTEN__
    virtual ~ReadStringController() {
        u4_web_text_prompt_closed(webPromptId);
    }
#endif

protected:
    int maxlen, screenX, screenY;
    TextView *view;
    uint8_t accepted[16];   // Character bitset.
#ifdef __EMSCRIPTEN__
    int webPromptId;
#endif

    friend EventHandler;
};

#define TEST_BIT(bits, c)   (bits[c >> 3] & 1 << (c & 7))
#define MAX_BITS    128

static void addCharBits(uint8_t* bits, const char* cp) {
    int c;
    while ((c = *cp++))
        bits[c >> 3] |= 1 << (c & 7);
}

/**
 * @param maxlen the maximum length of the string
 * @param screenX the screen column where to begin input
 * @param screenY the screen row where to begin input
 * @param textView  Pointer to associated TextView or NULL.
 * @param accepted_chars a string characters to be accepted for input
 */
ReadStringController::ReadStringController(int maxlen, int screenX, int screenY, TextView* textView, const char* accepted_chars) {
    // Set 0-9, A-Z, a-z, backspace, new line, carriage return, & space.
    static const uint8_t alphaNumBitset[MAX_BITS/8] = {
        0x00, 0x25, 0x00, 0x00, 0x01, 0x00, 0xFF, 0x03,
        0xFE, 0xFF, 0xFF, 0x07, 0xFE, 0xFF, 0xFF, 0x07
    };

    this->maxlen = maxlen;
    this->screenX = screenX;
    this->screenY = screenY;
    view = textView;

    if (accepted_chars) {
        memset(accepted, 0, MAX_BITS/8);
        addCharBits(accepted, accepted_chars);
    } else {
        memcpy(accepted, alphaNumBitset, MAX_BITS/8);
    }

#ifdef __EMSCRIPTEN__
    webPromptId = allocWebPromptId();
    u4_web_text_prompt_opened(webPromptId, U4_WEB_PROMPT_TEXT);
#endif
}

static void soundInvalidInput() {
    soundPlay(SOUND_BLOCKED);
}

bool ReadStringController::keyPressed(int key) {
    if (key < MAX_BITS && TEST_BIT(accepted, key)) {
        int len = value.length();

        if (key == U4_BACKSPACE) {
            if (len > 0) {
                /* remove the last character */
                value.erase(len - 1, 1);
#ifdef __EMSCRIPTEN__
                /* Todo 49: the overlay echoes the current value after the erase. */
                u4_web_screen_input(webPromptId, value.c_str());
#endif

                if (view) {
                    view->textAt(screenX + len - 1, screenY, " ");
                    view->setCursorPos(screenX + len - 1, screenY);
                } else {
                    screenHideCursor();
                    screenTextAt(screenX + len - 1, screenY, " ");
                    screenSetCursorPos(screenX + len - 1, screenY);
                    screenShowCursor();
                }
            } else
                soundInvalidInput();
        }
        else if (key == '\n' || key == '\r') {
            doneWaiting();
        }
        else if (key == U4_ESC) {
            value.erase(0, value.length());
#ifdef __EMSCRIPTEN__
            /* Todo 49: ESC clears the input -- the overlay must drop its echo. */
            u4_web_screen_input(webPromptId, "");
#endif
            doneWaiting();
        }
        else if (len < maxlen) {
            /* add a character to the end */
            value += key;
#ifdef __EMSCRIPTEN__
            /* Todo 49: the overlay echoes the typed character as part of the value. */
            u4_web_screen_input(webPromptId, value.c_str());
#endif

            if (view) {
                view->textAtFmt(screenX + len, screenY, "%c", key);
                view->setCursorPos(screenX + len + 1, screenY);
            } else {
                screenHideCursor();
                screenTextAt(screenX + len, screenY, "%c", key);
                screenSetCursorPos(screenX + len + 1, screenY);
                c->col = len + 1;
                screenShowCursor();
            }
        }
        else
            soundInvalidInput();
        return true;
    } else {
        bool valid = EventHandler::defaultKeyHandler(key);
        if (! valid)
            soundInvalidInput();
        return valid;
    }
}

//----------------------------------------------------------------------------

/**
 * A controller to read a single key from a provided list.
 */
class ReadChoiceController : public WaitableController<int> {
public:
    ReadChoiceController(const string &choices);
    virtual bool keyPressed(int key);
#ifdef __EMSCRIPTEN__
    virtual ~ReadChoiceController() {
        u4_web_text_prompt_closed(webPromptId);
    }
#endif

protected:
    string choices;
#ifdef __EMSCRIPTEN__
    int webPromptId;
#endif
};

ReadChoiceController::ReadChoiceController(const string &choices) {
    this->choices = choices;
#ifdef __EMSCRIPTEN__
    // Todo 30: a choice prompt is a prompt epoch, so the web shell's Korean
    // answer field can reach it exactly like an NPC keyword prompt.
    webPromptId = allocWebPromptId();
    u4_web_text_prompt_opened(webPromptId, U4_WEB_PROMPT_CHOICE);
#endif
}

bool ReadChoiceController::keyPressed(int key) {
    /* Todo 30: `choices` is a plain ASCII byte set at every readChoice() call
     * site (xu4 passes "yn \n\033", "mf", "ab", "abcdefgh...\033\n\r", ...),
     * so a key that is not a single ASCII byte -- a multi-byte Korean code
     * point, or a GLFW modifier/keypad code above 0xFF -- can never be one of
     * the accepted choices. Compare the whole int explicitly instead of
     * letting find_first_of() narrow it: truncating would let 320 (GLFW's
     * GLFW_KEY_KP_0) masquerade as '@' and answer a choice it never was.
     *
     * HOW A KOREAN ANSWER REACHES A CHOICE: the native key path can only ever
     * carry single bytes (see ReadStringController's ASCII accepted-chars
     * bitset too), so a Korean answer is resolved to the canonical English
     * choice key ('y'/'n' for "yn", 'm'/'f' for "mf", 'a'/'b' for "ab") by
     * src/i18n/korean-aliases.ts and arrives here as the very same keystroke
     * a player pressing that key would produce. The English keys, the command
     * keys and the comparison values above are untouched. */
    const bool singleByteKey = (key >= 0) && (key <= 0x7F);

    // isupper() accepts 1-byte characters, yet the modifier keys
    // (ALT, SHIFT, ETC) produce values beyond 255
    if (singleByteKey && isupper(key))
        key = tolower(key);

    if (choices.empty() || (singleByteKey && choices.find_first_of(static_cast<char>(key)) < choices.length())) {
        // If the value is printable, display it
        const ScreenState* ss = screenState();
        if (ss->cursorVisible && key > ' ' && key <= 0x7F)
            screenShowChar(toupper(key), ss->cursorX, ss->cursorY);
#ifdef __EMSCRIPTEN__
        /*
         * Todo 49: the message-area overlay echoes the accepted choice key
         * as a temporary cell, matching the native display condition above
         * (printable and cursor visible) so nothing extra appears.
         */
        if (ss->cursorVisible && key > ' ' && key <= 0x7F) {
            char echo = (char) toupper(key);
            u4_web_screen_choice(&echo);
        }
#endif
        value = key;
        doneWaiting();
        return true;
    }

    return false;
}

//----------------------------------------------------------------------------

/**
 * A controller to read a direction enter with the arrow keys.
 */
class ReadDirController : public WaitableController<Direction> {
public:
    ReadDirController();
    virtual bool keyPressed(int key);
};

ReadDirController::ReadDirController() {
    value = DIR_NONE;
}

bool ReadDirController::keyPressed(int key) {
    Direction d = keyToDirection(key);
    bool valid = (d != DIR_NONE);

    switch(key) {
    case U4_ESC:
    case U4_SPACE:
    case U4_ENTER:
        value = DIR_NONE;
        doneWaiting();
        return true;

    default:
        if (valid) {
            value = d;
            doneWaiting();
            return true;
        }
        break;
    }

    return false;
}

//----------------------------------------------------------------------------

class AnyKeyController : public Controller {
public:
    void wait();
    void waitTimeout();
    virtual bool keyPressed(int key);
    virtual bool inputEvent(const InputEvent*);
    virtual void timerFired();
};

void AnyKeyController::wait() {
    timerInterval = 0;
    xu4.eventHandler->runController(this);
}

// Wait briefly (10 seconds) for a key press.
void AnyKeyController::waitTimeout() {
    timerInterval = 10000 / xu4.eventHandler->getTimerInterval();
    xu4.eventHandler->runController(this);
}

bool AnyKeyController::keyPressed(int key) {
    xu4.eventHandler->setControllerDone();
    return true;
}

bool AnyKeyController::inputEvent(const InputEvent* ev) {
    if (ev->type == IE_MOUSE_PRESS && ev->n == CMOUSE_LEFT)
        xu4.eventHandler->setControllerDone();
    return true;
}

void AnyKeyController::timerFired() {
    xu4.eventHandler->setControllerDone();
}

//----------------------------------------------------------------------------

/**
 * A controller to read a player number.
 */
class ReadPlayerController : public ReadChoiceController {
public:
    ReadPlayerController();
    ~ReadPlayerController();
    virtual bool keyPressed(int key);

    int getPlayer();
    int waitFor();
};

ReadPlayerController::ReadPlayerController() : ReadChoiceController("12345678 \033\n") {
}

ReadPlayerController::~ReadPlayerController() {
}

bool ReadPlayerController::keyPressed(int key) {
    bool valid = ReadChoiceController::keyPressed(key);
    if (valid) {
        if (value < '1' ||
            value > ('0' + c->saveGame->members))
            value = '0';
    } else {
        value = '0';
    }
    return valid;
}

int ReadPlayerController::getPlayer() {
    return value - '1';
}

int ReadPlayerController::waitFor() {
    ReadChoiceController::waitFor();
    return getPlayer();
}

//----------------------------------------------------------------------------

/**
 * A controller to handle input for commands requiring a letter
 * argument in the range 'a' - lastValidLetter.
 */
class AlphaActionController : public WaitableController<int> {
public:
    AlphaActionController(char letter, const string &p) : lastValidLetter(letter), prompt(p) {}
    bool keyPressed(int key);

private:
    char lastValidLetter;
    string prompt;
};

bool AlphaActionController::keyPressed(int key) {
    if (islower(key))
        key = toupper(key);

    if (key >= 'A' && key <= toupper(lastValidLetter)) {
        screenMessage("%c\n", key);
        value = key - 'A';
        doneWaiting();
    } else if (key == U4_SPACE || key == U4_ESC || key == U4_ENTER) {
        screenMessage("\n");
        value = -1;
        doneWaiting();
    } else {
        screenMessage("\n%s", prompt.c_str());
        return EventHandler::defaultKeyHandler(key);
    }
    return true;
}

//----------------------------------------------------------------------------

/*
 * A controller that ignores keypresses
 */
class IgnoreKeysController : public Controller {
public:
    virtual bool keyPressed(int key) {
        EventHandler::globalKeyHandler(key);
        return true;
    }
};

//----------------------------------------------------------------------------

/**
 * Handles any and all keystrokes.
 * Generally used to exit the application, switch applications,
 * minimize, maximize, etc.
 */
bool EventHandler::globalKeyHandler(int key) {
    switch(key) {
    case U4_PAUSE:
    case U4_ALT + 'p':
        xu4.eventHandler->togglePause();
        return true;

#if defined(MACOSX)
    case U4_META + 'q': /* Cmd+q */
    case U4_META + 'x': /* Cmd+x */
#endif
    case U4_ALT + 'x': /* Alt+x */
#if defined(WIN32)
    case U4_ALT + U4_FKEY + 3:
#endif
        xu4.eventHandler->quitGame();
        return true;

    default:
        return false;
    }
}

/**
 * A default key handler that should be valid everywhere
 */
bool EventHandler::defaultKeyHandler(int key) {
    switch (key) {
#ifdef DEBUG
    case '`':
        if (c && c->location) {
            const Location* loc = c->location;
            const Tile* tile = loc->map->tileTypeAt(loc->coords, WITH_OBJECTS);
            printf("x = %d, y = %d, level = %d, tile = %d (%s)\n",
                    loc->coords.x, loc->coords.y, loc->coords.z,
                    xu4.config->usaveIds()->ultimaId( MapTile(tile->id) ),
                    tile->nameStr());
        }
        break;
#endif

    case U4_ESC:
        xu4_selectGame();
        break;

    default:
        return false;
    }

    return true;
}

//----------------------------------------------------------------------------

/*
 * Read a player number.
 * Return -1 if none is selected.
 */
int EventHandler::choosePlayer()
{
    ReadPlayerController ctrl;
    xu4.eventHandler->pushController(&ctrl);
    return ctrl.waitFor();
}

/**
 * Handle input for commands requiring a letter argument in the
 * range 'a' - lastValidLetter.
 */
int EventHandler::readAlphaAction(char lastValidLetter, const char* prompt)
{
    AlphaActionController ctrl(lastValidLetter, prompt);
    xu4.eventHandler->pushController(&ctrl);
    return ctrl.waitFor();
}

/*
 * Read a single key from a provided list.
 */
char EventHandler::readChoice(const char* choices)
{
    ReadChoiceController ctrl(choices);
    xu4.eventHandler->pushController(&ctrl);
    return ctrl.waitFor();
}

/*
 * Read a direction entered with the arrow keys.
 */
Direction EventHandler::readDir()
{
    ReadDirController ctrl;
    xu4.eventHandler->pushController(&ctrl);
    return ctrl.waitFor();
}

/**
 * Read an integer, terminated by the enter key.
 * Non-numeric keys are ignored.
 */
int EventHandler::readInt(int maxlen)
{
    ReadStringController ctrl(maxlen, TEXT_AREA_X + c->col,
                                      TEXT_AREA_Y + c->line,
                              NULL, "0123456789 \n\r\010");

    xu4.eventHandler->pushController(&ctrl);
    string s = ctrl.waitFor();
    return static_cast<int>(strtol(s.c_str(), NULL, 10));
}

/*
 * Read a string, terminated by the enter key.
 */
const char* EventHandler::readString(int maxlen, const char *extraChars)
{
    assert(size_t(maxlen) < sizeof(xu4.eventHandler->readStringBuf));
    ReadStringController ctrl(maxlen, TEXT_AREA_X + c->col,
                                      TEXT_AREA_Y + c->line);
    if (extraChars)
        addCharBits(ctrl.accepted, extraChars);

    xu4.eventHandler->pushController(&ctrl);
    ctrl.waitFor();

    char* buf = xu4.eventHandler->readStringBuf;
    strcpy(buf, ctrl.value.c_str());
    return buf;
}

/*
 * Read a string, terminated by the enter key.
 */
const char* EventHandler::readStringView(int maxlen, TextView *view,
                                         const char* extraChars) {
    assert(size_t(maxlen) < sizeof(xu4.eventHandler->readStringBuf));
    ReadStringController ctrl(maxlen, view->cursorX(), view->cursorY(),
                              view);
    if (extraChars)
        addCharBits(ctrl.accepted, extraChars);

    xu4.eventHandler->pushController(&ctrl);
    ctrl.waitFor();

    char* buf = xu4.eventHandler->readStringBuf;
    strcpy(buf, ctrl.value.c_str());
    return buf;
}

/*
 * Wait until a key is pressed.
 */
void EventHandler::waitAnyKey()
{
#if 1
    AnyKeyController ctrl;
#ifdef __EMSCRIPTEN__
    u4_web_key_wait(1);
#endif
    ctrl.wait();
#ifdef __EMSCRIPTEN__
    u4_web_key_wait(0);
#endif
#else
    ReadChoiceController ctrl("");
    xu4.eventHandler->pushController(&ctrl);
    ctrl.waitFor();
#endif
}

/*
 * Wait briefly (10 seconds) for a key press.
 */
void EventHandler::waitAnyKeyTimeout()
{
    AnyKeyController ctrl;
#ifdef __EMSCRIPTEN__
    u4_web_key_wait(1);
#endif
    ctrl.waitTimeout();
#ifdef __EMSCRIPTEN__
    u4_web_key_wait(0);
#endif
}

/*
 * Ignore non-global key & mouse events forever.
 */
void EventHandler::ignoreInput()
{
    IgnoreKeysController ctrl;
    xu4.eventHandler->runController(&ctrl);
}
