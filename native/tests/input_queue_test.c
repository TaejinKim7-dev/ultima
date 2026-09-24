/*
 * input_queue_test.c — Step 8 native CTest for vendor/xu4/src/web_bridge.
 *
 * Exercises the browser-safe input queue through its C ABI only:
 * bounded FIFO key queue (reject-newest on overflow), prompt epochs with
 * stale request rejection (no mutation), prompt-transition key isolation,
 * per-frame snapshot drain, and the always-yield contract hook.
 *
 * Returns 0 on success, 1 on the first failure (message on stderr).
 * No original game data is needed.
 */
#include <stdio.h>
#include <string.h>

#include "web_bridge.h"

#define CHECK(cond, msg)                                        \
    do {                                                        \
        if (!(cond)) {                                          \
            fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__,       \
                    __LINE__, (msg));                           \
            return 1;                                           \
        }                                                       \
    } while (0)

static int test_key_fifo(void) {
    int out[8];

    u4_web_reset();
    CHECK(u4_web_enqueue_key('a') == U4_WEB_OK, "enqueue a");
    CHECK(u4_web_enqueue_key('b') == U4_WEB_OK, "enqueue b");
    CHECK(u4_web_pending_keys() == 2, "two keys pending");
    /* Enqueue must not dispatch: everything stays queued until drained. */
    CHECK(u4_web_pending_keys() == 2, "enqueue does not consume");
    CHECK(u4_web_drain_keys(out, 8) == 2, "drain both");
    CHECK(out[0] == 'a' && out[1] == 'b', "FIFO order");
    CHECK(u4_web_pending_keys() == 0, "queue empty after drain");
    return 0;
}

static int test_bounded_reject_newest(void) {
    int out[U4_WEB_INPUT_QUEUE_MAX + 8];
    int i;

    u4_web_reset();
    for (i = 0; i < U4_WEB_INPUT_QUEUE_MAX; ++i)
        CHECK(u4_web_enqueue_key(65) == U4_WEB_OK, "fill queue");
    CHECK(u4_web_pending_keys() == U4_WEB_INPUT_QUEUE_MAX, "queue at capacity");
    CHECK(u4_web_enqueue_key(66) == U4_WEB_ERR_FULL, "overflow rejected");
    CHECK(u4_web_last_error() != NULL && u4_web_last_error()[0] != '\0',
          "overflow logged");
    /* Reject-newest: the queued prefix is untouched. */
    CHECK(u4_web_drain_keys(out, (int) sizeof(out) / (int) sizeof(out[0])) ==
          U4_WEB_INPUT_QUEUE_MAX, "drain full queue");
    for (i = 0; i < U4_WEB_INPUT_QUEUE_MAX; ++i)
        CHECK(out[i] == 65, "prefix preserved, no reorder");
    return 0;
}

static int test_invalid_keys(void) {
    u4_web_reset();
    CHECK(u4_web_enqueue_key(-1) == U4_WEB_ERR_INVALID, "negative rejected");
    CHECK(u4_web_enqueue_key(0x10000) == U4_WEB_ERR_INVALID, "huge rejected");
    CHECK(u4_web_pending_keys() == 0, "invalid keys leave no trace");
    CHECK(u4_web_drain_keys(NULL, 4) == U4_WEB_ERR_INVALID, "null drain rejected");
    return 0;
}

static int test_prompt_epoch_text(void) {
    char buf[64];

    u4_web_reset();
    CHECK(u4_web_current_request() == -1, "no prompt initially");
    CHECK(u4_web_submit_text(7, "early", 5) == U4_WEB_ERR_NO_PROMPT,
          "submit with no prompt rejected");
    CHECK(u4_web_begin_prompt(7) == U4_WEB_OK, "begin prompt 7");
    CHECK(u4_web_current_request() == 7, "prompt 7 active");
    CHECK(u4_web_submit_text(7, "hello", 5) == U4_WEB_OK, "submit accepted");
    CHECK(u4_web_has_text(7) == 1, "text held for request 7");
    CHECK(u4_web_take_text(7, buf, (int) sizeof(buf)) == 5, "take returns length");
    CHECK(strcmp(buf, "hello") == 0, "text round-trips");
    /* Consumed exactly once. */
    CHECK(u4_web_has_text(7) == 0, "text consumed");
    CHECK(u4_web_take_text(7, buf, (int) sizeof(buf)) == U4_WEB_ERR_STALE,
          "second take goes stale");
    return 0;
}

static int test_stale_rejected_without_mutation(void) {
    char buf[64];

    u4_web_reset();
    CHECK(u4_web_begin_prompt(7) == U4_WEB_OK, "begin prompt 7");
    CHECK(u4_web_submit_text(7, "hello", 5) == U4_WEB_OK, "submit for 7");
    /* Controller transition: epoch advances, old state must die with it. */
    CHECK(u4_web_begin_prompt(8) == U4_WEB_OK, "begin prompt 8");
    CHECK(u4_web_submit_text(7, "stale-answer", 12) == U4_WEB_ERR_STALE,
          "stale request rejected");
    CHECK(u4_web_last_error() != NULL && u4_web_last_error()[0] != '\0',
          "stale rejection logged as bridge error");
    CHECK(u4_web_has_text(7) == 0, "stale text not stored");
    CHECK(u4_web_has_text(8) == 0, "new epoch has no text");
    CHECK(u4_web_take_text(7, buf, (int) sizeof(buf)) == U4_WEB_ERR_STALE,
          "stale take rejected");
    CHECK(u4_web_pending_keys() == 0, "no key mutation from stale submit");
    /* The live epoch still works. */
    CHECK(u4_web_submit_text(8, "live", 4) == U4_WEB_OK, "live epoch accepts");
    CHECK(u4_web_take_text(8, buf, (int) sizeof(buf)) == 4, "live text taken");
    CHECK(strcmp(buf, "live") == 0, "live text intact");
    return 0;
}

static int test_prompt_transition_drops_keys(void) {
    int out[8];

    u4_web_reset();
    CHECK(u4_web_begin_prompt(1) == U4_WEB_OK, "begin prompt 1");
    /* A held/repeated key arrives while prompt 1 is tearing down... */
    CHECK(u4_web_enqueue_key(65) == U4_WEB_OK, "repeat 1");
    CHECK(u4_web_enqueue_key(65) == U4_WEB_OK, "repeat 2");
    /* ...then the controller transitions: repeats must not leak forward. */
    CHECK(u4_web_begin_prompt(2) == U4_WEB_OK, "begin prompt 2");
    CHECK(u4_web_pending_keys() == 0, "in-flight keys discarded at epoch boundary");
    CHECK(u4_web_drain_keys(out, 8) == 0, "next prompt sees nothing");
    return 0;
}

static int test_end_prompt_closes_epoch(void) {
    u4_web_reset();
    CHECK(u4_web_begin_prompt(3) == U4_WEB_OK, "begin prompt 3");
    CHECK(u4_web_end_prompt(3) == U4_WEB_OK, "end prompt 3");
    CHECK(u4_web_current_request() == -1, "no active prompt");
    CHECK(u4_web_submit_text(3, "late", 4) == U4_WEB_ERR_STALE,
          "late submit goes stale");
    /* Ending a non-current prompt is a harmless no-op. */
    CHECK(u4_web_begin_prompt(4) == U4_WEB_OK, "begin prompt 4");
    CHECK(u4_web_end_prompt(999) == U4_WEB_OK, "end foreign prompt");
    CHECK(u4_web_current_request() == 4, "current epoch untouched");
    return 0;
}

static int test_text_bounds(void) {
    char big[U4_WEB_TEXT_MAX_BYTES + 16];
    char buf[16];
    int rc;

    memset(big, 'x', sizeof(big));
    u4_web_reset();
    CHECK(u4_web_begin_prompt(9) == U4_WEB_OK, "begin prompt 9");
    CHECK(u4_web_submit_text(9, big, (int) sizeof(big)) == U4_WEB_ERR_TOO_LONG,
          "over-long text rejected");
    CHECK(u4_web_has_text(9) == 0, "over-long text not stored");
    CHECK(u4_web_submit_text(9, big, -1) == U4_WEB_ERR_INVALID,
          "negative length rejected");
    CHECK(u4_web_submit_text(9, NULL, 4) == U4_WEB_ERR_INVALID,
          "null payload rejected");
    /* Small output buffers truncate safely and still consume. */
    CHECK(u4_web_submit_text(9, "0123456789abcdef", 16) == U4_WEB_OK,
          "exact prompt submit");
    rc = u4_web_take_text(9, buf, 8);
    CHECK(rc == 16, "take reports full length");
    CHECK(strcmp(buf, "0123456") == 0, "take truncates with terminator");
    CHECK(u4_web_has_text(9) == 0, "truncated take still consumes");
    return 0;
}

static int test_frame_snapshot_and_yield(void) {
    int out[8];

    u4_web_reset();
    CHECK(u4_web_enqueue_key(65) == U4_WEB_OK, "key A");
    CHECK(u4_web_enqueue_key(66) == U4_WEB_OK, "key B");
    CHECK(u4_web_enqueue_key(67) == U4_WEB_OK, "key C");
    /* Per-frame snapshot: a burst cannot starve the frame. */
    CHECK(u4_web_drain_keys(out, 2) == 2, "frame takes two");
    CHECK(out[0] == 65 && out[1] == 66, "oldest first");
    CHECK(u4_web_pending_keys() == 1, "remainder stays queued");
    /* Yield hook must be callable every frame (no-op off-web, Asyncify
     * sleep(0) on-web); it must never disturb queued state. */
    u4_web_frame_yield();
    CHECK(u4_web_pending_keys() == 1, "yield preserves queue");
    u4_web_reset();
    CHECK(u4_web_pending_keys() == 0, "reset clears keys");
    CHECK(u4_web_current_request() == -1, "reset clears epoch");
    return 0;
}

int main(void) {
    CHECK(test_key_fifo() == 0, "key fifo");
    CHECK(test_bounded_reject_newest() == 0, "bounded reject-newest");
    CHECK(test_invalid_keys() == 0, "invalid keys");
    CHECK(test_prompt_epoch_text() == 0, "prompt epoch text");
    CHECK(test_stale_rejected_without_mutation() == 0, "stale rejection");
    CHECK(test_prompt_transition_drops_keys() == 0, "transition isolation");
    CHECK(test_end_prompt_closes_epoch() == 0, "end prompt");
    CHECK(test_text_bounds() == 0, "text bounds");
    CHECK(test_frame_snapshot_and_yield() == 0, "frame snapshot + yield");
    printf("input-queue: all 9 test groups passed\n");
    return 0;
}
