import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Theme } from '../assets'
import type { ShipMap } from '../map'
import type { StaticMerge } from '../merge'
import { withSurface } from '../surfaces'
import { glowTexture } from './glow'

/*
 * Luminaires du plafond : ce qu'on voit en levant la tête en vue subjective. Chaque ambiance de
 * pont a les siens (dalles LED de la station, réglettes grillagées de la cale, plafonniers ronds
 * des quartiers), posés en quadrillage dans chaque pièce : c'est l'éclairage général, inscrit dans
 * le champ de lumière du pont. Les lampes d'accent du pont (cf. `lights` dans levels.ts) ont un
 * spot encastré de leur couleur.
 */

export type FixtureKind = 'panel' | 'tube' | 'dome' | 'spot'

export interface Fixture {
  kind: FixtureKind
  x: number
  z: number
  color: THREE.ColorRepresentation
  /** Réglette posée le long de z (le long de x par défaut). */
  alongZ?: boolean
}

/** Éclairage général d'une ambiance : son luminaire, sa lumière, et l'écart entre deux luminaires. */
interface General {
  kind: FixtureKind
  color: string
  intensity: number
  /** Écart visé entre deux luminaires, en tuiles. */
  spacing: number
  distance: number
}

const GENERAL: Record<Theme, General> = {
  station: { kind: 'panel', color: '#dfeaff', intensity: 0.7, spacing: 2, distance: 4.5 },
  // La cale : des réglettes au sodium, clairsemées ; il reste de l'ombre entre deux.
  raw: { kind: 'tube', color: '#ffc98e', intensity: 1, spacing: 3, distance: 4.5 },
  cozy: { kind: 'dome', color: '#ffe4c0', intensity: 0.7, spacing: 2, distance: 4.5 },
  sim: { kind: 'panel', color: '#9fdcff', intensity: 0.6, spacing: 2, distance: 4.5 },
}

export interface GeneralLight {
  x: number
  z: number
  color: string
  intensity: number
  distance: number
}

/**
 * Quadrille chaque pièce de luminaires.
 * @param skip pièce sans éclairage général (une serre sous verrière, une salle tamisée)
 * @param taken emplacements déjà pris (lampes d'accent, ascenseur) : pas de luminaire à moins de 0,7
 */
export function generalLighting(map: ShipMap, theme: Theme, skip: (room: string) => boolean, taken: { x: number; z: number }[]): { fixtures: Fixture[]; lights: GeneralLight[] } {
  const g = GENERAL[theme]
  const boxes = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>()
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const room = map.room(x, z)
      if (!room || skip(room)) continue
      const b = boxes.get(room)
      if (!b) boxes.set(room, { minX: x, maxX: x, minZ: z, maxZ: z })
      else {
        b.minX = Math.min(b.minX, x)
        b.maxX = Math.max(b.maxX, x)
        b.minZ = Math.min(b.minZ, z)
        b.maxZ = Math.max(b.maxZ, z)
      }
    }
  }
  const fixtures: Fixture[] = [], lights: GeneralLight[] = []
  for (const [room, b] of boxes) {
    const w = b.maxX - b.minX + 1, d = b.maxZ - b.minZ + 1
    const nx = Math.max(1, Math.round(w / g.spacing)), nz = Math.max(1, Math.round(d / g.spacing))
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minX - 0.5 + ((i + 0.5) * w) / nx, z = b.minZ - 0.5 + ((j + 0.5) * d) / nz
        // Une pièce n'est pas toujours un rectangle : pas de luminaire hors d'elle, ni à cheval sur un mur.
        if ([[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].some(([dx, dz]) => map.room(Math.round(x + dx), Math.round(z + dz)) !== room)) continue
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 0.7)) continue
        fixtures.push({ kind: g.kind, x, z, color: g.color, alongZ: d > w })
        lights.push({ x, z, color: g.color, intensity: g.intensity, distance: g.distance })
      }
    }
  }
  return { fixtures, lights }
}

// ---------------------------------------------------------------- modèles

const BEZEL = withSurface(new THREE.MeshLambertMaterial({ color: '#2a2e36' }), 'metal')
const FRAME = withSurface(new THREE.MeshLambertMaterial({ color: '#8d94a1' }), 'metal')
const HOUSING = withSurface(new THREE.MeshLambertMaterial({ color: '#c9ced6' }), 'grain')

/** Face lumineuse d'une couleur : plus claire que sa lumière, et assez forte pour rester blanche après le tone mapping. */
const faces = new Map<string, THREE.MeshBasicMaterial>()
function face(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color)
  const key = c.getHexString()
  let m = faces.get(key)
  if (!m) faces.set(key, (m = new THREE.MeshBasicMaterial({ color: c.lerp(new THREE.Color('#ffffff'), 0.3).multiplyScalar(1.6) })))
  return m
}

const GEO = {
  panelFace: new THREE.BoxGeometry(0.5, 0.012, 0.5),
  panelRim: new THREE.BoxGeometry(0.55, 0.022, 0.025),
  tubeBody: new THREE.BoxGeometry(0.96, 0.05, 0.17),
  tube: new THREE.CylinderGeometry(0.021, 0.021, 0.84, 8).rotateZ(Math.PI / 2),
  tubeCap: new THREE.BoxGeometry(0.04, 0.07, 0.19),
  tubeBar: new THREE.BoxGeometry(0.012, 0.012, 0.19),
  domeBase: new THREE.CylinderGeometry(0.21, 0.21, 0.025, 28),
  dome: new THREE.SphereGeometry(0.17, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.42, 1),
  spotBezel: new THREE.CylinderGeometry(0.115, 0.13, 0.03, 24),
  spotLens: new THREE.CylinderGeometry(0.085, 0.085, 0.012, 24),
}

/** Demi-côté du halo d'un luminaire sur le plafond. */
const HALO: Record<FixtureKind, number> = { panel: 0.75, tube: 0.85, dome: 0.65, spot: 0.5 }

function piece(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, turn = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  if (turn) m.rotation.y = Math.PI / 2
  return m
}

/**
 * Pose les luminaires sous un plafond de hauteur `y` : leurs pièces rejoignent la géométrie
 * fusionnée du plafond ; rend le maillage de leurs halos (un appel de dessin), à ajouter au plafond.
 */
export function buildFixtures(fixtures: Fixture[], y: number, merge: StaticMerge): THREE.Mesh | null {
  const halos: THREE.BufferGeometry[] = []
  for (const f of fixtures) {
    const lit = face(f.color)
    const parts: THREE.Object3D[] = []
    if (f.kind === 'panel') {
      // Dalle LED encastrée : la face, et quatre profilés autour.
      parts.push(piece(GEO.panelFace, lit, f.x, y - 0.008, f.z))
      for (const s of [-1, 1]) {
        parts.push(piece(GEO.panelRim, FRAME, f.x, y - 0.011, f.z + s * 0.2625))
        parts.push(piece(GEO.panelRim, FRAME, f.x + s * 0.2625, y - 0.011, f.z, true))
      }
    } else if (f.kind === 'tube') {
      // Réglette industrielle : un caisson, deux tubes, et une grille de protection.
      const g = new THREE.Group()
      g.add(piece(GEO.tubeBody, BEZEL, 0, -0.025, 0))
      for (const s of [-1, 1]) {
        g.add(piece(GEO.tube, lit, 0, -0.072, s * 0.04))
        g.add(piece(GEO.tubeCap, BEZEL, s * 0.46, -0.035, 0))
      }
      for (const k of [-0.28, -0.14, 0, 0.14, 0.28]) g.add(piece(GEO.tubeBar, BEZEL, k, -0.1, 0))
      g.position.set(f.x, y, f.z)
      if (f.alongZ) g.rotation.y = Math.PI / 2
      parts.push(g)
    } else if (f.kind === 'dome') {
      // Plafonnier rond : une embase claire, un globe dépoli.
      parts.push(piece(GEO.domeBase, HOUSING, f.x, y - 0.0125, f.z), piece(GEO.dome, lit, f.x, y - 0.02, f.z))
    } else {
      parts.push(piece(GEO.spotBezel, BEZEL, f.x, y - 0.015, f.z), piece(GEO.spotLens, lit, f.x, y - 0.03, f.z))
    }
    for (const p of parts) merge.add(p, false)

    // Le halo : la lumière qui déborde du luminaire sur le plafond.
    const h = HALO[f.kind]
    const halo = new THREE.PlaneGeometry(f.kind === 'tube' ? h * 2.6 : h * 2, h * 2).rotateX(Math.PI / 2)
    if (f.kind === 'tube' && f.alongZ) halo.rotateY(Math.PI / 2)
    halo.translate(f.x, y - 0.004, f.z)
    const c = new THREE.Color(f.color)
    halo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: 12 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3))
    halos.push(halo)
  }
  if (!halos.length) return null
  const mesh = new THREE.Mesh(mergeGeometries(halos), HALO_MATERIAL())
  for (const g of halos) g.dispose()
  mesh.renderOrder = 1
  return mesh
}

let haloMaterial: THREE.MeshBasicMaterial | null = null
const HALO_MATERIAL = () =>
  (haloMaterial ??= new THREE.MeshBasicMaterial({ map: glowTexture(), vertexColors: true, opacity: 0.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
