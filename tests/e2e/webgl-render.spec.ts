import { expect, test } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const gpuCppPath = join(repoRoot, "vendor/xu4/src/gpu_opengl.cpp")
const gpuHeaderPath = join(repoRoot, "vendor/xu4/src/gpu_opengl.h")
const shaderDir = join(repoRoot, "vendor/xu4/module/render/shader")
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-7")

// Exact compile-time guard introduced by Step 7. Each dynamic GPU upload
// site (work buffer, triangle list, map chunk geometry) must carry one
// WebGL2 branch (CPU staging + glBufferSubData) and one native branch
// (glMapBufferRange/glUnmapBuffer).
const WEBGL_GUARD = "#if defined(__EMSCRIPTEN__) || defined(U4_WEBGL2_SAFE_BUFFERS)"

// Vendor module shaders exercised through a real WebGL2 compile+link,
// using the same version/precision/define prefix scheme as
// compileSLFile() in gpu_opengl.cpp.
const SHADER_FILES = [
  "world.glsl",
  "msdf.glsl",
  "shadowcast.glsl",
  "hq2x.glsl",
  "xbr-lv2.glsl",
  "xbrz-freescale.glsl",
]

interface VendorShaderInput {
  name: string
  src: string
}

interface HarnessPixel {
  x: number
  y: number
  rgba: Array<number>
}

interface HarnessResult {
  webgl2: boolean
  vendorShadersOk: boolean
  sceneOk: boolean
  glError: number
  compileLogs: Array<{ shader: string; stage: string; log: string }>
  titlePixel: HarnessPixel | null
  statusPixel: HarnessPixel | null
  backgroundPixel: HarnessPixel | null
  runtimeError: string | null
}

test("WebGL2-safe buffers and shaders render a nonblank title/status scene", async ({
  page,
}) => {
  mkdirSync(evidenceDir, { recursive: true })
  const badShader = process.env["U4_BAD_SHADER"] === "1"

  // Part 1 (Node): the vendor renderer must carry an explicit WebGL2-safe
  // upload path instead of unconditional mapped buffers. This fails (RED)
  // on the pre-Step-7 tree where glMapBufferRange is the only path.
  const gpuCpp = readFileSync(gpuCppPath, "utf8")
  const gpuHeader = readFileSync(gpuHeaderPath, "utf8")
  expect(gpuCpp, "web/native compile-time branch must exist").toContain("__EMSCRIPTEN__")
  expect(gpuCpp, "explicit WebGL2-safe buffer marker must exist").toContain(
    "U4_WEBGL2_SAFE_BUFFERS",
  )
  expect(gpuCpp, "CPU staging upload path must exist").toContain("glBufferSubData")
  expect(gpuCpp + gpuHeader, "WebGL2 GLSL ES version must exist").toContain("#version 300 es")
  const guardSites = gpuCpp.split(WEBGL_GUARD).length - 1
  expect(guardSites, "web/native guards cover the dynamic upload sites").toBeGreaterThanOrEqual(3)
  for (const section of gpuCpp.split(WEBGL_GUARD).slice(1)) {
    const webBranch = section.split("#else")[0] ?? ""
    expect(webBranch, "WebGL2 branch must not map buffers").not.toContain("glMapBufferRange")
    expect(webBranch, "WebGL2 branch must not unmap buffers").not.toContain("glUnmapBuffer")
  }
  const mappedCalls = (gpuCpp.match(/glMapBufferRange\(GL_/g) ?? []).length
  expect(mappedCalls, "native mapped-buffer calls are preserved").toBe(3)

  // Part 2 (browser): compile the real vendor shaders under WebGL2 and
  // render a title/status scene using only bufferData + bufferSubData
  // uploads (the WebGL2-safe technique from Part 1).
  const shaders: Array<VendorShaderInput> = SHADER_FILES.map((name) => ({
    name,
    src: readFileSync(join(shaderDir, name), "utf8"),
  }))

  await page.goto("/ultima/")
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

  const result = await page.evaluate(
    async ({ shaders: vendorShaders, badShader: forceBadShader }): Promise<HarnessResult> => {
      const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null
      const failure: HarnessResult = {
        webgl2: false,
        vendorShadersOk: false,
        sceneOk: false,
        glError: 0,
        compileLogs: [],
        titlePixel: null,
        statusPixel: null,
        backgroundPixel: null,
        runtimeError: "canvas-or-context-missing",
      }
      if (canvas === null) return failure
      const gl = canvas.getContext("webgl2", {
        preserveDrawingBuffer: true,
        antialias: false,
      }) as WebGL2RenderingContext | null
      if (gl === null) return failure

      const compileLogs: Array<{ shader: string; stage: string; log: string }> = []
      let vendorShadersOk = true

      const compileStage = (
        shaderName: string,
        stage: string,
        type: number,
        source: string,
      ): WebGLShader | null => {
        const shader = gl.createShader(type)
        if (shader === null) {
          vendorShadersOk = false
          return null
        }
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        const log = gl.getShaderInfoLog(shader) ?? ""
        compileLogs.push({ shader: shaderName, stage, log })
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
          vendorShadersOk = false
          return null
        }
        return shader
      }

      // Mirror compileSLFile(): version line first, then the stage define,
      // then the vendor body. Fragment stages also get a precision line,
      // which GLSL ES requires.
      const DVERSION = "#version 300 es\n"
      const PRECISION_F = "precision highp float;\n"
      for (const vendor of vendorShaders) {
        let body = vendor.src
        if (forceBadShader && vendor.name === "world.glsl") {
          body = body.replace("void main() {", "void main(( {")
        }
        const vert = compileStage(
          vendor.name,
          "vertex",
          gl.VERTEX_SHADER,
          `${DVERSION}#define VERTEX\n${body}`,
        )
        const frag = compileStage(
          vendor.name,
          "fragment",
          gl.FRAGMENT_SHADER,
          `${DVERSION}${PRECISION_F}#define FRAGMENT\n${body}`,
        )
        if (vert === null || frag === null) {
          continue
        }
        const program = gl.createProgram()
        if (program === null) {
          vendorShadersOk = false
          continue
        }
        gl.attachShader(program, vert)
        gl.attachShader(program, frag)
        gl.linkProgram(program)
        const linkLog = gl.getProgramInfoLog(program) ?? ""
        compileLogs.push({ shader: vendor.name, stage: "link", log: linkLog })
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
          vendorShadersOk = false
        }
        gl.deleteProgram(program)
        gl.deleteShader(vert)
        gl.deleteShader(frag)
      }

      // Scene render with the WebGL2-safe upload pattern only: reserve with
      // bufferData(NULL) then stream CPU-side data with bufferSubData,
      // including a partial region update like gpu_updateWorkBuffer().
      const sceneVertSource =
        `${DVERSION}layout(location = 0) in vec2 pos;\n` +
        "layout(location = 1) in vec3 col;\n" +
        "out vec3 vCol;\n" +
        "void main() {\n" +
        "  vCol = col;\n" +
        "  gl_Position = vec4(pos, 0.0, 1.0);\n" +
        "}\n"
      const sceneFragSource =
        `${DVERSION}${PRECISION_F}in vec3 vCol;\n` +
        "out vec4 fragColor;\n" +
        "void main() {\n" +
        "  fragColor = vec4(vCol, 1.0);\n" +
        "}\n"
      const sceneVert = compileStage("scene", "vertex", gl.VERTEX_SHADER, sceneVertSource)
      const sceneFrag = compileStage("scene", "fragment", gl.FRAGMENT_SHADER, sceneFragSource)
      let sceneOk = false
      let titlePixel: HarnessPixel | null = null
      let statusPixel: HarnessPixel | null = null
      let backgroundPixel: HarnessPixel | null = null
      if (sceneVert !== null && sceneFrag !== null && vendorShadersOk) {
        const program = gl.createProgram()
        if (program !== null) {
          gl.attachShader(program, sceneVert)
          gl.attachShader(program, sceneFrag)
          gl.linkProgram(program)
          if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) {
            gl.useProgram(program)
            // Title band: full-width two-triangle strip, warm gold gradient.
            // Status panel: right-side rect in light parchment plus one
            // bright "text line" updated via a partial bufferSubData.
            const titleVerts = new Float32Array([
              -1.0, 0.15, 0.72, 0.53, 0.1, 1.0, 0.15, 0.78, 0.58, 0.12, 1.0,
              0.95, 0.85, 0.62, 0.14, -1.0, 0.15, 0.72, 0.53, 0.1, 1.0, 0.95,
              0.85, 0.62, 0.14, -1.0, 0.95, 0.8, 0.6, 0.16,
            ])
            // 6 title verts (30 floats) + 6 status verts (30 floats).
            const statusBase = new Float32Array([
              0.25, -0.9, 0.88, 0.83, 0.7, 1.0, -0.9, 0.9, 0.85, 0.72, 1.0,
              0.85, 0.86, 0.78, 0.64, 0.25, -0.9, 0.88, 0.83, 0.7, 1.0, 0.85,
              0.86, 0.78, 0.64, 0.25, 0.85, 0.89, 0.84, 0.71,
            ])
            const floatsPerVert = 5
            const totalFloats = titleVerts.length + statusBase.length
            const buffer = gl.createBuffer()
            if (buffer !== null) {
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
              gl.bufferData(gl.ARRAY_BUFFER, totalFloats * 4, gl.DYNAMIC_DRAW)
              gl.bufferSubData(gl.ARRAY_BUFFER, 0, titleVerts)
              gl.bufferSubData(gl.ARRAY_BUFFER, titleVerts.length * 4, statusBase)
              // Partial region refresh of the status "text line" (last vert).
              const textLine = new Float32Array([0.3, 0.7, 0.98, 0.96, 0.88])
              const textOffsetFloats = titleVerts.length + statusBase.length - floatsPerVert
              gl.bufferSubData(gl.ARRAY_BUFFER, textOffsetFloats * 4, textLine)
              const stride = floatsPerVert * 4
              gl.enableVertexAttribArray(0)
              gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
              gl.enableVertexAttribArray(1)
              gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2 * 4)
              gl.viewport(0, 0, canvas.width, canvas.height)
              gl.clearColor(0.02, 0.03, 0.12, 1.0)
              gl.clear(gl.COLOR_BUFFER_BIT)
              gl.drawArrays(gl.TRIANGLES, 0, totalFloats / floatsPerVert)
              const readAt = (x: number, y: number): HarnessPixel => {
                const pixels = new Uint8Array(4)
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
                return { x, y, rgba: [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0, pixels[3] ?? 0] }
              }
              // readPixels uses a bottom-left origin.
              titlePixel = readAt(160, 160)
              statusPixel = readAt(280, 40)
              backgroundPixel = readAt(8, 100)
              const distinct = (pixel: HarnessPixel, other: HarnessPixel): boolean =>
                (pixel.rgba[0] ?? 0) !== (other.rgba[0] ?? 0) ||
                (pixel.rgba[1] ?? 0) !== (other.rgba[1] ?? 0) ||
                (pixel.rgba[2] ?? 0) !== (other.rgba[2] ?? 0)
              sceneOk =
                titlePixel !== null &&
                statusPixel !== null &&
                backgroundPixel !== null &&
                distinct(titlePixel, backgroundPixel) &&
                distinct(statusPixel, backgroundPixel) &&
                gl.getError() === gl.NO_ERROR
            }
          }
        }
      }

      let runtimeError: string | null = null
      if (!vendorShadersOk) runtimeError = "shader-compile-error"
      else if (!sceneOk) runtimeError = "scene-render-error"
      if (runtimeError !== null) {
        window.dispatchEvent(
          new CustomEvent("u4-runtime-error", { detail: { source: "webgl-render", runtimeError } }),
        )
        document.body.setAttribute("data-webgl-render", "error")
      } else {
        document.body.setAttribute("data-webgl-render", "ok")
      }
      return {
        webgl2: true,
        vendorShadersOk,
        sceneOk,
        glError: gl.getError(),
        compileLogs,
        titlePixel,
        statusPixel,
        backgroundPixel,
        runtimeError,
      }
    },
    { shaders, badShader },
  )

  if (!result.vendorShadersOk || !result.sceneOk) {
    console.log(`webgl-render diagnostics: ${JSON.stringify(result, null, 2)}`)
  }

  if (badShader) {
    // Failure QA: the corrupted fixture must surface as a runtime-error
    // event, and the assertions below keep the run nonzero (RED).
    expect(result.runtimeError, "bad shader surfaces a runtime-error").toBe("shader-compile-error")
    await expect(page.locator("body")).toHaveAttribute("data-webgl-render", "error")
  }

  // GREEN assertions: real WebGL2, clean vendor shader logs, nonblank
  // title/status pixels distinct from the background.
  expect(result.webgl2, "WebGL2 context is available").toBe(true)
  expect(result.vendorShadersOk, "vendor shaders compile and link").toBe(true)
  for (const entry of result.compileLogs) {
    expect(entry.log, `${entry.shader} ${entry.stage} log is clean`).not.toMatch(/error/i)
  }
  expect(result.runtimeError, "no runtime error is emitted").toBeNull()
  expect(result.sceneOk, "title/status scene renders without GL errors").toBe(true)
  expect(result.titlePixel, "title pixel is sampled").not.toBeNull()
  expect(result.statusPixel, "status pixel is sampled").not.toBeNull()
  expect(result.backgroundPixel, "background pixel is sampled").not.toBeNull()

  await page.locator("#game-canvas").screenshot({ path: join(evidenceDir, "title-render.png") })
  writeFileSync(
    join(evidenceDir, "render-summary.json"),
    JSON.stringify(
      {
        scenario: "WebGL2-safe bufferSubData scene with vendor shader compile+link",
        observedAt: new Date().toISOString(),
        url: page.url(),
        webgl2: result.webgl2,
        vendorShadersOk: result.vendorShadersOk,
        sceneOk: result.sceneOk,
        glError: result.glError,
        titlePixel: result.titlePixel,
        statusPixel: result.statusPixel,
        backgroundPixel: result.backgroundPixel,
        compileLogSizes: result.compileLogs.map((entry) => ({
          shader: entry.shader,
          stage: entry.stage,
          bytes: entry.log.length,
        })),
      },
      null,
      2,
    ),
  )
})
