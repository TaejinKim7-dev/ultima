/** Type surface of scripts/lib/topic-glosses.mjs for the unit tests that import it. */
export interface TopicSlot {
  npc: string
  field: string
  raw: string
}
export interface TopicGlossTables {
  glosses: Record<string, string>
  overrides: Record<string, string>
}
export interface TopicGlossaryEntry {
  sourceHash?: string
  translation?: string
  status?: string
}
export function topicSlots(tlkEntries: Record<string, { sourceHash?: string; translation?: string }>): TopicSlot[]
export function topicSlug(raw: string): string
export function defaultGlossId(raw: string): string
export function overrideGlossId(raw: string, map: string, npc: string): string
export function buildTopicGlossTables(
  tlkEntries: Record<string, TopicGlossaryEntry>,
  glossaryEntries: Record<string, TopicGlossaryEntry>
): TopicGlossTables
export function topicGlossProblems(
  tlkEntries: Record<string, TopicGlossaryEntry>,
  glossaryEntries: Record<string, TopicGlossaryEntry>,
  aliases: { entries?: Record<string, { alias?: string; canonical?: string }> },
  options?: { strict?: boolean }
): string[]