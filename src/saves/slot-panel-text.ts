// Todo 51: the text of a slot row in the slot list (pure, unit-tested).

import type { PartySummary } from "./party-summary.ts"

export function describeSlot(summary: PartySummary | null): string {
  if (summary === null) return "비어 있음 — 이 슬롯을 고른 뒤 '새 게임 시작'을 하세요"
  const avatar = summary.name === "" ? "(이름 없음)" : summary.name
  return `${avatar} · 이동 ${summary.moves.toLocaleString("en-US")} · HP ${summary.hp}/${summary.hpMax} · 동료 ${summary.members}명 · 금 ${summary.gold}`
}
