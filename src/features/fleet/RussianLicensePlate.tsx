import styles from './RussianLicensePlate.module.css'

type Props = {
  plate: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Русский госномер: слева основная часть (А 123 АА), справа синяя полоса
 * с кодом региона, триколором и подписью «RUS». Если номер не соответствует
 * стандартному формату — показываем его целиком, без правой полосы.
 */
function splitPlate(raw: string): { main: string; region: string } {
  const plate = raw.replace(/\s+/g, ' ').trim()
  const m = plate.match(/^(.+?)[\s-]*?(\d{2,3})$/)
  if (!m) return { main: plate, region: '' }
  return { main: m[1].trim().replace(/\s+/g, ' '), region: m[2] }
}

export function RussianLicensePlate({ plate, size = 'md', className }: Props) {
  const { main, region } = splitPlate(plate)
  return (
    <span
      className={`${styles.plate} ${styles[`size-${size}`]} ${className ?? ''}`}
      aria-label={`Госномер ${plate}`}
    >
      <span className={styles.main}>{main || plate}</span>
      {region ? (
        <span className={styles.region} aria-hidden>
          <span className={styles.regionNumber}>{region}</span>
          <span className={styles.regionFooter}>
            <span className={styles.regionFlag}>
              <span className={styles.flagW} />
              <span className={styles.flagB} />
              <span className={styles.flagR} />
            </span>
            <span className={styles.regionLabel}>RUS</span>
          </span>
        </span>
      ) : null}
    </span>
  )
}
