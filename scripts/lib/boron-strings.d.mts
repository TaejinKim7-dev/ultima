/** Type surface of scripts/lib/boron-strings.mjs for the unit tests that import it. */
export interface BoronLiteral {
  form: "quoted" | "braced"
  offset: number
  text: string
  kind: "display" | "identifier"
}
export function extractBoronLiterals(source: string): BoronLiteral[]
