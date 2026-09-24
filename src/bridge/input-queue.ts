// Step 8: browser-safe input queues.
//
// Contract: DOM/GLFW callbacks only ENQUEUE immutable key/text events. The
// engine consumes them solely from its normal input loop (snapshot per
// frame). This module is the TypeScript side of that contract; the C++
// mirror lives in `vendor/xu4/src/web_bridge.{h,cpp}` and shares the same
// bounds, error codes, and epoch rules.
//
// Design choices (documented per plan):
// - Bounded queue: INPUT_QUEUE_MAX (256) key events. Overflow REJECTS the
//   newest event with a `full` error (logged by the caller as a non-fatal
//   bridge runtime-error). We never silently drop the oldest entry: that
//   would reorder the player's intent.
// - Immutable events: every queued event is Object.freeze()n before it is
//   stored, so a DOM callback cannot mutate an event after enqueueing it.
// - Prompt epochs: each engine prompt owns a numeric requestId. beginPrompt
//   starts a new epoch and discards keys still in flight from the previous
//   epoch (a held/repeated key during a controller transition must NOT leak
//   into the next prompt). submitText validates the requestId; a stale ID is
//   rejected with a bridge runtime-error payload and causes no game mutation.
// - IME guards: keydown events with isComposing=true (or legacy keyCode 229)
//   are swallowed, never enqueued as final keys. Confirmed composition text
//   arrives only via submitText after compositionend.
// - Per-frame yield: the engine loop must call yieldToBrowser() once per
//   frame even when fsleep=0, so DOM callbacks get a chance to run and the
//   Asyncify stack can unwind. framesYielded() exposes the count for tests.

import { BRIDGE_ABI_VERSION, type RuntimeErrorBridgeEvent } from "./types.ts"

/** Maximum number of key events held before new ones are rejected. */
export const INPUT_QUEUE_MAX = 256 as const

/** Maximum UTF-8 byte length accepted for a single text submission. */
export const TEXT_MAX_BYTES = 256 as const

/** Legacy DOM keyCode meaning "IME is processing this keystroke". */
export const IME_PROCESSING_KEY_CODE = 229 as const

/** An immutable key event, as consumed by the engine input loop. */
export interface QueuedKeyEvent {
  readonly kind: "key"
  readonly key: number
}

/** An immutable text event, as consumed by the engine input loop. */
export interface QueuedTextEvent {
  readonly kind: "text"
  readonly requestId: number
  readonly text: string
}

/** Any immutable event the queue can hold. */
export type QueuedInputEvent = QueuedKeyEvent | QueuedTextEvent

/** Why an enqueue operation was rejected. */
export type EnqueueErrorCode = "full" | "invalid"

/** Why a text submission was rejected. */
export type SubmitErrorCode = "stale" | "too-long" | "invalid" | "no-prompt"

export interface EnqueueSuccess {
  readonly ok: true
}

export interface EnqueueFailure {
  readonly ok: false
  readonly error: EnqueueErrorCode
}

export type EnqueueResult = EnqueueSuccess | EnqueueFailure

export interface SubmitSuccess {
  readonly ok: true
}

export interface SubmitFailure {
  readonly ok: false
  readonly error: SubmitErrorCode
  /** Non-fatal bridge payload so the shell can log the rejection. */
  readonly bridgeError: RuntimeErrorBridgeEvent
}

export type SubmitResult = SubmitSuccess | SubmitFailure

/** Minimal DOM keydown shape the queue guards (avoids full DOM types). */
export interface DomKeyDown {
  readonly key: string
  readonly keyCode: number
  readonly isComposing: boolean
}

export interface DomKeyResult {
  readonly consumed: boolean
}

function staleBridgeError(requestId: number, detail: string): RuntimeErrorBridgeEvent {
  return {
    abiVersion: BRIDGE_ABI_VERSION,
    type: "runtime-error",
    message: `stale text request ${requestId} rejected: ${detail}`,
    fatal: false
  }
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function isValidKey(key: number): boolean {
  return Number.isInteger(key) && key >= 0 && key <= 0xffff
}

function isValidRequestId(requestId: number): boolean {
  return Number.isInteger(requestId) && requestId >= 0
}

/**
 * A browser-safe input queue. All mutation happens through enqueue (DOM
 * callbacks) and drain/take (engine loop); events themselves are frozen.
 */
export interface InputQueue {
  /** Enqueue a raw engine key code. Never dispatches to a controller. */
  enqueueKey(key: number): EnqueueResult
  /** DOM keydown entry point with IME composition guards. */
  enqueueKeyFromDom(event: DomKeyDown): DomKeyResult
  /** Number of key events currently held. */
  pendingKeys(): number
  /**
   * Snapshot up to `max` (default: all) oldest keys for this frame and
   * remove exactly those from the queue. Engine loop only.
   */
  drainKeys(max?: number): QueuedKeyEvent[]
  /** Start a new prompt epoch; discards keys in flight from the old epoch. */
  beginPrompt(requestId: number): void
  /** End the epoch for `requestId` (no-op for a non-current ID). */
  endPrompt(requestId: number): void
  /** Currently active prompt request ID, or null when no prompt is open. */
  currentRequest(): number | null
  /** Submit final (post-composition) text for `requestId`. */
  submitText(requestId: number, text: string): SubmitResult
  /** Consume pending text for `requestId` exactly once (null when absent). */
  takeText(requestId: number): string | null
  /** Track IME composition state (compositionstart/end). */
  setComposing(composing: boolean): void
  /** Whether an IME composition is currently in progress. */
  isComposing(): boolean
  /**
   * Yield to the browser once. The engine loop awaits this every frame,
   * even when fsleep=0, so DOM callbacks can run.
   */
  yieldToBrowser(): Promise<void>
  /** How many per-frame yields have happened (test hook, not game state). */
  framesYielded(): number
  /** Drop all queued state (used on reset/reload, never across prompts). */
  reset(): void
}

export function createInputQueue(): InputQueue {
  const keys: QueuedKeyEvent[] = []
  const pendingText = new Map<number, QueuedTextEvent>()
  let activeRequest: number | null = null
  let lastRequest: number | null = null
  let composing = false
  let yieldedFrames = 0

  function enqueueKey(key: number): EnqueueResult {
    if (!isValidKey(key)) {
      return { ok: false, error: "invalid" }
    }
    if (keys.length >= INPUT_QUEUE_MAX) {
      return { ok: false, error: "full" }
    }
    const event: QueuedKeyEvent = Object.freeze({ kind: "key", key })
    keys.push(event)
    return { ok: true }
  }

  function enqueueKeyFromDom(event: DomKeyDown): DomKeyResult {
    // IME composition guard: intermediate composition keystrokes (including
    // the legacy 229 "processing" code) are never final keys.
    if (composing || event.isComposing || event.keyCode === IME_PROCESSING_KEY_CODE) {
      return { consumed: false }
    }
    if (event.key.length === 1) {
      const code = event.key.charCodeAt(0)
      return { consumed: enqueueKey(code).ok }
    }
    const namedKeys: Record<string, number> = {
      Enter: 13,
      Escape: 27,
      Backspace: 8,
      Tab: 9,
      " ": 32,
      ArrowUp: "[".charCodeAt(0),
      ArrowDown: "/".charCodeAt(0),
      ArrowLeft: ";".charCodeAt(0),
      ArrowRight: "'".charCodeAt(0)
    }
    const mapped = namedKeys[event.key]
    if (mapped === undefined) {
      return { consumed: false }
    }
    return { consumed: enqueueKey(mapped).ok }
  }

  function drainKeys(max?: number): QueuedKeyEvent[] {
    const count = max === undefined ? keys.length : Math.max(0, Math.min(max, keys.length))
    return keys.splice(0, count)
  }

  function beginPrompt(requestId: number): void {
    if (!isValidRequestId(requestId)) {
      return
    }
    // Epoch boundary: keys queued (or repeated) while the previous prompt
    // was tearing down belong to the old controller and must not leak into
    // the next prompt. Unconsumed text from the old epoch dies with it.
    keys.length = 0
    pendingText.clear()
    activeRequest = requestId
    lastRequest = requestId
  }

  function endPrompt(requestId: number): void {
    if (activeRequest === requestId) {
      activeRequest = null
      pendingText.delete(requestId)
    }
  }

  function submitText(requestId: number, text: string): SubmitResult {
    if (typeof text !== "string") {
      return {
        ok: false,
        error: "invalid",
        bridgeError: staleBridgeError(requestId, "non-string payload")
      }
    }
    if (activeRequest === null) {
      // A request whose epoch already closed is stale; one that never had
      // an epoch at all is reported as no-prompt. Both reject with no game
      // mutation.
      if (lastRequest !== null) {
        return {
          ok: false,
          error: "stale",
          bridgeError: staleBridgeError(requestId, "prompt epoch already closed")
        }
      }
      return {
        ok: false,
        error: "no-prompt",
        bridgeError: staleBridgeError(requestId, "no prompt is active")
      }
    }
    if (requestId !== activeRequest) {
      // Stale request: reject with a bridge error and mutate nothing.
      return {
        ok: false,
        error: "stale",
        bridgeError: staleBridgeError(requestId, `active prompt is ${activeRequest}`)
      }
    }
    if (utf8ByteLength(text) > TEXT_MAX_BYTES) {
      return {
        ok: false,
        error: "too-long",
        bridgeError: {
          abiVersion: BRIDGE_ABI_VERSION,
          type: "runtime-error",
          message: `text request ${requestId} exceeds ${TEXT_MAX_BYTES} bytes`,
          fatal: false
        }
      }
    }
    const event: QueuedTextEvent = Object.freeze({ kind: "text", requestId, text })
    pendingText.set(requestId, event)
    return { ok: true }
  }

  function takeText(requestId: number): string | null {
    const event = pendingText.get(requestId)
    if (event === undefined) {
      return null
    }
    pendingText.delete(requestId)
    return event.text
  }

  function yieldToBrowser(): Promise<void> {
    yieldedFrames += 1
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve())
      } else {
        setTimeout(() => resolve(), 0)
      }
    })
  }

  function reset(): void {
    keys.length = 0
    pendingText.clear()
    activeRequest = null
    lastRequest = null
    composing = false
  }

  return {
    enqueueKey,
    enqueueKeyFromDom,
    pendingKeys: () => keys.length,
    drainKeys,
    beginPrompt,
    endPrompt,
    currentRequest: () => activeRequest,
    submitText,
    takeText,
    setComposing: (value: boolean) => {
      composing = value
    },
    isComposing: () => composing,
    yieldToBrowser,
    framesYielded: () => yieldedFrames,
    reset
  }
}
