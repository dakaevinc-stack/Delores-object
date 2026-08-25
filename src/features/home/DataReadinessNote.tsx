import styles from './DataReadinessNote.module.css'

type Props = {
  className?: string
}

/**
 * Мягкая плашка: полных данных ещё нет — можно работать на демо
 * и наращивать парк/объекты вручную.
 */
export function DataReadinessNote({ className }: Props) {
  return (
    <aside
      className={[styles.note, className].filter(Boolean).join(' ')}
      aria-label="Статус данных"
    >
      <span className={styles.stripe} aria-hidden />
      <div className={styles.copy}>
        <p className={styles.kicker}>Пока демо-данные</p>
        <p className={styles.text}>
          Полных списков техники и объектов ещё нет. Добавляйте единицы в парк и
          объекты вручную — цифры на карточках обновятся сами. Когда будут Excel
          или выгрузки, подключим импорт.
        </p>
      </div>
    </aside>
  )
}
