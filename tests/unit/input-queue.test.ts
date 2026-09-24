import { describe, expect, it } from "vitest"
import {
  INPUT_QUEUE_MAX,
  TEXT_MAX_BYTES,
  createInputQueue,
  type InputQueue,
  type QueuedKeyEvent
} from "../../src/bridge/input-queue.ts"

// Step 8: browser-safe input queues. DOM/GLFW callbacks only enqueue
// immutable events; the engine consumes them from its normal input loop.
// Bounded queue, request IDs + prompt epochs, IME composition guards, and a
// per-frame yield even when fsleep=0.
describe("input queue: bounded immutable key queue", () => {
  it("exposes the documented capacity bounds", () => {
    expect(INPUT_QUEUE_MAX).toBe(256)
    expect(TEXT_MAX_BYTES).toBe(256)
  })

  it("enqueues keys and drains them FIFO from the engine loop only", () => {
    const queue: InputQueue = createInputQueue()
    expect(queue.enqueueKey("a".charCodeAt(0)).ok).toBe(true)
    expect(queue.enqueueKey("b".charCodeAt(0)).ok).toBe(true)
    expect(queue.pendingKeys()).toBe(2)

    // Enqueueing must not dispatch to any controller: nothing is consumed
    // until the engine loop drains.
    const drained: QueuedKeyEvent[] = queue.drainKeys()
    expect(drained.map((event) => event.key)).toEqual([97, 98])
    expect(queue.pendingKeys()).toBe(0)
  })

  it("returns immutable (frozen) events", () => {
    const queue: InputQueue = createInputQueue()
    queue.enqueueKey(65)
    const [event] = queue.drainKeys()
    expect(Object.isFrozen(event)).toBe(true)
  })

  it("rejects new keys with an error once the bounded queue is full", () => {
    const queue: InputQueue = createInputQueue()
    for (let i = 0; i < INPUT_QUEUE_MAX; i += 1) {
      expect(queue.enqueueKey(65).ok).toBe(true)
    }
    expect(queue.pendingKeys()).toBe(INPUT_QUEUE_MAX)
    const rejected = queue.enqueueKey(66)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.error).toBe("full")
    }
    // Reject-newest: the queued prefix is untouched, no silent drop of
    // older input and no reordering.
    const drained = queue.drainKeys()
    expect(drained).toHaveLength(INPUT_QUEUE_MAX)
    expect(drained.every((event) => event.key === 65)).toBe(true)
  })

  it("rejects non-integer and out-of-range keys without mutating the queue", () => {
    const queue: InputQueue = createInputQueue()
    for (const bad of [Number.NaN, 1.5, -1, 0x10000]) {
      const result = queue.enqueueKey(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("invalid")
      }
    }
    expect(queue.pendingKeys()).toBe(0)
  })

  it("snapshots a per-frame boundary so a burst cannot starve the frame", () => {
    const queue: InputQueue = createInputQueue()
    queue.enqueueKey(65)
    queue.enqueueKey(66)
    queue.enqueueKey(67)
    const frame = queue.drainKeys(2)
    expect(frame.map((event) => event.key)).toEqual([65, 66])
    expect(queue.pendingKeys()).toBe(1)
  })
})

describe("input queue: prompt epochs and request IDs", () => {
  it("accepts text only for the currently active prompt request", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(7)
    const accepted = queue.submitText(7, "hello")
    expect(accepted.ok).toBe(true)
    expect(queue.takeText(7)).toBe("hello")
  })

  it("rejects a stale request ID as a bridge error with no game mutation", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(7)
    queue.submitText(7, "hello")

    // The prompt advances (controller transition): leftover state from the
    // old epoch must not leak into the next prompt.
    queue.beginPrompt(8)

    const stale = queue.submitText(7, "stale-answer")
    expect(stale.ok).toBe(false)
    if (!stale.ok) {
      expect(stale.error).toBe("stale")
      // The rejection carries a non-fatal bridge runtime-error payload so
      // the shell can log it without mutating game state.
      expect(stale.bridgeError.type).toBe("runtime-error")
      expect(stale.bridgeError.fatal).toBe(false)
    }
    // No mutation: the stale text is not stored anywhere consumable.
    expect(queue.takeText(7)).toBeNull()
    expect(queue.takeText(8)).toBeNull()
    expect(queue.pendingKeys()).toBe(0)
  })

  it("does not deliver keys queued during a prompt transition to the next prompt", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(1)
    // A held/repeated key arrives while prompt 1 is tearing down...
    queue.enqueueKey(65)
    queue.enqueueKey(65)
    // ...then the controller transitions to prompt 2. The epoch boundary
    // discards the in-flight repeats instead of leaking them forward.
    queue.beginPrompt(2)
    expect(queue.pendingKeys()).toBe(0)
    expect(queue.drainKeys()).toEqual([])
  })

  it("ending a prompt clears its epoch so late submissions go stale", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(3)
    queue.endPrompt(3)
    const late = queue.submitText(3, "too late")
    expect(late.ok).toBe(false)
    if (!late.ok) {
      expect(late.error).toBe("stale")
    }
  })

  it("rejects over-long text without storing it", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(9)
    const tooLong = queue.submitText(9, "x".repeat(TEXT_MAX_BYTES + 1))
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) {
      expect(tooLong.error).toBe("too-long")
    }
    expect(queue.takeText(9)).toBeNull()
  })

  it("consumes submitted text exactly once", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(11)
    queue.submitText(11, "name")
    expect(queue.takeText(11)).toBe("name")
    expect(queue.takeText(11)).toBeNull()
  })
})

describe("input queue: IME composition guards", () => {
  it("swallows key events arriving mid-composition (no intermediate as final)", () => {
    const queue: InputQueue = createInputQueue()
    queue.setComposing(true)
    expect(queue.enqueueKeyFromDom({ key: "Enter", keyCode: 13, isComposing: true }).consumed).toBe(
      false
    )
    expect(queue.pendingKeys()).toBe(0)

    // A 229 (IME processing) keydown is never a final key either.
    expect(queue.enqueueKeyFromDom({ key: "Process", keyCode: 229, isComposing: false }).consumed).toBe(
      false
    )
    expect(queue.pendingKeys()).toBe(0)
  })

  it("accepts the confirmed composition result as text after compositionend", () => {
    const queue: InputQueue = createInputQueue()
    queue.beginPrompt(21)
    queue.setComposing(true)
    queue.setComposing(false)
    // 확정된 한글 입력은 최종 텍스트로만 전달된다.
    const result = queue.submitText(21, "아바타")
    expect(result.ok).toBe(true)
    expect(queue.takeText(21)).toBe("아바타")
  })

  it("still accepts plain (non-IME) DOM keys while not composing", () => {
    const queue: InputQueue = createInputQueue()
    const result = queue.enqueueKeyFromDom({ key: "a", keyCode: 65, isComposing: false })
    expect(result.consumed).toBe(true)
    expect(queue.pendingKeys()).toBe(1)
  })
})

describe("input queue: per-frame yield contract", () => {
  it("requires a browser yield every frame even when no sleep is needed", async () => {
    const queue: InputQueue = createInputQueue()
    // The engine loop must yield to the browser once per frame so DOM input
    // callbacks can run; with fsleep=0 there is no other yield point.
    expect(queue.framesYielded()).toBe(0)
    await queue.yieldToBrowser()
    expect(queue.framesYielded()).toBe(1)
    await queue.yieldToBrowser()
    expect(queue.framesYielded()).toBe(2)
  })
})
