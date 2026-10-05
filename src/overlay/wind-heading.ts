// Todo 50: the wind / dungeon-heading line ("Wind West" / "Dir: North") as
// Korean. The engine reports only a mode and the native Direction enum value
// (vendor/xu4/src/direction.h: NONE=0, WEST=1, NORTH=2, EAST=3, SOUTH=4); the
// English text never leaves the engine.

/** Engine signal mode: 0 = no heading (combat, etc.), 1 = wind (overland/town), 2 = dungeon orientation. */
export const WIND_MODE_WIND = 1
export const WIND_MODE_DUNGEON = 2

const CARDINAL_KO: Readonly<Record<number, string>> = { 1: "서", 2: "북", 3: "동", 4: "남" }

/** The Korean heading line, or null when there is nothing to show. */
export function composeWindHeading(mode: number, direction: number): string | null {
  const cardinal = CARDINAL_KO[direction]
  if (cardinal === undefined) return null
  if (mode === WIND_MODE_WIND) return `바람 ${cardinal}`
  if (mode === WIND_MODE_DUNGEON) return `방향 ${cardinal}`
  return null
}

/** The heading is drawn only while playing, with no top-menu modal open, and with something to say. */
export function windHeadingVisible(playing: boolean, modal: boolean, text: string | null): boolean {
  return playing && !modal && text !== null
}
