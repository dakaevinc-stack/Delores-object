export type SiteRef = {
  id: string
  name: string
}

export function resolveSiteId(
  probe: string | null | undefined,
  sites: readonly SiteRef[],
): string | null
