// Todo 53: the Korean text of each slot's Drive status in the slot list.
import { describe, expect, it } from "vitest"
import { cloudBadge } from "../../src/cloud/cloud-labels.ts"

describe("cloudBadge", () => {
  it("names every sync state in Korean and says which action applies", () => {
    expect(cloudBadge("same")).toEqual({ text: "Drive와 같음", action: null })
    expect(cloudBadge("local-only")).toEqual({ text: "Drive에 없음", action: "push" })
    expect(cloudBadge("local-newer")).toEqual({ text: "Drive보다 최신", action: "push" })
    expect(cloudBadge("remote-newer")).toEqual({ text: "Drive가 더 최신", action: "pull" })
    expect(cloudBadge("remote-only")).toEqual({ text: "Drive에만 있음", action: "pull" })
    expect(cloudBadge("empty")).toEqual({ text: "", action: null })
  })
})
