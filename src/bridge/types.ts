// Bridge ABI contract between the (future, Todo 6+) WASM/native xu4 engine and
// this web shell.
//
// This file is intentionally TypeScript-only: it documents "C ABI version 1",
// the shape of the events the native side will emit/consume, without writing
// any C/C++ glue. The native bridge implementation is a later Todo; this is
// the versioned contract it must match.

/** Documented, versioned identifier for the native<->web bridge wire shape. */
export const BRIDGE_ABI_VERSION = 1 as const

/** The literal type of {@link BRIDGE_ABI_VERSION}. */
export type BridgeAbiVersion = typeof BRIDGE_ABI_VERSION

/**
 * The exact named event set the plan defines for this bridge. Keep this list
 * and the {@link BridgeEvent} union in sync -- the contract test asserts
 * both the list and per-type shapes.
 */
export const BRIDGE_EVENT_TYPES = [
  "message",
  "clear",
  "prompt",
  "view",
  "save-state",
  "runtime-error"
] as const

/** One of the bridge's named event type discriminants. */
export type BridgeEventType = (typeof BRIDGE_EVENT_TYPES)[number]

interface BridgeEventBase {
  /** Must equal {@link BRIDGE_ABI_VERSION}; guards against silent ABI drift. */
  readonly abiVersion: BridgeAbiVersion
}

/**
 * Long-form game text routed to the HTML dialogue panel below the canvas
 * (never overlaid on the game screen -- see the confirmed requirement in
 * `handoff.md`). Control tokens embedded in `text` (newline/backspace/
 * right/color/prompt) are parsed client-side by
 * `src/dialogue/message-tokens.ts`'s `tokenizeMessage` (Todo 11) -- the
 * native `screenMessageN` buffer already carries these as literal control
 * bytes (see `vendor/xu4/src/screen.cpp`), so `text` itself is the token
 * stream and needs no ABI change.
 *
 * `awaitKey` carries a Hawkwind-style pause (native
 * `EventHandler::waitAnyKey()`, e.g. `discourse_castle.cpp`'s
 * `runTalkHawkwind`) out of band: unlike every other control token, a
 * native pause is a blocking function call with no message-buffer byte
 * representation, so it cannot be recovered by tokenizing `text` alone.
 * This field is additive to ABI v1 (optional, ignored by older readers).
 */
export interface MessageBridgeEvent extends BridgeEventBase {
  readonly type: "message"
  readonly text: string
  readonly awaitKey?: boolean
}

/** Clears the dialogue panel's current line/history state. */
export interface ClearBridgeEvent extends BridgeEventBase {
  readonly type: "clear"
}

/** The distinct prompt shapes the original input rules distinguish. */
export const PROMPT_KINDS = ["text", "yesno", "direction", "number", "avatar-name"] as const
export type PromptKind = (typeof PROMPT_KINDS)[number]

/**
 * Requests shell-side input for a specific prompt. `promptId` lets the web
 * shell reject stale submissions after a prompt epoch changes (Todo 8).
 */
export interface PromptBridgeEvent extends BridgeEventBase {
  readonly type: "prompt"
  readonly promptId: string
  readonly kind: PromptKind
}

/** The overlay regions kept over the original game screen layout. */
export const VIEW_REGIONS = ["status", "menu", "textview"] as const
export type ViewRegion = (typeof VIEW_REGIONS)[number]

/**
 * Short in-game text (HP/status/menus) rendered as a DOM overlay positioned
 * over the original screen area, as opposed to the dialogue panel below it.
 */
export interface ViewBridgeEvent extends BridgeEventBase {
  readonly type: "view"
  readonly region: ViewRegion
  readonly text: string
}

/** Persistence lifecycle states the shell surfaces to the user. */
export const SAVE_STATE_STATUSES = ["saving", "saved", "error"] as const
export type SaveStateStatus = (typeof SAVE_STATE_STATUSES)[number]

export interface SaveStateBridgeEvent extends BridgeEventBase {
  readonly type: "save-state"
  readonly status: SaveStateStatus
  readonly message?: string
}

/** A native/engine-side error surfaced to the web shell. */
export interface RuntimeErrorBridgeEvent extends BridgeEventBase {
  readonly type: "runtime-error"
  readonly message: string
  readonly fatal: boolean
}

/** The discriminated union of every event this bridge ABI defines. */
export type BridgeEvent =
  | MessageBridgeEvent
  | ClearBridgeEvent
  | PromptBridgeEvent
  | ViewBridgeEvent
  | SaveStateBridgeEvent
  | RuntimeErrorBridgeEvent

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

/**
 * Validates an unknown value against the bridge ABI contract. Unknown event
 * types, mismatched ABI versions, and malformed shapes are rejected rather
 * than silently accepted -- this is the enforcement point the contract test
 * exercises. Never throws.
 */
export function isBridgeEvent(candidate: unknown): candidate is BridgeEvent {
  if (!isRecord(candidate)) {
    return false
  }

  if (candidate["abiVersion"] !== BRIDGE_ABI_VERSION) {
    return false
  }

  const type = candidate["type"]
  if (!isOneOf(type, BRIDGE_EVENT_TYPES)) {
    return false
  }

  switch (type) {
    case "message": {
      if (!isString(candidate["text"])) {
        return false
      }
      const awaitKey = candidate["awaitKey"]
      return awaitKey === undefined || isBoolean(awaitKey)
    }
    case "clear":
      return true
    case "prompt":
      return isString(candidate["promptId"]) && isOneOf(candidate["kind"], PROMPT_KINDS)
    case "view":
      return isOneOf(candidate["region"], VIEW_REGIONS) && isString(candidate["text"])
    case "save-state": {
      if (!isOneOf(candidate["status"], SAVE_STATE_STATUSES)) {
        return false
      }
      const message = candidate["message"]
      return message === undefined || isString(message)
    }
    case "runtime-error":
      return isString(candidate["message"]) && isBoolean(candidate["fatal"])
  }
}
