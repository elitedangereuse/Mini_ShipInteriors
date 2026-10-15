import * as THREE from 'three'
import { box, cylinder, drawnTexture, glow, lit, mesh, part, type Builder } from './kit'
import { rushLogo } from './mess-decor'
import { COUNTER_TOP, KITCHEN_FLOOR, MESS_BOUNDS, SERVICE_COUNTER, STATIONS } from '../../shared/mess-rush.js'

/*
 * La cuisine de MESS RUSH (cf. shared/mess-rush.js et mess-rush/level.ts), à l'échelle de ses
 * cuisiniers (0,67 m) : des meubles bas (dessus à 0,34 m, comme dans Overcooked), sans hotte ni
 * crédence ni étagère qui leur arriverait à la tête. Son sol (le carrelage, les tapis des postes, le
 * logo au milieu et, derrière le comptoir de service, l'allée des clients), ses comptoirs, ses caisses
 * d'ingrédients, ses fourneaux et sa plonge.
 */

const C = {
  steel: '#c6ccd4',
  steelMid: '#9aa3ae',
  steelDark: '#565e69',
  black: '#1b1d22',
  orange: '#ff8a1c',
  navy: '#1a2233',
  tile: '#eef2f4',
  joint: '#cdd6da',
  mat: '#23262d',
  matDot: '#3a3f49',
  lane: '#2b3140',
  laneEdge: '#ffc93c',
  wood: '#b07a45',
  woodDark: '#7a5230',
}

const TOP = COUNTER_TOP

/** Pixels par mètre du sol dessiné. */
const PX = 128

/**
 * Le sol de la cuisine, d'un seul tenant, dessiné en coordonnées de l'instance. Au sud du nord, le
 * carrelage blanc, un tapis de caoutchouc devant chaque poste ; derrière le comptoir de service,
 * l'allée des clients, sombre, bordée de jaune, fléchée vers la sortie. Au milieu, le logo de MESS RUSH.
 */
const rushFloor: Builder = () => {
  const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = MESS_BOUNDS
  const w = x1 - x0, d = z1 - z0
  const map = drawnTexture(Math.round(w * PX), Math.round(d * PX), (g) => {
    g.scale(PX, PX)
    g.translate(-x0, -z0)
    // L'allée des clients, derrière le comptoir de service.
    g.fillStyle = C.lane
    g.fillRect(x0, z0, w, SERVICE_COUNTER.minZ - z0)
    g.fillStyle = C.laneEdge
    g.fillRect(SERVICE_COUNTER.minX, z0 + 0.12, x1 - SERVICE_COUNTER.minX, 0.04)
    g.fillStyle = '#3d4558'
    for (let x = SERVICE_COUNTER.minX + 0.6; x < x1 - 0.4; x += 1.1) {
      const z = (z0 + SERVICE_COUNTER.minZ) / 2
      g.beginPath()
      g.moveTo(x - 0.2, z)
      g.lineTo(x + 0.05, z - 0.2)
      g.lineTo(x + 0.05, z - 0.08)
      g.lineTo(x + 0.25, z - 0.08)
      g.lineTo(x + 0.25, z + 0.08)
      g.lineTo(x + 0.05, z + 0.08)
      g.lineTo(x + 0.05, z + 0.2)
      g.closePath()
      g.fill()
    }
    // Le carrelage de la cuisine.
    const k0 = KITCHEN_FLOOR.minZ - 0.6
    g.fillStyle = C.tile
    g.fillRect(x0, k0, w, z1 - k0)
    g.fillStyle = C.joint
    for (let x = x0; x <= x1; x += 0.25) g.fillRect(x - 0.004, k0, 0.008, z1 - k0)
    for (let z = k0; z <= z1; z += 0.25) g.fillRect(x0, z - 0.004, w, 0.008)
    // Les tapis, devant les postes où l'on travaille debout (planches, fourneaux, plonge, passe).
    const mat = (x: number, z: number, mw: number, md: number) => {
      g.fillStyle = C.mat
      g.fillRect(x - mw / 2, z - md / 2, mw, md)
      g.fillStyle = C.matDot
      for (let j = 0; j < Math.floor(md / 0.09); j++) for (let i = 0; i < Math.floor(mw / 0.08) - (j % 2); i++) {
        g.beginPath()
        g.arc(x - mw / 2 + 0.04 + i * 0.08 + (j % 2) * 0.04, z - md / 2 + 0.05 + j * 0.09, 0.022, 0, Math.PI * 2)
        g.fill()
      }
    }
    for (const s of STATIONS) {
      if (!['board', 'pot', 'pan', 'sink', 'pass', 'plates'].includes(s.kind)) continue
      if (s.x > 16.8) mat(16.6, s.z, 0.32, 0.7)
      else if (s.z > 11.5) mat(s.x, 11.6, 0.6, 0.32)
      else mat(s.x, 8.55, 0.7, 0.32)
    }
  })
  map.anisotropy = 8
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  // Le logo, peint au milieu du sol, que la cuisine laisse libre.
  const live = new THREE.Group()
  const logo = mesh(new THREE.PlaneGeometry(1.8, 1.8 * (778 / 1024)), new THREE.MeshBasicMaterial({ map: rushLogo(), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 12.5 - (x0 + x1) / 2, 0.009, 10.35 - (z0 + z1) / 2)
  logo.rotation.x = -Math.PI / 2
  logo.rotation.z = Math.PI
  live.add(logo)
  return { solid: g, live }
}

/** Un caisson bas : le corps, le socle noir, le dessus inox, la baguette orange en façade (vers +z). */
function carcass(g: THREE.Group, W: number, D: number, faces: number[] = [1]) {
  g.add(box(W, TOP - 0.05, D - 0.04, lit(C.steelMid, 'metal'), 0, (TOP - 0.05) / 2 + 0.025, 0))
  g.add(box(W - 0.02, 0.05, D - 0.08, lit(C.black), 0, 0.025, 0))
  g.add(box(W + 0.02, 0.03, D, lit(C.steel, 'metal'), 0, TOP - 0.015, 0))
  for (const f of faces) g.add(box(W, 0.012, 0.012, glow(C.orange), 0, TOP - 0.035, f * (D / 2 + 0.004)))
}

/**
 * Un comptoir bas (`label` : « longueur|sorte ») : `wall`, adossé (dos à -z) ; `service`, le comptoir
 * de service, bandeau bleu nuit côté clients (-z) ; `island`, à deux faces. Des tiroirs en façade.
 * Le dessus reste libre : les postes y posent leurs objets (cf. mess-rush/props.ts).
 */
const rushCounter: Builder = ({ label = '1|wall' }) => {
  const [len, kind = 'wall'] = label.split('|')
  const W = Math.max(0.3, Number(len) || 1)
  const D = kind === 'service' ? 0.6 : 0.55
  const g = new THREE.Group()
  const faces = kind === 'island' ? [1, -1] : [1]
  carcass(g, W, D, faces)
  for (const f of faces) {
    for (let x = -W / 2 + 0.25; x < W / 2 - 0.15; x += 0.5) {
      g.add(box(0.4, 0.1, 0.01, lit(C.steel, 'metal'), x, TOP - 0.11, f * (D / 2 - 0.012)), box(0.1, 0.01, 0.012, lit(C.black), x, TOP - 0.1, f * (D / 2 - 0.002)))
    }
  }
  if (kind === 'service') g.add(box(W, 0.2, 0.012, lit(C.navy), 0, 0.16, -D / 2 - 0.002), box(W, 0.016, 0.014, glow(C.orange), 0, 0.27, -D / 2 - 0.004))
  return { solid: g }
}

/**
 * Une caisse d'ingrédients (`label` : la couleur de l'ingrédient) : du bois clair cerclé de sombre,
 * ouverte sur le dessus, un bandeau de sa couleur en façade (vers +z). L'ingrédient, en grand, est
 * posé dessus par mess-rush/props.ts : on voit d'un coup d'œil ce qu'elle contient.
 */
const rushCrate: Builder = ({ label = '#e8772a' }) => {
  const W = 0.66, D = 0.52
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood')
  const dark = lit(C.woodDark, 'wood')
  g.add(box(W, TOP - 0.02, D, wood, 0, (TOP - 0.02) / 2, 0, 0.015))
  for (const y of [0.08, 0.18, 0.28]) g.add(box(W + 0.01, 0.025, D + 0.01, dark, 0, y, 0))
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(box(0.05, TOP, 0.05, dark, x, TOP / 2, z))
  // L'intérieur sombre, et la paille.
  g.add(box(W - 0.08, 0.01, D - 0.08, lit('#3a2a1a'), 0, TOP - 0.015, 0), box(W - 0.12, 0.012, D - 0.12, lit('#d9b45a'), 0, TOP - 0.006, 0))
  g.add(box(W * 0.7, 0.07, 0.012, lit(label), 0, TOP * 0.55, D / 2 + 0.008))
  return { solid: g }
}

/**
 * Un fourneau bas à deux feux (dos à -z) : plaque noire, deux couronnes qui rougeoient, une rangée de
 * boutons en façade. La marmite ou la poêle de chaque feu est posée par mess-rush/props.ts.
 */
const rushStove: Builder = () => {
  const W = 1.38, D = 0.55
  const g = new THREE.Group()
  g.add(box(W, TOP - 0.03, D - 0.02, lit(C.steelDark, 'metal'), 0, (TOP - 0.03) / 2, -0.01), box(W - 0.02, 0.05, D - 0.06, lit(C.black), 0, 0.025, -0.02))
  g.add(box(W + 0.02, 0.03, D, lit(C.black), 0, TOP - 0.015, 0))
  for (const x of [-0.32, 0.32]) {
    const ring = mesh(new THREE.TorusGeometry(0.13, 0.012, 5, 24), glow('#ff5a1c'), x, TOP + 0.003, -0.02)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  }
  for (let i = 0; i < 4; i++) g.add(cylinder(0.022, 0.022, 0.02, lit(C.black), -0.48 + i * 0.32, TOP - 0.1, D / 2 + 0.005, 10).rotateX(Math.PI / 2))
  g.add(box(W, 0.012, 0.012, glow(C.orange), 0, TOP - 0.035, D / 2 + 0.004))
  return { solid: g, emitter: 'hum' }
}

/** La plonge basse (dos à -z) : un bac d'eau, un robinet court, l'égouttoir à côté. */
const rushSink: Builder = () => {
  const W = 1.1, D = 0.55
  const g = new THREE.Group()
  carcass(g, W, D)
  g.add(box(0.5, 0.02, 0.36, lit('#2c3138'), -0.2, TOP - 0.005, 0.02), box(0.46, 0.004, 0.32, lit('#7fb8d8'), -0.2, TOP - 0.012, 0.02))
  g.add(cylinder(0.012, 0.015, 0.12, lit(C.steel, 'metal'), -0.2, TOP + 0.06, -0.2, 8), box(0.02, 0.02, 0.1, lit(C.steel, 'metal'), -0.2, TOP + 0.12, -0.16))
  g.add(box(0.36, 0.015, 0.3, lit(C.steel, 'metal'), 0.3, TOP + 0.008, 0.02))
  for (let i = 0; i < 4; i++) g.add(box(0.008, 0.06, 0.28, lit(C.steelDark, 'metal'), 0.17 + i * 0.08, TOP + 0.04, 0.02))
  return { solid: g }
}

export const MESS_RUSH_FURNITURE = {
  'rush-floor': rushFloor,
  'rush-counter': rushCounter,
  'rush-crate': rushCrate,
  'rush-stove': rushStove,
  'rush-sink': rushSink,
} satisfies Record<string, Builder>
