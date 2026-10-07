import * as THREE from 'three'
import { BLASTER_PACK } from '../assets'
import { box, decal, drawnTexture, glow, lit, type Builder } from './kit'
import { kitModel } from './nature'

/*
 * Stand de tir de la cale, à la place de l'ancienne baie de réparation : le pas de tir (un comptoir
 * qui traverse la pièce), le couloir de tir et son pare-balles, le râtelier où l'on prend une arme,
 * les caisses de munitions. Armes et caisses viennent du Blaster Kit de Kenney (cf.
 * scripts/import-kenney-blaster.mjs) ; les cibles, elles, sont sorties par le jeu (cf. src/range.ts).
 */

const C = {
  steel: '#4a4f58',
  steelDark: '#2a2d33',
  rubber: '#1b1c20',
  top: '#3a3d44',
  hazard: '#e9a917',
  black: '#17181b',
  plaque: '#23262c',
}

const blaster = (file: string, s: number, x = 0, z = 0, turn = 0, y = 0) => kitModel(file, s, x, z, turn, y, { pack: BLASTER_PACK })

/** Largeur de la pièce entre ses murs (cf. SHOOTING_RANGE) : le comptoir et le pare-balles vont de l'un à l'autre. */
const WIDTH = 4.7
/** Couloirs de tir. */
const LANES = 4

/** Pas de tir : un comptoir bas, d'un mur à l'autre, liseré de danger côté tireur, un numéro par couloir. */
const rangeCounter: Builder = () => {
  const g = new THREE.Group()
  g.add(box(WIDTH, 0.29, 0.24, lit(C.steelDark, 'metal'), 0, 0.145, 0), box(WIDTH, 0.03, 0.34, lit(C.top), 0, 0.305, 0))
  // Liseré jaune et noir sur le chant, côté tireur.
  const seg = WIDTH / 46
  for (let i = 0; i < 46; i++) g.add(box(seg, 0.032, 0.012, lit(i % 2 ? C.black : C.hazard), -WIDTH / 2 + (i + 0.5) * seg, 0.305, 0.176))
  const numbers = drawnTexture(1024, 64, (c) => {
    c.fillStyle = '#e8ebf0'
    c.font = '700 44px ui-monospace, Menlo, monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = 0; i < LANES; i++) c.fillText(String(i + 1).padStart(2, '0'), (1024 * (i + 0.5)) / LANES, 34)
  })
  const live = new THREE.Group()
  live.add(decal(numbers, WIDTH, 0.29, 0.322))
  // Chargeurs oubliés sur le comptoir.
  g.add(blaster('clip-small', 0.42, -1.5, -0.04, 0.5, 0.32), blaster('clip-large', 0.42, 0.95, 0.03, 1.9, 0.32), blaster('clip-small', 0.42, 1.08, -0.05, 0.2, 0.32))
  return { solid: g, live }
}

/**
 * Couloir de tir, côté cibles (origine au pied du mur du fond, contenu vers +z) : les plaques
 * d'acier inclinées du pare-balles contre le mur, et au sol les lignes des couloirs, les distances
 * et les fentes d'où sortent les cibles.
 */
const rangeLane: Builder = () => {
  const g = new THREE.Group()
  const depth = 2.48
  // Pare-balles : un cadre, des plaques inclinées vers le bas.
  g.add(box(WIDTH, 0.06, 0.1, lit(C.steelDark, 'metal'), 0, 0.03, 0.05), box(WIDTH, 0.05, 0.1, lit(C.steelDark, 'metal'), 0, 0.975, 0.05))
  for (let i = 0; i < 6; i++) {
    const plate = box(WIDTH - 0.04, 0.17, 0.02, lit(i % 2 ? C.rubber : '#24262b', 'metal'), 0, 0.14 + i * 0.15, 0.055)
    plate.rotation.x = 0.35
    g.add(plate)
  }
  for (const x of [-WIDTH / 2 + 0.03, WIDTH / 2 - 0.03]) g.add(box(0.06, 1, 0.1, lit(C.hazard), x, 0.5, 0.05))
  const floor = drawnTexture(1024, 544, (c) => {
    c.fillStyle = '#16181c'
    c.globalAlpha = 0.55
    c.fillRect(0, 0, 1024, 544)
    c.globalAlpha = 1
    c.strokeStyle = '#e9a917'
    c.lineWidth = 5
    c.setLineDash([26, 18])
    for (let i = 1; i < LANES; i++) {
      c.beginPath(); c.moveTo((1024 * i) / LANES, 0); c.lineTo((1024 * i) / LANES, 544); c.stroke()
    }
    c.setLineDash([])
    // Fentes des cibles (cf. ROWS dans src/range.ts) et distances au pas de tir.
    c.font = '700 30px ui-monospace, Menlo, monospace'
    c.textBaseline = 'middle'
    ;[[0.2, '25'], [1.0, '15'], [1.8, '10']].forEach(([z, label]) => {
      const y = ((z as number) / depth) * 544
      c.fillStyle = '#07080a'
      c.fillRect(28, y - 5, 968, 10)
      c.fillStyle = '#c9ced6'
      c.fillText(`${label} m`, 36, y + 28)
    })
    c.strokeStyle = '#c9ced6'
    c.lineWidth = 6
    c.strokeRect(3, 3, 1018, 538)
  })
  const live = new THREE.Group()
  const marks = decal(floor, WIDTH, depth)
  marks.position.z = depth / 2 + 0.02
  live.add(marks)
  return { solid: g, live }
}

/**
 * Râtelier mural (dos au mur, contenu vers +z) : une plaque, cinq armes du kit couchées dessus,
 * un bandeau lumineux. C'est là qu'on prend une arme (cf. main.ts).
 */
const rangeRack: Builder = () => {
  const g = new THREE.Group()
  g.add(box(1.5, 0.66, 0.03, lit(C.plaque), 0, 0.62, 0.015, 0.01), box(1.44, 0.6, 0.006, lit('#30343b'), 0, 0.62, 0.032))
  const guns: [string, number, number][] = [
    ['blaster-e', -0.36, 0.79], ['blaster-d', 0.4, 0.8],
    ['blaster-a', -0.5, 0.52], ['blaster-b', -0.08, 0.53], ['blaster-h', 0.3, 0.53], ['blaster-l', 0.58, 0.52],
  ]
  for (const [file, x, y] of guns) {
    const gun = blaster(file, 0.44, x, 0.075, Math.PI / 2)
    // Centrée sur sa hauteur, plutôt que posée dessus.
    gun.position.y = y - new THREE.Box3().setFromObject(gun).getSize(new THREE.Vector3()).y / 2
    g.add(gun)
    g.add(box(0.03, 0.02, 0.07, lit(C.steel, 'metal'), x - 0.05, y - 0.06, 0.06), box(0.03, 0.02, 0.07, lit(C.steel, 'metal'), x + 0.06, y - 0.06, 0.06))
  }
  // Tablette et chargeurs.
  g.add(box(1.5, 0.025, 0.14, lit(C.steel, 'metal'), 0, 0.27, 0.07))
  for (const x of [-0.6, -0.5, -0.4, 0.45, 0.56]) g.add(blaster(x < 0 ? 'clip-large' : 'clip-small', 0.4, x, 0.07, 0, 0.283))
  const live = new THREE.Group()
  live.add(box(1.44, 0.014, 0.012, glow('#ff8a1c'), 0, 0.965, 0.03))
  return { solid: g, live }
}

/** Caisse de munitions du kit, couvercle ouvert (`label` : `medium` pour la courte). */
const rangeCrate: Builder = ({ label }) => ({ solid: blaster(label === 'medium' ? 'crate-medium' : 'crate-wide', 0.62) })

export const RANGE = {
  'range-counter': rangeCounter,
  'range-lane': rangeLane,
  'range-rack': rangeRack,
  'range-crate': rangeCrate,
} satisfies Record<string, Builder>
