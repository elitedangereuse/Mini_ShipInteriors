import { DIRS } from '../map'
import { hash } from '../deck'
import { tr } from '../i18n'
import type { LevelDef, LightDef, Prop, Rot } from '../levels'
import { BAY_BOOTH, groundHeight, RULES, ZONE_LEVEL, type BayLight, type Zone } from '../../shared/salvage.js'
import type { ZoneKit } from './kit'

/*
 * La baie infestée en pont du jeu (cf. LevelDef, Deck) : le plan fixe (parois, portes du sas),
 * ses rangées de conteneurs et piles de caisses (des obstacles), les bacs de la serre et les
 * excroissances du nid, la passerelle du hall de fret (caillebotis, escaliers, garde-corps), son
 * décor (câbles, ossements, cristaux thargoïdes, verre brisé, flaques caustiques), les lampes de
 * secours, les projecteurs des zones éclairées et la plateforme d'extraction. Les casiers, les
 * colis et les fusées changent pendant la partie : ils sont à part (cf. items.ts).
 */

/** Face d'un objet adossé au mur `dir` (0 nord… 3 ouest) : il regarde de l'autre côté. */
export const FACING: Rot[] = [0, 3, 2, 1]

/** Nom de chaque coin de la baie (cf. BAY_AREAS), pour le cartouche du pont. */
const AREA_NAMES: Record<string, string> = {
  freight: tr('Hall de fret', 'Freight hall'),
  offices: tr('Bureaux de la baie', 'Bay offices'),
  greenhouse: tr('Serre hydroponique', 'Hydroponics bay'),
  avenue: tr('Grande allée', 'Main avenue'),
  machines: tr('Salle des machines', 'Machine room'),
  storage: tr('Aire de stockage', 'Storage yard'),
  nest: tr('Le nid', 'The nest'),
  workshop: tr('Ateliers', 'Workshops'),
  dock: tr('Quai de chargement', 'Loading dock'),
  collapse: tr('Zone effondrée', 'Collapsed zone'),
}
const ROOM_NAMES: Record<string, string> = {
  pause: tr('Salle de pause', 'Break room'),
  radio: tr('Local radio', 'Radio room'),
  workshop: tr('Atelier', 'Workshop'),
  infirmary: tr('Infirmerie de fortune', 'Makeshift infirmary'),
}

export function zoneLevel(zone: Zone, kit: ZoneKit): LevelDef {
  const props: Prop[] = []
  const W = zone.width
  for (const c of zone.containers) {
    const cx = c.x + (c.w - 1) / 2, cz = c.z + (c.d - 1) / 2
    const variant = c.x * 31 + c.z * 17
    if (c.kind === 'container') {
      props.push({ model: 'prebuilt', object: kit.container(c.color === 2 && c.flip ? 3 : c.color), x: cx, z: cz, rot: c.w > 1 ? (c.flip ? 1 : 3) : c.flip ? 2 : 0 })
    } else if (c.kind === 'planter') {
      props.push({ model: 'prebuilt', object: kit.planter(variant), x: cx, z: cz, rot: (variant % 4) as Rot })
    } else if (c.kind === 'growth') {
      props.push({ model: 'prebuilt', object: kit.growth(variant), x: cx, z: cz })
    } else {
      props.push({ model: 'prebuilt', object: kit.crates(c.color + (c.flip ? 1 : 0)), x: cx, z: cz, rot: (c.color % 4) as Rot })
    }
  }
  for (const [i, d] of zone.decor.entries()) {
    props.push({ model: 'prebuilt', object: kit.decor(d.kind, i), x: d.x, z: d.z, rot: d.rot as Rot, solid: false })
  }

  // La passerelle du hall de fret : ses dalles, ses escaliers et ses garde-corps (un poteau par
  // sommet, pas deux). Déjà placés : leur position de pièce est l'origine.
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x
      if (zone.stairs[i] >= 0) props.push({ model: 'prebuilt', object: kit.stairs(x, z, zone.stairs[i], RULES.deck), x: 0, z: 0, solid: false })
      else if (zone.elev[i] > 0) props.push({ model: 'prebuilt', object: kit.deck(x, z, zone.elev[i]), x: 0, z: 0, solid: false })
    }
  }
  const posts = new Set<string>()
  for (const r of zone.rails) {
    const d = DIRS[r.dir]
    // Les deux bouts de l'arête, et la hauteur du sol juste en deçà, du côté de la passerelle.
    const mx = r.x + d.dx * 0.5, mz = r.z + d.dz * 0.5
    const ends = [-1, 1].map((s) => {
      const x = mx + (d.dz ? s * 0.5 : 0), z = mz + (d.dx ? s * 0.5 : 0)
      const h = groundHeight(zone, { x: x - d.dx * 0.02 - (d.dz ? s * 0.02 : 0), z: z - d.dz * 0.02 - (d.dx ? s * 0.02 : 0) })
      return { x: x - d.dx * 0.03, z: z - d.dz * 0.03, h }
    })
    const own = ends.map((e) => {
      const key = `${e.x.toFixed(2)},${e.z.toFixed(2)}`
      if (posts.has(key)) return false
      posts.add(key)
      return true
    }) as [boolean, boolean]
    props.push({ model: 'prebuilt', object: kit.rail(ends[0], ends[1], own), x: 0, z: 0, solid: false })
  }

  // Petites pièces : leurs meubles (cf. BAY_ROOMS) ; les meubles des grands espaces (BAY_PROPS) ;
  // le guichet de sécurité, sa vitre et son comptoir.
  for (const f of [...zone.rooms.flatMap((r) => r.furniture), ...zone.props]) {
    props.push({ model: f.model as Prop['model'], x: f.x, z: f.z, rot: f.rot ?? 0, y: f.y, label: f.label, solid: !!f.block })
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
  // Les projecteurs des zones éclairées (forts, et qui portent loin), une seule lampe de fortune
  // par petite pièce, les lueurs de certains coins (cristaux du nid, câbles qui crachent), et la
  // lampe ambrée du guichet, qu'on repère de loin dans le noir.
  for (const l of zone.lights) for (const lamp of l.lamps) lights.push([lamp.x, lamp.z, l.color, l.intensity, undefined, 10])
  for (const r of zone.rooms) lights.push(light(r.light))
  for (const a of zone.areas) for (const l of a.lights) lights.push(light(l))
  lights.push([BAY_BOOTH.technician.x, BAY_BOOTH.technician.z - 0.2, '#ffb347', 1.3])
  for (const door of zone.doors) {
    const out = DIRS[door.dir]
    lights.push([door.x + out.dx * 0.9, door.z + out.dz * 0.9, '#4fdc84', 0.9])
  }

  // Lampes de secours, rouges et fatiguées, sur la paroi ou le flanc d'un conteneur, au nord
  // (face à la caméra) ou à l'ouest ; pas sous les projecteurs, ni sur la passerelle.
  const closed = (x: number, z: number, d: number) => {
    const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz
    return !zone.open[(z * W + x) * 4 + d] || nx < 0 || nz < 0 || nx >= W || nz >= zone.height || !!zone.blocked[nz * W + nx]
  }
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x
      if (zone.room[i] !== 'z' || zone.blocked[i] || zone.lit[i] || zone.elev[i] > 0 || hash(x * 7 + 3, z * 5 + 1) % 7 !== 0) continue
      if (zone.lockers.some((l) => l.x === x && l.z === z)) continue
      if (zone.rooms.some((r) => x >= r.x && z >= r.z && x < r.x + r.w && z < r.z + r.d)) continue
      const dir = [0, 3].find((d) => closed(x, z, d) && !zone.rail[i * 4 + d])
      if (dir === undefined) continue
      props.push({ model: 'emergency-lamp', x: x + DIRS[dir].dx * 0.34, z: z + DIRS[dir].dz * 0.34, rot: FACING[dir], solid: false })
      lights.push([x + DIRS[dir].dx * 0.2, z + DIRS[dir].dz * 0.2, '#ff3322', 0.8, 'neon'])
    }
  }

  // Noms : le sas, les petites pièces et la passerelle d'abord, puis les coins de la baie.
  const rect = (name: string, x: number, z: number, w: number, d: number) => ({ name, minX: x, maxX: x + w - 1, minZ: z, maxZ: z + d - 1 })
  const tiles = zone.airlock.tiles
  const areas = [
    rect(tr('Sas d\'extraction', 'Extraction airlock'), Math.min(...tiles.map((t) => t.x)), Math.min(...tiles.map((t) => t.z)), 3, 2),
    ...zone.rooms.map((r) => rect(ROOM_NAMES[r.id] ?? '', r.x, r.z, r.w, r.d)),
    rect(tr('Passerelle', 'Catwalk'), 1, 3, 11, 2),
    ...zone.areas.map((a) => rect(AREA_NAMES[a.id] ?? '', a.x, a.z, a.w, a.d)),
  ]
  const glow = (x: number, z: number) => {
    const i = z * W + x
    if (!zone.lit[i] || zone.room[i] !== 'z') return null
    return zone.lights.find((l) => x >= l.x && z >= l.z && x < l.x + l.w && z < l.z + l.d)?.color ?? null
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
    areas,
    windows: { z: 0, x: 0 },
    props,
    lights,
    zone: { kit, map: { walls: zone.walls, doors: zone.doors }, glow },
  }
}
