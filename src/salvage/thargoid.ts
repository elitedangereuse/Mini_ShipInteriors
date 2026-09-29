import * as THREE from 'three'
import { compact, cylinder, glow, lit, mesh } from '../furniture/kit'

/*
 * Le Thargoïde de la baie infestée : un humanoïde voûté, fait main (primitives Three.js) et animé
 * par le code, sans squelette ni clip. Plus grand qu'un CMDR (1,05 contre 0,72), jambes à genou
 * inversé, bras interminables terminés par trois griffes, carapace noire à facettes hexagonales,
 * veines et cœur d'un vert caustique qui luisent dans le noir. Sa tête est un bourgeon de cinq
 * pétales autour d'un cœur lumineux, comme les vaisseaux thargoïdes : il s'entrouvre quand il
 * poursuit, s'ouvre en fleur quand il frappe ; des mandibules dessous, et dans le dos une
 * couronne de pétales qui se déploie avec lui.
 *
 * Chaque membre est fusionné en deux maillages au plus (carapace, lueurs) : ~24 appels de dessin
 * par Thargoïde. Les lueurs ont leur propre matériau, qui pulse selon son humeur.
 */

const C = {
  chitin: '#161b19',
  ridge: '#26302c',
  bone: '#55625b',
  flesh: '#0d2a1d',
  plate: '#34423c',
  glow: '#56ffae',
  hot: '#c6ffe2',
}

/**
 * Carapace un peu brillante (la lampe frontale y accroche des reflets), à peine émissive : la
 * silhouette se détache du noir d'un vert très sombre.
 */
const CHITIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45, emissive: '#06140d' })

export type ThargoidMood = 'patrol' | 'investigate' | 'chase' | 'lured' | 'look' | 'search' | 'attack'

/** Membre : un pivot (l'articulation), sa géométrie fusionnée, et son matériau de lueur à lui. */
function limb(parts: THREE.Object3D[], glowMat: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  g.add(...parts)
  const merged = compact(g)
  for (const child of merged.children) {
    const m = child as THREE.Mesh
    m.material = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial ? glowMat : CHITIN
  }
  return merged
}

/** Cylindre effilé entre deux hauteurs (du pivot vers le bas) : os de membre. */
function bone(rTop: number, rBottom: number, length: number, color: string, segments = 6): THREE.Mesh {
  return cylinder(rTop, rBottom, length, lit(color), 0, -length / 2, 0, segments)
}

/** Griffe : un cône fin, pointe vers le bas, légèrement recourbé vers l'avant. */
function claw(length: number, x: number, z: number, lean: number, tip = true): THREE.Object3D[] {
  const c = mesh(new THREE.ConeGeometry(0.011, length, 5), lit(C.bone), 0, 0, 0)
  // Pointe vers le bas, recourbée vers l'avant (+z).
  c.rotation.x = Math.PI - lean
  c.position.set(x, -length / 2, z + Math.sin(lean) * length * 0.5)
  const out: THREE.Object3D[] = [c]
  if (tip) out.push(mesh(new THREE.OctahedronGeometry(0.007), glow(C.glow), x, -length * 0.98, z + Math.sin(lean) * length))
  return out
}

/** Pétale (plaque en amande, extrudée) avec sa nervure lumineuse ; pied à l'origine, pointe vers +y. */
function petalParts(w: number, h: number, color = C.chitin): THREE.Object3D[] {
  const s = new THREE.Shape()
  // Une courbe de Bézier quadratique ne s'écarte que de la moitié de son point de contrôle :
  // celui-ci à ±w donne un pétale de w de large.
  s.moveTo(0, 0)
  s.quadraticCurveTo(w, h * 0.4, 0, h)
  s.quadraticCurveTo(-w, h * 0.4, 0, 0)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 5 })
  geo.translate(0, 0, -0.006)
  const p = mesh(geo, lit(color))
  const rib = mesh(new THREE.BoxGeometry(0.008, h * 0.8, 0.016), glow(C.glow), 0, h * 0.45, 0)
  return [p, rib]
}

/** Corps sculpté au tour à six faces (section hexagonale), aplati d'avant en arrière. */
function hexLathe(profile: [number, number][], color: string, flatten = 0.72): THREE.Mesh {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 6)
  geo.rotateY(Math.PI / 6)
  geo.scale(1, 1, flatten)
  return mesh(geo, lit(color))
}

interface Leg { thigh: THREE.Group; shin: THREE.Group; foot: THREE.Group; side: number }
interface Arm { upper: THREE.Group; fore: THREE.Group; hand: THREE.Group; side: number }

export class ThargoidBody {
  readonly root = new THREE.Group()
  private readonly glowMat = new THREE.MeshBasicMaterial({ vertexColors: true })
  private readonly hips = new THREE.Group()
  private readonly torso = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly jaw: THREE.Group[] = []
  /** Pétales de la tête (bourgeon fermé au repos, fleur ouverte pour frapper) ; `petals` : les épines du dos. */
  private readonly bud: THREE.Group[] = []
  private bloom = 0.1
  private readonly petals: THREE.Group[] = []
  private readonly legs: Leg[] = []
  private readonly arms: Arm[] = []
  private phase = 0
  private time = Math.random() * 10
  private readonly seed = Math.random() * Math.PI * 2
  /** Valeurs lissées de la posture (on passe d'une humeur à l'autre en douceur). */
  private lean = 0.3
  private flare = 0
  private reach = 0
  private run = 0
  private attackTime = 0

  constructor() {
    const gm = this.glowMat
    // --- Bassin : un prisme hexagonal, une couture lumineuse.
    this.hips.position.y = 0.5
    this.hips.add(limb([
      cylinder(0.09, 0.07, 0.1, lit(C.chitin), 0, 0, 0, 6),
      cylinder(0.092, 0.092, 0.012, glow(C.glow), 0, 0.02, 0, 6),
      mesh(new THREE.ConeGeometry(0.05, 0.12, 6), lit(C.ridge), 0, -0.05, -0.05),
    ], gm))
    this.root.add(this.hips)

    // --- Torse : taille de guêpe, thorax large à facettes, cœur lumineux, côtes en lames.
    this.torso.position.y = 0.04
    this.hips.add(this.torso)
    const chest: THREE.Object3D[] = [
      hexLathe([[0.03, 0], [0.06, 0.02], [0.07, 0.08], [0.1, 0.15], [0.16, 0.24], [0.175, 0.3], [0.13, 0.36], [0.06, 0.4], [0.02, 0.41]], C.chitin),
      mesh(new THREE.OctahedronGeometry(0.045), glow(C.hot), 0, 0.25, 0.1),
      cylinder(0.03, 0.03, 0.4, lit(C.ridge), 0, 0.2, -0.1, 6),
    ]
    // Veines : du cœur vers les épaules et vers la taille.
    for (const s of [-1, 1]) {
      for (const [x, y, rz, len] of [[0.06, 0.3, 0.9, 0.12], [0.05, 0.17, -0.5, 0.13], [0.1, 0.24, 1.3, 0.1]] as const) {
        const v = mesh(new THREE.BoxGeometry(0.008, len, 0.008), glow(C.glow), s * x, y, 0.105 - Math.abs(x) * 0.2)
        v.rotation.z = s * rz
        chest.push(v)
      }
      // Côtes : trois lames qui débordent du thorax.
      for (let k = 0; k < 3; k++) {
        const r = mesh(new THREE.BoxGeometry(0.09, 0.016, 0.05), lit(C.ridge), s * 0.13, 0.19 + k * 0.045, 0.03)
        r.rotation.z = s * (0.35 - k * 0.1)
        r.rotation.y = s * 0.25
        chest.push(r)
      }
    }
    this.torso.add(limb(chest, gm))

    // --- Dos : trois épines sombres le long de l'échine, qui se hérissent quand il chasse.
    const crown = new THREE.Group()
    crown.position.set(0, 0.24, -0.11)
    this.torso.add(crown)
    for (let k = 0; k < 3; k++) {
      const pivot = new THREE.Group()
      pivot.position.y = k * 0.07
      const spine = mesh(new THREE.ConeGeometry(0.022 - k * 0.003, 0.2 - k * 0.03, 5), lit(C.ridge), 0, 0.08, 0)
      pivot.add(limb([spine, mesh(new THREE.OctahedronGeometry(0.008), glow(C.glow), 0, 0.17 - k * 0.03, 0)], gm))
      pivot.rotation.x = -1.2
      crown.add(pivot)
      this.petals.push(pivot)
    }

    // --- Cou et tête : un bourgeon de cinq pétales autour d'un cœur, penché vers l'avant ; des
    // mandibules dessous.
    const neck = new THREE.Group()
    neck.position.set(0, 0.38, 0.02)
    this.torso.add(neck)
    neck.add(limb([cylinder(0.025, 0.035, 0.08, lit(C.ridge), 0, 0.04, 0, 6), cylinder(0.03, 0.03, 0.008, glow(C.glow), 0, 0.075, 0, 6)], gm))
    this.head.position.y = 0.08
    neck.add(this.head)
    const heart = new THREE.Group()
    heart.rotation.x = 0.55
    this.head.add(heart)
    // Le cœur, et deux fentes lumineuses au pied du bourgeon : même fermé, il « regarde ».
    const slits = [-1, 1].map((sx) => {
      const sl = mesh(new THREE.BoxGeometry(0.03, 0.007, 0.006), glow(C.hot), sx * 0.022, 0.03, 0.045)
      sl.rotation.z = sx * 0.4
      return sl
    })
    heart.add(limb([
      mesh(new THREE.IcosahedronGeometry(0.036, 0), glow(C.hot), 0, 0.07, 0),
      cylinder(0.05, 0.03, 0.04, lit(C.chitin), 0, 0.01, 0, 5),
      ...slits,
    ], gm))
    for (let k = 0; k < 5; k++) {
      const around = new THREE.Group()
      around.rotation.y = (k / 5) * Math.PI * 2
      const petal = new THREE.Group()
      petal.position.set(0, 0.015, 0.034)
      petal.add(limb(petalParts(0.085, 0.17, k % 2 ? C.ridge : C.plate), gm))
      around.add(petal)
      heart.add(around)
      this.bud.push(petal)
    }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.028, 0.0, 0.06)
      const m = mesh(new THREE.ConeGeometry(0.012, 0.1, 5), lit(C.bone), 0, -0.045, 0.012)
      m.rotation.x = Math.PI - 0.35
      pivot.add(limb([m], gm))
      this.head.add(pivot)
      this.jaw.push(pivot)
    }

    // --- Bras : épaules pointues, humérus, avant-bras en lame, main à trois griffes.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.17, 0.33, 0)
      this.torso.add(shoulder)
      const spike = mesh(new THREE.ConeGeometry(0.035, 0.12, 5), lit(C.ridge), side * 0.02, 0.05, -0.01)
      spike.rotation.z = -side * 0.5
      shoulder.add(limb([spike, mesh(new THREE.SphereGeometry(0.04, 6, 5), lit(C.chitin))], gm))
      const upper = new THREE.Group()
      shoulder.add(upper)
      upper.add(limb([
        bone(0.035, 0.025, 0.26, C.chitin),
        mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), lit(C.ridge), side * 0.012, -0.1, 0.022),
        mesh(new THREE.TorusGeometry(0.028, 0.006, 4, 12).rotateX(Math.PI / 2), glow(C.glow), 0, -0.25, 0),
      ], gm))
      const fore = new THREE.Group()
      fore.position.y = -0.26
      upper.add(fore)
      const blade = mesh(new THREE.BoxGeometry(0.012, 0.22, 0.05), lit(C.ridge), side * 0.02, -0.13, -0.02)
      fore.add(limb([bone(0.024, 0.016, 0.3, C.chitin), blade, mesh(new THREE.BoxGeometry(0.006, 0.2, 0.006), glow(C.glow), 0, -0.15, 0.022)], gm))
      const hand = new THREE.Group()
      hand.position.y = -0.3
      fore.add(hand)
      hand.add(limb([
        mesh(new THREE.SphereGeometry(0.022, 6, 4), lit(C.chitin)),
        ...claw(0.15, -0.02, 0.01, 0.25), ...claw(0.17, 0, 0.018, 0.3), ...claw(0.15, 0.02, 0.01, 0.25),
      ], gm))
      this.arms.push({ upper, fore, hand, side })
    }

    // --- Jambes : cuisse, tibia en arrière (genou inversé), pied à trois orteils et ergot.
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group()
      thigh.position.set(side * 0.085, -0.02, 0)
      this.hips.add(thigh)
      const knee = mesh(new THREE.ConeGeometry(0.022, 0.08, 5), lit(C.ridge), 0, -0.26, 0.03)
      knee.rotation.x = 0.9
      thigh.add(limb([
        bone(0.045, 0.03, 0.26, C.chitin), knee,
        mesh(new THREE.BoxGeometry(0.06, 0.18, 0.024), lit(C.ridge), 0, -0.11, 0.035),
        mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 12).rotateX(Math.PI / 2), glow(C.glow), 0, -0.25, 0),
      ], gm))
      const shin = new THREE.Group()
      shin.position.y = -0.26
      thigh.add(shin)
      shin.add(limb([bone(0.028, 0.02, 0.28, C.chitin), mesh(new THREE.BoxGeometry(0.008, 0.2, 0.03), lit(C.ridge), 0, -0.13, -0.025)], gm))
      const foot = new THREE.Group()
      foot.position.y = -0.28
      shin.add(foot)
      const toes: THREE.Object3D[] = [mesh(new THREE.SphereGeometry(0.02, 6, 4), lit(C.chitin))]
      for (const a of [-0.35, 0, 0.35]) {
        const t = mesh(new THREE.ConeGeometry(0.012, 0.1, 5), lit(C.bone), Math.sin(a) * 0.05, -0.01, 0.05)
        t.rotation.x = Math.PI / 2
        t.rotation.z = -a
        toes.push(t)
      }
      const spur = mesh(new THREE.ConeGeometry(0.01, 0.06, 5), lit(C.bone), 0, -0.005, -0.035)
      spur.rotation.x = -Math.PI / 2
      toes.push(spur)
      foot.add(limb(toes, gm))
      this.legs.push({ thigh, shin, foot, side })
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = m.material === CHITIN
    })
  }

  /**
   * @param mood humeur donnée par le relais
   * @param speed vitesse au sol (tuiles/s), pour la cadence des pas
   */
  update(dt: number, mood: ThargoidMood, speed: number) {
    this.time += dt
    const t = this.time
    const k = (rate: number) => 1 - Math.exp(-rate * dt)
    const chasing = mood === 'chase'
    const moving = speed > 0.08
    // Posture visée selon l'humeur : voûté en marche, penché en avant à la course, bras tendus
    // pour fouiller ou frapper, pétales ouverts quand il chasse.
    if (mood === 'attack') this.attackTime += dt
    else this.attackTime = 0
    const strike = mood === 'attack' ? Math.min(1, this.attackTime / 0.25) * (this.attackTime < 1.1 ? 1 : Math.max(0, 1 - (this.attackTime - 1.1) * 2)) : 0
    const leanGoal = mood === 'attack' ? 0.55 + strike * 0.35 : chasing ? 0.62 : mood === 'search' ? 0.5 : moving ? 0.3 : 0.2
    const flareGoal = mood === 'attack' ? 1 : chasing ? 0.65 : mood === 'lured' ? 0.45 : mood === 'look' || mood === 'investigate' ? 0.25 : 0
    const reachGoal = mood === 'attack' ? strike : mood === 'search' ? 0.7 : chasing ? 0.55 : 0
    this.lean += (leanGoal - this.lean) * k(6)
    this.flare += (flareGoal - this.flare) * k(5)
    this.reach += (reachGoal - this.reach) * k(8)
    this.run += ((chasing && moving ? 1 : 0) - this.run) * k(5)

    // Cycle de marche, calé sur la distance parcourue.
    const stride = 0.55 + this.run * 0.4
    if (moving) this.phase += (speed * dt * Math.PI * 2) / stride
    const swing = moving ? 0.42 + this.run * 0.25 : 0
    const bob = moving ? Math.abs(Math.sin(this.phase)) * (0.02 + this.run * 0.02) : Math.sin(t * 1.7 + this.seed) * 0.006
    this.hips.position.y = 0.5 - this.lean * 0.05 + bob

    for (const leg of this.legs) {
      const p = this.phase + (leg.side > 0 ? Math.PI : 0)
      const s = Math.sin(p)
      // Cuisse en avant, tibia en arrière, pied à plat : une jambe digitigrade.
      leg.thigh.rotation.x = -0.45 - s * swing + this.lean * 0.25
      leg.shin.rotation.x = 0.95 + Math.max(0, Math.cos(p)) * swing * 0.9
      leg.foot.rotation.x = -(leg.thigh.rotation.x + leg.shin.rotation.x) + 0.05
      leg.thigh.rotation.z = leg.side * 0.08
    }

    this.torso.rotation.x = this.lean + (moving ? Math.sin(this.phase * 2) * 0.03 : Math.sin(t * 1.6 + this.seed) * 0.02)
    this.torso.rotation.y = moving ? Math.sin(this.phase) * 0.12 : 0
    const breath = 1 + Math.sin(t * 1.6 + this.seed) * 0.02
    this.torso.scale.set(breath, 1, breath)

    for (const arm of this.arms) {
      const p = this.phase + (arm.side > 0 ? 0 : Math.PI)
      const s = moving ? Math.sin(p) * swing * 0.7 : 0
      // Au repos, les bras pendent devant lui, griffes vers le sol ; tendus pour fouiller ou frapper.
      const rummage = mood === 'search' ? Math.sin(t * 7 + arm.side) * 0.35 : 0
      const windup = mood === 'attack' && this.attackTime < 0.25 ? -0.8 * (1 - this.attackTime / 0.25) : 0
      arm.upper.rotation.x = -0.25 + s - this.reach * 1.35 + rummage - windup - this.lean * 0.3
      arm.upper.rotation.z = arm.side * (0.2 + this.reach * 0.25 + Math.sin(t * 2.3 + arm.side) * 0.02)
      arm.fore.rotation.x = -0.45 - this.reach * 0.35 + (moving ? Math.max(0, -s) * 0.5 : 0)
      // Griffes : un tic de temps en temps.
      const twitch = Math.max(0, Math.sin(t * 3.1 + this.seed + arm.side * 2)) ** 12
      arm.hand.rotation.x = -0.2 - this.reach * 0.3 + twitch * 0.5
    }

    // Tête : elle compense la penchée (le regard reste devant) et scrute les côtés.
    const scan = mood === 'look' || mood === 'investigate' ? Math.sin(t * 1.3 + this.seed) * 0.7 : mood === 'lured' && !moving ? Math.sin(t * 0.8) * 0.2 : Math.sin(t * 0.5 + this.seed) * 0.15
    this.head.rotation.x = -this.lean * 0.85 + (mood === 'lured' && !moving ? 0.25 : 0)
    this.head.rotation.y = scan
    this.head.rotation.z = mood === 'lured' && !moving ? Math.sin(t * 1.1) * 0.25 : 0
    // Tête : le bourgeon respire au repos, s'entrouvre en chasse, éclot pour frapper.
    const bloomGoal = mood === 'attack' ? 0.2 + strike * 0.8 : chasing ? 0.45 : mood === 'lured' ? 0.55 + Math.sin(t * 1.5) * 0.1 : mood === 'search' ? 0.3 : 0.08 + Math.max(0, Math.sin(t * 0.9 + this.seed)) * 0.08
    this.bloom += (bloomGoal - this.bloom) * k(7)
    for (const [i, petal] of this.bud.entries()) petal.rotation.x = -0.28 + this.bloom * 1.45 + Math.sin(t * 3 + i * 1.3) * 0.02
    for (const [i, jaw] of this.jaw.entries()) {
      jaw.rotation.z = (i ? -1 : 1) * (0.15 + this.flare * 0.5 + (chasing ? Math.max(0, Math.sin(t * 14)) * 0.15 : 0))
    }
    // Épines du dos : couchées en patrouille, hérissées en chasse et à l'attaque.
    for (const [i, spine] of this.petals.entries()) spine.rotation.x = -1.25 + this.flare * 0.7 + Math.sin(t * 2 + i) * 0.03

    // Lueurs : un battement lent au repos, qui s'emballe en chasse et flambe à l'attaque.
    const pulse = mood === 'attack' ? 2.2 : chasing ? 1.35 + Math.sin(t * 9) * 0.35 : mood === 'lured' ? 1 + Math.sin(t * 5) * 0.4 : 0.75 + Math.sin(t * 2.2 + this.seed) * 0.2
    this.glowMat.color.setScalar(pulse)
  }
}
