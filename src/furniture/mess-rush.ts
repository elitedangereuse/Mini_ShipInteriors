import * as THREE from 'three'
import { box, cylinder, drawnTexture, glow, lit, mesh, part, type Builder } from './kit'
import { rushLogo } from './mess-decor'
import { ISLAND, KITCHEN_FLOOR, MESS_BOUNDS, SERVICE_COUNTER, STATIONS } from '../../shared/mess-rush.js'

/*
 * La cuisine de MESS RUSH (cf. shared/mess-rush.js et mess-rush/level.ts) : la cuisine du mess,
 * seule, sans la salle du self. Son sol (le carrelage blanc, les tapis des postes, et derrière le
 * comptoir de service, l'allée où les clients font la queue), ses comptoirs (l'îlot, le comptoir
 * de service, les plans adossés), le four de comptoir et l'enseigne au logo de MESS RUSH.
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
}

/** Hauteur du dessus des comptoirs (cf. carcass dans kitchen.ts, et TOP dans mess-rush/props.ts). */
const TOP = 0.46

/** Pixels par mètre du sol dessiné. */
const PX = 128

/**
 * Le sol de la cuisine, d'un seul tenant, dessiné en coordonnées de l'instance. Au sud du comptoir
 * de service, le carrelage blanc, et un tapis de caoutchouc devant chaque poste (au mur et des deux
 * côtés de l'îlot). Au nord, l'allée des clients : sombre, bordée de jaune, fléchée vers la sortie
 * (l'ouest), où ils attendent leur plat.
 */
const rushFloor: Builder = () => {
  const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = MESS_BOUNDS
  const w = x1 - x0, d = z1 - z0
  const map = drawnTexture(Math.round(w * PX), Math.round(d * PX), (g) => {
    g.scale(PX, PX)
    g.translate(-x0, -z0)
    // L'allée des clients.
    g.fillStyle = C.lane
    g.fillRect(x0, z0, w, SERVICE_COUNTER.minZ - z0)
    g.fillStyle = C.laneEdge
    g.fillRect(x0, z0 + 0.12, w, 0.04)
    g.fillRect(x0, SERVICE_COUNTER.minZ - 0.16, w, 0.04)
    g.fillStyle = '#3d4558'
    for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.1) {
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
    // Les tapis, devant les postes : au mur du fond, de part et d'autre de l'îlot, devant le comptoir de service.
    const mat = (x: number, z: number, mw: number) => {
      g.fillStyle = C.mat
      g.fillRect(x - mw / 2, z, mw, 0.32)
      g.fillStyle = C.matDot
      for (let j = 0; j < 3; j++) for (let i = 0; i < Math.floor(mw / 0.08) - (j % 2); i++) {
        g.beginPath()
        g.arc(x - mw / 2 + 0.04 + i * 0.08 + (j % 2) * 0.04, z + 0.07 + j * 0.09, 0.022, 0, Math.PI * 2)
        g.fill()
      }
    }
    for (const s of STATIONS) {
      if (s.kind === 'trash' || s.kind === 'counter') continue
      if (s.z > 11.5) mat(s.x, 11.45, 0.8)
      else if (Math.abs(s.z - (ISLAND.minZ + ISLAND.maxZ) / 2) < 0.1) {
        mat(s.x, ISLAND.minZ - 0.38, 0.7)
        mat(s.x, ISLAND.maxZ + 0.06, 0.7)
      } else if (s.z < KITCHEN_FLOOR.minZ) mat(s.x, KITCHEN_FLOOR.minZ + 0.06, 0.8)
    }
    // Au bout de l'îlot, les passages : un seuil jaune et noir (à quatre, les portillons s'y ferment).
    for (const [a, b] of [[x0, ISLAND.minX], [ISLAND.maxX, x1]]) {
      for (let x = a, i = 0; x < b; x += 0.1, i++) {
        g.fillStyle = i % 2 ? '#1b1d22' : C.laneEdge
        g.fillRect(x, (ISLAND.minZ + ISLAND.maxZ) / 2 - 0.05, 0.1, 0.1)
      }
    }
  })
  map.anisotropy = 8
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

/**
 * Un comptoir de la cuisine (`label` : « longueur|sorte »), dessus inox à hauteur des postes (0,46),
 * une baguette orange tout du long :
 * - `island` : l'îlot, à deux faces, des tiroirs des deux côtés ;
 * - `service` : le comptoir de service, côté cuisine des étagères d'assiettes, côté clients un
 *   bandeau bleu nuit liseré d'orange ; au-dessus, la rampe des lampes chauffantes ;
 * - `wall` : un plan adossé (dos à -z).
 * Le dessus reste libre : les postes y posent leurs objets (cf. mess-rush/props.ts).
 */
const rushCounter: Builder = ({ label = '2|island' }) => {
  const [len, kind = 'island'] = label.split('|')
  const W = Math.max(0.4, Number(len) || 2)
  const D = kind === 'service' ? 0.6 : 0.55
  const g = new THREE.Group()
  const steel = lit(C.steel, 'metal')
  g.add(box(W, TOP - 0.06, D - 0.04, lit(C.steelMid, 'metal'), 0, (TOP - 0.06) / 2 + 0.03, 0))
  g.add(box(W - 0.02, 0.05, D - 0.08, lit(C.black), 0, 0.025, 0))
  g.add(box(W + 0.02, 0.03, D, steel, 0, TOP - 0.015, 0))
  const faces = kind === 'island' ? [1, -1] : kind === 'service' ? [1] : [1]
  for (const f of faces) {
    g.add(box(W, 0.012, 0.012, glow(C.orange), 0, TOP - 0.035, f * (D / 2 + 0.004)))
    // Des tiroirs, tous les 0,5 m.
    for (let x = -W / 2 + 0.27; x < W / 2 - 0.2; x += 0.5) {
      g.add(box(0.44, 0.13, 0.01, lit(C.steel, 'metal'), x, 0.33, f * (D / 2 - 0.012)), box(0.12, 0.012, 0.012, lit(C.black), x, 0.35, f * (D / 2 - 0.002)))
    }
  }
  if (kind === 'service') {
    // Côté clients (-z) : le bandeau bleu nuit, liseré d'orange.
    g.add(box(W, 0.3, 0.012, lit(C.navy), 0, 0.24, -D / 2 - 0.002), box(W, 0.02, 0.014, glow(C.orange), 0, 0.4, -D / 2 - 0.004))
    // La rampe des lampes chauffantes, sur ses montants.
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) g.add(cylinder(0.012, 0.012, 0.5, steel, x, TOP + 0.25, -0.12, 6))
    g.add(box(W, 0.03, 0.08, lit(C.steelDark, 'metal'), 0, TOP + 0.5, -0.12))
    for (let x = -W / 2 + 0.6; x < W / 2 - 0.4; x += 1.2) g.add(cylinder(0.035, 0.05, 0.06, lit(C.black), x, TOP + 0.46, -0.12, 10), cylinder(0.04, 0.04, 0.008, glow('#ff6a1c'), x, TOP + 0.428, -0.12, 10))
  }
  if (kind === 'wall') {
    // La crédence carrelée.
    g.add(box(W, 0.4, 0.012, lit('#dbe4e8'), 0, TOP + 0.2, -D / 2 - 0.004))
  }
  return { solid: g }
}

/**
 * Le four de comptoir (posé sur le comptoir de service, porte vers +z) : caisson inox, porte vitrée
 * où rougeoie la résistance, minuterie et boutons, pieds noirs.
 */
const rushOven: Builder = () => {
  const W = 0.66, D = 0.44, H = 0.4
  const g = new THREE.Group()
  g.add(box(W, H, D, lit(C.steelMid, 'metal'), 0, H / 2 + 0.03, 0, 0.02))
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) g.add(cylinder(0.018, 0.018, 0.03, lit(C.black), x, 0.015, z, 8))
  // La porte : le cadre, la vitre sombre, la lueur orange de la résistance, la poignée.
  g.add(box(0.46, 0.28, 0.015, lit(C.steelDark, 'metal'), -0.08, H / 2 + 0.03, D / 2 + 0.006))
  g.add(box(0.38, 0.2, 0.01, lit('#2a1a12'), -0.08, H / 2 + 0.03, D / 2 + 0.014), box(0.34, 0.03, 0.012, glow('#ff7a2a'), -0.08, H / 2 - 0.04, D / 2 + 0.016))
  g.add(box(0.36, 0.016, 0.016, lit(C.black), -0.08, H / 2 + 0.19, D / 2 + 0.03))
  // La minuterie, ses boutons.
  g.add(box(0.1, 0.05, 0.01, glow('#7dffa8'), W / 2 - 0.1, H / 2 + 0.12, D / 2 + 0.006))
  for (const y of [H / 2 + 0.02, H / 2 - 0.08]) g.add(cylinder(0.022, 0.022, 0.02, lit(C.black), W / 2 - 0.1, y, D / 2 + 0.012, 12).rotateX(Math.PI / 2))
  g.add(box(W - 0.06, 0.012, 0.02, glow(C.orange), 0, H + 0.025, D / 2 - 0.01))
  return { solid: g }
}

/**
 * L'enseigne de MESS RUSH, au mur (dos au mur, vers +z) : le logo détouré sur un caisson bleu nuit
 * à pans coupés, liseré de néon cyan, avec sa lueur. `label` : sa largeur.
 */
const rushSign: Builder = ({ label = '1.6' }) => {
  const W = Math.min(3, Math.max(0.6, Number(label) || 1.6))
  const H = W * (778 / 1024)
  const g = new THREE.Group()
  const live = new THREE.Group()
  const y = 0.62 + H / 2
  g.add(box(W + 0.12, H + 0.1, 0.05, lit(C.navy, 'metal'), 0, y, 0.025, 0.02))
  for (const [w, h, x, yy] of [[W + 0.12, 0.02, 0, y + H / 2 + 0.05], [W + 0.12, 0.02, 0, y - H / 2 - 0.05], [0.02, H + 0.1, -W / 2 - 0.06, y], [0.02, H + 0.1, W / 2 + 0.06, y]] as const) {
    g.add(box(w, h, 0.02, glow('#2fd9ff'), x, yy, 0.055))
  }
  const logo = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: rushLogo(), transparent: true, alphaTest: 0.05 }), 0, y, 0.056)
  live.add(logo)
  return { solid: g, live }
}

export const MESS_RUSH_FURNITURE = {
  'rush-floor': rushFloor,
  'rush-counter': rushCounter,
  'rush-oven': rushOven,
  'rush-sign': rushSign,
} satisfies Record<string, Builder>
