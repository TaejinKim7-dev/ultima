import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { checkBasePath } from "./check-base-path.mjs"

// `npm run build:site -- --base=/ultima/` forwards its extra args to this
// whole script invocation, not to an arbitrary command inside a compound
// shell script -- so parsing/forwarding `--base` by hand here is what makes
// the flag actually reach `vite build`.
function parseBase(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) {
      continue
    }
    if (arg.startsWith("--base=")) {
      return arg.slice("--base=".length)
    }
    if (arg === "--base") {
      const next = argv[i + 1]
      if (next !== undefined) {
        return next
      }
    }
  }
  return "/"
}

const base = parseBase(process.argv.slice(2))
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))

const buildResult = spawnSync(process.execPath, [viteBin, "build", `--base=${base}`], {
  stdio: "inherit"
})

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1)
}

try {
  const result = checkBasePath("dist", base)
  console.log(
    `build:site verified GitHub Pages asset contract for base "${base}" (${result.checkedReferenceCount} asset reference(s), ${result.checkedFileCount} file(s)).`
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown base-path check error"
  console.error(`build:site failed its base-path/asset check: ${reason}`)
  process.exit(1)
}
