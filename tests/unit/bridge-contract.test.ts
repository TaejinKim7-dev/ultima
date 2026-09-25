import { describe, expect, it } from "vitest"
import {
  BRIDGE_ABI_VERSION,
  BRIDGE_EVENT_TYPES,
  isBridgeEvent,
  PROMPT_KINDS,
  type BridgeEvent
} from "../../src/bridge/types.ts"

describe("bridge ABI contract (C ABI version 1)", () => {
  it("pins the documented ABI version and the exact named event set", () => {
    // Given/When: the contract's version constant and event type list.

    // Then: the ABI version is 1 and the event set matches the plan exactly.
    expect(BRIDGE_ABI_VERSION).toBe(1)
    expect(BRIDGE_EVENT_TYPES).toEqual([
      "message",
      "clear",
      "prompt",
      "view",
      "save-state",
      "runtime-error"
    ])
  })

  it("accepts a well-formed message event", () => {
    const candidate: unknown = {
      abiVersion: 1,
      type: "message",
      text: "Thou hast found a torch."
    }

    expect(isBridgeEvent(candidate)).toBe(true)
  })

  it("accepts a well-formed clear event", () => {
    const candidate: unknown = { abiVersion: 1, type: "clear" }

    expect(isBridgeEvent(candidate)).toBe(true)
  })

  it("accepts a message event with an optional awaitKey flag (Todo 11: Hawkwind-style pause) and rejects a non-boolean value", () => {
    // awaitKey carries the native EventHandler::waitAnyKey() pause out of
    // band -- it has no message-buffer byte representation (see
    // discourse_castle.cpp's runTalkHawkwind), so it rides the envelope
    // instead of being a token inside `text`.
    const withoutFlag: unknown = { abiVersion: 1, type: "message", text: "hello" }
    const pausedTrue: unknown = { abiVersion: 1, type: "message", text: "hello", awaitKey: true }
    const pausedFalse: unknown = { abiVersion: 1, type: "message", text: "hello", awaitKey: false }
    const malformed: unknown = { abiVersion: 1, type: "message", text: "hello", awaitKey: "yes" }

    expect(isBridgeEvent(withoutFlag)).toBe(true)
    expect(isBridgeEvent(pausedTrue)).toBe(true)
    expect(isBridgeEvent(pausedFalse)).toBe(true)
    expect(isBridgeEvent(malformed)).toBe(false)
  })

  it("accepts a well-formed prompt event and rejects an unknown prompt kind", () => {
    const validPrompt: unknown = {
      abiVersion: 1,
      type: "prompt",
      promptId: "req-1",
      kind: "yesno"
    }
    const invalidPrompt: unknown = {
      abiVersion: 1,
      type: "prompt",
      promptId: "req-1",
      kind: "not-a-real-kind"
    }

    expect(isBridgeEvent(validPrompt)).toBe(true)
    expect(isBridgeEvent(invalidPrompt)).toBe(false)
  })

  it("recognizes 'command' as a distinct prompt kind (Todo 13: single-key command prompts, e.g. ReadChoiceController/AlphaActionController, are distinct from free-answer 'text' prompts)", () => {
    const validCommandPrompt: unknown = {
      abiVersion: 1,
      type: "prompt",
      promptId: "req-1",
      kind: "command"
    }

    expect(PROMPT_KINDS).toContain("command")
    expect(isBridgeEvent(validCommandPrompt)).toBe(true)
  })

  it("accepts a well-formed view event and rejects an unknown region", () => {
    const validView: unknown = {
      abiVersion: 1,
      type: "view",
      region: "status",
      text: "HP:99 MP:12"
    }
    const invalidView: unknown = {
      abiVersion: 1,
      type: "view",
      region: "not-a-real-region",
      text: "HP:99 MP:12"
    }

    expect(isBridgeEvent(validView)).toBe(true)
    expect(isBridgeEvent(invalidView)).toBe(false)
  })

  it("accepts a well-formed save-state event with and without an optional message", () => {
    const saved: unknown = { abiVersion: 1, type: "save-state", status: "saved" }
    const failed: unknown = {
      abiVersion: 1,
      type: "save-state",
      status: "error",
      message: "IDBFS flush failed"
    }
    const invalidStatus: unknown = { abiVersion: 1, type: "save-state", status: "done" }

    expect(isBridgeEvent(saved)).toBe(true)
    expect(isBridgeEvent(failed)).toBe(true)
    expect(isBridgeEvent(invalidStatus)).toBe(false)
  })

  it("accepts a well-formed runtime-error event and rejects a missing fatal flag", () => {
    const validError: unknown = {
      abiVersion: 1,
      type: "runtime-error",
      message: "wasm trap",
      fatal: true
    }
    const missingFatal: unknown = {
      abiVersion: 1,
      type: "runtime-error",
      message: "wasm trap"
    }

    expect(isBridgeEvent(validError)).toBe(true)
    expect(isBridgeEvent(missingFatal)).toBe(false)
  })

  it("rejects an event of an unknown/undefined type instead of silently accepting it", () => {
    const unknownType: unknown = { abiVersion: 1, type: "teleport", x: 1, y: 2 }
    const noType: unknown = { abiVersion: 1 }

    expect(isBridgeEvent(unknownType)).toBe(false)
    expect(isBridgeEvent(noType)).toBe(false)
  })

  it("rejects events carrying a mismatched ABI version", () => {
    const wrongVersion: unknown = { abiVersion: 2, type: "clear" }
    const missingVersion: unknown = { type: "clear" }

    expect(isBridgeEvent(wrongVersion)).toBe(false)
    expect(isBridgeEvent(missingVersion)).toBe(false)
  })

  it("rejects malformed candidates (null, primitives, arrays) instead of throwing", () => {
    expect(isBridgeEvent(null)).toBe(false)
    expect(isBridgeEvent(undefined)).toBe(false)
    expect(isBridgeEvent("message")).toBe(false)
    expect(isBridgeEvent(42)).toBe(false)
    expect(isBridgeEvent([])).toBe(false)
    expect(isBridgeEvent({})).toBe(false)
  })

  it("narrows the type of accepted candidates to BridgeEvent", () => {
    const candidate: unknown = { abiVersion: 1, type: "clear" }

    if (isBridgeEvent(candidate)) {
      const narrowed: BridgeEvent = candidate
      expect(narrowed.type).toBe("clear")
    } else {
      throw new Error("expected the clear event to be accepted")
    }
  })
})
