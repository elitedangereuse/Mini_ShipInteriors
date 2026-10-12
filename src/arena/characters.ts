import * as THREE from 'three'
import { BLASTER_PACK, packModel } from '../assets'
import { chefRig } from '../chef'
import { gardenerRig } from '../gardener'
import { boxInBone, lookRig, parseLook, type LookRig } from '../looks'
import { droidModel, mechanicRig } from '../mechanic'
import { nurseRig } from '../nurse'
import { soldierRig } from '../patrol'
import type { Weapon } from '../range-weapons'
import { tr } from '../i18n'
import { ARENA_CHARACTERS, ARENA_PALETTE, CHARACTER_IDS, DEFAULT_CHARACTER, type CharacterId, type CharacterStats, type CharacterWeapon } from '../../shared/arena.js'
import { ROSTER, type Identity } from './roster'

/*
 * Les personnages jouables de CMDR Arena : six membres de l'équipage du vaisseau, chacun avec son
 * arme, ses chiffres (cf. ARENA_CHARACTERS dans shared/arena.js, que le relais lit de même) et sa
 * façon de jouer, à la Brawl Stars. On les reconnaît de loin : chacun a l'allure du PNJ qu'il est à
 * bord (la combinaison de Rourke, la toque de Marcel, la blouse de Betty, le chapeau de paille de
 * Capucine, Nico et son drone, Jacques et son béret), sa couleur, et l'arme qui va avec.
 *
 * - Rourke, soldat polyvalent : la mitraillette de service ; ni lent ni rapide, ni fragile ni
 *   solide, des dégâts réguliers. Facile à prendre en main, bon partout, le meilleur nulle part.
 * - Marcel, tank à dégâts de zone : le lance-tomates, dont chaque tomate éclate à l'impact et
 *   éclabousse autour d'elle. Lent, le plus solide de tous, mais de courte portée.
 * - Nico et Boulon, glass cannon mobile : le fusil laser, qui traverse et frappe fort de loin.
 *   Nico est le plus rapide et le plus fragile ; Boulon, son drone, scanne les buissons proches.
 * - Betty, soutien et soigneuse : ses seringues soignent les coéquipiers blessés et piquent ceux
 *   d'en face. Ni lente ni fragile, mais peu de dégâts : elle tient son équipe en vie.
 * - Capucine, contrôle de zone : elle lance par-dessus les obstacles des graines qui deviennent des
 *   fleurs carnivores, qui mordent qui passe à portée. Elle vaut ce que valent ses pièges.
 * - Jacques, tank explosif : il lance ses cocktails par-dessus les obstacles ; ils éclatent, et la
 *   flaque brûle encore un moment. Lent et solide, il bouche un passage, et punit les groupes.
 */

/** L'arme d'un personnage : ce que le moteur du stand en lit (cf. range-weapons.ts), et ses chiffres de l'arène. */
export interface ArenaArm extends Weapon, CharacterWeapon {
  id: CharacterId
  /**
   * Le modèle du projectile qui vole (la tomate, la seringue, la graine, le cocktail) ; sans : un
   * trait lumineux. `heal` : la seringue de Betty soignera (sa dose est vert d'eau, pas rose).
   */
  ammo?: (heal?: boolean) => THREE.Object3D
  /** Le projectile vole tête en avant (la seringue), au lieu de tourner sur lui-même (la tomate). */
  aligned?: boolean
}

/** Un personnage : qui il est (cf. roster.ts), ses chiffres, son arme et son modèle. */
export interface Character extends Identity {
  id: CharacterId
  stats: CharacterStats
  arm: ArenaArm
  /** Son personnage, prêt à jouer (une instance neuve à chaque appel). */
  rig(): Promise<LookRig>
  /** Nico combat avec Boulon, son drone, qui flotte à son épaule. */
  drone?: boolean
}

// --------------------------------------------------------------- modèles

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color })

/** Le lance-tomates de Marcel : le tube du kit, une tomate engagée dans la gueule et une autre au chargeur. */
function tomatoLauncher(): THREE.Object3D {
  const g = new THREE.Group()
  const tube = packModel('blaster-h', BLASTER_PACK).clone(true)
  g.add(tube)
  const box = new THREE.Box3().setFromObject(tube)
  const front = packModel('food-tomato', BLASTER_PACK).clone(true)
  front.scale.setScalar(1.6)
  front.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.2, box.max.z - 0.15)
  const spare = packModel('food-tomato', BLASTER_PACK).clone(true)
  spare.scale.setScalar(1.3)
  spare.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.02, (box.min.z + box.max.z) / 2)
  g.add(front, spare)
  return g
}

/** Formes et matières des projectiles, partagées : on en lance un par seconde, toute la partie. */
const HULL = new THREE.SphereGeometry(0.035, 10, 8), HULL_MAT = lambert('#6b4630')
const SPROUT = new THREE.ConeGeometry(0.014, 0.05, 6), SPROUT_MAT = lambert('#7fd04a')
const BREW = new THREE.SphereGeometry(0.05, 10, 8), BREW_MAT = new THREE.MeshBasicMaterial({ color: '#b6ff3a', transparent: true, opacity: 0.75 })

/** Une graine de Capucine : une coque brune, et une pousse qui pointe déjà. */
function seed(): THREE.Object3D {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(HULL, HULL_MAT)
  hull.scale.set(1, 1.25, 1)
  const sprout = new THREE.Mesh(SPROUT, SPROUT_MAT)
  sprout.position.y = 0.05
  g.add(hull, sprout)
  return g
}

/** Le sachet de graines de Capucine, dans ses mains : une poche de toile, une fleur carnivore brodée. */
function seedBag(): THREE.Object3D {
  const g = new THREE.Group()
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 10), lambert('#c9a874'))
  cloth.position.set(0, 0.18, 0.2)
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 16), lambert('#c0643f'))
  tie.rotation.x = Math.PI / 2
  tie.position.set(0, 0.34, 0.2)
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), lambert('#6f9a5a'))
  tuft.position.set(0, 0.44, 0.2)
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), lambert('#d9453a'))
  badge.position.set(0, 0.2, 0.372)
  g.add(cloth, tie, tuft, badge)
  // À la taille d'un pistolet du kit.
  g.scale.setScalar(0.6)
  return g
}

/** Le cocktail de Jacques, dans sa main (à la taille d'un pistolet du kit) : le verre, et sa mixture verte qui luit. */
function cocktail(): THREE.Object3D {
  const g = new THREE.Group()
  const glass = packModel('food-cocktail', BLASTER_PACK).clone(true)
  glass.scale.setScalar(0.7)
  const brew = new THREE.Mesh(BREW, BREW_MAT)
  brew.scale.set(1.4, 0.6, 1.4)
  brew.position.y = 0.23
  g.add(glass, brew)
  return g
}

/** Le même, en vol. */
function thrownCocktail(): THREE.Object3D {
  const g = cocktail()
  g.scale.setScalar(0.45)
  return g
}

/** Une tomate en vol. */
function tomato(): THREE.Object3D {
  const g = packModel('food-tomato', BLASTER_PACK).clone(true)
  g.scale.setScalar(0.55)
  return g
}

/** La seringue de Betty, en vol (aiguille vers +z) : le corps de verre, sa dose, le piston, l'aiguille. */
const BARREL = new THREE.CylinderGeometry(0.016, 0.016, 0.09, 10).rotateX(Math.PI / 2)
const DOSE = new THREE.CylinderGeometry(0.0115, 0.0115, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0, 0.008)
const PLUNGER = new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10).rotateX(Math.PI / 2).translate(0, 0, -0.05)
const NEEDLE = new THREE.ConeGeometry(0.005, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0, 0.07)
const BARREL_MAT = new THREE.MeshBasicMaterial({ color: '#f2f8ff', transparent: true, opacity: 0.55, toneMapped: false })
const STEEL_MAT = lambert('#c9d3dc')
/** La dose : rose pour piquer ceux d'en face, vert d'eau pour soigner (cf. ARENA_PALETTE). */
const DOSE_MAT = { attack: new THREE.MeshBasicMaterial({ color: '#ff5fa8', toneMapped: false }), heal: new THREE.MeshBasicMaterial({ color: ARENA_PALETTE.heal, toneMapped: false }) }

function syringe(heal = false): THREE.Object3D {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(DOSE, heal ? DOSE_MAT.heal : DOSE_MAT.attack), new THREE.Mesh(BARREL, BARREL_MAT), new THREE.Mesh(PLUNGER, STEEL_MAT), new THREE.Mesh(NEEDLE, STEEL_MAT))
  // Assez grande pour se lire, vue de haut, à la vitesse où elle file.
  g.scale.setScalar(1.6)
  return g
}

// --------------------------------------------------------------- personnages

/** Rourke : sa combinaison de la sécurité, sans son fusil laser (il a sa mitraillette, dans l'arène). */
async function rourkeRig(): Promise<LookRig> {
  const r = await soldierRig()
  r.rifle.visible = false
  return r
}

/**
 * Jacques : il ne quitte jamais son comptoir, alors pour l'arène on lui a prêté des jambes (le
 * robot « Unité R-7 » du kit). Il a gardé l'essentiel : le béret, le nœud papillon rouge, le gilet
 * noir sur sa plastron crème, et le torchon sur l'épaule.
 */
async function jacquesRig(): Promise<LookRig> {
  const r = await lookRig(parseLook('robot.g'))
  const root = r.root
  root.updateMatrixWorld(true)
  const black = lambert('#141519'), cream = lambert('#f4f1ea'), red = lambert('#b0202a'), brass = lambert('#c9a24a')
  const torso = root.getObjectByName('torso') as THREE.Mesh | undefined
  if (torso?.isMesh) {
    const tb = boxInBone(torso, torso)
    const size = tb.getSize(new THREE.Vector3()), c = tb.getCenter(new THREE.Vector3())
    const front = tb.max.z + size.z * 0.01
    const vest = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.8, size.y * 0.7, size.z * 0.04), black)
    vest.position.set(c.x, c.y - size.y * 0.05, front)
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.24, size.y * 0.45, size.z * 0.05), cream)
    shirt.position.set(c.x, tb.max.y - size.y * 0.24, front + size.z * 0.005)
    torso.add(vest, shirt)
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.16, size.y * 0.09, size.z * 0.08), red)
      wing.position.set(c.x + s * size.x * 0.08, tb.max.y - size.y * 0.06, front + size.z * 0.03)
      wing.rotation.z = s * 0.25
      torso.add(wing)
    }
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.025, 6, 4), brass)
      button.position.set(c.x + size.x * 0.12, c.y + size.y * 0.1 - i * size.y * 0.13, front + size.z * 0.03)
      torso.add(button)
    }
    // Le torchon, sur l'épaule gauche.
    const rag = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.22, size.y * 0.04, size.z * 0.7), cream)
    rag.position.set(c.x + size.x * 0.32, tb.max.y + size.y * 0.01, c.z)
    torso.add(rag)
  }
  const head = root.getObjectByName('head') as THREE.Mesh | undefined
  if (head?.isMesh) {
    const hb = boxInBone(head, head)
    const size = hb.getSize(new THREE.Vector3()), c = hb.getCenter(new THREE.Vector3())
    const beret = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.56, 14, 10), lambert('#1b1b24'))
    beret.scale.set(1, 0.3, 0.95)
    beret.position.set(c.x + size.x * 0.06, hb.max.y + size.y * 0.02, c.z - size.z * 0.03)
    beret.rotation.z = -0.18
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(size.x * 0.03, size.x * 0.02, size.y * 0.12, 5), lambert('#1b1b24'))
    stalk.position.set(c.x + size.x * 0.1, hb.max.y + size.y * 0.17, c.z - size.z * 0.03)
    head.add(beret, stalk)
  }
  return { ...r, height: r.height + 0.04 }
}

const arm = (id: CharacterId, look: Omit<ArenaArm, keyof CharacterWeapon | 'id' | 'take' | 'weight' | 'name'>): ArenaArm => ({
  ...ARENA_CHARACTERS[id].weapon,
  id,
  name: ROSTER[id].weapon,
  take: '',
  // La vitesse du personnage passe par le poids de son arme (cf. RangeGame.load).
  weight: ARENA_CHARACTERS[id].speed,
  ...look,
})

export const CHARACTERS: Character[] = [
  {
    ...ROSTER.rourke, id: 'rourke', stats: ARENA_CHARACTERS.rourke, rig: rourkeRig,
    arm: arm('rourke', {
      trait: tr('rafales', 'bursts'), model: 'blaster-a', grip: [-0.1, -0.14], color: '#5fd0ff', sound: 'smg',
      kick: 0.5, side: 0.45, recover: 5, bloom: 0.45, bloomMax: 4.5, settle: 3.5, move: 1.2, punch: 0.55,
    }),
  },
  {
    ...ROSTER.marcel, id: 'marcel', stats: ARENA_CHARACTERS.marcel, rig: chefRig,
    arm: arm('marcel', {
      trait: tr('éclabousse', 'splash'), model: 'blaster-h', grip: [-0.09, -0.08], make: tomatoLauncher, ammo: tomato, color: '#ff4a2a', sound: 'launcher',
      kick: 3.2, side: 0.6, recover: 3.4, bloom: 1.5, bloomMax: 3.5, settle: 2.5, move: 1, punch: 2.4,
    }),
  },
  {
    ...ROSTER.nico, id: 'nico', stats: ARENA_CHARACTERS.nico, rig: mechanicRig, drone: true,
    arm: arm('nico', {
      trait: tr('perce', 'piercing'), model: 'blaster-e', grip: [-0.1, 0.3], color: '#ff8a2a', sound: 'rifle',
      kick: 4, side: 0.7, recover: 3.6, bloom: 3, bloomMax: 4, settle: 2.6, move: 1, punch: 2.1,
    }),
  },
  {
    ...ROSTER.betty, id: 'betty', stats: ARENA_CHARACTERS.betty, rig: nurseRig,
    arm: arm('betty', {
      trait: tr('soigne', 'heals'), model: 'blaster-b', grip: [-0.08, -0.12], ammo: syringe, aligned: true, color: '#ff7bc0', sound: 'syringe',
      kick: 1, side: 0.3, recover: 8, bloom: 0.7, bloomMax: 2.5, settle: 6, move: 0.4, punch: 0.7,
    }),
  },
  {
    ...ROSTER.capucine, id: 'capucine', stats: ARENA_CHARACTERS.capucine, rig: gardenerRig,
    arm: arm('capucine', {
      trait: tr('pièges', 'traps'), model: '', grip: [0, 0], make: seedBag, ammo: seed, color: '#8ad94a', sound: 'seed',
      kick: 0.6, side: 0.2, recover: 6, bloom: 0, bloomMax: 0, settle: 6, move: 0, punch: 0.5,
    }),
  },
  {
    ...ROSTER.jacques, id: 'jacques', stats: ARENA_CHARACTERS.jacques, rig: jacquesRig,
    arm: arm('jacques', {
      trait: tr('flambe', 'flambé'), model: '', grip: [0.08, 0], make: cocktail, ammo: thrownCocktail, color: '#b6ff3a', sound: 'cocktail',
      kick: 0.8, side: 0.2, recover: 6, bloom: 0, bloomMax: 0, settle: 6, move: 0, punch: 0.6,
    }),
  },
]

if (CHARACTERS.map((c) => c.id).join() !== CHARACTER_IDS.join()) throw new Error('Les personnages de l\'arène ne suivent pas ARENA_CHARACTERS')

/** Les armes des personnages, dans l'ordre : l'arsenal du moteur de tir de l'arène. */
export const ARMS: ArenaArm[] = CHARACTERS.map((c) => c.arm)

export const characterById = (id: string | undefined): Character => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!

let warmed = false
/**
 * Charge d'avance les modèles des personnages (au terminal, avant toute partie) : ceux des PNJ le
 * sont déjà à bord, pas le robot qui prête ses jambes à Jacques.
 */
export function warmCharacters() {
  if (warmed) return
  warmed = true
  for (const c of CHARACTERS) void c.rig().catch(() => {})
}

/**
 * Ce qu'un personnage vaut, de 0 à 1, sur chacune des six jauges de sa fiche : points de vie,
 * vitesse, dégâts d'un coup, portée, cadence (coups par seconde) et zone d'impact (rayon de
 * l'explosion, des mâchoires d'une fleur ou de la flaque). Chacune rapportée au meilleur des six.
 */
export function gauges(c: Character): { label: string; value: number; text: string }[] {
  const zone = (w: CharacterWeapon) => Math.max(w.blast, w.flower?.radius ?? 0, w.fire?.radius ?? 0)
  const rate = (w: CharacterWeapon) => 1 / w.interval
  const best = (f: (x: Character) => number) => Math.max(...CHARACTERS.map(f))
  const w = c.stats.weapon
  const row = (label: string, f: (x: Character) => number, text: string) => ({ label, value: f(c) / best(f), text })
  return [
    row(tr('Vie', 'Health'), (x) => x.stats.hp, String(c.stats.hp)),
    row(tr('Vitesse', 'Speed'), (x) => x.stats.speed, `×${c.stats.speed.toFixed(2)}`),
    row(tr('Dégâts', 'Damage'), (x) => x.stats.weapon.damage * x.stats.weapon.pellets, w.heal ? `${w.damage} · +${w.heal}` : String(w.damage)),
    row(tr('Portée', 'Range'), (x) => x.stats.weapon.range, tr(`${w.range} cases`, `${w.range} tiles`)),
    row(tr('Cadence', 'Rate'), (x) => rate(x.stats.weapon), tr(`${rate(w).toFixed(1)} / s`, `${rate(w).toFixed(1)}/s`)),
    row(tr('Zone', 'Area'), (x) => zone(x.stats.weapon), zone(w) ? tr(`${zone(w)} case${zone(w) > 1 ? 's' : ''}`, `${zone(w)} tiles`) : '—'),
  ]
}

// --------------------------------------------------------------- Boulon

/**
 * Boulon, le drone de Nico (cf. mechanic.ts), à son épaule pendant la partie : il flotte, ses rotors
 * tournent, et son scanner s'allume quand il repère quelqu'un dans un buisson.
 */
export class Drone {
  readonly root: THREE.Group
  private readonly parts = droidModel()
  private time = Math.random() * 10

  constructor() {
    this.root = this.parts.group
  }

  /** @param scanning il repère un adversaire caché dans un buisson tout proche */
  update(dt: number, scanning = false) {
    this.time += dt
    const t = this.time
    this.root.position.set(0.24 + Math.sin(t * 0.9) * 0.03, 0.66 + Math.sin(t * 2.3) * 0.025, -0.12 + Math.cos(t * 0.9) * 0.03)
    this.root.rotation.set(Math.sin(t * 1.7) * 0.08, Math.sin(t * 0.6) * 0.3, 0)
    for (const r of this.parts.rotors) r.rotation.y += dt * 40
    this.parts.beam.visible = scanning && Math.sin(t * 14) > -0.4
    this.parts.tipMat.color.set(Math.sin(t * 6) > 0 ? '#ff3b2f' : '#5a1410')
  }
}
