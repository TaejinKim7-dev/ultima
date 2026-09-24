/*
 * web_bridge.h — Step 8 browser-safe input queue (C ABI home, version 1).
 *
 * Contract: DOM/GLFW callbacks only ENQUEUE immutable key/text events via
 * u4_web_enqueue_key / u4_web_submit_text. The engine consumes them solely
 * from its normal input loop via u4_web_drain_keys / u4_web_take_text
 * (snapshot per frame). Callbacks must NEVER call controller dispatch
 * directly, and this bridge never retains Controller pointers (it stores
 * only plain key codes and copied text), so no stack controller pointer
 * survives an Asyncify suspension.
 *
 * This header is self-contained (no engine includes) so it compiles under
 * Emscripten, the native test harness, and the native GLFW build alike.
 * Bounds and error codes mirror `src/bridge/input-queue.ts`.
 */

#ifndef WEB_BRIDGE_H
#define WEB_BRIDGE_H

/* Bounded queue: at most this many key events are held. Overflow REJECTS
 * the newest event (U4_WEB_ERR_FULL); the oldest entries are never
 * silently dropped or reordered. */
#define U4_WEB_INPUT_QUEUE_MAX 256

/* Maximum UTF-8 byte length accepted for a single text submission. */
#define U4_WEB_TEXT_MAX_BYTES 256

/* Status codes (0 == success, negative == rejection, no game mutation). */
#define U4_WEB_OK 0
#define U4_WEB_ERR_FULL -1
#define U4_WEB_ERR_INVALID -2
#define U4_WEB_ERR_STALE -3
#define U4_WEB_ERR_NO_PROMPT -4
#define U4_WEB_ERR_TOO_LONG -5

#ifdef __cplusplus
extern "C" {
#endif

/*
 * JS-callback entry points (exported to JavaScript; keep the underscore
 * aliases `_u4_web_enqueue_key` / `_u4_web_submit_text` in EXPORTED_FUNCTIONS).
 * Both only enqueue; neither dispatches to any controller.
 */
int u4_web_enqueue_key(int key);
int u4_web_submit_text(int requestId, const char *text, int byteLength);

/*
 * Engine-loop entry points (called only from the normal input loop, never
 * from JS callbacks; not exported to JavaScript).
 */

/* Number of key events currently held. */
int u4_web_pending_keys(void);

/*
 * Copy up to maxOut oldest queued keys into out[] and remove exactly those
 * from the queue. Returns the number copied (0 when empty, negative for an
 * invalid out/maxOut pair). The per-frame snapshot boundary.
 */
int u4_web_drain_keys(int *out, int maxOut);

/*
 * Start a new prompt epoch for requestId. Discards keys still in flight
 * from the previous epoch (a held/repeated key during a controller
 * transition must NOT leak into the next prompt) and drops unconsumed
 * text from the old epoch. Returns U4_WEB_OK (or U4_WEB_ERR_INVALID).
 */
int u4_web_begin_prompt(int requestId);

/* End the epoch for requestId (no-op unless it is the current one). */
int u4_web_end_prompt(int requestId);

/* Currently active prompt request ID, or -1 when no prompt is open. */
int u4_web_current_request(void);

/* 1 when unconsumed text for requestId is held, 0 otherwise. */
int u4_web_has_text(int requestId);

/*
 * Copy pending text for requestId into out[] (NUL-terminated, at most
 * outSize bytes including the terminator) and consume it exactly once.
 * Returns the byte length on success, or a negative error code (stale /
 * absent / invalid). Never mutates state on rejection.
 */
int u4_web_take_text(int requestId, char *out, int outSize);

/* Drop all queued state (reset/reload path only, never across prompts). */
void u4_web_reset(void);

/* Human-readable reason for the most recent rejection (never NULL). */
const char *u4_web_last_error(void);

/*
 * Yield to the browser once. On Emscripten this performs an Asyncify-safe
 * sleep(0); elsewhere it is a no-op. The engine foreground loop calls this
 * every frame even when fsleep==0 so DOM input callbacks can run.
 */
void u4_web_frame_yield(void);

#ifdef __cplusplus
}
#endif

#endif /* WEB_BRIDGE_H */
