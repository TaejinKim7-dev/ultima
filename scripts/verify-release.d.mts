// Types for scripts/verify-release.mjs (imported by tests/unit/verify-release.test.ts).

export interface ReleaseStep {
  readonly label: string
  readonly args: readonly string[]
}

export const RELEASE_STEPS: readonly (readonly string[])[]

export function releaseSteps(): ReleaseStep[]

export interface RunReleaseOptions {
  env?: Record<string, string | undefined>
  argv?: readonly string[]
  runner?: (step: ReleaseStep) => number
  log?: (message: string) => void
  error?: (message: string) => void
}

export function runRelease(options?: RunReleaseOptions): number
