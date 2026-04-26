import { Link } from 'react-router-dom'
import card from './ObjectCard.module.css'
import styles from './AddObjectCard.module.css'

export function AddObjectCard() {
  return (
    <Link
      className={`${card.card} ${styles.addRoot}`}
      to="/objects/new"
      aria-label="Добавить новый объект в портфель"
    >
      <div className={`${card.top} ${styles.addTop}`}>
        <div className={card.leftMeta}>
          <span className={styles.addMark} aria-hidden>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className={`${card.status} ${styles.addEyebrow}`}>Новая площадка</span>
        </div>
      </div>

      <h2 className={`${card.title} ${styles.addTitle}`}>Добавить объект</h2>

      <div className={styles.rule} aria-hidden />

      <p className={styles.addSummary}>
        Заведите карточку нового объекта, когда он появится в портфеле.
      </p>
    </Link>
  )
}
