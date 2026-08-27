import { useEffect, useState } from 'react'
import { LoginIntroOverlay } from './LoginIntroOverlay'
import {
  consumeLoginIntroPending,
  peekLoginIntroPending,
  subscribeLoginIntroRequest,
} from './loginIntroPending'

/** Глобальный хост: интро не умирает при Navigate на /driver. */
export function LoginIntroHost() {
  const [open, setOpen] = useState(() => peekLoginIntroPending())

  useEffect(() => {
    return subscribeLoginIntroRequest(() => setOpen(true))
  }, [])

  if (!open) return null

  return (
    <LoginIntroOverlay
      onDone={() => {
        consumeLoginIntroPending()
        setOpen(false)
      }}
    />
  )
}
