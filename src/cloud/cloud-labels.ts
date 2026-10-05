// Todo 53: the Korean label of a slot's Drive status and the one action it offers (pure).

import type { SyncState } from "./sync-plan.ts"

export function cloudBadge(state: SyncState): { text: string; action: "push" | "pull" | null } {
  switch (state) {
    case "same":
      return { text: "Drive와 같음", action: null }
    case "local-only":
      return { text: "Drive에 없음", action: "push" }
    case "local-newer":
      return { text: "Drive보다 최신", action: "push" }
    case "remote-newer":
      return { text: "Drive가 더 최신", action: "pull" }
    case "remote-only":
      return { text: "Drive에만 있음", action: "pull" }
    case "empty":
      return { text: "", action: null }
  }
}
