import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Неизвестная ошибка' }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className={styles.wrap}>
          <div className={styles.card} role="alert">
            <h1 className={styles.title}>Сбой интерфейса</h1>
            <p className={styles.message}>{this.state.message}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => window.location.reload()}
              >
                Обновить страницу
              </button>
              <a className={styles.btn} href="/">
                На главную
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
