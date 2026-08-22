import * as THREE from 'three'

export const ARENA_LIMIT = 21.2

export function clampArena(pos: THREE.Vector3, radius: number) {
  pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_LIMIT + radius, ARENA_LIMIT - radius)
  pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_LIMIT + radius, ARENA_LIMIT - radius)
}

/** pos.y = высота «якоря»; feetOffset — расстояние вниз до ног */
export function moveCapsule(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: THREE.Box3[],
  radius: number,
  feetOffset: number,
  dt: number,
): boolean {
  let onGround = false
  const next = pos.clone().addScaledVector(vel, dt)
  const half = radius
  const headClear = 0.35

  for (const box of colliders) {
    const min = box.min
    const max = box.max

    const bodyBottom = next.y - feetOffset
    const bodyTop = next.y + headClear

    const inX = next.x + half > min.x && next.x - half < max.x
    const inZ = next.z + half > min.z && next.z - half < max.z

    if (inX && inZ && vel.y <= 0 && bodyBottom <= max.y + 0.08 && bodyBottom >= min.y - 0.35) {
      next.y = max.y + feetOffset
      vel.y = 0
      onGround = true
    }

    if (bodyTop > min.y + 0.15 && bodyBottom < max.y - 0.05 && inZ) {
      if (next.x + half > min.x && next.x < min.x + half && vel.x > 0) {
        next.x = min.x - half
        vel.x = 0
      } else if (next.x - half < max.x && next.x > max.x - half && vel.x < 0) {
        next.x = max.x + half
        vel.x = 0
      }
    }

    if (bodyTop > min.y + 0.15 && bodyBottom < max.y - 0.05 && inX) {
      if (next.z + half > min.z && next.z < min.z + half && vel.z > 0) {
        next.z = min.z - half
        vel.z = 0
      } else if (next.z - half < max.z && next.z > max.z - half && vel.z < 0) {
        next.z = max.z + half
        vel.z = 0
      }
    }
  }

  clampArena(next, half)
  pos.copy(next)
  return onGround
}

export function canSee(from: THREE.Vector3, to: THREE.Vector3, wallMeshes: THREE.Mesh[]) {
  const dir = to.clone().sub(from)
  const dist = dir.length()
  if (dist < 0.5) return true
  dir.normalize()
  const ray = new THREE.Raycaster(from, dir, 0, dist - 0.4)
  return ray.intersectObjects(wallMeshes, false).length === 0
}

export function randomSpawnPoint(): THREE.Vector3 {
  for (let i = 0; i < 12; i++) {
    const x = (Math.random() - 0.5) * 26
    const z = (Math.random() - 0.5) * 26
    if (Math.abs(x) > 3 || Math.abs(z) > 3) return new THREE.Vector3(x, 0, z)
  }
  return new THREE.Vector3(-12, 0, -12)
}
