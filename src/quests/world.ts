import * as THREE from 'three'
import type { Rig } from '../assets'
import type { Deck, Interactable } from '../deck'
import type { Spot } from '../economy/data'
import { placeTask } from '../economy/placement'
import { markerMaterial } from '../economy/tasks'
import { buildFurniture, disposeFurniture, isCustomModel, keepShared } from '../furniture'
import { DIRS } from '../map'
import { petRig, speciesOf } from '../pets'
import { dampAngle } from '../player'
import { QUEST_ROOMS, questById } from '../../shared/quests.js'
import type { Choice, Cinematic, Line } from './cinematic'
import { QUEST_CONTENT, stepHooks, type Hook, type QuestActor, type QuestContent, type QuestProp } from './content'
import type { QuestStore } from './store'

/*
 * Les quêtes dans le vaisseau : les objets et les animaux qu'elles y posent (visibles du seul
 * joueur dont la quête en est là), le « ! » au-dessus de ce qui en propose une, et ce qui se passe
 * quand on interagit avec une de leurs cibles : la scène se joue (cf. cinematic.ts), puis le
 * journal avance (cf. store.ts). Une scène refermée avant la fin ne compte pas.
 */

/** Une cible de quête dans le vaisseau : un membre d'équipage, un meuble, une porte, un objet de quête. */
interface Target {
  deck: Deck
  item: Interactable
  /** Hauteur du « ! » au-dessus du sol. */
  y: number
  /** Le personnage reste là, tourné vers le joueur (rappelé toutes les 3 s pendant une scène). */
  hold?: () => void
  emote?: (id: string) => void
  /** Occupé avec le joueur (une commande, une consultation) : la quête attendra. */
  busy?: () => boolean
}

export type QuestEvent = 'start' | 'step' | 'part' | 'done'

export interface QuestHost {
  decks: Deck[]
  /** Pont où se trouve le joueur. */
  deck(): Deck
  /** Position du joueur. */
  player: THREE.Vector3
  /** Avant une scène : le joueur s'arrête et se tourne vers ce qu'il regarde. */
  face(at: THREE.Vector3): void
  /** Emote du joueur, pendant une scène. */
  emote(id: string): void
  /** Une quête commence, avance (`detail` : ce que le journal garde d'un élément réuni), se termine. */
  announce(event: QuestEvent, quest: QuestContent, detail?: string): void
  /** Cri d'un animal de quête. */
  bark(at: THREE.Vector3): void
}

const MARK_OBJECT = 1.2
const MARK_PERSON = 1.45
const MARK_DOOR = 1.55
/** Volume invisible qu'on clique : un objet de quête fait parfois quelques centimètres de haut. */
const PICK_MATERIAL = keepShared(new THREE.MeshBasicMaterial())

interface LiveProp {
  holder: THREE.Group
  item: Interactable
  deck: Deck
  key: string
  update?: (t: number) => void
}

interface LiveActor {
  /** L'animal, une fois son modèle chargé. */
  pet?: QuestPet
  item?: Interactable
  deck: Deck
  key: string
}

export class QuestWorld {
  /** Cibles, par clé (cf. keyOf). */
  private readonly targets = new Map<string, Target[]>()
  private readonly props = new Map<string, LiveProp>()
  private readonly actors = new Map<string, LiveActor>()
  private readonly marks = new Map<Target, THREE.Sprite>()
  /** Portes des pièces qu'une quête ouvre : on les examine même si la pièce est fermée. */
  readonly doorItems = new Set<Interactable>()
  /** Scènes d'appoint déjà jouées : la fois suivante, le personnage reprend sa conversation. */
  private readonly asides = new Set<Hook>()
  private dirty = true
  /** Celui à qui l'on parle : tenu en place tant que la scène dure. */
  private held: Target | null = null
  private holdIn = 0

  constructor(
    private readonly host: QuestHost,
    private readonly store: QuestStore,
    private readonly cinematic: Cinematic,
  ) {
    store.subscribe(() => (this.dirty = true))
    // Les portes des pièces fermées par une quête.
    for (const { quest, level, room } of QUEST_ROOMS) {
      const deck = host.decks.find((d) => d.def.id === level)
      if (!deck) continue
      for (const d of deck.map.doors) {
        const step = DIRS[d.dir]
        if (deck.map.room(d.x, d.z) !== room && deck.map.room(d.x + step.dx, d.z + step.dz) !== room) continue
        const item = deck.doorExamine(d.x, d.z, d.dir)
        if (!item) continue
        this.doorItems.add(item)
        this.add(`${quest}|door`, { deck, item, y: MARK_DOOR })
      }
    }
    // Les meubles du vaisseau que des scènes visent (`item:<pont>:<modèle>`).
    for (const on of this.wanted()) {
      const m = /^item:(-?\d+):(.+)$/.exec(on)
      if (!m) continue
      const deck = host.decks.find((d) => d.def.id === Number(m[1]))
      const item = deck?.interactables.find((it) => it.furniture?.model === m[2])
      if (deck && item) this.add(on, { deck, item, y: /bugenhagen|teacher/.test(m[2]) ? MARK_PERSON : MARK_OBJECT })
    }
  }

  /** Toutes les cibles nommées par les quêtes. */
  private wanted(): Set<string> {
    const out = new Set<string>()
    for (const q of QUEST_CONTENT) {
      out.add(q.offer.on)
      for (const step of q.steps) for (const { hook } of stepHooks(step)) out.add(hook.on)
    }
    return out
  }

  private add(key: string, target: Target) {
    const list = this.targets.get(key)
    if (list) list.push(target)
    else this.targets.set(key, [target])
  }

  /**
   * Déclare un membre d'équipage (`npc:<nom>`) : son invite, de quoi le tenir en place pendant
   * une scène (il arrête sa tournée et se tourne vers le joueur), et de quoi lui faire jouer une emote.
   */
  npc(name: string, deck: Deck, item: Interactable, options: Pick<Target, 'hold' | 'emote' | 'busy'> = {}) {
    this.add(`npc:${name}`, { deck, item, y: MARK_PERSON, ...options })
  }

  /** Les objets, les animaux et les portes sont propres à leur quête ; l'équipage et les meubles, à tout le bord. */
  private keyOf(quest: QuestContent, on: string): string {
    return on === 'door' || on.startsWith('prop:') || on.startsWith('actor:') ? `${quest.id}|${on}` : on
  }

  /** La cible `on` de la quête à laquelle correspond `item`, s'il y en a une. */
  private targetOf(quest: QuestContent, on: string, item: Interactable): Target | undefined {
    return this.targets.get(this.keyOf(quest, on))?.find((t) => t.item === item)
  }

  /** La pièce `room` du pont `level` est-elle ouverte au joueur (aucune quête ne la ferme, ou elle est terminée) ? */
  roomOpen(level: number, room: string | null): boolean {
    const gate = QUEST_ROOMS.find((r) => r.level === level && r.room === room)
    return !gate || this.store.isDone(gate.quest)
  }

  /**
   * En dev : chaque quête racontée a son squelette (shared/quests.js), étape pour étape, et chacune
   * de ses cibles existe à bord. À appeler une fois l'équipage déclaré.
   */
  check() {
    if (!import.meta.env.DEV) return
    for (const q of QUEST_CONTENT) {
      const def = questById(q.id)
      if (!def) {
        console.warn(`Quête ${q.id} : absente de shared/quests.js`)
        continue
      }
      if (def.steps.length !== q.steps.length) console.warn(`Quête ${q.id} : ${q.steps.length} étapes racontées, ${def.steps.length} dans shared/quests.js`)
      q.steps.forEach((step, i) => {
        if ((step.parts?.length ?? 0) !== (def.steps[i] ?? 0)) console.warn(`Quête ${q.id}, étape ${i} : ${step.parts?.length ?? 0} éléments racontés, ${def.steps[i]} dans shared/quests.js`)
        if (!step.parts?.length && !step.hooks?.length) console.warn(`Quête ${q.id}, étape ${i} : rien ne la termine`)
      })
      const own = new Set([...(q.props ?? []).map((p) => `prop:${p.id}`), ...(q.actors ?? []).map((a) => `actor:${a.id}`)])
      for (const on of [q.offer.on, ...q.steps.flatMap((s) => stepHooks(s).map((h) => h.hook.on))]) {
        if (own.has(on) || this.targets.has(this.keyOf(q, on))) continue
        console.warn(`Quête ${q.id} : cible « ${on} » introuvable à bord`)
      }
      for (const p of q.props ?? []) if (!isCustomModel(p.model)) console.warn(`Quête ${q.id} : modèle « ${p.model} » inconnu`)
    }
  }

  // ---------------------------------------------------------------- interactions

  /**
   * Le joueur interagit avec `item` : si une quête l'attend là, sa scène se joue et l'on rend
   * true (l'interaction habituelle n'a pas lieu).
   */
  intercept(item: Interactable): boolean {
    if (this.cinematic.active) return true
    if (!this.store.ready) return false
    // D'abord ce qui fait avancer une quête en cours.
    for (const quest of QUEST_CONTENT) {
      const state = this.store.state(quest.id)
      if (!state || state.done) continue
      for (const { hook, part, aside } of stepHooks(quest.steps[state.step])) {
        if (aside || (part !== null && (state.flags >> part) & 1)) continue
        const target = this.targetOf(quest, hook.on, item)
        if (!target || target.busy?.()) continue
        void this.runStep(quest, hook, target, part)
        return true
      }
    }
    // Puis ce qui en propose une.
    for (const quest of QUEST_CONTENT) {
      if (this.store.state(quest.id)) continue
      const target = this.targetOf(quest, quest.offer.on, item)
      if (!target || target.busy?.()) continue
      void this.runOffer(quest, target)
      return true
    }
    // Puis ce qu'on peut apprendre de plus (une fois), et la porte toujours fermée.
    for (const quest of QUEST_CONTENT) {
      const state = this.store.state(quest.id)
      if (!state || state.done) continue
      for (const { hook, aside } of stepHooks(quest.steps[state.step])) {
        if (!aside || this.asides.has(hook)) continue
        const target = this.targetOf(quest, hook.on, item)
        if (!target || target.busy?.()) continue
        void this.play(hook.scene, target).then((end) => end && this.asides.add(hook))
        return true
      }
      const door = quest.locked && this.targetOf(quest, 'door', item)
      if (door) {
        void this.play(quest.locked!, door)
        return true
      }
    }
    return false
  }

  /** Joue une scène devant sa cible ; rend ce que rend Cinematic.play. */
  private play(scene: Line[], target: Target, choices?: Choice[]): Promise<string | null> {
    this.host.face(target.item.position)
    target.hold?.()
    this.held = target
    this.holdIn = 3
    return this.cinematic.play(scene, {
      target: () => target.item.position,
      choices,
      onLine: (l) => {
        if (l.emote) target.emote?.(l.emote)
        if (l.me) this.host.emote(l.me)
      },
    })
  }

  private async runOffer(quest: QuestContent, target: Target) {
    const choice = await this.play(quest.offer.scene, target, [{ label: quest.offer.accept, value: 'accept' }, { label: quest.offer.decline, value: 'decline' }])
    if (choice === 'accept' && this.store.start(quest.id)) this.host.announce('start', quest)
  }

  private async runStep(quest: QuestContent, hook: Hook, target: Target, part: number | null) {
    const step = this.store.state(quest.id)?.step
    if (!(await this.play(hook.scene, target))) return
    // Le journal a pu changer pendant la scène (un autre onglet) : l'étape doit être la même.
    const state = this.store.state(quest.id)
    if (!state || state.done || state.step !== step) return
    if (part !== null) {
      const complete = this.store.flag(quest.id, part)
      this.host.announce('part', quest, quest.steps[state.step].parts![part].found)
      if (!complete) return
    }
    this.host.announce(this.store.advance(quest.id) ? 'done' : 'step', quest)
  }

  // ---------------------------------------------------------------- le vaisseau

  /** Met le vaisseau à jour sur le journal : objets et animaux présents, « ! » à afficher. */
  private sync() {
    this.dirty = false
    const ready = this.store.ready
    const marked = new Set<Target>()
    for (const quest of QUEST_CONTENT) {
      const state = this.store.state(quest.id)
      for (const prop of quest.props ?? []) {
        const key = `${quest.id}|prop:${prop.id}`
        const wanted = ready && prop.when(state)
        if (wanted && !this.props.has(key)) this.spawnProp(key, prop)
        else if (!wanted && this.props.has(key)) this.removeProp(key)
      }
      for (const actor of quest.actors ?? []) {
        const key = `${quest.id}|actor:${actor.id}`
        const wanted = ready && actor.when(state)
        if (wanted && !this.actors.has(key)) this.spawnActor(key, actor)
        else if (!wanted && this.actors.has(key)) this.removeActor(key)
      }
      // Une quête pas encore commencée : ce qui la propose est signalé.
      if (ready && !state) for (const t of this.targets.get(this.keyOf(quest, quest.offer.on)) ?? []) marked.add(t)
    }
    for (const [target, sprite] of this.marks) {
      if (marked.has(target)) continue
      sprite.removeFromParent()
      this.marks.delete(target)
    }
    for (const target of marked) {
      if (this.marks.has(target)) continue
      const sprite = new THREE.Sprite(markerMaterial('exclamation-mark', '#ffd24a'))
      sprite.scale.setScalar(0.4)
      sprite.renderOrder = 4
      target.deck.group.add(sprite)
      this.marks.set(target, sprite)
    }
  }

  private spawnProp(key: string, prop: QuestProp) {
    const deck = this.host.decks.find((d) => d.def.id === prop.deck)
    if (!deck || !isCustomModel(prop.model)) return
    // Place vérifiée, comme pour une tâche de bord : jamais dans un meuble ni devant une porte.
    const spot = { id: key, task: 'trash', deck: prop.deck, x: prop.x, z: prop.z } as Spot
    const place = prop.fixed ? { x: prop.x, z: prop.z, moved: false } : placeTask(deck, spot)
    if (import.meta.env.DEV && (!place || place.moved)) console.warn(`Objet de quête ${key} : ${place ? `déplacé en (${place.x}, ${place.z})` : 'aucune place libre'}`)
    if (!place) return
    const f = buildFurniture(prop.model, undefined, Math.round(prop.x * 10) * 131 + Math.round(prop.z * 10))
    const holder = new THREE.Group()
    const body = new THREE.Group()
    if (f.solid) body.add(f.solid)
    if (f.live) body.add(f.live)
    holder.add(body)
    body.position.set(place.x, 0, place.z)
    body.rotation.y = ((prop.rot ?? 0) * Math.PI) / 2
    body.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(body)
    const size = bounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.45, 0.35, 0.45))
    const pick = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), PICK_MATERIAL)
    pick.position.copy(bounds.getCenter(new THREE.Vector3()))
    pick.visible = false
    holder.add(pick)
    const item: Interactable = { object: pick, position: new THREE.Vector3(place.x, 0, place.z), label: prop.label ?? '', text: prop.idle }
    deck.group.add(holder)
    // Sans invite, un simple décor : on ne l'examine pas.
    if (prop.label) {
      deck.interactables.push(item)
      this.add(key, { deck, item, y: Math.max(MARK_OBJECT, bounds.max.y + 0.45) })
    }
    this.props.set(key, { holder, item, deck, key, update: f.update })
  }

  private removeProp(key: string) {
    const live = this.props.get(key)
    if (!live) return
    live.holder.removeFromParent()
    disposeFurniture(live.holder)
    this.forget(key, live.deck, live.item)
    this.props.delete(key)
  }

  /** Retire une invite du pont, et la cible qui allait avec. */
  private forget(key: string, deck: Deck, item: Interactable) {
    const i = deck.interactables.indexOf(item)
    if (i >= 0) deck.interactables.splice(i, 1)
    for (const target of this.targets.get(key) ?? []) {
      this.marks.get(target)?.removeFromParent()
      this.marks.delete(target)
    }
    this.targets.delete(key)
  }

  private spawnActor(key: string, actor: QuestActor) {
    const deck = this.host.decks.find((d) => d.def.id === actor.deck)
    const species = speciesOf(actor.species)
    if (!deck || !species) return
    const live: LiveActor = { deck, key }
    this.actors.set(key, live)
    void petRig(species, undefined).then((rig) => {
      // Parti pendant le chargement (quête abandonnée, terminée).
      if (this.actors.get(key) !== live) return
      const pet = new QuestPet(rig, deck, actor.x, actor.z, species.scale)
      pet.onBark = () => this.host.bark(pet.root.position)
      live.pet = pet
      live.item = { object: pet.root, position: pet.root.position, label: actor.label, text: actor.idle }
      deck.interactables.push(live.item)
      this.add(key, { deck, item: live.item, y: MARK_OBJECT })
      this.dirty = true
    })
  }

  private removeActor(key: string) {
    const live = this.actors.get(key)
    if (!live) return
    live.pet?.root.removeFromParent()
    if (live.item) this.forget(key, live.deck, live.item)
    this.actors.delete(key)
  }

  /**
   * @param t horloge des meubles (cf. holoTime)
   * @param marks les « ! » se montrent (pas en mode photo ni pendant une scène : ce sont des repères de l'interface)
   */
  update(dt: number, t: number, marks: boolean) {
    if (this.dirty) this.sync()
    const deck = this.host.deck()
    for (const [target, sprite] of this.marks) {
      sprite.visible = marks
      if (target.deck !== deck) continue
      const p = target.item.position
      sprite.position.set(p.x, target.y + Math.sin(t * 2.4 + p.x) * 0.045, p.z)
    }
    for (const live of this.props.values()) if (live.deck === deck) live.update?.(t)
    for (const quest of QUEST_CONTENT) {
      for (const actor of quest.actors ?? []) {
        const live = this.actors.get(`${quest.id}|actor:${actor.id}`)
        if (live?.pet) live.pet.update(dt, live.deck === deck ? this.host.player : null, actor.follows(this.store.state(quest.id)))
      }
    }
    // Celui à qui l'on parle ne reprend pas sa tournée au milieu d'une phrase.
    if (!this.cinematic.active) this.held = null
    else if (this.held?.hold && (this.holdIn -= dt) <= 0) {
      this.holdIn = 3
      this.held.hold()
    }
  }
}

// ---------------------------------------------------------------- l'animal d'une quête

const PET_WALK = 1.7
const PET_RUN = 3.4
/** Il s'arrête à cette distance du joueur, et repart quand le joueur s'éloigne au-delà de la seconde. */
const PET_NEAR = 0.75
const PET_FAR = 1.35

/**
 * Animal d'une quête (un compagnon des Cube Pets) : il attend, tapi, tourné vers qui approche ;
 * puis, apprivoisé, il suit le joueur sur son pont, par le chemin le plus court.
 */
class QuestPet {
  readonly root = new THREE.Group()
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private current?: THREE.AnimationAction
  private path: { x: number; z: number }[] = []
  private repath = 0
  private yaw = 0
  private moving = false
  private barkIn = 4
  onBark?: () => void

  constructor(rig: Rig, private readonly deck: Deck, x: number, z: number, scale: number) {
    rig.root.scale.setScalar(scale)
    this.root.add(rig.root)
    this.root.position.set(x, 0, z)
    this.mixer = new THREE.AnimationMixer(rig.root)
    for (const clip of rig.clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.play('idle')
    deck.group.add(this.root)
  }

  private play(name: string) {
    const next = this.actions.get(name)
    if (!next || next === this.current) return
    next.reset().fadeIn(0.2).play()
    this.current?.fadeOut(0.2)
    this.current = next
  }

  /** @param player position du joueur s'il est sur le pont de l'animal, sinon null */
  update(dt: number, player: THREE.Vector3 | null, follows: boolean) {
    this.mixer.update(dt)
    if (dt <= 0) return
    const p = this.root.position
    const distance = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity
    if (player && distance < 4) this.yaw = Math.atan2(player.x - p.x, player.z - p.z)
    if (player && follows) {
      if (!this.moving && distance > PET_FAR) this.moving = true
      if (this.moving && distance < PET_NEAR) {
        this.moving = false
        this.path = []
      }
      if (this.moving) this.chase(dt, player, distance)
      // Content d'être là : il le dit de temps en temps.
      if ((this.barkIn -= dt) <= 0) {
        this.barkIn = 9 + Math.random() * 10
        this.onBark?.()
      }
    } else this.moving = false
    this.play(this.moving ? (distance > 3 ? 'run' : 'walk') : 'idle')
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 9, dt)
  }

  private chase(dt: number, player: THREE.Vector3, distance: number) {
    const p = this.root.position
    if ((this.repath -= dt) <= 0) {
      this.repath = 0.35
      const tiles = this.deck.pathfinder.find({ x: Math.round(p.x), z: Math.round(p.z) }, { x: Math.round(player.x), z: Math.round(player.z) }, false)
      // Le dernier pas se fait droit sur le joueur ; sans chemin (joueur sur un meuble), tout droit.
      this.path = tiles ? [...tiles.slice(1, -1).map((t) => ({ x: t.x, z: t.z })), { x: player.x, z: player.z }] : [{ x: player.x, z: player.z }]
    }
    const next = this.path[0]
    if (!next) return
    const dx = next.x - p.x, dz = next.z - p.z
    const d = Math.hypot(dx, dz)
    const step = Math.min(d, (distance > 3 ? PET_RUN : PET_WALK) * dt)
    if (d > 1e-4) {
      p.x += (dx / d) * step
      p.z += (dz / d) * step
      this.yaw = Math.atan2(dx, dz)
    }
    if (d - step < 0.06) this.path.shift()
  }
}
