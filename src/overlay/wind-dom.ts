// Todo 50: the Korean wind / dungeon-heading line drawn over the native
// "Wind West" / "Dir: North" text (WIND_AREA at {56,184,80,8} of the 320x200
// raster). Like the message-area overlay it is a child of the game viewport,
// NOT of `#overlay-layer`, so it follows the same visibility rule: switch on
// AND playing AND no top-menu modal open. createElement/textContent only.

import { computeOverlayFontPx, toCssRect, computeScale, type ContentRect } from "./overlay-layout.ts"
import { composeWindHeading, windHeadingVisible } from "./wind-heading.ts"
import type { ScreenToggle } from "./message-area-dom.ts"

/** Native pixel rect of the wind line (screen.cpp: WIND_AREA_X/Y/W/H = 7,23,10,1 text cells). */
export const WIND_RECT = { x: 56, y: 184, width: 80, height: 8 } as const

export interface WindOverlayOptions {
  readonly host: HTMLElement
  readonly getContentRect: () => ContentRect
  readonly switchToggle: ScreenToggle
  readonly doc?: Document
}

export interface WindOverlayHandle {
  wind(mode: number, direction: number): void
  applyPlay(on: boolean): void
  applyModal(on: boolean): void
}

export function createWindOverlay(options: WindOverlayOptions): WindOverlayHandle {
  const doc = options.doc ?? options.host.ownerDocument
  const win = doc.defaultView ?? null

  const box = doc.createElement("div")
  box.className = "windheading"
  box.dataset["role"] = "windheading"
  box.setAttribute("aria-hidden", "true")
  box.hidden = true
  options.host.appendChild(box)

  let text: string | null = null
  let playing = false
  let modal = false

  function render(): void {
    const show = options.switchToggle.enabled && windHeadingVisible(playing, modal, text)
    box.hidden = !show
    if (!show) return
    const content = options.getContentRect()
    const dpr = win !== null && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1
    const css = toCssRect(WIND_RECT, content, dpr)
    const { scaleY } = computeScale(content)
    const fontPx = computeOverlayFontPx(scaleY, dpr)
    box.style.left = `${css.left}px`
    box.style.top = `${css.top}px`
    box.style.width = `${css.width}px`
    box.style.height = `${css.height}px`
    box.style.fontSize = `${fontPx}px`
    box.style.lineHeight = `${css.height}px`
    if (box.textContent !== text) box.textContent = text
  }

  function frame(): void {
    render()
    if (win === null) return
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(frame)
    else win.setTimeout(frame, 16)
  }
  frame()

  return {
    wind(mode, direction) {
      text = composeWindHeading(mode, direction)
      render()
    },
    applyPlay(on) {
      playing = on
      render()
    },
    applyModal(on) {
      modal = on
      render()
    }
  }
}
