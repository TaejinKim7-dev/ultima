// Todo 51: the save-slot list on the page. DOM only (createElement/textContent,
// never innerHTML); all logic lives in slot-controller.ts.

import { describeSlot } from "./slot-panel-text.ts"
import type { SlotController } from "./slot-controller.ts"
import type { CloudSync } from "../cloud/cloud-sync.ts"
import { cloudBadge } from "../cloud/cloud-labels.ts"

export interface SlotPanelOptions {
  readonly host: HTMLElement
  readonly controller: SlotController
  /** Shows a short Korean notice (the dialogue panel). */
  readonly notify: (text: string) => void
  readonly download: (bytes: Uint8Array, filename: string) => void
  /** Todo 53: optional Google Drive sync; the panel shows its controls when given. */
  readonly cloud?: CloudSync
}

function button(doc: Document, label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const element = doc.createElement("button")
  element.type = "button"
  element.textContent = label
  element.disabled = disabled
  element.addEventListener("click", onClick)
  return element
}

export function mountSlotPanel(options: SlotPanelOptions): void {
  const { host, controller, notify } = options
  const doc = host.ownerDocument
  host.hidden = false
  host.replaceChildren()

  const title = doc.createElement("h2")
  title.textContent = "저장 슬롯"
  const note = doc.createElement("p")
  note.className = "slot-note"
  const toolbar = doc.createElement("div")
  toolbar.className = "slot-toolbar"
  const list = doc.createElement("ul")
  list.className = "slot-list"
  const cloudBar = doc.createElement("div")
  cloudBar.className = "slot-cloud"
  const remoteList = doc.createElement("ul")
  remoteList.className = "slot-list slot-remote-list"
  host.append(title, note, toolbar, cloudBar, list, remoteList)

  const importInput = doc.createElement("input")
  importInput.type = "file"
  importInput.accept = ".dat,.sav,.u4slot"
  importInput.hidden = true
  host.appendChild(importInput)

  function report(error: unknown): void {
    notify(`[슬롯 오류] ${error instanceof Error ? error.message : "알 수 없는 오류"}\n`)
  }

  function run(task: () => Promise<unknown>, done?: string): void {
    void task().then(
      () => {
        if (done !== undefined) notify(`${done}\n`)
      },
      report
    )
  }

  async function renderCloud(): Promise<Map<string, { text: string; action: "push" | "pull" | null }>> {
    const badges = new Map<string, { text: string; action: "push" | "pull" | null }>()
    cloudBar.replaceChildren()
    remoteList.replaceChildren()
    const cloud = options.cloud
    if (cloud === undefined) return badges
    const state = await cloud.state()
    const label = doc.createElement("span")
    label.className = "slot-cloud-label"
    if (!state.connected) {
      label.textContent = "Google Drive (선택): 다른 기기에서 이어하려면 연결하세요. 저장 파일만 본인 Drive에 올라가며 원본 게임 데이터는 올리지 않습니다."
      const connectButton = button(doc, "Google Drive 연결", () => run(() => cloud.connect()), state.busy)
      // Load Google's sign-in script before the click so its popup is not blocked.
      const warm = () => void cloud.prepare().catch(report)
      connectButton.addEventListener("pointerenter", warm)
      connectButton.addEventListener("focus", warm)
      cloudBar.append(label, connectButton)
      return badges
    }
    label.textContent = state.busy ? "Google Drive 연결됨 — 동기화 중…" : "Google Drive 연결됨 — 저장(Q)하면 자동으로 올라갑니다."
    cloudBar.append(
      label,
      button(doc, "모두 동기화", () => run(() => cloud.syncAll(), "Google Drive와 동기화했습니다."), state.busy),
      button(doc, "새로 고침", () => run(() => cloud.refresh()), state.busy),
      button(doc, "연결 해제", () => cloud.disconnect(), state.busy)
    )
    for (const entry of state.entries) {
      const badge = cloudBadge(entry.state)
      badges.set(entry.slotId, badge)
      if (entry.state !== "remote-only") continue
      const row = doc.createElement("li")
      row.className = "slot-row slot-remote"
      const name = doc.createElement("div")
      name.className = "slot-name"
      name.textContent = `${entry.name} (Drive에만 있음)`
      const actions = doc.createElement("div")
      actions.className = "slot-actions"
      actions.append(button(doc, "이 브라우저로 받기", () => run(() => cloud.pull(entry.slotId), "Drive에서 슬롯을 받았습니다."), state.busy))
      row.append(name, actions)
      remoteList.appendChild(row)
    }
    return badges
  }

  async function render(): Promise<void> {
    const badges = await renderCloud()
    const state = await controller.state()
    note.textContent = state.playing
      ? "플레이 중에는 슬롯을 바꿀 수 없습니다. 저장(Q)하면 지금 슬롯에 저장됩니다."
      : "슬롯을 고른 뒤 'Journey Onward'(이어하기)나 '새 게임 시작'을 하세요. 저장(Q)하면 사용 중인 슬롯에 저장됩니다."
    toolbar.replaceChildren(
      button(doc, "새 슬롯", () => run(() => controller.newSlot(), "새 슬롯을 만들었습니다."), state.playing),
      button(doc, "슬롯 가져오기", () => importInput.click(), state.playing)
    )
    list.replaceChildren()
    for (const slot of state.slots) {
      const row = doc.createElement("li")
      row.className = slot.active ? "slot-row slot-active" : "slot-row"
      const name = doc.createElement("div")
      name.className = "slot-name"
      name.textContent = `${slot.active ? "▶ " : ""}${slot.name}${slot.active ? " (사용 중)" : ""}`
      const detail = doc.createElement("div")
      detail.className = "slot-detail"
      const badge = badges.get(slot.id)
      detail.textContent = `${describeSlot(slot.summary)} · ${new Date(slot.updatedAt).toLocaleString("ko-KR")}${badge !== undefined && badge.text !== "" ? ` · ${badge.text}` : ""}`
      const actions = doc.createElement("div")
      actions.className = "slot-actions"
      actions.append(
        button(doc, "선택", () => run(() => controller.select(slot.id), `슬롯 '${slot.name}'을(를) 선택했습니다.`), state.playing || slot.active),
        button(
          doc,
          "이름 바꾸기",
          () => {
            const next = doc.defaultView?.prompt("새 이름", slot.name)
            if (next !== null && next !== undefined) run(() => controller.rename(slot.id, next))
          },
          false
        ),
        button(doc, "복제", () => run(() => controller.duplicate(slot.id), "슬롯을 복제했습니다."), false),
        button(
          doc,
          "내보내기",
          () => run(async () => options.download(await controller.exportSlot(slot.id), `ultima4-slot-${slot.name}.dat`)),
          slot.summary === null
        ),
        button(
          doc,
          "삭제",
          () => {
            if (doc.defaultView?.confirm(`슬롯 '${slot.name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`) === true) {
              run(() => controller.remove(slot.id), "슬롯을 삭제했습니다.")
            }
          },
          state.playing && slot.active
        )
      )
      const cloud = options.cloud
      if (cloud !== undefined && badge?.action === "push") {
        actions.append(button(doc, "Drive에 올리기", () => run(() => cloud.push(slot.id), "Drive에 올렸습니다."), false))
      } else if (cloud !== undefined && badge?.action === "pull") {
        actions.append(button(doc, "Drive에서 받기", () => run(() => cloud.pull(slot.id), "Drive에서 받았습니다."), state.playing && slot.active))
      }
      row.append(name, detail, actions)
      list.appendChild(row)
    }
  }

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0]
    importInput.value = ""
    if (file === undefined) return
    run(async () => controller.importSlot(new Uint8Array(await file.arrayBuffer())), "슬롯을 가져왔습니다.")
  })

  controller.subscribe(() => {
    void render().catch(report)
  })
  options.cloud?.subscribe(() => {
    void render().catch(report)
  })
  void render().catch(report)
}
