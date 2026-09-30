import * as THREE from 'three'
import type { Deck, Interactable } from '../deck'
import { buildFurniture, disposeFurniture, isCustomModel, keepShared } from '../furniture'
import { box, glow, lit, type Furniture } from '../furniture/kit'
import { tr } from '../i18n'
import { iconSvg, type IconName } from '../icons'
import { DIRS } from '../map'
import { formatCredits, type Spot, type TaskKind } from './data'
import { activeTasks, clock, hash32, taskOf } from './schedule'
import { placeTask } from './placement'
import type { Wallet } from './wallet'

/*
 * Tâches de bord : ordures, flaques, brèches… qui apparaissent aux emplacements du vaisseau
 * selon le calendrier de schedule.ts. Chaque tâche a son décor (src/furniture/tasks.ts), un
 * marqueur qui flotte au-dessus d'elle, et une interaction : on s'y met (le geste dure quelques
 * secondes, cf. main.ts), puis le site la paie. Une tâche réglée disparaît pour celui qui l'a
 * réglée, et pour lui seul : les autres la voient toujours, et peuvent la régler aussi.
 */

/** Bruit du geste en cours (cf. Sound.work, ou les étincelles de Sound.sparks). */
export type WorkSound = 'scrub' | 'wrench' | 'hiss' | 'water' | 'sparks' | 'chop' | 'sizzle' | 'munch'

/**
 * Ce qu'on fait de chaque tâche : le verbe de l'invite, le geste en cours, une phrase une fois
 * réglée (une au hasard), l'icône du marqueur, le bruit du geste.
 */
export const TASK_INFO: Record<TaskKind, { verb: string; doing: string; done: string[]; icon: IconName; sound: WorkSound }> = {
  trash: {
    verb: tr('Ramasser les ordures', 'Pick up the litter'),
    doing: tr('Ramassage…', 'Picking up…'),
    done: [
      tr('Ordures ramassées. Parmi elles, un billet de loterie de Jameson Memorial, gagnant et périmé.', 'Litter picked up. Among it, a Jameson Memorial lottery ticket: a winner, and expired.'),
      tr('Direction le recycleur. Il fait un drôle de bruit, mais il accepte.', 'Off to the recycler. It makes a funny noise, but it takes it.'),
    ],
    icon: 'trash',
    sound: 'scrub',
  },
  spill: {
    verb: tr('Éponger la flaque', 'Mop up the spill'),
    doing: tr('Épongeage…', 'Mopping…'),
    done: [
      tr('Flaque épongée. Le sol brille comme une station Coriolis neuve.', 'Spill mopped up. The floor shines like a brand-new Coriolis station.'),
      tr('Épongé. Plus personne ne glissera ici, sauf Comète, par principe.', 'Mopped up. Nobody will slip here anymore, except Comète, on principle.'),
    ],
    icon: 'drop',
    sound: 'scrub',
  },
  plant: {
    verb: tr('Arroser la plante', 'Water the plant'),
    doing: tr('Arrosage…', 'Watering…'),
    done: [
      tr('Arrosée. La plante se redresse et vous remercie à sa façon : en silence.', 'Watered. The plant perks up and thanks you in its own way: silently.'),
      tr('Un peu d\'eau recyclée, et la voilà reverdie. Mieux vaut ne pas savoir d\'où vient l\'eau.', 'A little recycled water and it is green again. Best not to ask where the water came from.'),
    ],
    icon: 'plant',
    sound: 'water',
  },
  fur: {
    verb: tr('Balayer les poils de Comète', 'Sweep up Comète\'s fur'),
    doing: tr('Balayage…', 'Sweeping…'),
    done: [
      tr('Balayé. Il y avait de quoi faire un deuxième Comète.', 'Swept up. There was enough to make a second Comète.'),
      tr('Balayé. Comète en sème déjà d\'autres, une coursive plus loin.', 'Swept up. Comète is already shedding more, one corridor over.'),
    ],
    icon: 'paw-print',
    sound: 'scrub',
  },
  dishes: {
    verb: tr('Débarrasser la vaisselle', 'Clear the dishes'),
    doing: tr('Débarrassage…', 'Clearing…'),
    done: [
      tr('Vaisselle débarrassée. Quelqu\'un a encore laissé du café lyophilisé au fond d\'une tasse.', 'Dishes cleared. Someone left freeze-dried coffee at the bottom of a mug again.'),
      tr('Direction le lave-vaisselle sonique. Il ne lave pas grand-chose, mais il le fait vite.', 'Into the sonic dishwasher. It doesn\'t clean much, but it does it fast.'),
    ],
    icon: 'fork-knife',
    sound: 'scrub',
  },
  crates: {
    verb: tr('Ranger les conteneurs', 'Stack the canisters'),
    doing: tr('Rangement…', 'Stacking…'),
    done: [
      tr('Conteneurs rangés et arrimés. Le chef de soute respire.', 'Canisters stacked and secured. The loadmaster breathes again.'),
      tr('Rangés. L\'un d\'eux est marqué « Ne pas scanner ». Vous ne l\'avez pas scanné.', 'Stacked. One is marked “Do not scan”. You did not scan it.'),
    ],
    icon: 'package',
    sound: 'wrench',
  },
  limpets: {
    verb: tr('Ranger les drones', 'Store the limpets'),
    doing: tr('Rangement…', 'Storing…'),
    done: [tr('Drones collecteurs rangés dans leur baie. L\'un d\'eux clignote encore, vexé.', 'Collector limpets back in their bay. One of them is still blinking, sulking.')],
    icon: 'drone',
    sound: 'wrench',
  },
  console: {
    verb: tr('Recalibrer la console', 'Recalibrate the console'),
    doing: tr('Calibration…', 'Calibrating…'),
    done: [
      tr('Console recalibrée : les capteurs revoient les étoiles au bon endroit.', 'Console recalibrated: the sensors see the stars in the right place again.'),
      tr('Calibration terminée. Vous l\'avez éteinte et rallumée. Ça marche toujours.', 'Calibration complete. You turned it off and on again. It always works.'),
    ],
    icon: 'cpu',
    sound: 'wrench',
  },
  filter: {
    verb: tr('Changer le filtre', 'Replace the filter'),
    doing: tr('Remplacement…', 'Replacing…'),
    done: [tr('Filtre du support vital remplacé : l\'air sent de nouveau le neuf. Enfin, le vaisseau.', 'Life support filter replaced: the air smells new again. Well, like the ship.')],
    icon: 'fan',
    sound: 'wrench',
  },
  breach: {
    verb: tr('Colmater la brèche', 'Seal the breach'),
    doing: tr('Colmatage…', 'Sealing…'),
    done: [
      tr('Brèche colmatée. La pression remonte, l\'alarme se tait, tout le monde respire.', 'Breach sealed. Pressure is back up, the alarm goes quiet, everyone breathes.'),
      tr('Colmatée avec un kit de réparation… et un peu de chewing-gum. N\'en dites rien à l\'ingénieur.', 'Sealed with a repair kit… and a bit of chewing gum. Don\'t tell the engineer.'),
    ],
    icon: 'shield-warning',
    sound: 'hiss',
  },
  broken: {
    verb: tr('Réparer le panneau', 'Repair the panel'),
    doing: tr('Réparation…', 'Repairing…'),
    done: [
      tr('Panneau réparé. Plus une étincelle, sauf dans vos yeux.', 'Panel repaired. Not a spark left, except in your eyes.'),
      tr('Réparé. Il reste deux vis : elles devaient être en trop.', 'Repaired. There are two screws left over: they must have been spare.'),
    ],
    icon: 'lightning',
    sound: 'sparks',
  },
  steam: {
    verb: tr('Resserrer la vanne', 'Tighten the valve'),
    doing: tr('Serrage…', 'Tightening…'),
    done: [tr('Vanne resserrée. Le sifflement s\'arrête, le silence du vaisseau revient.', 'Valve tightened. The hissing stops, and the ship\'s quiet returns.')],
    icon: 'wind',
    sound: 'hiss',
  },
}

/** Demi-épaisseur d'un mur : une tâche murale se pose sur sa face intérieure. */
const WALL_HALF = 0.15
/** Hauteur du marqueur au-dessus du sol (au-dessus des têtes). */
const MARKER_Y = 1.18

/** Une tâche présente sur un pont, que le joueur n'a pas encore réglée. */
export interface LiveTask {
  spot: Spot
  /** Apparition en cours (cf. schedule.ts). */
  cycle: number
  deck: Deck
  /** Décor et marqueur (enfant du groupe du pont). */
  holder: THREE.Group
  marker: THREE.Sprite
  item: Interactable
  update?: (t: number) => void
}

export class TaskBoard {
  readonly live = new Map<string, LiveTask>()
  /** Apparitions réglées dans cette page (un invité n'a pas de compte ; le site peut tarder). */
  private done = new Map<string, number>()
  /** Tâche en cours de règlement : elle reste là même si son apparition se termine pendant le geste. */
  private pinned: string | null = null
  private phase = 0
  /** Le joueur s'approche d'une tâche et interagit (cf. main.ts). */
  onInteract?: (task: LiveTask) => void

  constructor(
    private readonly decks: Deck[],
    private readonly wallet: Wallet,
  ) {}

  /** Tâches présentes sur un pont. */
  count(deck: Deck): number {
    let n = 0
    for (const t of this.live.values()) if (t.deck === deck) n++
    return n
  }

  /** Réglée par ce joueur (dans cette page, ou d'après le site) ? */
  private settled(spot: Spot, cycle: number): boolean {
    return (this.done.get(spot.id) ?? -1) >= cycle || (this.wallet.tasks.get(spot.id) ?? -1) >= cycle
  }

  /** Met les ponts à l'heure : les tâches apparues arrivent, celles qui sont finies ou réglées s'en vont. */
  refresh() {
    const wanted = new Map<string, { spot: Spot; cycle: number }>()
    for (const a of activeTasks(clock.now())) if (!this.settled(a.spot, a.cycle)) wanted.set(a.spot.id, a)
    for (const [id, task] of this.live) {
      if (id === this.pinned) continue
      if (wanted.get(id)?.cycle !== task.cycle) this.remove(task)
    }
    for (const [id, a] of wanted) if (!this.live.has(id)) this.add(a.spot, a.cycle)
  }

  /** Garde une tâche pendant qu'on la règle (null : plus aucune). */
  pin(id: string | null) {
    this.pinned = id
  }

  /** Tâche réglée par ce joueur : elle disparaît, pour lui seul. */
  complete(task: LiveTask) {
    this.done.set(task.spot.id, Math.max(this.done.get(task.spot.id) ?? -1, task.cycle))
    if (this.pinned === task.spot.id) this.pinned = null
    this.remove(task)
  }

  /** Règlement pas payé (site injoignable) : la tâche revient, on pourra réessayer. */
  undo(spot: Spot, cycle: number) {
    if (this.done.get(spot.id) === cycle) this.done.delete(spot.id)
    this.refresh()
  }

  /**
   * Animation des tâches du pont affiché (décor, marqueur qui flotte). `markers` : les marqueurs
   * se montrent (pas en mode photo : ce sont des repères de l'interface).
   */
  update(t: number, deck: Deck, markers = true) {
    this.phase = t
    for (const task of this.live.values()) {
      if (task.deck !== deck) continue
      task.update?.(t)
      task.marker.visible = markers
      const bob = Math.sin(t * 2.2 + (hash32(task.spot.id) % 7)) * 0.035
      task.marker.position.y = task.marker.userData.y + bob
    }
  }

  private add(spot: Spot, cycle: number) {
    const deck = this.decks.find((d) => d.def.id === spot.deck)
    if (!deck) return
    // Place vérifiée : jamais dans un mur, un meuble ou un comptoir (cf. placement.ts).
    const place = placeTask(deck, spot)
    // En dev : le plan a bougé sous l'emplacement, economy.json est à corriger.
    if (import.meta.env.DEV && (!place || place.moved)) console.warn(`Tâche ${spot.id} : ${place ? `déplacée en (${place.x}, ${place.z})` : 'aucune place libre'}, cf. economy.json`)
    if (!place) return
    const def = taskOf(spot)
    const info = TASK_INFO[spot.task]
    const holder = new THREE.Group()
    const body = new THREE.Group()
    // Graine tirée de l'emplacement et de l'apparition : la même chez tous, différente à chaque fois.
    const f = decor(spot, hash32(`${spot.id}:${cycle}`))
    if (f.solid) body.add(f.solid)
    if (f.live) body.add(f.live)
    holder.add(body)

    let at: { x: number; z: number }
    if (place.wall !== undefined) {
      // Sur la face intérieure du mur, tournée vers la pièce (nord → face au sud…).
      const d = DIRS[place.wall]
      body.position.set(place.x + d.dx * (0.5 - WALL_HALF), 0, place.z + d.dz * (0.5 - WALL_HALF))
      body.rotation.y = (((4 - place.wall) % 4) * Math.PI) / 2
      at = { x: place.x + d.dx * 0.28, z: place.z + d.dz * 0.28 }
    } else {
      body.position.set(place.x, spot.y ?? 0, place.z)
      body.rotation.y = ((spot.rot ?? 0) * Math.PI) / 2
      at = { x: place.x, z: place.z }
    }

    // Volume invisible, qu'on clique : le décor fait parfois quelques centimètres de haut.
    body.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(body)
    const size = bounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.45, 0.35, 0.45))
    const center = bounds.getCenter(new THREE.Vector3())
    const pick = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), PICK_MATERIAL)
    pick.position.copy(center)
    pick.visible = false
    holder.add(pick)

    const marker = new THREE.Sprite(markerMaterial(info.icon))
    marker.scale.setScalar(0.34)
    marker.position.set(at.x, MARKER_Y, at.z)
    marker.userData.y = MARKER_Y
    marker.renderOrder = 4
    holder.add(marker)

    const item: Interactable = {
      object: pick,
      position: new THREE.Vector3(at.x, 0, at.z),
      label: `${info.verb} · +${formatCredits(def.reward)}`,
    }
    const task: LiveTask = { spot, cycle, deck, holder, marker, item, update: f.update }
    item.onInteract = () => this.onInteract?.(task)
    deck.group.add(holder)
    deck.interactables.push(item)
    this.live.set(spot.id, task)
    f.update?.(this.phase)
  }

  private remove(task: LiveTask) {
    task.holder.removeFromParent()
    disposeFurniture(task.holder)
    const i = task.deck.interactables.indexOf(task.item)
    if (i >= 0) task.deck.interactables.splice(i, 1)
    if (this.live.get(task.spot.id) === task) this.live.delete(task.spot.id)
  }
}

const PICK_MATERIAL = keepShared(new THREE.MeshBasicMaterial())

/** Décor d'une tâche (src/furniture/tasks.ts) ; un simple repère s'il n'existe pas encore. */
function decor(spot: Spot, seed: number): Furniture {
  const model = `task-${spot.task}`
  if (isCustomModel(model)) {
    const f = buildFurniture(model, spot.variant, seed)
    // Petites pièces : sans ombre portée (un appel de dessin de moins par tâche).
    f.solid?.traverse((o) => ((o as THREE.Mesh).castShadow = false))
    return f
  }
  const g = new THREE.Group()
  g.add(box(0.3, 0.12, 0.3, lit('#6b5a44'), 0, 0.06, 0.05), box(0.12, 0.05, 0.12, glow('#ff8a1c'), 0, 0.14, 0.05))
  return { solid: g }
}

// ---------------------------------------------------------------- marqueurs

const markers = new Map<string, THREE.SpriteMaterial>()

/**
 * Marqueur d'une tâche : hexagone sombre cerclé d'orange (l'interface d'Elite), avec l'icône de
 * la tâche. Visible à travers les murs, comme un repère de l'interface du vaisseau. Les étapes des
 * commandes du chef ont le leur, cerclé d'une autre couleur (cf. kitchen.ts).
 */
export function markerMaterial(name: IconName, stroke = '#ff8a1c'): THREE.SpriteMaterial {
  const key = `${name}:${stroke}`
  let m = markers.get(key)
  if (m) return m
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const g = canvas.getContext('2d')!
  const hexagon = (r: number) => {
    g.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r)
    }
    g.closePath()
  }
  hexagon(58)
  g.fillStyle = 'rgba(12, 14, 28, 0.82)'
  g.fill()
  g.lineWidth = 7
  g.strokeStyle = stroke
  g.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const img = new Image()
  img.onload = () => {
    g.drawImage(img, S * 0.27, S * 0.27, S * 0.46, S * 0.46)
    texture.needsUpdate = true
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name).replace('currentColor', '#ffd9a8'))}`
  m = keepShared(new THREE.SpriteMaterial({ map: keepShared(texture), transparent: true, depthTest: false, depthWrite: false }))
  markers.set(key, m)
  return m
}
