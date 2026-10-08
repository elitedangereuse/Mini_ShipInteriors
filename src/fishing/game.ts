import * as THREE from 'three'
import { tr } from '../i18n'
import { bitePlan, castPoint, FEINT_TIME, FISH, FISHING_DOCK, FISHING_POND, fishSize, pickFish, type FishSpecies } from '../../shared/fishing.js'
import type { FishCollection } from './collection'
import { fishModel } from './models'
import { fishPortrait } from './portraits'
import { fishAbout, fishName, RARITY_COLOR, RARITY_NAME } from './species'

/*
 * La pêche à l'étang du jardin exotique (pont supérieur). Le joueur se tient sur le ponton ; il
 * lance son appât là où il clique dans l'étang, puis regarde son bouchon. Le poisson tâte d'abord
 * l'appât : le bouchon frémit et s'enfonce à peine (une feinte, parfois plusieurs). Quand il plonge
 * pour de bon, il faut ferrer (cliquer, ou Espace) avant qu'il ne remonte. Trop tôt, sur une
 * feinte, le poisson s'enfuit ; trop tard, il a mangé l'appât. Une prise est montrée au joueur,
 * avec sa fiche, et rejoint sa collection (cf. collection.ts et le livre des prises, book.ts).
 *
 * Plus un poisson est rare, plus il feinte et moins il laisse de temps (cf. shared/fishing.js).
 * Tout se joue chez le joueur : les autres le voient sur le ponton, pas sa ligne.
 */

export type FishingSound = 'cast' | 'splash' | 'nibble' | 'bite' | 'catch' | 'rare' | 'miss'

type Phase = 'aim' | 'cast' | 'wait' | 'reel' | 'show'

/** Durée du lancer, puis de la sortie du poisson (secondes). */
const CAST_TIME = 0.6
const REEL_TIME = 0.75
/** Une prise affichée ne se referme pas avant cela (un clic de trop ne la fait pas disparaître). */
const SHOW_MIN = 0.7
/** Hauteur des mains du pêcheur, et longueur de la canne. */
const HANDS = 0.42
const ROD = 0.95

interface Hud {
  root: HTMLElement
  count: HTMLElement
  help: HTMLElement
  flash: HTMLElement
  card: HTMLElement
}

const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FISHING_POND.water)
const _hit = new THREE.Vector3()
const _tip = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

export class FishingGame {
  private session?: {
    phase: Phase
    /** Temps écoulé dans la phase (secondes). */
    t: number
    /** Là où le pointeur vise, puis là où le bouchon s'est posé. */
    aim: { x: number; z: number }
    fish?: FishSpecies
    size: number
    plan?: { feints: number[]; bite: number; window: number }
    /** Feintes déjà signalées (bruit, rides). */
    nibbles: number
    bitten: boolean
    model?: THREE.Object3D
    hud: Hud
    flashTime: number
  }
  /** Ce qui se dessine sur le pont : la canne, le fil, le bouchon, le repère du lancer, les rides. */
  private readonly gear = new THREE.Group()
  private readonly rod: THREE.Mesh
  private readonly line: THREE.Line
  private readonly bobber = new THREE.Group()
  private readonly ring: THREE.Mesh
  private readonly ripple: THREE.Mesh
  private rippleAge = 9
  private padFire = false
  /** Bruitages (cf. main.ts) : `at`, là où cela se passe, dans le repère du pont. */
  onSound?: (sound: FishingSound, at: THREE.Vector3) => void
  /** Le joueur lance, ou ferre : geste du personnage. */
  onGesture?: () => void
  /** L'espèce qui mordra à ce lancer, si ce n'est pas le hasard qui choisit (cf. QUEST_FISH) ; null : le tirage habituel. */
  special?: () => FishSpecies | null
  /** Une prise vient d'être sortie de l'eau. */
  onCatch?: (fish: FishSpecies, size: number) => void
  /** Le joueur veut ouvrir le livre des prises. */
  onBook?: () => void

  /** @param group le pont supérieur : la ligne s'y dessine, dans son repère */
  constructor(private group: THREE.Object3D, private collection: FishCollection) {
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.014, ROD, 5).translate(0, ROD / 2, 0), new THREE.MeshLambertMaterial({ color: '#3a2e28' }))
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.7 }))
    this.line.frustumCulled = false
    const red = new THREE.MeshLambertMaterial({ color: '#ff3c2e' }), white = new THREE.MeshLambertMaterial({ color: '#fbf8f0' })
    this.bobber.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red),
      new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white),
      new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4).translate(0, 0.06, 0), red),
    )
    const paint = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.14, 24).rotateX(-Math.PI / 2), paint('#ffd24a', 0.9))
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2), paint('#ffffff', 0.7))
    this.ring.renderOrder = this.ripple.renderOrder = 3
    this.gear.add(this.rod, this.line, this.bobber, this.ring, this.ripple)
    this.gear.visible = false
    group.add(this.gear)
  }

  get active() { return !!this.session }

  /** Azimut et inclinaison de la vue subjective (cf. FirstPersonCamera) : derrière le pêcheur, face à l'étang. */
  readonly viewYaw = Math.PI
  readonly viewPitch = THREE.MathUtils.degToRad(-14)

  /** Cap du personnage (cf. Player.setHeading) : tourné vers son bouchon, ou vers là où il vise. */
  get heading(): number {
    const s = this.session
    return s ? Math.atan2(s.aim.x - FISHING_DOCK.x, s.aim.z - FISHING_DOCK.z) : 0
  }

  start() {
    if (this.session) return
    this.session = { phase: 'aim', t: 0, aim: { x: FISHING_POND.x, z: FISHING_POND.z - 0.3 }, size: 0, nibbles: 0, bitten: false, hud: this.buildHud(), flashTime: 0 }
    this.gear.visible = true
    this.rippleAge = 9
    this.enter('aim')
    void this.collection.load().then(() => this.count())
    // Les portraits se rendent tous d'un coup, la première fois (cf. portraits.ts) : maintenant,
    // pendant qu'on vise, plutôt qu'à l'instant où le premier poisson sort de l'eau.
    setTimeout(() => fishPortrait(FISH[0]), 400)
  }

  stop() {
    const s = this.session
    if (!s) return
    this.session = undefined
    this.padFire = false
    this.gear.visible = false
    this.drop(s.model)
    s.hud.root.remove()
  }

  // ------------------------------------------------------------------ commandes

  /** Vise le point de l'étang sous le curseur (ou le doigt, ou la mire). */
  aimAt(camera: THREE.Camera, clientX: number, clientY: number) {
    const s = this.session
    if (s?.phase !== 'aim') return
    _ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    _ray.setFromCamera(_ndc, camera)
    // Le plan de l'eau, dans le repère du pont (le pont est posé à sa hauteur dans la scène).
    _plane.constant = -(this.group.getWorldPosition(_hit).y + FISHING_POND.water)
    if (!_ray.ray.intersectPlane(_plane, _hit)) return
    this.group.worldToLocal(_hit)
    s.aim = castPoint(_hit.x, _hit.z)
  }

  /** Le geste du jeu : lancer, ferrer, ou ranger la prise qu'on regarde. */
  press() {
    const s = this.session
    if (!s) return
    if (s.phase === 'aim') {
      this.enter('cast')
      this.onGesture?.()
      this.onSound?.('cast', this.bobber.position)
    } else if (s.phase === 'wait') {
      const plan = s.plan!
      this.onGesture?.()
      if (s.t >= plan.bite) return this.enter('reel')
      const feint = plan.feints.some((f) => s.t >= f && s.t <= f + FEINT_TIME)
      this.flash(feint ? tr('Trop tôt : ce n\'était qu\'une feinte. Il s\'enfuit !', 'Too soon: that was only a feint. It got away!') : tr('Rien au bout de la ligne.', 'Nothing on the line.'), false)
      if (feint) this.onSound?.('miss', this.bobber.position)
      this.enter('aim')
    } else if (s.phase === 'show' && s.t >= SHOW_MIN) {
      this.drop(s.model)
      s.model = undefined
      this.enter('aim')
    }
  }

  /** @returns true si la touche est prise par le jeu */
  key(e: KeyboardEvent): boolean {
    if (!this.session) return false
    if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'NumpadEnter') return false
    e.preventDefault()
    if (e.code === 'Escape') this.stop()
    else if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) this.press()
    return true
  }

  /** Manette : le stick déplace la visée, le bouton d'action lance et ferre. */
  pad(x: number, y: number, fire: boolean, dt: number) {
    const s = this.session
    if (!s) return
    if (s.phase === 'aim' && Math.hypot(x, y) > 0.15) s.aim = castPoint(s.aim.x + x * 2.4 * dt, s.aim.z - y * 2.4 * dt)
    if (fire && !this.padFire) this.press()
    this.padFire = fire
  }

  // ------------------------------------------------------------------ partie

  private enter(phase: Phase) {
    const s = this.session!
    s.phase = phase
    s.t = 0
    s.hud.card.hidden = phase !== 'show'
    const coarse = matchMedia('(pointer: coarse)').matches
    if (phase === 'aim') {
      s.hud.help.textContent = coarse
        ? tr('Touchez l\'étang pour lancer votre appât', 'Touch the pond to cast your bait')
        : tr('Cliquez dans l\'étang pour lancer votre appât (ou Espace)', 'Click in the pond to cast your bait (or Space)')
    } else if (phase === 'cast' || phase === 'wait') {
      s.hud.help.textContent = coarse
        ? tr('Le bouchon frémit ? Attendez. Il plonge ? Touchez l\'écran pour ferrer !', 'Bobber twitching? Wait. It dives? Touch the screen to strike!')
        : tr('Le bouchon frémit ? Attendez. Il plonge ? Cliquez (ou Espace) pour ferrer !', 'Bobber twitching? Wait. It dives? Click (or Space) to strike!')
    } else if (phase === 'show') {
      s.hud.help.textContent = coarse ? tr('Touchez l\'écran pour relancer', 'Touch the screen to cast again') : tr('Cliquez (ou Espace) pour relancer', 'Click (or Space) to cast again')
    }
    if (phase === 'cast') {
      // Une espèce qui ne sort pas du tirage (la koï du sillage, cf. main.ts) passe devant les autres.
      s.fish = this.special?.() ?? pickFish()
      s.size = fishSize(s.fish)
      s.plan = bitePlan(s.fish)
      s.nibbles = 0
      s.bitten = false
    } else if (phase === 'reel') {
      const fish = s.fish!
      // Dans le monde, un poisson tient entre les mains : sa taille compte, sans aller jusqu'au mètre.
      s.model = fishModel(fish, THREE.MathUtils.clamp(s.size / 160, 0.22, 0.62))
      this.gear.add(s.model)
      this.splash(s.aim.x, s.aim.z, 0.5)
      this.onSound?.('splash', this.bobber.position)
    } else if (phase === 'show') this.reveal()
  }

  /** La prise, à l'écran : son portrait, son nom, sa rareté, sa taille, ce qu'en dit le livre. */
  private reveal() {
    const s = this.session!, fish = s.fish!, card = s.hud.card
    const el = (tag: string, className: string, text = '') => {
      const node = document.createElement(tag)
      node.className = className
      node.textContent = text
      return node
    }
    card.replaceChildren()
    card.style.setProperty('--rarity', RARITY_COLOR[fish.rarity])
    card.dataset.rarity = fish.rarity
    const portrait = el('img', 'fish-portrait') as HTMLImageElement
    portrait.alt = ''
    portrait.draggable = false
    portrait.src = fishPortrait(fish)
    const tags = el('div', 'fish-tags')
    const news = el('span', 'fish-new')
    tags.append(el('span', 'fish-rarity', RARITY_NAME[fish.rarity]), el('span', 'fish-size', `${s.size} cm`), news)
    card.append(portrait, tags, el('strong', 'fish-name', fishName(fish)), el('p', 'fish-about', fishAbout(fish)))
    const kept = el('span', 'fish-kept')
    card.append(kept)
    const first = !this.collection.has(fish.id), best = this.collection.caught[fish.id]?.best ?? 0
    if (first) news.textContent = tr('Nouvelle espèce !', 'New species!')
    else if (s.size > best) news.textContent = tr(`Record : ${best} cm battu`, `Best: ${best} cm beaten`)
    news.hidden = !news.textContent
    this.onSound?.(first || fish.rarity === 'epic' || fish.rarity === 'legendary' ? 'rare' : 'catch', this.bobber.position)
    this.onCatch?.(fish, s.size)
    void this.collection.add(fish.id, s.size).then((result) => {
      if (this.session !== s) return
      this.count()
      if (result.kept === 'guest') kept.textContent = tr('Invité : votre collection reste dans ce navigateur. Connectez-vous au site pour la garder.', 'Guest: your collection stays in this browser. Sign in to the site to keep it.')
      else if (result.kept === 'local') kept.textContent = tr('Site indisponible : prise gardée dans ce navigateur.', 'Site unavailable: catch kept in this browser.')
    })
  }

  private drop(model: THREE.Object3D | undefined) {
    // Géométries et matériaux partagés avec le pack (cf. models.ts) : on ne libère rien.
    if (model) this.gear.remove(model)
  }

  /** Des rides à la surface, en (x, z) : un anneau qui s'élargit et s'efface. */
  private splash(x: number, z: number, size: number) {
    this.ripple.position.set(x, FISHING_POND.water + 0.004, z)
    this.ripple.userData.size = size
    this.rippleAge = 0
  }

  /** @param dt temps écoulé (secondes) */
  update(dt: number) {
    const s = this.session
    if (!s) return
    s.t += dt
    const water = FISHING_POND.water
    // La canne : tenue devant le pêcheur, pointée vers le bouchon ; elle plie quand ça mord.
    const yaw = this.heading, dx = Math.sin(yaw), dz = Math.cos(yaw)
    const biting = s.phase === 'wait' && s.t >= s.plan!.bite
    const lift = s.phase === 'reel' || s.phase === 'show' ? 1.15 : biting ? 0.45 : s.phase === 'cast' ? 0.5 + 0.5 * Math.min(1, s.t / CAST_TIME) : 0.75
    this.rod.position.set(FISHING_DOCK.x + dx * 0.2, HANDS, FISHING_DOCK.z + dz * 0.2)
    this.rod.quaternion.setFromUnitVectors(_up, _tip.set(dx * Math.cos(lift), Math.sin(lift), dz * Math.cos(lift)))
    _tip.multiplyScalar(ROD).add(this.rod.position)

    const b = this.bobber.position
    this.ring.visible = s.phase === 'aim'
    this.bobber.visible = s.phase === 'cast' || s.phase === 'wait'
    if (s.phase === 'aim') {
      this.ring.position.set(s.aim.x, water + 0.006, s.aim.z)
      this.ring.scale.setScalar(1 + 0.12 * Math.sin(s.t * 5))
      b.copy(_tip)
    } else if (s.phase === 'cast') {
      const k = Math.min(1, s.t / CAST_TIME)
      b.set(THREE.MathUtils.lerp(_tip.x, s.aim.x, k), THREE.MathUtils.lerp(_tip.y, water + 0.03, k) + Math.sin(k * Math.PI) * 0.55, THREE.MathUtils.lerp(_tip.z, s.aim.z, k))
      if (k >= 1) {
        this.splash(s.aim.x, s.aim.z, 0.3)
        this.onSound?.('splash', b)
        this.enter('wait')
      }
    } else if (s.phase === 'wait') {
      const plan = s.plan!
      let dip = Math.sin(s.t * 3) * 0.006
      // Les feintes : le bouchon frémit et s'enfonce à peine.
      plan.feints.forEach((f, i) => {
        if (s.t < f) return
        if (i >= s.nibbles) {
          s.nibbles = i + 1
          this.splash(s.aim.x, s.aim.z, 0.18)
          this.onSound?.('nibble', b)
        }
        if (s.t <= f + FEINT_TIME) dip -= 0.032 * Math.sin(((s.t - f) / FEINT_TIME) * Math.PI) * (1 + 0.5 * Math.sin(s.t * 40))
      })
      if (s.t >= plan.bite) {
        if (!s.bitten) {
          s.bitten = true
          this.splash(s.aim.x, s.aim.z, 0.42)
          this.onSound?.('bite', b)
          this.flash(tr('Ça mord !', 'A bite!'), true)
        }
        dip = -0.085 - 0.01 * Math.sin(s.t * 30)
        if (s.t > plan.bite + plan.window) {
          this.flash(tr('Trop tard : il a mangé l\'appât.', 'Too late: it ate the bait.'), false)
          this.onSound?.('miss', b)
          this.enter('aim')
        }
      }
      b.set(s.aim.x, water + 0.03 + dip, s.aim.z)
      this.bobber.rotation.z = biting ? 0.5 : 0
    } else if (s.model) {
      // Le poisson sort de l'eau, vole jusqu'aux mains du pêcheur, puis frétille au bout du fil.
      const hold = { x: FISHING_DOCK.x + dx * 0.42, y: HANDS + 0.28, z: FISHING_DOCK.z + dz * 0.42 }
      const k = s.phase === 'reel' ? Math.min(1, s.t / REEL_TIME) : 1
      s.model.position.set(THREE.MathUtils.lerp(s.aim.x, hold.x, k), THREE.MathUtils.lerp(water, hold.y, k) + Math.sin(k * Math.PI) * 0.7, THREE.MathUtils.lerp(s.aim.z, hold.z, k))
      // De profil pour le joueur, le nez en l'air tant qu'il vole.
      s.model.rotation.set(s.phase === 'reel' ? -1.1 * (1 - k) : 0, yaw + Math.PI / 2 + Math.sin(s.t * 9) * (s.phase === 'reel' ? 0.5 : 0.22), 0)
      b.copy(s.model.position)
      if (s.phase === 'reel' && k >= 1) this.enter('show')
    }

    // Le fil : du bout de la canne au bouchon (ou au poisson), un peu détendu.
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute
    const slack = s.phase === 'wait' && !biting ? 0.12 : 0.02
    pos.setXYZ(0, _tip.x, _tip.y, _tip.z)
    pos.setXYZ(1, (_tip.x + b.x) / 2, (_tip.y + b.y) / 2 - slack, (_tip.z + b.z) / 2)
    pos.setXYZ(2, b.x, b.y, b.z)
    pos.needsUpdate = true
    this.line.visible = s.phase !== 'aim'

    this.rippleAge += dt
    const life = this.rippleAge / 0.8
    this.ripple.visible = life < 1
    if (life < 1) {
      this.ripple.scale.setScalar((this.ripple.userData.size as number) * (0.3 + 0.7 * life))
      ;(this.ripple.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - life)
    }
    if (s.flashTime > 0 && (s.flashTime -= dt) <= 0) s.hud.flash.classList.remove('show')
  }

  // ------------------------------------------------------------------ affichage

  private buildHud(): Hud {
    const el = (tag: string, className: string, text = '') => {
      const node = document.createElement(tag)
      node.className = className
      node.textContent = text
      return node
    }
    const root = el('div', 'court-hud fish-hud')
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', tr('Pêche', 'Fishing'))
    const top = el('div', 'court-top')
    const box = el('div', 'court-box')
    const count = el('strong', 'fish-count')
    box.append(el('span', 'court-label', tr('Pêche à l\'étang', 'Pond fishing')), count, el('span', 'court-best', tr('espèces prises', 'species caught')))
    const book = el('button', 'court-quit', tr('Livre des prises', 'Catch book')) as HTMLButtonElement
    book.type = 'button'
    book.onclick = () => { this.stop(); this.onBook?.() }
    const quit = el('button', 'court-quit', tr('Ranger la canne (Échap)', 'Put the rod away (Esc)')) as HTMLButtonElement
    quit.type = 'button'
    quit.onclick = () => this.stop()
    top.append(box, book, quit)
    const flash = el('div', 'court-flash')
    flash.setAttribute('aria-live', 'polite')
    const help = el('div', 'court-power fish-help')
    const card = el('div', 'fish-card')
    card.setAttribute('aria-live', 'polite')
    card.hidden = true
    root.append(top, flash, card, help)
    document.body.append(root)
    const hud = { root, count, help, flash, card }
    this.count(hud)
    return hud
  }

  private count(hud = this.session?.hud) {
    const { caught, total } = this.collection.progress
    if (hud) hud.count.textContent = `${caught} / ${total}`
  }

  private flash(text: string, good: boolean) {
    const s = this.session!
    s.hud.flash.textContent = text
    s.hud.flash.classList.toggle('good', good)
    s.hud.flash.classList.add('show')
    s.flashTime = 1.6
  }
}
