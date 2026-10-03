/** Type surface of scripts/lib/cpp-strings.mjs for the unit tests that import it. */
export interface CppLiteral { offset: number; text: string }
export interface CppExtractOptions {
  extraCallNames?: string[]
  joinAdjacent?: boolean
  secondArgCallNames?: string[]
  assignNames?: string[]
  markerComments?: boolean
  skipFormatOnly?: boolean
  textAtCalls?: boolean
  setTitleCalls?: boolean
  /** Todo 40: names of static string-array initialisers, appended after every other literal. */
  staticArrays?: string[]
}
export function extractCppLiterals(source: string, options?: CppExtractOptions): CppLiteral[]
