export type ArenaAudio = {
  resume: () => void
  rocketFire: () => void
  mgFire: () => void
  explosion: (power?: number) => void
  jump: () => void
  pain: () => void
  frag: () => void
  weaponSwitch: () => void
  spawn: () => void
  dispose: () => void
}

export function createArenaAudio(): ArenaAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null

  function ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.55
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  function tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slide = 0,
  ) {
    const c = ensure()
    if (!c || !master) return
    const t0 = c.currentTime
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + duration)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(g)
    g.connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  function noise(duration: number, gain: number, freq = 900) {
    const c = ensure()
    if (!c || !master) return
    const t0 = c.currentTime
    const bufferSize = Math.floor(c.sampleRate * duration)
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    const src = c.createBufferSource()
    src.buffer = buffer
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = 0.7
    const g = c.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(master)
    src.start(t0)
  }

  return {
    resume: () => {
      ensure()
    },
    rocketFire: () => {
      tone(110, 0.18, 'sawtooth', 0.22, -60)
      noise(0.12, 0.14, 420)
    },
    mgFire: () => {
      tone(780 + Math.random() * 120, 0.04, 'square', 0.06, -200)
    },
    explosion: (power = 1) => {
      noise(0.35 * power, 0.35 * power, 280)
      tone(55, 0.4 * power, 'sine', 0.28 * power, -30)
      tone(140, 0.15, 'triangle', 0.12 * power, -80)
    },
    jump: () => {
      tone(220, 0.08, 'sine', 0.08, 120)
    },
    pain: () => {
      tone(180, 0.12, 'sawtooth', 0.14, -90)
    },
    frag: () => {
      tone(660, 0.08, 'square', 0.1, 0)
      window.setTimeout(() => tone(880, 0.12, 'square', 0.08, 0), 70)
    },
    weaponSwitch: () => {
      tone(520, 0.05, 'triangle', 0.06, 80)
    },
    spawn: () => {
      tone(330, 0.1, 'sine', 0.1, 180)
    },
    dispose: () => {
      void ctx?.close()
      ctx = null
      master = null
    },
  }
}
