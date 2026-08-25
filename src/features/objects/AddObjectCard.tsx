import { Link } from 'react-router-dom'
import styles from './ObjectCard.module.css'

/** Та же стеклянная карточка: слоты как у объектов, брендовые акценты. */
export function AddObjectCard() {
  return (
    <Link
      className={`${styles.card} ${styles.cardAdd}`}
      to="/objects/new"
      aria-label="Добавить объект"
    >
      <span className={styles.face}>
        <span className={styles.specular} aria-hidden />
        <span className={styles.caustic} aria-hidden />

        <div className={styles.head}>
          <span className={`${styles.dot} ${styles.dotAdd}`} aria-hidden />
          <span className={`${styles.status} ${styles.statusAdd}`}>Новый</span>
          <span className={`${styles.pct} ${styles.pctAdd}`}>+</span>
        </div>

        <h2 className={styles.title}>Добавить объект</h2>

        <div className={styles.track} aria-hidden>
          <span className={styles.trackFact} style={{ width: '42%' }} />
        </div>

        <div className={styles.foot}>
          <p className={styles.meta}>Срок не задан</p>
          <p className={`${styles.delta} ${styles.deltaAdd}`}>План не задан</p>
        </div>
      </span>
    </Link>
  )
}
