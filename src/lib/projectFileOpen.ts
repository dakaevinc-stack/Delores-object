import type { SiteProjectFileKind } from './siteProjectFilesRepository'

export type ProjectOpenMode =
  | 'pdf'
  | 'dwg'
  | 'image'
  | 'spreadsheet'
  | 'word'
  | 'text'
  | 'download'

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function projectOpenMode(
  row: { kind: SiteProjectFileKind; name: string; mime?: string },
): ProjectOpenMode {
  const ext = fileExtension(row.name)
  const mime = (row.mime ?? '').toLowerCase()

  if (row.kind === 'folder') return 'download'
  if (row.kind === 'dwg' || ext === 'dwg' || ext === 'dxf') return 'dwg'
  if (row.kind === 'pdf' || ext === 'pdf' || mime.includes('pdf')) return 'pdf'

  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext) ||
    mime.startsWith('image/')
  ) {
    return 'image'
  }

  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'spreadsheet'
  }

  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'word'
  if (ext === 'doc') return 'download' // старый .doc в браузере не разобрать

  if (['txt', 'md', 'log', 'json', 'xml'].includes(ext) || mime.startsWith('text/')) {
    return 'text'
  }

  return 'download'
}

export function canPreviewInApp(row: { kind: SiteProjectFileKind; name: string; mime?: string }): boolean {
  const mode = projectOpenMode(row)
  return mode !== 'download'
}
