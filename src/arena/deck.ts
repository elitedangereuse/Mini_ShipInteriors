import * as THREE from 'three'
import { box, drawnTexture, glow, lit } from '../furniture/kit'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import type { ZoneKit } from '../salvage/kit'
import { ARENA_LEVEL, ARENA_TEAMS, type ArenaZone } from '../../shared/arena.js'

/*
 * L'arène en pont du jeu (cf. LevelDef, Deck) : une baie de stockage comme celle de la zone
 * thargoïde, avec le même kit (cloisons, dalles, conteneurs, cf. src/salvage/kit.ts), mais en
 * petit, et tous projecteurs allumés : rien n'y est caché. Chaque base est peinte à la couleur de
 * son équipe (le sol, une rampe de lumière) ; les caisses d'armes blindées, faites main, montent
 * aussi haut que les cloisons : ce qui se voit protège, pour le joueur comme pour le relais.
 */

/** Distance (en tuiles) autour d'un point d'apparition où le sol prend la couleur de l'équipe. */
const BASE_REACH = 2.6

let crateMaterials: THREE.Material[] | null = null

/** Caisse d'armes blindée : une tuile, haute comme une cloison, cerclée de la couleur du danger. */
function weaponCrate(variant: number): THREE.Object3D {
  crateMaterials ??= ['#3d4450', '#4a4136', '#35423f'].map((color) => new THREE.MeshLambertMaterial({
    map: drawnTexture(128, 128, (g) => {
      g.fillStyle = color
      g.fillRect(0, 0, 128, 128)
      g.strokeStyle = '#0006'
      g.lineWidth = 6
      g.strokeRect(9, 9, 110, 110)
      g.beginPath()
      g.moveTo(9, 9)
      g.lineTo(119, 119)
      g.moveTo(119, 9)
      g.lineTo(9, 119)
      g.stroke()
      g.fillStyle = '#e9a917'
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
  g.add(box(0.9, 1.04, 0.9, crateMaterials[variant % crateMaterials.length], 0, 0.52, 0, 0.02))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, 0.025, 0))
  g.add(box(0.94, 0.05, 0.94, lit('#23272c', 'metal'), 0, 1.045, 0))
  return g
}

/** Rampe de lumière d'une base : un bandeau de la couleur de l'équipe, au pied du mur. */
function baseStrip(color: string, length: number): THREE.Object3D {
  return box(0.06, 0.05, length, glow(color), 0, 0.03, 0)
}

export function arenaLevel(zone: ArenaZone, kit: ZoneKit): LevelDef {
  const props: Prop[] = []
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    if (c.kind === 'container') {
      props.push({ model: 'prebuilt', object: kit.container(c.color), x: cx, z: cz, rot: c.w > 1 ? (c.flip ? 1 : 3) : c.flip ? 2 : 0 })
    } else props.push({ model: 'prebuilt', object: weaponCrate(c.x + c.z), x: cx, z: cz, rot: ((c.x + c.z) % 4) as Rot })
  }

  // Les bases : le sol à la couleur de l'équipe, une rampe de lumière le long du mur du fond.
  const baseOf = (x: number, z: number) => {
    for (const team of ARENA_TEAMS) {
      if (zone.spawns[team.id].some((s) => Math.hypot(s.x - x, s.z - z) <= BASE_REACH)) return team
    }
    return null
  }
  const lights: LightDef[] = []
  for (const team of ARENA_TEAMS) {
    const spots = zone.spawns[team.id]
    const zs = spots.map((s) => s.z)
    const minZ = Math.min(...zs) - 1, maxZ = Math.max(...zs) + 1
    const x = team.id === 0 ? -0.3 : zone.width - 0.7
    props.push({ model: 'prebuilt', object: baseStrip(team.color, maxZ - minZ + 1), x, z: (minZ + maxZ) / 2, solid: false })
    for (const s of spots) lights.push([s.x, s.z, team.color, 1.6, undefined, 6])
  }
  // Les projecteurs : une trame serrée, blanche, qui ne laisse aucun coin dans l'ombre.
  for (let z = 1.5; z < zone.height; z += 4) {
    for (let x = 2.5; x < zone.width; x += 4.5) lights.push([x, z, '#fff3dd', 2.6, undefined, 9])
  }

  return {
    id: ARENA_LEVEL,
    name: tr('Arène', 'Arena'),
    theme: 'raw',
    // Plein jour : rien n'est caché, on se voit de loin.
    ambience: { sky: '#dfe8f5', ground: '#5b6470', hemi: 2.4, sun: '#fff1dd', sunIntensity: 1.6 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { a: tr('Arène', 'Arena') },
    windows: { a: 0 },
    props,
    lights,
    zone: { kit, map: { walls: [], doors: [] }, glow: (x, z) => (zone.blocked[z * zone.width + x] ? null : baseOf(x, z)?.color ?? null) },
  }
}
