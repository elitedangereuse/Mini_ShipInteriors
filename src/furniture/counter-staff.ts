import * as THREE from 'three'
import { box, compact, lit, sphere } from './kit'

/** Small jointed crew figures, sized like the commander's avatar. */
export function counterStaff(scientist: boolean, phase: number) {
  const root = new THREE.Group()
  root.name = scientist ? 'ljpc-scientist' : 'weekly-officer'
  const skin = lit(scientist ? '#bd8e71' : '#d2a184')
  const uniform = lit(scientist ? '#e7eef0' : '#35444e')
  const dark = lit('#26333e'), trim = lit(scientist ? '#49b7b0' : '#bda777')
  const fixed = new THREE.Group()
  for (const x of [-0.058, 0.058]) {
    fixed.add(box(0.075, 0.25, 0.085, dark, x, 0.205, -0.35, 0.012),
      box(0.086, 0.055, 0.13, lit('#1c2630'), x, 0.045, -0.325, 0.012))
  }
  root.add(compact(fixed))
  const torso = new THREE.Group(); torso.position.set(0, 0.35, -0.35)
  root.add(torso)
  const jacket = new THREE.Group()
  jacket.add(box(0.235, 0.235, 0.14, uniform, 0, 0.1, 0, 0.024),
    box(0.075, 0.16, 0.008, dark, 0, 0.13, 0.071),
    box(0.045, 0.045, 0.06, skin, 0, 0.233, 0))
  if (scientist) {
    for (const side of [-1, 1]) {
      const lapel = box(0.052, 0.13, 0.012, lit('#ffffff'), side * 0.047, 0.146, 0.079)
      lapel.rotation.z = side * -0.3; jacket.add(lapel)
    }
    jacket.add(box(0.017, 0.095, 0.012, trim, 0, 0.151, 0.082),
      box(0.053, 0.063, 0.012, lit('#ffffff'), 0.078, 0.102, 0.08),
      box(0.04, 0.017, 0.014, trim, 0.078, 0.117, 0.082),
      box(0.063, 0.034, 0.012, lit('#c4d4db'), -0.075, 0.025, 0.075))
  } else {
    jacket.add(box(0.24, 0.027, 0.146, dark, 0, 0.014, 0),
      box(0.027, 0.023, 0.01, trim, 0, 0.014, 0.079))
    for (const side of [-1, 1]) jacket.add(box(0.065, 0.016, 0.13, trim, side * 0.102, 0.215, 0))
    for (let i = 0; i < 3; i++) jacket.add(box(0.042, 0.007, 0.012, trim, 0.065, 0.125 + i * 0.014, 0.076))
  }
  torso.add(compact(jacket))
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.24; torso.add(head)
  const face = new THREE.Group()
  face.add(box(0.20, 0.205, 0.175, skin, 0, 0.091, 0, 0.035),
    box(0.028, 0.032, 0.024, skin, 0, 0.072, 0.092, 0.008),
    box(0.045, 0.005, 0.006, lit('#79574a'), 0, 0.036, 0.086))
  for (const x of [-0.103, 0.103]) face.add(sphere(0.023, skin, x, 0.085, 0, 8))
  if (scientist) {
    const hair = lit('#bfc7cb')
    face.add(box(0.207, 0.063, 0.173, hair, 0, 0.184, -0.02, 0.023))
    for (const x of [-0.082, 0.082]) face.add(box(0.042, 0.105, 0.16, hair, x, 0.14, -0.032, 0.012))
    for (const x of [-0.047, 0.047]) {
      face.add(box(0.079, 0.047, 0.01, dark, x, 0.103, 0.089, 0.008),
        box(0.062, 0.03, 0.011, lit('#a8d6dc'), x, 0.103, 0.095, 0.004))
    }
    face.add(box(0.025, 0.009, 0.013, dark, 0, 0.11, 0.094))
  } else {
    face.add(box(0.213, 0.072, 0.19, uniform, 0, 0.185, -0.008, 0.018),
      box(0.22, 0.013, 0.105, dark, 0, 0.155, 0.063, 0.008),
      box(0.024, 0.024, 0.009, trim, 0, 0.183, 0.092))
  }
  head.add(compact(face))
  const eyes = new THREE.Group(); eyes.position.set(0, 0.105, 0.103)
  for (const x of [-0.047, 0.047]) eyes.add(box(0.009, 0.014, 0.005, lit('#17222b'), x, 0, 0))
  head.add(eyes)
  const arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = []
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.145, 0.22, 0)
    shoulder.name = side < 0 ? 'left-arm' : 'right-arm'
    const sleeve = new THREE.Group()
    sleeve.add(box(0.075, 0.12, 0.078, uniform, 0, -0.05, 0, 0.018))
    shoulder.add(compact(sleeve)); torso.add(shoulder)
    const elbow = new THREE.Group(); elbow.position.y = -0.11; shoulder.add(elbow)
    const forearm = new THREE.Group()
    forearm.add(box(0.065, 0.11, 0.068, uniform, 0, -0.047, 0, 0.015),
      box(0.058, 0.047, 0.06, skin, 0, -0.119, 0, 0.013))
    if (scientist && side < 0) {
      forearm.add(box(0.13, 0.018, 0.10, dark, 0, -0.142, 0.025, 0.007),
        box(0.105, 0.004, 0.076, lit('#63c6c1'), 0, -0.153, 0.025, 0.004))
    }
    elbow.add(compact(forearm)); arms.push({ shoulder, elbow })
  }
  const update = (time: number) => {
    const t = time + phase
    torso.position.y = 0.35 + Math.sin(t * 1.7) * 0.003
    head.rotation.y = Math.sin(t * (scientist ? 0.48 : 0.29)) * (scientist ? 0.18 : 0.09)
    // Alternates looking down at the work and glancing back towards visitors.
    const working = (Math.sin(t * 0.52) + 1) / 2
    head.rotation.x = working * (scientist ? 0.15 : 0.07)
    eyes.scale.y = t % 4.9 < 0.12 ? 0.12 : 1
    arms.forEach(({ shoulder, elbow }, i) => {
      shoulder.rotation.x = -0.55 + Math.sin(t * 1.2 + i) * 0.025
      shoulder.rotation.z = i === 0 ? -0.08 : 0.08
      elbow.rotation.x = -0.85 + Math.sin(t * (scientist ? 2.1 : 2.8) + i * 1.8) * working * 0.055
    })
  }
  update(0)
  return { root, update }
}
