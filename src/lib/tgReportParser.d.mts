export type ParsedTgReport = {
  siteName: string
  workLines: string[]
  resources: {
    itr: number | null
    workers: number | null
    equipment: number | null
  }
  responsible: string
  comment: string
  reportedAtIso: string
  sourceMessageId: string
}

export type ParseMeta = {
  responsible: string
  reportedAtIso: string
  sourceMessageId: string
}

export function looksLikeBrigadierReport(text: string | null | undefined): boolean

export function parseBrigadierReportText(
  text: string,
  meta: ParseMeta,
): ParsedTgReport | null
