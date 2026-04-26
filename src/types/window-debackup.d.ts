export {}

declare global {
  interface Window {
    /** Резервное копирование localStorage — см. docs/RECOVERY.ru.md */
    DELORESH_BACKUP?: {
      keys: () => string[]
      exportJson: () => string
      download: () => void
      importJson: (json: string) => {
        applied: number
        skipped: number
        errors: string[]
      }
    }
  }
}
