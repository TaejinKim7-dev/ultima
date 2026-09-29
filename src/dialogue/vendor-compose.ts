// Todo 25: composes one Korean vendor line from vendors.b's `web-say` call.
// The engine sends the FNV-1a hash of the (unsubstituted) Boron template it
// is about to print plus the [symbol, value, symbol, value, ...] pairs of the
// `construct` plan (`@` shop, `%` owner, `$` price, `#` quantity, `=` item
// name), evaluated. i18n:generate pre-normalizes the Korean template to
// Boron's runtime form (scripts/lib/vendor-templates.mjs), so this side only
// substitutes symbols the way `construct` does: one left-to-right pass,
// substituted values are never rescanned.
//
// Pure (no DOM, no engine): the shell injects the real lookups.

export interface VendorComposeDeps {
  /** Korean runtime template for a template hash (8 lowercase hex digits), if translated. */
  template(hash: string): string | undefined
  /** Maps an English shop/owner/item name to its module id. */
  nameId(text: string): string | undefined
  /** Resolves an id to Korean, returning `fallback` when no translation is ready. */
  resolve(id: string, fallback: string): string
}

/** True when the last syllable of `text` ends in ㄹ (which takes 로, not 으로). */
function endsWithRieul(text: string): boolean {
  const last = text.at(-1)
  if (last === undefined) {
    return false
  }
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 8
  }
  return "178".includes(last)
}

/** True when the last syllable of `text` ends in a final consonant; undefined if unknown. */
function hasBatchim(text: string): boolean | undefined {
  const last = text.at(-1)
  if (last === undefined) {
    return undefined
  }
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0
  }
  if (last >= "0" && last <= "9") {
    // Sino-Korean readings ending in a consonant: 영 일 삼 육 칠 팔.
    return "013678".includes(last)
  }
  return undefined
}

// "(이)가" / "을(를)" / "이(가)" written after a symbol in the translation.
const PARTICLES: readonly (readonly [string, string, string])[] = [
  ["(이)가", "이", "가"],
  ["(을)를", "을", "를"],
  ["을(를)", "을", "를"],
  ["이(가)", "이", "가"],
  ["은(는)", "은", "는"],
  ["(은)는", "은", "는"],
  ["과(와)", "과", "와"],
  ["(으)로", "으로", "로"]
]

function resolveParticle(rest: string, value: string): { text: string; consumed: number } | undefined {
  for (const [written, withBatchim, without] of PARTICLES) {
    if (rest.startsWith(written)) {
      const batchim = hasBatchim(value)
      if (batchim === undefined) {
        return undefined
      }
      const rieul = written === "(으)로" && endsWithRieul(value)
      return { text: batchim && !rieul ? withBatchim : without, consumed: written.length }
    }
  }
  return undefined
}

// An inventory listing built by vendors.b's build-items: "K name\n" per item.
const LISTING_LINE = /^([A-Za-z][ -])(.+)$/

function translateValue(raw: string, deps: VendorComposeDeps): string {
  const nameId = deps.nameId(raw)
  if (nameId !== undefined) {
    return deps.resolve(nameId, raw)
  }
  if (!raw.includes("\n")) {
    return raw
  }
  return raw
    .split("\n")
    .map((line) => {
      const match = LISTING_LINE.exec(line)
      const itemId = match?.[2] === undefined ? undefined : deps.nameId(match[2])
      return match === null || itemId === undefined ? line : `${match[1]}${deps.resolve(itemId, match[2] ?? "")}`
    })
    .join("\n")
}

/**
 * The Korean line for one web-say call, or null when the template is not one
 * we translate (never falls back to English).
 */
export function composeVendorLine(hash: string, pairs: readonly string[], deps: VendorComposeDeps): string | null {
  const template = deps.template(hash)
  if (template === undefined || template === "") {
    return null
  }
  const values = new Map<string, string>()
  for (let index = 0; index + 1 < pairs.length; index += 2) {
    const symbol = pairs[index] ?? ""
    const raw = pairs[index + 1] ?? ""
    // Boron construct matches the first pair for a duplicated symbol.
    if (!values.has(symbol)) {
      values.set(symbol, translateValue(raw, deps))
    }
  }

  let out = ""
  for (let index = 0; index < template.length; ) {
    const ch = template.charAt(index)
    const value = values.get(ch)
    if (value === undefined) {
      out += ch
      index += 1
      continue
    }
    index += 1
    const particle = resolveParticle(template.slice(index), value)
    if (particle === undefined) {
      out += value
    } else {
      out += value + particle.text
      index += particle.consumed
    }
  }
  return out
}

/**
 * Wraps composeVendorLine for the EM_JS call site. An exception thrown here
 * would unwind the wasm game loop, so every failure is contained.
 */
export function createVendorHandler(
  deps: VendorComposeDeps,
  emit: (text: string) => void,
  onError: (error: unknown) => void = () => {}
): (hash: string, pairs: readonly string[]) => void {
  return (hash, pairs) => {
    try {
      const text = composeVendorLine(hash, pairs, deps)
      if (text !== null) {
        emit(text)
      }
    } catch (error) {
      onError(error)
    }
  }
}
