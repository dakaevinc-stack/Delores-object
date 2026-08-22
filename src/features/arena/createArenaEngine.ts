import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

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
  name: string
  color: number
}

type Rocket = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
  owner: 'player' | number
}

const ARENA = 22
const EYE = 1.65
const RADIUS = 0.42
const GRAVITY = -28
const JUMP = 9.2
const SPEED = 13.5
const AIR = 0.32

export function createArenaEngine(
  container: HTMLElement,
  onHud: (state: ArenaHudState) => void,
): { dispose: () => void; requestLock: () => void } {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a3a5c)
  scene.fog = new THREE.Fog(0x1a3a5c, 18, 58)

  const camera = new THREE.PerspectiveCamera(
    95,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.08,
    120,
  )

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  container.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0x7eb8ff, 0x2a1810, 0.55))
  const sun = new THREE.DirectionalLight(0xffe0c0, 1.15)
  sun.position.set(12, 22, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 60
  sun.shadow.camera.left = -28
  sun.shadow.camera.right = 28
  sun.shadow.camera.top = 28
  sun.shadow.camera.bottom = -28
  scene.add(sun)

  const rim = new THREE.PointLight(0x2f8cff, 1.4, 40, 2)
  rim.position.set(-8, 6, -10)
  scene.add(rim)

  const colliders: THREE.Box3[] = []
  const wallMeshes: THREE.Mesh[] = []
  const matFloor = new THREE.MeshStandardMaterial({
    color: 0x4a4038,
    roughness: 0.82,
    metalness: 0.08,
  })
  const matWall = new THREE.MeshStandardMaterial({
    color: 0x6b5a48,
    roughness: 0.75,
    metalness: 0.12,
  })
  const matTrim = new THREE.MeshStandardMaterial({
    color: 0x1e6fd9,
    emissive: 0x0a3d80,
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.55,
  })
  const matMetal = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    roughness: 0.35,
    metalness: 0.85,
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

  const floor = addBox(0, -0.25, 0, ARENA * 2 + 4, 0.5, ARENA * 2 + 4, matFloor)
  floor.receiveShadow = true

  addBox(0, 0, -ARENA, ARENA * 2, 5, 0.6, matWall)
  addBox(0, 0, ARENA, ARENA * 2, 5, 0.6, matWall)
  addBox(-ARENA, 0, 0, 0.6, 5, ARENA * 2, matWall)
  addBox(ARENA, 0, 0, 0.6, 5, ARENA * 2, matWall)

  addBox(-10, 0, -10, 4, 2.2, 4, matMetal)
  addBox(10, 0, 10, 5, 1.4, 3, matMetal)
  addBox(0, 0, 0, 6, 3, 6, matWall)
  addBox(-6, 3, 0, 4, 0.35, 8, matTrim, false)
  addBox(8, 0, -6, 3, 4, 3, matTrim)
  addBox(-14, 0, 12, 2.5, 1.8, 6, matMetal)
  addBox(14, 0, -12, 2.5, 1.8, 6, matMetal)

  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.4, 8),
    matMetal,
  )
  ramp.position.set(6, 0.8, -4)
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
  let vel = new THREE.Vector3()
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
  const botNames = ['Sarge', 'Xaero', 'Orbb', 'Slash']
  const botColors = [0xc45c2a, 0x3d8cff, 0x9b59b6, 0x2ecc71]

  function makeBot(i: number, x: number, z: number): Bot {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({
        color: botColors[i % botColors.length],
        roughness: 0.45,
        metalness: 0.25,
        emissive: botColors[i % botColors.length],
        emissiveIntensity: 0.08,
      }),
    )
    body.castShadow = true
    group.add(body)
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x111822,
        emissive: 0x2f8cff,
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.2,
      }),
    )
    visor.position.set(0, 0.35, 0.28)
    group.add(visor)
    group.position.set(x, EYE - 0.9, z)
    scene.add(group)
    return {
      id: i,
      group,
      body,
      health: 100,
      vel: new THREE.Vector3(),
      shootCd: 0.8 + Math.random(),
      strafe: Math.random() > 0.5 ? 1 : -1,
      name: botNames[i % botNames.length]!,
      color: botColors[i % botColors.length]!,
    }
  }

  bots.push(makeBot(0, -14, -14))
  bots.push(makeBot(1, 14, 14))
  bots.push(makeBot(2, -14, 14))
  bots.push(makeBot(3, 14, -14))

  controls.object.position.set(0, EYE, 16)

  function respawnPlayer() {
    controls.object.position.set(0, EYE, 16)
    vel.set(0, 0, 0)
    health = 100
    armor = 50
    ammoMg = 200
    ammoRocket = 25
    spawnInvuln = 2
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
    if (health <= 0) {
      health = 0
      deaths += 1
      respawnPlayer()
    }
  }

  function flashBot(bot: Bot) {
    const mat = bot.body.material as THREE.MeshStandardMaterial
    const prev = mat.emissiveIntensity
    mat.emissive.setHex(0xffffff)
    mat.emissiveIntensity = 0.45
    window.setTimeout(() => {
      if (bot.health > 0) {
        mat.emissive.setHex(bot.color)
        mat.emissiveIntensity = prev
      }
    }, 80)
  }

  function damageBot(bot: Bot, amount: number) {
    if (bot.health <= 0) return
    bot.health -= amount
    flashBot(bot)
    if (bot.health <= 0) {
      scene.remove(bot.group)
      frags += 1
      const idx = bots.indexOf(bot)
      if (idx >= 0) bots.splice(idx, 1)
      window.setTimeout(() => {
        bots.push(makeBot(bot.id, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28))
      }, 2400)
    }
  }

  function spawnExplosion(pos: THREE.Vector3, radius: number, damage: number, owner: 'player' | number) {
    const geo = new THREE.SphereGeometry(0.4, 12, 12)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.85,
    })
    const fx = new THREE.Mesh(geo, mat)
    fx.position.copy(pos)
    scene.add(fx)
    let t = 0
    const tickFx = () => {
      t += 0.05
      const s = 1 + t * 6
      fx.scale.setScalar(s)
      mat.opacity = Math.max(0, 0.85 - t * 0.7)
      if (t < 0.5) requestAnimationFrame(tickFx)
      else scene.remove(fx)
    }
    requestAnimationFrame(tickFx)

    if (owner !== 'player') {
      const dist = pos.distanceTo(controls.object.position)
      if (dist < radius) damagePlayer((1 - dist / radius) * damage)
    }
    for (const bot of bots) {
      if (bot.health <= 0) continue
      const dist = pos.distanceTo(bot.group.position)
      if (dist < radius) {
        const falloff = 1 - dist / radius
        if (owner === 'player') damageBot(bot, damage * falloff)
        else if (typeof owner === 'number' && owner !== bot.id) damageBot(bot, damage * falloff * 0.5)
      }
    }
  }

  function fireRocket(owner: 'player' | number, origin: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.5, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff6622,
        emissive: 0xff4400,
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.2,
      }),
    )
    mesh.position.copy(origin)
    mesh.lookAt(origin.clone().add(dir))
    scene.add(mesh)
    rockets.push({
      mesh,
      vel: dir.clone().normalize().multiplyScalar(28),
      life: 4,
      owner,
    })
  }

  function fireMg(origin: THREE.Vector3, dir: THREE.Vector3, owner: 'player' | number) {
    const aim = dir.clone().normalize()
    const ray = new THREE.Raycaster(origin, aim, 0, 80)
    if (owner === 'player') {
      const hits = ray.intersectObjects(
        bots.filter((b) => b.health > 0).map((b) => b.body),
        false,
      )
      if (hits[0]) {
        const bot = bots.find((b) => b.body === hits[0]!.object)
        if (bot) damageBot(bot, 8)
      }
    } else {
      const playerPos = controls.object.position
      const toPlayer = playerPos.clone().sub(origin)
      const proj = toPlayer.dot(aim)
      if (proj > 0 && proj < 80) {
        const closest = origin.clone().add(aim.clone().multiplyScalar(proj))
        if (closest.distanceTo(playerPos) < 1.1 && canSee(origin, playerPos)) {
          damagePlayer(7)
        }
      }
    }
    if (owner === 'player') {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }),
      )
      spark.position.copy(origin).add(aim.clone().multiplyScalar(1.2))
      scene.add(spark)
      window.setTimeout(() => scene.remove(spark), 40)
    }
  }

  function canSee(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = to.clone().sub(from)
    const dist = dir.length()
    if (dist < 0.6) return true
    dir.normalize()
    const ray = new THREE.Raycaster(from, dir, 0, dist - 0.35)
    const hits = ray.intersectObjects(wallMeshes, false)
    return hits.length === 0
  }

  function resolveCapsule(pos: THREE.Vector3, velIn: THREE.Vector3, dt: number) {
    const next = pos.clone().addScaledVector(velIn, dt)
    const half = RADIUS
    for (const box of colliders) {
      const min = box.min.clone()
      const max = box.max.clone()
      min.y -= 0.01
      if (next.x + half > min.x && next.x - half < max.x && next.z + half > min.z && next.z - half < max.z) {
        if (next.y - EYE + 0.9 > min.y && next.y - EYE < max.y) {
          if (velIn.x > 0) next.x = min.x - half
          else if (velIn.x < 0) next.x = max.x + half
        }
      }
      if (next.y - EYE + 0.9 > min.y && next.y - EYE < max.y && next.x + half > min.x && next.x - half < max.x) {
        if (velIn.z > 0) next.z = min.z - half
        else if (velIn.z < 0) next.z = max.z + half
      }
      const feet = next.y - EYE
      if (
        next.x + half > min.x &&
        next.x - half < max.x &&
        next.z + half > min.z &&
        next.z - half < max.z &&
        feet <= max.y &&
        feet >= min.y - 0.2 &&
        velIn.y <= 0
      ) {
        next.y = max.y + EYE
        velIn.y = 0
        onGround = true
      }
    }
    pos.copy(next)
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
    if (e.code === 'Digit1') weapon = 'mg'
    if (e.code === 'Digit2') weapon = 'rocket'
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
  const onLock = () => pushHud(true)
  const onUnlock = () => pushHud(false)
  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / Math.max(h, 1)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const onClick = () => {
    if (!controls.isLocked) controls.lock()
  }
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = true
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)
  controls.addEventListener('lock', onLock)
  controls.addEventListener('unlock', onUnlock)
  renderer.domElement.addEventListener('click', onClick)
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)

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
      forward.normalize()
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      const wish = new THREE.Vector3()
      if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(forward)
      if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(forward)
      if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right)
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right)
      if (wish.lengthSq() > 0) wish.normalize()

      const accel = onGround ? SPEED : SPEED * AIR
      vel.x += wish.x * accel * dt * 6
      vel.z += wish.z * accel * dt * 6

      if (onGround) {
        vel.x *= 0.86
        vel.z *= 0.86
        if (keys.has('Space')) {
          vel.y = JUMP
          onGround = false
        }
      } else {
        vel.y += GRAVITY * dt
      }

      onGround = false
      resolveCapsule(controls.object.position, vel, dt)

      if (mouseDown) {
        const dir = new THREE.Vector3()
        camera.getWorldDirection(dir)
        const origin = controls.object.position.clone()
        if (weapon === 'rocket' && rocketCd <= 0 && ammoRocket > 0) {
          ammoRocket -= 1
          rocketCd = 0.85
          fireRocket('player', origin, dir)
        } else if (weapon === 'mg' && mgCd <= 0 && ammoMg > 0) {
          ammoMg -= 1
          mgCd = 0.09
          fireMg(origin, dir, 'player')
        }
      }
    }

    for (const bot of bots) {
      if (bot.health <= 0) continue
      bot.shootCd -= dt
      const pp = controls.object.position
      const bp = bot.group.position
      const toP = pp.clone().sub(bp)
      toP.y = 0
      const dist = toP.length()
      if (dist > 0.4) {
        toP.normalize()
        bot.group.lookAt(pp.x, bp.y, pp.z)
        const strafe = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(bot.strafe * 0.35)
        bot.vel.copy(toP).multiplyScalar(5.5).add(strafe)
      } else {
        bot.vel.multiplyScalar(0.8)
      }
      bot.vel.y += GRAVITY * dt
      let bonGround = false
      const bnext = bp.clone().addScaledVector(bot.vel, dt)
      for (const box of colliders) {
        if (
          bnext.x + 0.35 > box.min.x &&
          bnext.x - 0.35 < box.max.x &&
          bnext.z + 0.35 > box.min.z &&
          bnext.z - 0.35 < box.max.z &&
          bnext.y - 0.9 > box.min.y &&
          bnext.y - 0.9 < box.max.y &&
          bot.vel.y <= 0
        ) {
          bnext.y = box.max.y + 0.9
          bot.vel.y = 0
          bonGround = true
        }
      }
      if (bonGround && Math.random() < 0.004) bot.strafe *= -1
      bot.group.position.copy(bnext)

      if (dist < 28 && bot.shootCd <= 0 && canSee(bp.clone().add(new THREE.Vector3(0, 0.4, 0)), pp)) {
        bot.shootCd = 1.1 + Math.random() * 0.8
        const aim = pp.clone().sub(bp).normalize()
        if (Math.random() > 0.45) fireRocket(bot.id, bp.clone().add(new THREE.Vector3(0, 0.5, 0)), aim)
        else fireMg(bp.clone().add(new THREE.Vector3(0, 0.5, 0)), aim, bot.id)
      }
    }

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]!
      r.life -= dt
      r.mesh.position.addScaledVector(r.vel, dt)
      let hit = false
      for (const box of colliders) {
        if (box.containsPoint(r.mesh.position)) hit = true
      }
      for (const bot of bots) {
        if (bot.health > 0 && r.mesh.position.distanceTo(bot.group.position) < 0.9) hit = true
      }
      if (r.owner === 'player' && r.mesh.position.distanceTo(controls.object.position) < 0.9) hit = false
      if (r.owner !== 'player' && r.mesh.position.distanceTo(controls.object.position) < 0.9) hit = true
      if (hit || r.life <= 0) {
        spawnExplosion(r.mesh.position.clone(), 4.2, 95, r.owner)
        scene.remove(r.mesh)
        rockets.splice(i, 1)
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
      window.removeEventListener('mouseup', onMouseUp)
      controls.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    },
    requestLock: () => {
      if (!controls.isLocked) controls.lock()
    },
  }
}
