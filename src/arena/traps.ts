import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { ArenaTrap } from '../net'
import { ARENA_CHARACTERS, ARENA_RULES } from '../../shared/arena.js'
import type { CombatFx } from './fx'
import { arenaFx } from './settings'

/*
 * Ce que les personnages laissent sur le terrain (cf. server/arena.js, qui les fait vivre), dans
 * l'arène. Tout ce qu'on en voit suit ce que dit le relais : la croissance, l'armement d'une fleur,
 * ses morsures, la fin ; rien de ce qu'on voit ne décide d'un dégât.
 * - Les fleurs carnivores de Capucine : elles jaillissent de terre dans une gerbe de terre (la tige
 *   pousse, les feuilles se déplient, la tête s'ouvre), se balancent, puis, quand une proie entre à
 *   portée, s'arment (le relais le dit : `aim`, `strike`) : la tête se tourne vers elle, recule, ouvre
 *   grand ses mâchoires qui rougeoient, et tremble ; elle mord en se détendant vers sa proie, mâchoires
 *   claquées. À la fin, elle fane : la tête retombe, tout brunit et rentre sous terre.
 * - Les flaques de Jacques : une nappe de sa mixture verte qui brûle, arrêtée par un liseré sombre,
 *   des flammèches orange qui dansent dessus et tout le long de son bord (on en voit la limite), des
 *   bulles qui crèvent, des braises qui montent ; elle faiblit sur la fin, et s'éteint dans une fumée.
 * Leur portée est peinte au sol, à la couleur du camp pour le joueur (cf. palette.ts) : un voile léger,
 * un bord fin (en tirets pour celles d'en face) et un arc épais qui se rétracte avec le temps qui leur
 * reste, et clignote dans leur dernière seconde. Une fleur qui s'arme ne tourne la tête que vers une
 * proie que le joueur voit (cf. ArenaClient.seenAt) : rien de tout cela ne trahit qui se cache.
 * Leurs formes sont partagées : une fleur, une flaque de plus ne coûtent que des objets.
 */

const FLOWER = ARENA_CHARACTERS.capucine.weapon.flower!
const FIRE = ARENA_CHARACTERS.jacques.weapon.fire!

const ring = new THREE.RingGeometry(0.965, 1, 48).rotateX(-Math.PI / 2)
const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
/** Le bord d'un piège d'en face : en tirets (la forme double la couleur, cf. palette.ts). */
const dashes = (() => {
  const parts: THREE.BufferGeometry[] = []
  const n = 16
  for (let i = 0; i < n; i++) parts.push(new THREE.RingGeometry(0.955, 1, 4, 1, (i / n) * Math.PI * 2, (Math.PI * 2) / n * 0.6))
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g.rotateX(-Math.PI / 2)
})()
/** Segments de l'arc du temps qui reste (cf. Shown.timer). */
const TIMER_SEGMENTS = 48
/** Une flammèche : orange au pied, jaune à la pointe (des couleurs de sommet : pas de mélange additif, qui blanchit sur le sable). */
const flame = (() => {
  const g = new THREE.ConeGeometry(0.06, 0.2, 6).translate(0, 0.1, 0)
  const base = new THREE.Color('#ff6a14'), tip = new THREE.Color('#ffe45c'), c = new THREE.Color()
  const y = g.attributes.position
  const colors = new Float32Array(y.count * 3)
  for (let i = 0; i < y.count; i++) c.copy(base).lerp(tip, y.getY(i) / 0.2).toArray(colors, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
})()
const BUBBLE = new THREE.SphereGeometry(0.035, 8, 6)
/**
 * La nappe : la mixture verte de Jacques, claire au milieu, plus sombre vers son bord, qu'un liseré
 * foncé arrête net : on la lit sur le sable clair comme sur le métal sombre.
 */
const POOL_TEXTURE = (() => {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const r = size / 2
  const fill = g.createRadialGradient(r, r, 0, r, r, r)
  fill.addColorStop(0, 'rgba(226, 255, 120, 0.95)')
  fill.addColorStop(0.55, 'rgba(150, 214, 40, 0.9)')
  fill.addColorStop(0.86, 'rgba(84, 140, 18, 0.9)')
  fill.addColorStop(0.93, 'rgba(40, 70, 8, 0.95)')
  fill.addColorStop(1, 'rgba(40, 70, 8, 0)')
  g.fillStyle = fill
  g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color })
const STEM = lambert('#3c7a34'), LEAF = lambert('#5fae45'), JAW = lambert('#c8321e'), INSIDE = lambert('#ffb0a0'), TOOTH = lambert('#f6f1e4')
/** Armée, l'intérieur de ses mâchoires rougeoie. */
const INSIDE_ARMED = new THREE.MeshBasicMaterial({ color: '#ff5a3c', toneMapped: false })
/** Fanée : tout brunit. */
const DRY = { stem: lambert('#6b5a34'), leaf: lambert('#8a7340'), jaw: lambert('#7a4a2c'), inside: lambert('#a07860') }
const LEAF_GEO = new THREE.SphereGeometry(0.09, 8, 6)
const STEM_GEO = new THREE.CylinderGeometry(0.018, 0.026, 0.3, 6).translate(0, 0.15, 0)
const SHELL_GEO = [true, false].map((up) => new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2))
const LINING_GEO = [true, false].map((up) => new THREE.CircleGeometry(0.1, 12).rotateX(up ? Math.PI / 2 : -Math.PI / 2))
const TOOTH_GEO = new THREE.ConeGeometry(0.012, 0.035, 4)
const DIRT = '#7a5230', SMOKE = '#5a5a5a', EMBER = '#ffb347'

/** Combien de temps une fleur met à faner, une flaque à s'éteindre (s). */
const WILT = 0.55
/** Après la sortie de terre (FLOWER.grow), le temps que la fleur se stabilise de son élan (s). */
const SETTLE = 0.25
/** La taille de la fleur : à hauteur de hanche d'un combattant, qu'on la voie venir. */
const PLANT = 1.45

interface Shown {
  kind: ArenaTrap['kind']
  root: THREE.Group
  /**
   * Sa portée, au sol, à la couleur de son camp pour le joueur : un voile léger (`mark`), un bord fin
   * (en tirets s'il est d'en face), et un arc plus épais qui se rétracte avec le temps qui lui reste
   * (`timer`, sa propre géométrie : on n'en dessine qu'une part).
   */
  mark: THREE.Mesh
  border: THREE.Mesh
  timer: THREE.Mesh
  life: number
  /** La fleur : son pied (tige et feuilles), sa tête et ses deux mâchoires, leurs intérieurs. */
  plant?: THREE.Group
  stem?: THREE.Mesh
  leaves?: THREE.Mesh[]
  head?: THREE.Group
  jaws?: [THREE.Object3D, THREE.Object3D]
  linings?: THREE.Mesh[]
  /** La flaque : sa nappe, ses flammèches (dessus, et le long du bord), ses bulles. */
  pool?: THREE.Mesh
  flames?: THREE.Mesh[]
  bubbles?: { mesh: THREE.Mesh; phase: number; speed: number }[]
  age: number
  left: number
  /** Depuis quand elle a mordu (s), et vers où (repère du piège). */
  bite: number
  biteAt: THREE.Vector3 | null
  /** Elle s'arme : sur qui (son identifiant), et dans combien de temps elle mord (s) ; 0 : au repos. */
  aim: number
  strike: number
  /** Combien elle est armée, de 0 à 1 (elle y va et en revient en douceur). */
  armed: number
  /** Elle n'est plus dans ce que dit le relais : elle fane, ou s'éteint (s). */
  gone: number
  phase: number
  /** Ses braises, ses crépitements : le prochain dans tant de secondes. */
  ember: number
  crackle: number
}

/** Une fleur carnivore : feuilles au sol, tige, et une tête à deux mâchoires dentées, ouvertes. */
function flowerModel() {
  const plant = new THREE.Group()
  const leaves: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(LEAF_GEO, LEAF)
    leaf.scale.set(1, 0.18, 0.45)
    const a = (i / 4) * Math.PI * 2 + 0.4
    leaf.position.set(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08)
    leaf.rotation.y = -a
    plant.add(leaf)
    leaves.push(leaf)
  }
  const stem = new THREE.Mesh(STEM_GEO, STEM)
  plant.add(stem)
  const head = new THREE.Group()
  head.position.y = 0.3
  plant.add(head)
  const linings: THREE.Mesh[] = []
  const jaw = (up: boolean) => {
    const pivot = new THREE.Group()
    const shell = new THREE.Mesh(SHELL_GEO[up ? 0 : 1], JAW)
    shell.scale.set(1, 0.7, 1)
    shell.position.z = 0.09
    const lining = new THREE.Mesh(LINING_GEO[up ? 0 : 1], INSIDE)
    lining.position.set(0, up ? 0.001 : -0.001, 0.09)
    linings.push(lining)
    pivot.add(shell, lining)
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI - Math.PI
      const tooth = new THREE.Mesh(TOOTH_GEO, TOOTH)
      tooth.position.set(Math.cos(a) * 0.1, up ? -0.012 : 0.012, 0.09 - Math.sin(a) * 0.1)
      if (up) tooth.rotation.x = Math.PI
      pivot.add(tooth)
    }
    head.add(pivot)
    return pivot
  }
  return { plant, stem, leaves, head, linings, jaws: [jaw(true), jaw(false)] as [THREE.Object3D, THREE.Object3D] }
}

const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2
const _p = new THREE.Vector3()

export class Traps {
  readonly group = new THREE.Group()
  private readonly shown = new Map<number, Shown>()
  private readonly fireMat = new THREE.MeshBasicMaterial({ map: POOL_TEXTURE, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })
  private readonly flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })
  private readonly bubbleMat = new THREE.MeshBasicMaterial({ color: '#d8ff7a', transparent: true, opacity: 0.8, depthWrite: false })
  /** Les effets de combat (la terre qui gicle, la fumée, les braises), une fois l'arène armée. */
  fx: CombatFx | null = null
  /**
   * Une fleur jaillit, s'arme (`windup`) ou fane ; une flaque s'embrase, puis crépite tant qu'elle
   * brûle : le client les fait entendre (cf. client.ts) ; on reconnaît le piège sans le voir.
   */
  onSound?: (kind: 'sprout' | 'windup' | 'wilt' | 'ignite' | 'crackle', at: THREE.Vector3) => void

  /**
   * @param tint la couleur d'un camp (0 ou 1) pour le joueur, et s'il est d'en face : pour sa portée
   * @param ground la hauteur du sol en (x, z) : un piège se pose sur le haut d'un plan à deux hauteurs
   * @param positionOf où se tient un combattant (repère de l'arène) : la proie qu'une fleur regarde
   */
  constructor(
    private tint: (team: number) => { color: string; foe: boolean },
    private ground: (x: number, z: number) => number = () => 0,
    private positionOf: (id: number) => { x: number; z: number } | null = () => null,
  ) {}

  /** Ce que le relais dit des pièges sur le terrain : ceux qui arrivent poussent, ceux qui manquent fanent. */
  sync(traps: ArenaTrap[]) {
    const seen = new Set<number>()
    for (const t of traps) {
      seen.add(t.id)
      let s = this.shown.get(t.id)
      if (!s) {
        s = this.make(t)
        this.shown.set(t.id, s)
        this.group.add(s.root)
      }
      s.left = t.left
      // Une fleur qui s'arme : le relais dit sur qui, et dans combien de temps elle mord.
      const arming = t.aim !== undefined && t.strike !== undefined
      if (arming && !s.aim) this.onSound?.('windup', s.root.position)
      s.aim = arming ? t.aim! : 0
      s.strike = arming ? t.strike! : 0
      const { color } = this.tint(t.team)
      for (const m of [s.mark, s.border, s.timer]) (m.material as THREE.MeshBasicMaterial).color.set(color)
    }
    for (const [id, s] of this.shown) {
      if (seen.has(id) || s.gone) continue
      s.gone = 0.001
      if (s.kind === 'flower') {
        // Fanée : tout brunit.
        s.stem!.material = DRY.stem
        for (const l of s.leaves!) l.material = DRY.leaf
        s.head!.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          if (m.material === JAW) m.material = DRY.jaw
          else if (m.material === INSIDE || m.material === INSIDE_ARMED) m.material = DRY.inside
        })
        this.onSound?.('wilt', s.root.position)
      }
    }
  }

  /** Où est le piège `id` (repère de l'arène) ; null s'il n'est plus là. */
  at(id: number): THREE.Vector3 | null {
    return this.shown.get(id)?.root.position ?? null
  }

  /**
   * La fleur `id` vient de mordre `prey` (repère de l'arène, s'il est connu) : elle se détend vers lui,
   * mâchoires claquées. Où elle est (repère de l'arène) ; null si ce n'est pas une fleur.
   */
  bite(id: number, prey: { x: number; z: number } | null = null): THREE.Vector3 | null {
    const s = this.shown.get(id)
    if (s?.kind !== 'flower') return null
    s.bite = 0
    s.biteAt = prey ? new THREE.Vector3(prey.x - s.root.position.x, 0, prey.z - s.root.position.z) : null
    return s.root.position
  }

  private make(t: ArenaTrap): Shown {
    const root = new THREE.Group()
    root.position.set(t.x, this.ground(t.x, t.z), t.z)
    const radius = t.kind === 'flower' ? FLOWER.radius : FIRE.radius
    const { color, foe } = this.tint(t.team)
    const paint = (opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })
    const mark = new THREE.Mesh(disc, paint(0.08))
    const border = new THREE.Mesh(foe ? dashes : ring, paint(0.6))
    const timer = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.97, TIMER_SEGMENTS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2), paint(0.95))
    for (const m of [mark, border, timer]) {
      m.scale.setScalar(radius + ARENA_RULES.body.r)
      m.position.y = 0.03
      m.renderOrder = 2
      root.add(m)
    }
    const s: Shown = {
      kind: t.kind, root, mark, border, timer, life: t.kind === 'flower' ? FLOWER.life : FIRE.life, age: 0, left: t.left,
      bite: Infinity, biteAt: null, aim: 0, strike: 0, armed: 0, gone: 0, phase: Math.random() * 10, ember: 0, crackle: 0.35,
    }
    if (t.kind === 'flower') {
      const f = flowerModel()
      root.add(f.plant)
      Object.assign(s, f)
      f.plant.scale.setScalar(0.01)
      // Elle jaillit de terre : une gerbe de terre, un nuage.
      this.fx?.spill(_p.copy(root.position).setY(root.position.y + 0.05), DIRT, 8, 1.1, root.position.y)
      this.fx?.puff(root.position, DIRT, 0.3, 3)
      this.onSound?.('sprout', root.position)
    } else {
      const pool = new THREE.Mesh(disc, this.fireMat)
      pool.scale.setScalar(radius * 0.92)
      pool.position.y = 0.025
      pool.renderOrder = 1
      root.add(pool)
      const flames: THREE.Mesh[] = []
      // Des flammèches dessus, et tout le long du bord : on voit jusqu'où la flaque brûle.
      const rim = arenaFx.reduced ? 8 : 14
      for (let i = 0; i < 9 + rim; i++) {
        const m = new THREE.Mesh(flame, this.flameMat)
        const onRim = i >= 9
        const a = onRim ? ((i - 9) / rim) * Math.PI * 2 : (i / 9) * Math.PI * 2 + Math.random()
        const r = onRim ? radius * 0.9 : Math.sqrt(Math.random()) * radius * 0.75
        m.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r)
        m.userData.phase = Math.random() * 10
        m.userData.rim = onRim
        if (onRim) m.scale.setScalar(0.7)
        root.add(m)
        flames.push(m)
      }
      const bubbles = arenaFx.reduced ? [] : Array.from({ length: 5 }, () => {
        const mesh = new THREE.Mesh(BUBBLE, this.bubbleMat)
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * 0.7
        mesh.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r)
        root.add(mesh)
        return { mesh, phase: Math.random(), speed: 0.8 + Math.random() * 0.8 }
      })
      Object.assign(s, { pool, flames, bubbles })
      this.onSound?.('ignite', root.position)
    }
    return s
  }

  update(dt: number) {
    for (const [id, s] of this.shown) {
      s.age += dt
      s.bite += dt
      if (s.gone) s.gone += dt
      // Ses dernières secondes : il faiblit ; disparu de ce que dit le relais : il fane, ou s'éteint.
      const fade = s.gone ? Math.max(0, 1 - s.gone / WILT) : Math.min(1, s.left / 0.6 + 0.2)
      if (s.gone && fade <= 0) {
        if (s.kind === 'fire') this.fx?.puff(s.root.position, SMOKE, 0.4, 4)
        else this.fx?.puff(s.root.position, DIRT, 0.25, 2)
        this.drop(s)
        this.shown.delete(id)
        continue
      }
      const shown = Math.min(1, fade + 0.2)
      ;(s.mark.material as THREE.MeshBasicMaterial).opacity = 0.08 * shown
      ;(s.border.material as THREE.MeshBasicMaterial).opacity = 0.6 * shown
      // Le temps qui reste : l'arc se rétracte, d'un tour complet (il vient de naître) à rien ; sa
      // dernière seconde, il clignote.
      const ending = !s.gone && s.left < 1 ? 0.55 + 0.45 * Math.sin(s.age * 18) : 1
      ;(s.timer.material as THREE.MeshBasicMaterial).opacity = 0.95 * shown * ending
      const left = s.gone ? 0 : Math.max(0, Math.min(1, s.left / s.life))
      s.timer.geometry.setDrawRange(0, Math.ceil(left * TIMER_SEGMENTS) * 6)
      if (s.kind === 'flower') this.flower(s, dt)
      else this.fire(s, dt, fade)
    }
  }

  /** La fleur : elle jaillit, se balance, s'arme sur sa proie, mord, fane. */
  private flower(s: Shown, dt: number) {
    const t = s.age + s.phase
    const plant = s.plant!, head = s.head!
    // Sortie de terre (FLOWER.grow) : la tige pousse d'un élan, puis la tête s'ouvre ; elle se stabilise.
    const grow = Math.min(1, s.age / (FLOWER.grow + SETTLE))
    const wilt = s.gone ? Math.min(1, s.gone / WILT) : 0
    plant.scale.setScalar(PLANT * Math.max(0.01, easeOutBack(grow) * (1 - wilt * 0.85)))
    s.stem!.scale.y = Math.max(0.01, 1 - wilt * 0.5)
    for (const [i, leaf] of s.leaves!.entries()) {
      const unfurl = THREE.MathUtils.clamp((s.age - 0.05 * i) / 0.3, 0, 1)
      leaf.scale.set(easeOutBack(unfurl), 0.18, 0.45 * (1 + wilt * 0.3))
    }
    // Armée : elle s'y prépare en douceur, et s'en remet de même.
    s.armed = THREE.MathUtils.damp(s.armed, s.aim && !s.gone ? 1 : 0, 14, dt)
    // Vers où elle regarde : sa proie si elle s'arme, celui qu'elle vient de mordre, sinon elle se balance.
    let yaw = Math.sin(t * 0.8) * 0.6
    const prey = s.aim ? this.positionOf(s.aim) : null
    const toward = prey ? _p.set(prey.x - s.root.position.x, 0, prey.z - s.root.position.z) : s.bite < 0.5 ? s.biteAt : null
    if (toward && toward.lengthSq() > 1e-6) yaw = THREE.MathUtils.lerp(yaw, Math.atan2(toward.x, toward.z), Math.max(s.armed, s.bite < 0.5 ? 1 : 0))
    head.rotation.y = THREE.MathUtils.damp(head.rotation.y, yaw, 12, dt)
    // Elle recule pour prendre son élan, tremble ; puis se détend vers sa proie en mordant.
    const lunge = s.bite < 0.3 ? Math.sin((s.bite / 0.3) * Math.PI) : 0
    const shake = s.armed > 0.5 ? Math.sin(t * 60) * 0.05 * s.armed : 0
    head.rotation.x = Math.sin(t * 2.1) * 0.15 * (1 - s.armed) - s.armed * 0.45 + lunge * 0.7 + wilt * 1.1 + shake
    head.rotation.z = Math.sin(t * 1.6) * 0.12 * (1 - s.armed) + shake
    head.position.set(Math.sin(head.rotation.y) * lunge * 0.12, 0.3 + s.armed * 0.04 - wilt * 0.12, Math.cos(head.rotation.y) * lunge * 0.12)
    head.scale.setScalar(1 + s.armed * 0.25 + lunge * 0.1)
    // Ses mâchoires : elles respirent ; armée, elles s'ouvrent grand et rougeoient ; elles claquent quand elle mord.
    const snap = s.bite < 0.25 ? Math.abs(Math.sin((s.bite / 0.25) * Math.PI)) : 0
    const open = Math.max(0, (0.6 + Math.sin(t * 3) * 0.08) * (1 - s.armed) + s.armed * 1.05 - snap * 0.9 - wilt * 0.5)
    s.jaws![0].rotation.x = -open
    s.jaws![1].rotation.x = open
    if (!s.gone) for (const l of s.linings!) l.material = s.armed > 0.5 ? INSIDE_ARMED : INSIDE
  }

  /** La flaque : elle s'étend, ses flammes dansent (le long du bord aussi), elle bouillonne ; elle faiblit sur la fin. */
  private fire(s: Shown, dt: number, fade: number) {
    const t = s.age + s.phase
    s.pool!.scale.setScalar(FIRE.radius * 0.92 * Math.min(1, s.age / 0.15, Math.max(0.05, fade)) * (0.97 + Math.sin(t * 9) * 0.03))
    for (const m of s.flames!) {
      const p = (m.userData.phase as number) + s.age
      const base = m.userData.rim ? 0.7 : 1
      m.scale.set(base, base * (0.6 + Math.abs(Math.sin(p * 7)) * 0.9) * fade, base)
      m.rotation.y = p * 3
    }
    for (const b of s.bubbles!) {
      // Une bulle gonfle, crève, et reprend ailleurs.
      b.phase += dt * b.speed
      const k = b.phase % 1
      b.mesh.scale.setScalar(Math.max(0.01, Math.sin(k * Math.PI) * fade))
      if (k < dt * b.speed) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * FIRE.radius * 0.7
        b.mesh.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r)
      }
    }
    // Elle crépite (on l'entend sans la voir), de temps en temps.
    if (!s.gone && (s.crackle -= dt) <= 0) {
      s.crackle = 0.3 + Math.random() * 0.25
      this.onSound?.('crackle', s.root.position)
    }
    // Des braises qui montent (pas en effets réduits).
    if (!this.fx || arenaFx.reduced || s.gone || (s.ember -= dt) > 0) return
    s.ember = 0.12 + Math.random() * 0.12
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * FIRE.radius * 0.8
    this.fx.puff(_p.set(s.root.position.x + Math.cos(a) * r, s.root.position.y + 0.05, s.root.position.z + Math.sin(a) * r), EMBER, 0.06, 1)
  }

  /** Retire un piège de la scène, et ce qui n'est qu'à lui (ses matières, l'arc de son temps). */
  private drop(s: Shown) {
    s.root.removeFromParent()
    for (const m of [s.mark, s.border, s.timer]) (m.material as THREE.Material).dispose()
    s.timer.geometry.dispose()
  }

  clear() {
    for (const s of this.shown.values()) this.drop(s)
    this.shown.clear()
  }
}
