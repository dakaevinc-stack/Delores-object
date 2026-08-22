import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { createArenaAudio } from './arenaAudio'
import { canSee, moveCapsule, randomSpawnPoint } from './arenaPhysics'

export type WeaponId = 'mg' | 'rocket'

export type ArenaHudState = {
  health: number
  armor: number
  frags: number
  deaths: number
  weapon: WeaponId
  ammoMg: number
  ammoRocket: number
  locked: boolean
  botsAlive: number
}

type Bot = {
  id: number
  group: THREE.Group
  body: THREE.Mesh
  health: number
  vel: THREE.Vector3
  shootCd: number
  strafe: number
  jumpCd: number
  color: number
}

type Rocket = {
  mesh: THREE.Mesh
  light: THREE.PointLight
  vel: THREE.Vector3
  life: number
  owner: 'player' | number
}

type Particle = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
}

const ARENA = 22
const EYE = 1.65
const RADIUS = 0.42
const GRAVITY = -32
const JUMP = 10.5
const GROUND_SPEED = 14
const AIR_SPEED = 9
const MAX_HVEL = 22
const BOT_FEET = 0.92
const FIRE_KEYS = ['KeyF', 'Enter', 'ControlLeft', 'ControlRight'] as const

export function createArenaEngine(
  container: HTMLElement,
  onHud: (state: ArenaHudState) => void,
): { dispose: () => void; requestLock: () => void } {
  const audio = createArenaAudio()
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x1a2840, 0.018)

  const camera = new THREE.PerspectiveCamera(
    92,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.08,
    140,
  )

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  container.appendChild(renderer.domElement)

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x2f8cff) },
        horizon: { value: new THREE.Color(0x6a4028) },
        bottom: { value: new THREE.Color(0x120810) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 col = mix(horizon, top, smoothstep(0.35, 1.0, h));
          col = mix(bottom, col, smoothstep(0.0, 0.45, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  )
  scene.add(sky)

  scene.add(new THREE.HemisphereLight(0x8ec5ff, 0x2a1810, 0.45))
  const sun = new THREE.DirectionalLight(0xffe8cc, 1.25)
  sun.position.set(14, 24, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 70
  sun.shadow.camera.left = -30
  sun.shadow.camera.right = 30
  sun.shadow.camera.top = 30
  sun.shadow.camera.bottom = -30
  sun.shadow.bias = -0.0004
  scene.add(sun)

  const fill = new THREE.PointLight(0x3b82f6, 1.6, 50, 2)
  fill.position.set(-10, 8, -8)
  scene.add(fill)

  const colliders: THREE.Box3[] = []
  const wallMeshes: THREE.Mesh[] = []
  const floorTex = makeGridTexture()
  const matFloor = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.88,
    metalness: 0.05,
  })
  const matWall = new THREE.MeshStandardMaterial({
    color: 0x5c4a3a,
    roughness: 0.78,
    metalness: 0.1,
  })
  const matTrim = new THREE.MeshStandardMaterial({
    color: 0x2484ff,
    emissive: 0x0d4db8,
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.6,
  })
  const matMetal = new THREE.MeshStandardMaterial({
    color: 0x9aacbe,
    roughness: 0.28,
    metalness: 0.92,
  })

  function addBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    collide = true,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y + h / 2, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh))
      wallMeshes.push(mesh)
    }
    return mesh
  }

  addBox(0, -0.25, 0, ARENA * 2 + 4, 0.5, ARENA * 2 + 4, matFloor)
  addBox(0, 0, -ARENA, ARENA * 2, 5.5, 0.7, matWall)
  addBox(0, 0, ARENA, ARENA * 2, 5.5, 0.7, matWall)
  addBox(-ARENA, 0, 0, 0.7, 5.5, ARENA * 2, matWall)
  addBox(ARENA, 0, 0, 0.7, 5.5, ARENA * 2, matWall)
  addBox(-10, 0, -10, 4, 2.4, 4, matMetal)
  addBox(10, 0, 10, 5, 1.5, 3, matMetal)
  addBox(0, 0, 0, 6, 3.2, 6, matWall)
  addBox(-6, 3.1, 0, 4, 0.35, 8, matTrim, false)
  addBox(8, 0, -6, 3, 4.2, 3, matTrim)
  addBox(-14, 0, 12, 2.5, 1.9, 6, matMetal)
  addBox(14, 0, -12, 2.5, 1.9, 6, matMetal)
  addBox(-5, 0, 5, 3, 1.2, 3, matTrim)

  const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.45, 8), matMetal)
  ramp.position.set(6, 0.85, -4)
  ramp.rotation.x = -0.32
  ramp.castShadow = true
  ramp.receiveShadow = true
  scene.add(ramp)
  colliders.push(new THREE.Box3().setFromObject(ramp))
  wallMeshes.push(ramp)

  const controls = new PointerLockControls(camera, renderer.domElement)
  scene.add(controls.object)

  const keys = new Set<string>()
  let mouseDown = false
  const vel = new THREE.Vector3()
  let onGround = false
  let health = 100
  let armor = 50
  let frags = 0
  let deaths = 0
  let weapon: WeaponId = 'rocket'
  let ammoMg = 200
  let ammoRocket = 25
  let mgCd = 0
  let rocketCd = 0
  let spawnInvuln = 1.2

  const bots: Bot[] = []
  const rockets: Rocket[] = []
  const particles: Particle[] = []
  const botColors = [0xc45c2a, 0x3d8cff, 0x9b59b6, 0x2ecc71]

  function makeBot(i: number, x: number, z: number): Bot {
    const group = new THREE.Group()
    const color = botColors[i % botColors.length]!
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 1.1, 6, 10),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.35,
        emissive: color,
        emissiveIntensity: 0.12,
      }),
    )
    body.castShadow = true
    group.add(body)
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.2, 0.24),
      new THREE.MeshStandardMaterial({
        color: 0x0a1018,
        emissive: 0x44aaff,
        emissiveIntensity: 0.85,
        metalness: 0.95,
        roughness: 0.15,
      }),
    )
    visor.position.set(0, 0.38, 0.3)
    group.add(visor)
    group.position.set(x, BOT_FEET, z)
    scene.add(group)
    return {
      id: i,
      group,
      body,
      health: 100,
      vel: new THREE.Vector3(),
      shootCd: 0.6 + Math.random(),
      strafe: Math.random() > 0.5 ? 1 : -1,
      jumpCd: 0,
      color,
    }
  }

  for (let i = 0; i < 4; i++) {
    const p = randomSpawnPoint()
    bots.push(makeBot(i, p.x, p.z))
  }

  controls.object.position.set(0, EYE, 14)

  function spawnParticles(pos: THREE.Vector3, count: number, color: number, speed: number, size = 0.12) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 5, 5),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        }),
      )
      mesh.position.copy(pos)
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed * 0.8,
        (Math.random() - 0.5) * speed,
      )
      scene.add(mesh)
      particles.push({ mesh, vel: v, life: 0.45 + Math.random() * 0.25 })
    }
  }

  function respawnPlayer() {
    controls.object.position.set(0, EYE, 14)
    vel.set(0, 0, 0)
    health = 100
    armor = 50
    ammoMg = 200
    ammoRocket = 25
    spawnInvuln = 2
    audio.spawn()
  }

  function damagePlayer(amount: number) {
    if (spawnInvuln > 0) return
    let dmg = amount
    if (armor > 0) {
      const absorbed = Math.min(armor, dmg * 0.66)
      armor -= absorbed
      dmg -= absorbed
    }
    health -= dmg
    if (dmg > 0) audio.pain()
    if (health <= 0) {
      health = 0
      deaths += 1
      audio.explosion(0.6)
      respawnPlayer()
    }
  }

  function flashBot(bot: Bot) {
    const mat = bot.body.material as THREE.MeshStandardMaterial
    mat.emissive.setHex(0xffffff)
    mat.emissiveIntensity = 0.55
    window.setTimeout(() => {
      if (bot.health > 0) {
        mat.emissive.setHex(bot.color)
        mat.emissiveIntensity = 0.12
      }
    }, 70)
  }

  function damageBot(bot: Bot, amount: number) {
    if (bot.health <= 0) return
    bot.health -= amount
    flashBot(bot)
    if (bot.health <= 0) {
      scene.remove(bot.group)
      frags += 1
      audio.frag()
      spawnParticles(bot.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 14, bot.color, 6, 0.1)
      const idx = bots.indexOf(bot)
      if (idx >= 0) bots.splice(idx, 1)
      window.setTimeout(() => {
        const p = randomSpawnPoint()
        bots.push(makeBot(bot.id, p.x, p.z))
      }, 2200)
    }
  }

  function spawnExplosion(pos: THREE.Vector3, radius: number, damage: number, owner: 'player' | number) {
    audio.explosion(radius / 4)
    spawnParticles(pos, 22, 0xff6622, 9, 0.14)
    spawnParticles(pos, 10, 0xffcc66, 5, 0.08)

    const flash = new THREE.PointLight(0xff8844, 3.5, 12, 2)
    flash.position.copy(pos)
    scene.add(flash)
    window.setTimeout(() => scene.remove(flash), 120)

    if (owner !== 'player') {
      const dist = pos.distanceTo(controls.object.position)
      if (dist < radius) damagePlayer((1 - dist / radius) * damage)
    } else {
      const dist = pos.distanceTo(controls.object.position)
      if (dist < radius * 0.85) {
        const falloff = 1 - dist / (radius * 0.85)
        damagePlayer(damage * falloff * 0.35)
        vel.add(
          pos
            .clone()
            .sub(controls.object.position)
            .normalize()
            .multiplyScalar(7 * falloff),
        )
      }
    }

    for (const bot of bots) {
      if (bot.health <= 0) continue
      const dist = pos.distanceTo(bot.group.position)
      if (dist < radius) {
        const falloff = 1 - dist / radius
        if (owner === 'player') damageBot(bot, damage * falloff)
        else if (typeof owner === 'number' && owner !== bot.id) damageBot(bot, damage * falloff * 0.45)
      }
    }
  }

  function muzzleOrigin(): THREE.Vector3 {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    return controls.object.position.clone().add(dir.multiplyScalar(0.75))
  }

  function fireRocket(owner: 'player' | number, origin: THREE.Vector3, dir: THREE.Vector3) {
    const aim = dir.clone().normalize()
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.55, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff6622,
        emissive: 0xff4400,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.15,
      }),
    )
    mesh.position.copy(origin)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim)
    const light = new THREE.PointLight(0xff6622, 1.8, 6, 2)
    mesh.add(light)
    scene.add(mesh)
    rockets.push({
      mesh,
      light,
      vel: aim.multiplyScalar(32),
      life: 3.5,
      owner,
    })
    if (owner === 'player') {
      audio.rocketFire()
      if (onGround) vel.add(aim.clone().multiplyScalar(-5.5))
    }
  }

  function fireMg(origin: THREE.Vector3, dir: THREE.Vector3, owner: 'player' | number) {
    const aim = dir.clone().normalize()
    if (owner === 'player') {
      audio.mgFire()
      const hits = new THREE.Raycaster(origin, aim, 0, 90).intersectObjects(
        bots.filter((b) => b.health > 0).map((b) => b.body),
        false,
      )
      if (hits[0]) {
        const bot = bots.find((b) => b.body === hits[0]!.object)
        if (bot) damageBot(bot, 9)
      }
      spawnParticles(origin.clone().add(aim.clone().multiplyScalar(1.5)), 2, 0xffeeaa, 2, 0.04)
    } else {
      const playerPos = controls.object.position
      const toPlayer = playerPos.clone().sub(origin)
      const proj = toPlayer.dot(aim)
      if (proj > 0 && proj < 90) {
        const closest = origin.clone().add(aim.clone().multiplyScalar(proj))
        if (closest.distanceTo(playerPos) < 1.15 && canSee(origin, playerPos, wallMeshes)) {
          damagePlayer(8)
        }
      }
    }
  }

  function wantsFire() {
    if (mouseDown) return true
    return FIRE_KEYS.some((code) => keys.has(code))
  }

  function tryPlayerFire() {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const origin = muzzleOrigin()
    if (weapon === 'rocket' && rocketCd <= 0 && ammoRocket > 0) {
      ammoRocket -= 1
      rocketCd = 0.8
      fireRocket('player', origin, dir)
    } else if (weapon === 'mg' && mgCd <= 0 && ammoMg > 0) {
      ammoMg -= 1
      mgCd = 0.085
      fireMg(origin, dir, 'player')
    }
  }

  function pushHud(locked: boolean) {
    onHud({
      health: Math.max(0, Math.round(health)),
      armor: Math.max(0, Math.round(armor)),
      frags,
      deaths,
      weapon,
      ammoMg,
      ammoRocket,
      locked,
      botsAlive: bots.filter((b) => b.health > 0).length,
    })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code)
    if (e.code === 'Digit1' && weapon !== 'mg') {
      weapon = 'mg'
      audio.weaponSwitch()
    }
    if (e.code === 'Digit2' && weapon !== 'rocket') {
      weapon = 'rocket'
      audio.weaponSwitch()
    }
    if (controls.isLocked && FIRE_KEYS.includes(e.code as (typeof FIRE_KEYS)[number])) {
      e.preventDefault()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
  const onLock = () => {
    audio.resume()
    pushHud(true)
  }
  const onUnlock = () => pushHud(false)
  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / Math.max(h, 1)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const onClick = () => {
    if (!controls.isLocked) {
      audio.resume()
      controls.lock()
    }
  }
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = true
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false
  }
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1 && controls.isLocked) mouseDown = true
  }
  const onTouchEnd = () => {
    mouseDown = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)
  controls.addEventListener('lock', onLock)
  controls.addEventListener('unlock', onUnlock)
  renderer.domElement.addEventListener('click', onClick)
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', onTouchEnd)

  let last = performance.now()
  let raf = 0
  let alive = true

  const tick = (now: number) => {
    if (!alive) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now

    spawnInvuln = Math.max(0, spawnInvuln - dt)
    mgCd = Math.max(0, mgCd - dt)
    rocketCd = Math.max(0, rocketCd - dt)

    if (controls.isLocked) {
      const forward = new THREE.Vector3()
      const right = new THREE.Vector3()
      controls.object.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() > 0) forward.normalize()
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      const wish = new THREE.Vector3()
      if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(forward)
      if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(forward)
      if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right)
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right)
      if (wish.lengthSq() > 0) wish.normalize()

      const targetSpeed = onGround ? GROUND_SPEED : AIR_SPEED
      const accel = onGround ? 48 : 22
      vel.x += wish.x * accel * dt
      vel.z += wish.z * accel * dt

      const hSpeed = Math.hypot(vel.x, vel.z)
      if (hSpeed > targetSpeed) {
        const scale = targetSpeed / hSpeed
        vel.x *= scale
        vel.z *= scale
      }
      if (hSpeed > MAX_HVEL) {
        const scale = MAX_HVEL / hSpeed
        vel.x *= scale
        vel.z *= scale
      }

      if (onGround) {
        vel.x *= 0.9
        vel.z *= 0.9
        if (keys.has('Space')) {
          vel.y = JUMP
          onGround = false
          audio.jump()
        }
      } else {
        vel.y += GRAVITY * dt
      }

      onGround = moveCapsule(controls.object.position, vel, colliders, RADIUS, EYE, dt)

      if (wantsFire()) tryPlayerFire()
    }

    for (const bot of bots) {
      if (bot.health <= 0) continue
      bot.shootCd -= dt
      bot.jumpCd -= dt
      const pp = controls.object.position
      const bp = bot.group.position
      const toP = pp.clone().sub(bp)
      toP.y = 0
      const dist = toP.length()

      if (dist > 0.5) {
        toP.normalize()
        bot.group.lookAt(pp.x, bp.y, pp.z)
        const strafe = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(bot.strafe * 0.42)
        const speed = dist > 14 ? 6.5 : dist < 6 ? 4 : 7.5
        bot.vel.x = toP.x * speed + strafe.x
        bot.vel.z = toP.z * speed + strafe.z
      } else {
        bot.vel.x *= 0.85
        bot.vel.z *= 0.85
      }

      bot.vel.y += GRAVITY * dt
      const botGround = moveCapsule(bot.group.position, bot.vel, colliders, 0.36, BOT_FEET, dt)
      if (botGround && bot.jumpCd <= 0 && dist > 8 && Math.random() < 0.015) {
        bot.vel.y = JUMP * 0.85
        bot.jumpCd = 1.4
      }
      if (botGround && Math.random() < 0.006) bot.strafe *= -1

      const aimFrom = bp.clone().add(new THREE.Vector3(0, 0.55, 0))
      if (dist < 32 && bot.shootCd <= 0 && canSee(aimFrom, pp, wallMeshes)) {
        bot.shootCd = 0.95 + Math.random() * 0.7
        const aim = pp.clone().sub(aimFrom).normalize()
        if (dist > 10 && Math.random() > 0.35) {
          fireRocket(bot.id, aimFrom, aim)
        } else {
          fireMg(aimFrom, aim, bot.id)
        }
      }
    }

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]!
      r.life -= dt
      r.mesh.position.addScaledVector(r.vel, dt)
      if (Math.random() > 0.4) {
        spawnParticles(r.mesh.position.clone(), 1, 0xffaa44, 1.5, 0.05)
      }

      let hit = false
      for (const box of colliders) {
        if (box.containsPoint(r.mesh.position)) hit = true
      }
      for (const bot of bots) {
        if (bot.health > 0 && r.mesh.position.distanceTo(bot.group.position) < 1) hit = true
      }
      if (r.owner === 'player' && r.mesh.position.distanceTo(controls.object.position) < 0.75) hit = false
      if (r.owner !== 'player' && r.mesh.position.distanceTo(controls.object.position) < 1) hit = true

      if (hit || r.life <= 0) {
        spawnExplosion(r.mesh.position.clone(), 4.5, 100, r.owner)
        scene.remove(r.mesh)
        rockets.splice(i, 1)
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      p.life -= dt
      p.vel.y -= 12 * dt
      p.mesh.position.addScaledVector(p.vel, dt)
      const mat = p.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, p.life * 2)
      if (p.life <= 0) {
        scene.remove(p.mesh)
        particles.splice(i, 1)
      }
    }

    pushHud(controls.isLocked)
    renderer.render(scene, camera)
  }

  raf = requestAnimationFrame(tick)
  pushHud(false)

  return {
    dispose: () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      controls.removeEventListener('lock', onLock)
      controls.removeEventListener('unlock', onUnlock)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      controls.disconnect()
      floorTex.dispose()
      renderer.dispose()
      audio.dispose()
      container.removeChild(renderer.domElement)
    },
    requestLock: () => {
      audio.resume()
      if (!controls.isLocked) controls.lock()
    },
  }
}

function makeGridTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#4a4038'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(30, 110, 220, 0.22)'
  ctx.lineWidth = 2
  const step = size / 16
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(size, i * step)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(12, 12)
  return tex
}
