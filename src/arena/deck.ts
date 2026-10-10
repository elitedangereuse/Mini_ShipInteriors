import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { box, decal, drawnTexture, glow, lit, rng } from '../furniture/kit'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import type { ZoneKit } from '../salvage/kit'
import { ARENA_LEVEL, ARENA_MAP, type ArenaZone } from '../../shared/arena.js'

/*
 * L'arène en pont du jeu (cf. LevelDef, Deck) : une petite baie de stockage, avec le kit de celle
 * de la zone thargoïde (cloisons, dalles, conteneurs, cf. src/salvage/kit.ts), mais tous projecteurs
 * allumés et peinte comme un terrain de jeu : un damier clair, le rond central, le liseré jaune au
 * pied de chaque obstacle. Les buissons sont de gros feuillages ronds, les caisses d'armes et les
 * piliers sont faits main, et un peu de fatras traîne le long des murs.
 *
 * Deux choses dépendent de qui regarde, et sont à part (cf. arenaExtras) :
 * - les bases, peintes à la couleur de chaque camp tel que le joueur le voit (la sienne en bleu,
 *   celle d'en face en rouge) ;
 * - l'étage des obstacles : en vue subjective, conteneurs, caisses et piliers sont doublés en
 *   hauteur. Vus de dessus, ils restent bas (on voit derrière) ; les yeux au sol, ce sont des murs :
 *   aucune vue ne voit plus que l'autre par-dessus un obstacle.
 */

/** Hauteur d'un conteneur du kit, d'une caisse, d'un pilier. */
const CONTAINER_H = 0.88
const CRATE_H = 1.04
const PILLAR_H = 1.06
/** Tuiles peintes de chaque base, depuis son bord. */
const BASE_DEPTH = 3

let crateMaterials: THREE.Material[] | null = null

/** Caisse d'armes blindée : une tuile, haute comme une cloison, cerclée de jaune. */
function weaponCrate(variant: number): THREE.Object3D {
  crateMaterials ??= ['#4a6fa8', '#a8623a', '#3f8f6b'].map((color) => new THREE.MeshLambertMaterial({
    map: drawnTexture(128, 128, (g) => {
      g.fillStyle = color
      g.fillRect(0, 0, 128, 128)
      g.strokeStyle = '#0005'
      g.lineWidth = 6
      g.strokeRect(9, 9, 110, 110)
      g.beginPath()
      g.moveTo(9, 9)
      g.lineTo(119, 119)
      g.moveTo(119, 9)
      g.lineTo(9, 119)
      g.stroke()
      g.fillStyle = '#ffd23f'
      g.fillRect(0, 54, 128, 20)
      g.fillStyle = '#17181b'
      for (let x = -20; x < 128; x += 26) {
        g.beginPath()
        g.moveTo(x, 74)
        g.lineTo(x + 13, 74)
        g.lineTo(x + 33, 54)
        g.lineTo(x + 20, 54)
        g.fill()
      }
    }),
  }))
  const g = new THREE.Group()
  g.add(box(0.9, CRATE_H, 0.9, crateMaterials[variant % crateMaterials.length], 0, CRATE_H / 2, 0, 0.02))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, 0.025, 0))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, CRATE_H + 0.005, 0))
  return g
}

/** Pilier : une tuile d'acier, ceinturée d'un bandeau lumineux. */
function pillar(height = PILLAR_H, band = true): THREE.Object3D {
  const g = new THREE.Group()
  g.add(box(0.82, height, 0.82, lit('#5a626e', 'metal'), 0, height / 2, 0, 0.03))
  if (band) {
    g.add(box(0.9, 0.08, 0.9, lit('#2a2d33', 'metal'), 0, 0.04, 0))
    g.add(box(0.85, 0.05, 0.85, glow('#ffd23f'), 0, height * 0.62, 0))
  }
  return g
}

/** Les buissons, d'un seul bloc : de gros feuillages ronds, serrés, d'un vert qui change d'une touffe à l'autre. */
function bushes(zone: ArenaZone): THREE.Object3D {
  const random = rng(1907)
  const parts: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      if (!zone.bush[z * zone.width + x]) continue
      for (let i = 0; i < 7; i++) {
        const r = 0.2 + random() * 0.1
        const blob = new THREE.IcosahedronGeometry(r, 1)
        blob.scale(1, 0.85 + random() * 0.4, 1)
        blob.translate(x + (random() - 0.5) * 0.7, 0.16 + random() * 0.26, z + (random() - 0.5) * 0.7)
        color.setHSL(0.31 + random() * 0.06, 0.72, 0.17 + random() * 0.1)
        const tint = new Float32Array(blob.attributes.position.count * 3)
        for (let k = 0; k < tint.length; k += 3) color.toArray(tint, k)
        blob.setAttribute('color', new THREE.BufferAttribute(tint, 3))
        parts.push(blob)
      }
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  for (const p of parts) p.dispose()
  return mesh
}

/** La peinture du sol : le damier, le rond central et sa ligne, le liseré des obstacles, la terre des buissons. */
function paint(zone: ArenaZone): THREE.Object3D {
  const T = 64, W = zone.width * T, H = zone.height * T
  const texture = drawnTexture(W, H, (c) => {
    c.clearRect(0, 0, W, H)
    const blocked = (x: number, z: number) => x < 0 || z < 0 || x >= zone.width || z >= zone.height || !!zone.blocked[z * zone.width + x]
    for (let z = 0; z < zone.height; z++) {
      for (let x = 0; x < zone.width; x++) {
        if (blocked(x, z) || ARENA_MAP[z][x] === '#') continue
        // Le damier : deux sables clairs, qui réveillent l'acier noirci du kit.
        c.fillStyle = (x + z) % 2 ? '#c79a4a8c' : '#e6bd668c'
        c.fillRect(x * T, z * T, T, T)
        if (zone.bush[z * zone.width + x]) {
          c.fillStyle = '#2f5d2acc'
          c.beginPath()
          c.roundRect(x * T + 3, z * T + 3, T - 6, T - 6, 16)
          c.fill()
        }
        // Liseré jaune au pied de chaque obstacle.
        c.fillStyle = '#ffd23fcc'
        if (blocked(x, z - 1)) c.fillRect(x * T, z * T, T, 5)
        if (blocked(x, z + 1)) c.fillRect(x * T, (z + 1) * T - 5, T, 5)
        if (blocked(x - 1, z)) c.fillRect(x * T, z * T, 5, T)
        if (blocked(x + 1, z)) c.fillRect((x + 1) * T - 5, z * T, 5, T)
      }
    }
    // La ligne médiane et le rond central.
    c.strokeStyle = '#ffffffcc'
    c.lineWidth = 6
    c.setLineDash([22, 16])
    c.beginPath()
    c.moveTo(W / 2, 0)
    c.lineTo(W / 2, H)
    c.stroke()
    c.setLineDash([])
    c.beginPath()
    c.arc(W / 2, H / 2, T * 1.35, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = '#ffffff22'
    c.fill()
    // L'étoile du rond central.
    c.fillStyle = '#ffd23fdd'
    c.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? T * 0.3 : T * 0.72, a = -Math.PI / 2 + (i * Math.PI) / 5
      c.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
    }
    c.fill()
  })
  const sheet = decal(texture, zone.width, zone.height, 0.008)
  sheet.position.set((zone.width - 1) / 2, sheet.position.y, (zone.height - 1) / 2)
  // Dans un groupe : c'est lui que le pont pose, la plaque reste à plat.
  return new THREE.Group().add(sheet)
}

export function arenaLevel(zone: ArenaZone, kit: ZoneKit): LevelDef {
  const props: Prop[] = []
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    if (c.kind === 'container') props.push({ model: 'prebuilt', object: kit.container(c.color), x: cx, z: cz, rot: containerRot(c) })
    else if (c.kind === 'pillar') props.push({ model: 'prebuilt', object: pillar(), x: cx, z: cz })
    else props.push({ model: 'prebuilt', object: weaponCrate(c.x + c.z), x: cx, z: cz, rot: ((c.x + c.z) % 4) as Rot })
  }
  // Déjà placés : leur position de pièce est l'origine.
  props.push({ model: 'prebuilt', object: paint(zone), x: 0, z: 0, solid: false })
  props.push({ model: 'prebuilt', object: bushes(zone), x: 0, z: 0, solid: false })

  // Du fatras le long des murs et des obstacles (fûts, câbles, ferraille) : jamais dans une base,
  // un buisson, ni au milieu d'un passage. Il ne gêne ni les pas ni les balles.
  const random = rng(4242)
  const kinds = ['barrel', 'cables', 'debris', 'barrel'] as const
  const solidAt = (x: number, z: number) => x < 0 || z < 0 || x >= zone.width || z >= zone.height || !!zone.blocked[z * zone.width + x]
  let n = 0
  for (let z = 0; z < zone.height; z++) {
    for (let x = BASE_DEPTH; x < zone.width - BASE_DEPTH; x++) {
      const i = z * zone.width + x
      if (zone.blocked[i] || zone.bush[i]) continue
      const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dz]) => solidAt(x + dx, z + dz))
      if (!side.length || random() > 0.2) continue
      const [dx, dz] = side[Math.floor(random() * side.length)]
      props.push({ model: 'prebuilt', object: kit.decor(kinds[n % kinds.length], n), x: x + dx * 0.3 + (dz ? (random() - 0.5) * 0.4 : 0), z: z + dz * 0.3 + (dx ? (random() - 0.5) * 0.4 : 0), rot: (n % 4) as Rot, solid: false })
      n++
    }
  }

  // Les projecteurs : une trame serrée, blanche, qui ne laisse aucun coin dans l'ombre.
  const lights: LightDef[] = []
  for (let z = 1; z < zone.height; z += 4) {
    for (let x = 2; x < zone.width; x += 4) lights.push([x, z, '#fff3dd', 2.8, undefined, 9])
  }

  return {
    id: ARENA_LEVEL,
    name: tr('Arène', 'Arena'),
    theme: 'raw',
    // Plein jour : rien n'est caché, on se voit de loin.
    ambience: { sky: '#e6eefa', ground: '#6b7482', hemi: 2.6, sun: '#fff1dd', sunIntensity: 1.8 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { a: tr('Arène', 'Arena') },
    windows: { a: 0 },
    props,
    lights,
    zone: { kit, map: { walls: [], doors: [] } },
  }
}

/** Sens d'un conteneur du kit (long de 1,9 le long de z) : couché le long de x, ou debout. */
const containerRot = (c: { w: number; flip: boolean }): Rot => (c.w > 1 ? (c.flip ? 1 : 3) : c.flip ? 2 : 0)

/** Ce qui change avec le joueur : la peinture des deux bases, l'étage des obstacles en vue subjective. */
export interface ArenaExtras {
  group: THREE.Group
  /** La base de chaque équipe (0, 1) : à peindre de la couleur du camp, tel que le joueur le voit. */
  paintBases(colors: [string, string]): void
  /** L'étage des obstacles : visible en vue subjective seulement. */
  upper: THREE.Group
}

export function arenaExtras(zone: ArenaZone, kit: ZoneKit): ArenaExtras {
  const group = new THREE.Group()
  // Les bases : une nappe de couleur sur leurs trois colonnes, et un bandeau lumineux à leur limite.
  const pads = [0, 1].map((team) => {
    const wash = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    const line = new THREE.MeshBasicMaterial()
    const x = team ? zone.width - 1 - (BASE_DEPTH - 1) / 2 : (BASE_DEPTH - 1) / 2
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(BASE_DEPTH, zone.height), wash)
    plane.rotation.x = -Math.PI / 2
    plane.position.set(x, 0.02, (zone.height - 1) / 2)
    plane.renderOrder = 1
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, zone.height), line)
    edge.position.set(team ? zone.width - 0.5 - BASE_DEPTH : BASE_DEPTH - 0.5, 0.03, (zone.height - 1) / 2)
    group.add(plane, edge)
    return [wash, line]
  })
  // L'étage : un second conteneur sur chaque conteneur, une seconde caisse, le haut des piliers.
  const upper = new THREE.Group()
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    let o: THREE.Object3D
    if (c.kind === 'container') {
      o = kit.container((c.color + 1) % 3)
      o.position.set(cx, CONTAINER_H, cz)
      o.rotation.y = (containerRot(c) * Math.PI) / 2
    } else if (c.kind === 'pillar') {
      o = pillar(PILLAR_H, false)
      o.position.set(cx, PILLAR_H, cz)
    } else {
      o = weaponCrate(c.x + c.z + 1)
      o.position.set(cx, CRATE_H, cz)
    }
    upper.add(o)
  }
  upper.visible = false
  group.add(upper)
  return {
    group,
    upper,
    paintBases(colors) {
      pads.forEach(([wash, line], team) => {
        wash.color.set(colors[team])
        line.color.set(colors[team])
      })
    },
  }
}
