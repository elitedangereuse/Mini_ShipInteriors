import * as THREE from 'three'
import { fabric } from './cozy'
import { box, cylinder, lit, mesh, sphere, type Builder } from './kit'

/*
 * Petits objets de salle de bain des quartiers : le canard en plastique, le gobelet à brosses
 * à dents, le dérouleur de papier (au mur), le tapis de bain moelleux. Face à +z ; un objet
 * accroché est construit dos au mur.
 */

/** Canard en plastique : corps, tête, bec orange. */
const rubberDuck: Builder = () => {
  const g = new THREE.Group()
  const yellow = lit('#ffd23c')
  const body = sphere(0.045, yellow, 0, 0.035, 0, 12)
  body.scale.set(1, 0.75, 1.25)
  g.add(body, sphere(0.028, yellow, 0, 0.083, 0.03, 12))
  const beak = mesh(new THREE.ConeGeometry(0.012, 0.03, 8), lit('#ff8a1c'), 0, 0.08, 0.062)
  beak.rotation.x = Math.PI / 2
  g.add(beak, sphere(0.006, lit('#16171b'), -0.014, 0.092, 0.05, 6), sphere(0.006, lit('#16171b'), 0.014, 0.092, 0.05, 6))
  // La queue retroussée.
  const tail = mesh(new THREE.ConeGeometry(0.018, 0.03, 8), yellow, 0, 0.055, -0.06)
  tail.rotation.x = -2.2
  g.add(tail)
  return { solid: g }
}

/** Gobelet à brosses à dents, et deux brosses de couleur. */
const toothbrushCup: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.03, 0.026, 0.08, lit('#9fd4e8'), 0, 0.04, 0, 12))
  for (const [x, col, a] of [[-0.01, '#ff5a7a', -0.2], [0.012, '#3bb0ff', 0.25]] as const) {
    const brush = new THREE.Group()
    brush.position.set(x, 0.05, 0)
    brush.rotation.z = a
    brush.add(box(0.008, 0.11, 0.008, lit(col), 0, 0.05, 0), box(0.01, 0.02, 0.012, lit('#f4f4f0'), 0, 0.1, 0.006))
    g.add(brush)
  }
  return { solid: g }
}

/** Dérouleur de papier toilette, accroché au mur, avec son rouleau. */
const toiletRoll: Builder = () => {
  const g = new THREE.Group()
  const chrome = lit('#c3c9d2')
  g.add(box(0.04, 0.04, 0.01, chrome, -0.07, 0.4, 0.005), box(0.04, 0.04, 0.01, chrome, 0.07, 0.4, 0.005))
  const bar = cylinder(0.005, 0.005, 0.14, chrome, 0, 0.4, 0.055, 6)
  bar.rotation.z = Math.PI / 2
  const roll = cylinder(0.045, 0.045, 0.1, lit('#f6f4ee'), 0, 0.4, 0.055, 14)
  roll.rotation.z = Math.PI / 2
  g.add(bar, roll, box(0.1, 0.08, 0.002, lit('#f6f4ee'), 0, 0.33, 0.1))
  for (const x of [-0.07, 0.07]) g.add(box(0.008, 0.008, 0.05, chrome, x, 0.4, 0.03))
  return { solid: g }
}

/** Tapis de bain moelleux, frangé, dans le tissu `label`. */
const bathMat: Builder = ({ label }) => {
  const g = new THREE.Group()
  const m = fabric(label, 'sage')
  g.add(box(0.62, 0.02, 0.4, m, 0, 0.01, 0, 0.008))
  // Bouclettes du tissu éponge, en relief.
  for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) g.add(sphere(0.018, m, -0.25 + i * 0.1, 0.02, -0.15 + k * 0.1, 5))
  return { solid: g }
}

export const BATH = {
  'rubber-duck': rubberDuck,
  'toothbrush-cup': toothbrushCup,
  'toilet-roll': toiletRoll,
  'bath-mat': bathMat,
} satisfies Record<string, Builder>
