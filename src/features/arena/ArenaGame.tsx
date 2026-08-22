import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createArenaEngine,
  type ArenaHudState,
  type WeaponId,
} from './createArenaEngine'
import styles from './ArenaGame.module.css'

const WEAPON_LABEL: Record<WeaponId, string> = {
  mg: 'Пулемёт',
  rocket: 'Ракетница',
}

export function ArenaGame() {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ReturnType<typeof createArenaEngine> | null>(null)
  const [hud, setHud] = useState<ArenaHudState>({
    health: 100,
    armor: 50,
    frags: 0,
    deaths: 0,
    weapon: 'rocket',
    ammoMg: 200,
    ammoRocket: 25,
    locked: false,
    botsAlive: 4,
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const engine = createArenaEngine(host, setHud)
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  return (
    <div className={styles.root}>
      <div ref={hostRef} className={styles.canvasHost} />

      <div className={styles.crosshair} aria-hidden />

      <header className={styles.topBar}>
        <Link className={styles.back} to="/">
          ← На главную
        </Link>
        <p className={styles.logo}>ARENA III</p>
      </header>

      <div className={styles.hud}>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Здоровье</span>
          <span className={styles.hudValue}>{hud.health}</span>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Броня</span>
          <span className={styles.hudValue}>{hud.armor}</span>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Фраги</span>
          <span className={styles.hudValueAccent}>{hud.frags}</span>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Смерти</span>
          <span className={styles.hudValue}>{hud.deaths}</span>
        </div>
        <div className={styles.hudBlockWide}>
          <span className={styles.hudLabel}>{WEAPON_LABEL[hud.weapon]}</span>
          <span className={styles.hudValue}>
            {hud.weapon === 'rocket' ? hud.ammoRocket : hud.ammoMg}
          </span>
        </div>
      </div>

      <div className={styles.weaponBar}>
        <span className={hud.weapon === 'rocket' ? styles.weaponOn : styles.weaponOff}>2 · Ракетница</span>
        <span className={hud.weapon === 'mg' ? styles.weaponOn : styles.weaponOff}>1 · Пулемёт</span>
      </div>

      {!hud.locked ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <p className={styles.overlayKicker}>Deloresh Arena</p>
            <h1 className={styles.overlayTitle}>ARENA III</h1>
            <p className={styles.overlayLead}>
              Быстрый арена-шутер в духе Quake III — ракеты, прыжки, боты и фраги.
            </p>
            <button
              type="button"
              className={styles.playBtn}
              onClick={() => engineRef.current?.requestLock()}
            >
              Играть
            </button>
            <ul className={styles.help}>
              <li>WASD — движение</li>
              <li>Пробел — прыжок</li>
              <li>ЛКМ — огонь</li>
              <li>1 / 2 — оружие</li>
              <li>Esc — пауза</li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
