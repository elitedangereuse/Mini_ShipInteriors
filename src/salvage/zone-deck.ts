import { DIRS } from '../map'
import { hash } from '../deck'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import { BAY_BOOTH, ZONE_LEVEL, type BayLight, type Zone } from '../../shared/salvage.js'
import type { ZoneKit } from './kit'

/*
 * La baie infestée en pont du jeu (cf. LevelDef, Deck) : le plan fixe (parois, portes du sas),
 * ses rangées de conteneurs et piles de caisses (des obstacles), son décor (câbles, ossements,
 * cristaux thargoïdes, flaques caustiques), les lampes de secours et la plateforme d'extraction.
 * Les casiers, les colis et les fusées changent pendant la partie : ils sont à part (cf. items.ts).
 */

/** Face d'un objet adossé au mur `dir` (0 nord… 3 ouest) : il regarde de l'autre côté. */
export const FACING: Rot[] = [0, 3, 2, 1]

export function zoneLevel(zone: Zone, kit: ZoneKit): LevelDef {
  const props: Prop[] = []
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    if (c.kind === 'container') {
      props.push({ model: 'prebuilt', object: kit.container(c.color === 2 && c.flip ? 3 : c.color), x: cx, z: cz, rot: c.w > 1 ? (c.flip ? 1 : 3) : c.flip ? 2 : 0 })
    } else {
      props.push({ model: 'prebuilt', object: kit.crates(c.color + (c.flip ? 1 : 0)), x: cx, z: cz, rot: (c.color % 4) as Rot })
    }
  }
  for (const [i, d] of zone.decor.entries()) {
    props.push({ model: 'prebuilt', object: kit.decor(d.kind, i), x: d.x, z: d.z, rot: d.rot as Rot, solid: false })
  }

  // Petites pièces : leurs meubles (cf. BAY_ROOMS) ; le guichet de sécurité, sa vitre et son comptoir.
  for (const r of zone.rooms) {
    for (const f of r.furniture) props.push({ model: f.model as Prop['model'], x: f.x, z: f.z, rot: f.rot ?? 0, y: f.y, solid: !!f.block })
  }
  props.push({
    model: 'security-booth', x: BAY_BOOTH.x + (BAY_BOOTH.w - 1) / 2, z: BAY_BOOTH.z + (BAY_BOOTH.d - 1) / 2, rot: 0,
  })

  // Sas d'extraction : la plateforme au fond, une lampe verte.
  const pad = zone.airlock.pad
  props.push({
    model: 'extraction-pad', x: pad.x, z: pad.z, solid: false,
    interact: tr('Le monte-charge du sas : entrez avec un colis, il part vers le vaisseau.', 'The airlock cargo lift: walk in with a crate and it goes up to the ship.'),
  })
  const lights: LightDef[] = [[pad.x, pad.z, '#6dff9a', 2.4]]
  const light = (l: BayLight): LightDef => [l.x, l.z, l.color, l.intensity, l.flicker]
  // Une seule lampe de fortune par petite pièce, les lueurs de certains coins (cristaux du nid,
  // câbles qui crachent), et la lampe ambrée du guichet, qu'on repère de loin dans le noir.
  for (const r of zone.rooms) lights.push(light(r.light))
  for (const a of zone.areas) for (const l of a.lights) lights.push(light(l))
  lights.push([BAY_BOOTH.technician.x, BAY_BOOTH.technician.z - 0.2, '#ffb347', 1.3])
  for (const door of zone.doors) {
    const out = DIRS[door.dir]
    lights.push([door.x + out.dx * 0.9, door.z + out.dz * 0.9, '#4fdc84', 0.9])
  }

  // Lampes de secours, rouges et fatiguées, sur la paroi ou le flanc d'un conteneur, au nord
  // (face à la caméra) ou à l'ouest.
  const closed = (x: number, z: number, d: number) => {
    const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz
    return !zone.open[(z * zone.width + x) * 4 + d] || nx < 0 || nz < 0 || nx >= zone.width || nz >= zone.height || !!zone.blocked[nz * zone.width + nx]
  }
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const i = z * zone.width + x
      if (zone.room[i] !== 'z' || zone.blocked[i] || hash(x * 7 + 3, z * 5 + 1) % 7 !== 0) continue
      if (zone.lockers.some((l) => l.x === x && l.z === z)) continue
      if (zone.rooms.some((r) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d)) continue
      const dir = [0, 3].find((d) => closed(x, z, d))
      if (dir === undefined) continue
      props.push({ model: 'emergency-lamp', x: x + DIRS[dir].dx * 0.34, z: z + DIRS[dir].dz * 0.34, rot: FACING[dir], solid: false })
      lights.push([x + DIRS[dir].dx * 0.2, z + DIRS[dir].dz * 0.2, '#ff3322', 0.8, 'neon'])
    }
  }

  return {
    id: ZONE_LEVEL,
    name: tr('Zone thargoïde', 'Thargoid zone'),
    theme: 'raw',
    // Presque noir : on y voit à la lampe frontale, dans le rayon de sa propre vue (cf. fog.ts).
    ambience: { sky: '#4a5d76', ground: '#0b0f14', hemi: 1.5, sun: '#8fa6c0', sunIntensity: 0.6 },
    footsteps: 'hard',
    layout: zone.layout,
    rooms: { z: tr('Baie de stockage infestée', 'Infested storage bay'), x: tr('Sas d\'extraction', 'Extraction airlock') },
    windows: { z: 0, x: 0 },
    props,
    lights,
    zone: { kit, map: { walls: zone.walls, doors: zone.doors } },
  }
}
