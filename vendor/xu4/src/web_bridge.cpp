/*
 * web_bridge.cpp — Step 8 browser-safe input queue implementation.
 *
 * Only plain key codes and copied text bytes are stored here; no
 * Controller pointers, no dispatch calls, no JS callback state. Single
 * browser thread: no locking (the engine loop and DOM callbacks never
 * interleave under Asyncify yields).
 */

#include "web_bridge.h"

#include <cstddef>
#include <cstdio>
#include <cstring>
#include <deque>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

bool validKey(int key) {
    return key >= 0 && key <= 0xFFFF;
}

bool validRequestId(int requestId) {
    return requestId >= 0;
}

struct WebInputState {
    std::deque<int> keys;
    std::string pendingText;
    int pendingTextRequest;
    bool hasPendingText;
    int activeRequest; /* -1 when no prompt is open */
    int lastRequest;   /* most recently begun request, -1 when none */
    char lastError[256];

    WebInputState()
        : pendingTextRequest(-1),
          hasPendingText(false),
          activeRequest(-1),
          lastRequest(-1) {
        lastError[0] = '\0';
    }
};

WebInputState &state() {
    static WebInputState s;
    return s;
}

void setError(const char *msg) {
    std::snprintf(state().lastError, sizeof(state().lastError), "%s", msg ? msg : "");
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
int u4_web_enqueue_key(int key) {
    if (!validKey(key)) {
        setError("enqueue_key: invalid key code");
        return U4_WEB_ERR_INVALID;
    }
    if ((int) state().keys.size() >= U4_WEB_INPUT_QUEUE_MAX) {
        /* Bounded queue: reject the newest event, keep the queued prefix
         * untouched (no silent drop, no reorder). */
        setError("enqueue_key: input queue full");
        return U4_WEB_ERR_FULL;
    }
    state().keys.push_back(key);
    return U4_WEB_OK;
}

EMSCRIPTEN_KEEPALIVE
int u4_web_submit_text(int requestId, const char *text, int byteLength) {
    if (!validRequestId(requestId)) {
        setError("submit_text: invalid request id");
        return U4_WEB_ERR_INVALID;
    }
    if (byteLength < 0 || (byteLength > 0 && text == NULL)) {
        setError("submit_text: invalid text payload");
        return U4_WEB_ERR_INVALID;
    }
    if (state().activeRequest < 0) {
        if (state().lastRequest >= 0) {
            std::snprintf(state().lastError, sizeof(state().lastError),
                          "submit_text: stale request %d (epoch closed)",
                          requestId);
            return U4_WEB_ERR_STALE;
        }
        setError("submit_text: no prompt is active");
        return U4_WEB_ERR_NO_PROMPT;
    }
    if (requestId != state().activeRequest) {
        std::snprintf(state().lastError, sizeof(state().lastError),
                      "submit_text: stale request %d (active prompt is %d)",
                      requestId, state().activeRequest);
        /* Stale request: reject with no game mutation. */
        return U4_WEB_ERR_STALE;
    }
    if (byteLength > U4_WEB_TEXT_MAX_BYTES) {
        std::snprintf(state().lastError, sizeof(state().lastError),
                      "submit_text: request %d exceeds %d bytes",
                      requestId, U4_WEB_TEXT_MAX_BYTES);
        return U4_WEB_ERR_TOO_LONG;
    }
    /* Copy the caller's bytes now (the HEAP view / temp pointer must not
     * outlive this call, especially across memory growth). */
    state().pendingText.assign(text ? text : "", (size_t) byteLength);
    state().pendingTextRequest = requestId;
    state().hasPendingText = true;
    return U4_WEB_OK;
}

int u4_web_pending_keys(void) {
    return (int) state().keys.size();
}

int u4_web_drain_keys(int *out, int maxOut) {
    if (out == NULL || maxOut < 0) {
        setError("drain_keys: invalid output buffer");
        return U4_WEB_ERR_INVALID;
    }
    int count = (int) state().keys.size();
    if (count > maxOut)
        count = maxOut;
    for (int i = 0; i < count; ++i) {
        out[i] = state().keys.front();
        state().keys.pop_front();
    }
    return count;
}

int u4_web_begin_prompt(int requestId) {
    if (!validRequestId(requestId)) {
        setError("begin_prompt: invalid request id");
        return U4_WEB_ERR_INVALID;
    }
    /* Epoch boundary: in-flight keys and unconsumed text from the previous
     * prompt belong to the old controller and die with it. */
    state().keys.clear();
    state().pendingText.clear();
    state().pendingTextRequest = -1;
    state().hasPendingText = false;
    state().activeRequest = requestId;
    state().lastRequest = requestId;
    return U4_WEB_OK;
}

int u4_web_end_prompt(int requestId) {
    if (state().activeRequest == requestId) {
        state().activeRequest = -1;
        state().pendingText.clear();
        state().pendingTextRequest = -1;
        state().hasPendingText = false;
    }
    return U4_WEB_OK;
}

int u4_web_current_request(void) {
    return state().activeRequest;
}

int u4_web_has_text(int requestId) {
    return (state().hasPendingText && state().pendingTextRequest == requestId) ? 1 : 0;
}

int u4_web_take_text(int requestId, char *out, int outSize) {
    if (out == NULL || outSize <= 0) {
        setError("take_text: invalid output buffer");
        return U4_WEB_ERR_INVALID;
    }
    if (!state().hasPendingText || state().pendingTextRequest != requestId) {
        std::snprintf(state().lastError, sizeof(state().lastError),
                      "take_text: no text for request %d", requestId);
        return U4_WEB_ERR_STALE;
    }
    size_t len = state().pendingText.size();
    size_t room = (size_t) outSize - 1;
    size_t copy = len < room ? len : room;
    std::memcpy(out, state().pendingText.data(), copy);
    out[copy] = '\0';
    state().pendingText.clear();
    state().pendingTextRequest = -1;
    state().hasPendingText = false;
    return (int) len;
}

void u4_web_reset(void) {
    state().keys.clear();
    state().pendingText.clear();
    state().pendingTextRequest = -1;
    state().hasPendingText = false;
    state().activeRequest = -1;
    state().lastRequest = -1;
    state().lastError[0] = '\0';
}

const char *u4_web_last_error(void) {
    return state().lastError;
}

void u4_web_frame_yield(void) {
#ifdef __EMSCRIPTEN__
    /* Asyncify-safe: unwind to the browser so DOM input callbacks can run,
     * even when the frame needed no sleep. Never dispatches controllers. */
    emscripten_sleep(0);
#endif
}

}  // extern "C"
