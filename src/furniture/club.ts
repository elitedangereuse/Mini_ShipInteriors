import * as THREE from 'three'
import { beatAt, beatPhase } from '../tempo'
import { box, compact, cylinder, drawnTexture, glow, lit, part, sphere, type Builder } from './kit'

/*
 * Le Zorb, la boîte de nuit des aliens, au bout du couloir de service de la cale : son enseigne
 * au néon, le cordon de la file d'attente, le videur (un alien tout en épaules, qui ne laisse
 * passer que les siens), et les habitués qui dansent au tempo de la piste. Les trois espèces du
 * Holo-Me s'y retrouvent : Zorbliens (verts), Cryoniens (bleus), Nébuliens (violets).
 */

const C = {
  suit: '#15161c',
  shirt: '#f1f1f4',
  brass: '#c9a24a',
  rope: '#a3182c',
  black: '#0b0b0f',
  eye: '#07070a',
}

/** Peau des trois espèces (les teintes du Holo-Me, cf. looks.ts) : clair, ombre. */
const SPECIES: Record<string, [string, string]> = {
  green: ['#6fdc6f', '#3f9c4a'],
  blue: ['#5cc8ff', '#2f86c4'],
  violet: ['#b27cff', '#7646c9'],
}
const SPECIES_IDS = Object.keys(SPECIES)

/** Tenues de soirée : haut, bas. */
const OUTFITS: [string, string][] = [
  ['#ff4fd8', '#1d1d28'],
  ['#39e0ff', '#2a1d3f'],
  ['#ffe94f', '#1d2a3f'],
  ['#f4f4f8', '#3a1d33'],
  ['#ff8a1c', '#16161d'],
]

interface Alien {
  root: THREE.Group
  /** Tout ce qui est au-dessus des hanches : il se penche et tourne d'un bloc. */
  upper: THREE.Group
  head: THREE.Group
  /** Épaules (gauche, droite) et coudes : les bras pendent le long de -y. */
  arms: { shoulder: THREE.Group; elbow: THREE.Group }[]
  legs: THREE.Group[]
  antennae: THREE.Group[]
  height: number
}

/**
 * Un alien fait main : grosse tête, grands yeux noirs, deux antennes. `bulk` élargit les épaules
 * et les bras (le videur), `scale` le grandit.
 */
function alien(species: string, top: string, bottom: string, bulk = 1, scale = 1): Alien {
  const [skin, shade] = SPECIES[species] ?? SPECIES.green
  const skinM = lit(skin), shadeM = lit(shade), topM = lit(top), bottomM = lit(bottom)
  const root = new THREE.Group()
  root.scale.setScalar(scale)
  const hipY = 0.24
  // Jambes : elles pivotent à la hanche.
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group()
    leg.position.set(side * 0.055 * bulk, hipY, 0)
    const g = new THREE.Group()
    g.add(box(0.075 * bulk, 0.2, 0.085, bottomM, 0, -0.1, 0, 0.02), box(0.08 * bulk, 0.045, 0.12, lit(C.black), 0, -0.218, 0.015, 0.015))
    leg.add(compact(g))
    root.add(leg)
    return leg
  })
  const upper = new THREE.Group()
  upper.position.y = hipY
  root.add(upper)
  const torso = new THREE.Group()
  torso.add(box(0.19 * bulk, 0.07, 0.12, bottomM, 0, 0.02, 0, 0.02))
  // Le torse s'évase vers les épaules.
  const chest = part(new THREE.CylinderGeometry(0.12 * bulk, 0.085 * bulk, 0.2, 10), topM, 0, 0.15, 0)
  chest.scale.z = 0.62
  torso.add(chest, cylinder(0.035, 0.04, 0.04, shadeM, 0, 0.265, 0, 8))
  upper.add(compact(torso))
  // Tête : un ovale plus large en haut, deux grands yeux en amande, pas de nez.
  const head = new THREE.Group()
  head.position.y = 0.28
  upper.add(head)
  const skull = new THREE.Group()
  const cranium = sphere(0.115, skinM, 0, 0.12, 0, 14)
  cranium.scale.set(1, 1.08, 0.95)
  const jaw = sphere(0.075, skinM, 0, 0.06, 0.012, 10)
  skull.add(cranium, jaw)
  for (const side of [-1, 1]) {
    const eye = sphere(0.034, lit(C.eye), side * 0.05, 0.115, 0.088, 10)
    eye.scale.set(1, 1.35, 0.5)
    eye.rotation.z = side * 0.45
    skull.add(eye, sphere(0.007, glow('#ffffff'), side * 0.057, 0.132, 0.106, 5))
  }
  skull.add(box(0.03, 0.005, 0.004, shadeM, 0, 0.045, 0.082))
  head.add(compact(skull))
  const antennae = [-1, 1].map((side) => {
    const a = new THREE.Group()
    a.position.set(side * 0.05, 0.215, 0)
    a.rotation.z = -side * 0.3
    a.add(cylinder(0.005, 0.007, 0.1, shadeM, 0, 0.05, 0, 5), sphere(0.017, glow(skin), 0, 0.108, 0, 8))
    head.add(a)
    return a
  })
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * (0.12 * bulk + 0.02), 0.225, 0)
    upper.add(shoulder)
    const r = 0.03 * (0.6 + 0.4 * bulk)
    const armG = new THREE.Group()
    armG.add(sphere(r * 1.25, topM, 0, 0, 0, 8), cylinder(r, r * 0.9, 0.1, topM, 0, -0.055, 0, 8))
    shoulder.add(compact(armG))
    const elbow = new THREE.Group()
    elbow.position.y = -0.105
    shoulder.add(elbow)
    const fore = new THREE.Group()
    fore.add(cylinder(r * 0.9, r * 0.75, 0.095, skinM, 0, -0.05, 0, 8), sphere(r * 1.05, skinM, 0, -0.11, 0, 8))
    elbow.add(compact(fore))
    return { shoulder, elbow }
  })
  return { root, upper, head, arms, legs, antennae, height: 0.74 * scale }
}

// ---------------------------------------------------------------- le videur

/**
 * Le videur du Zorb : un Zorblien deux fois large comme la porte, costume noir, lunettes noires,
 * oreillette, bras croisés. Il respire, tourne la tête vers le couloir, et fait de temps en temps
 * craquer sa nuque.
 */
const clubBouncer: Builder = ({ random }) => {
  const a = alien('green', C.suit, C.suit, 1.75, 1.22)
  const live = new THREE.Group()
  live.add(a.root)
  // Chemise, cravate, lunettes et oreillette.
  const dress = new THREE.Group()
  dress.add(box(0.07, 0.15, 0.012, lit(C.shirt), 0, 0.17, 0.1), box(0.022, 0.12, 0.014, lit('#7b1fd0'), 0, 0.165, 0.104))
  a.upper.add(compact(dress))
  const shades = new THREE.Group()
  shades.add(box(0.2, 0.045, 0.02, lit(C.black), 0, 0.118, 0.1, 0.008), box(0.008, 0.02, 0.1, lit(C.black), -0.1, 0.12, 0.05), box(0.008, 0.02, 0.1, lit(C.black), 0.1, 0.12, 0.05))
  shades.add(sphere(0.012, glow('#39ff9a'), 0.118, 0.1, 0.02, 6))
  a.head.add(compact(shades))
  // Bras croisés sur la poitrine.
  const [left, right] = a.arms
  left.shoulder.rotation.set(-0.5, 0, 0.35)
  left.elbow.rotation.set(-1.5, 0, 0.9)
  right.shoulder.rotation.set(-0.42, 0, -0.35)
  right.elbow.rotation.set(-1.6, 0, -0.9)
  for (const [i, leg] of a.legs.entries()) leg.rotation.z = (i ? 1 : -1) * 0.08
  const g = new THREE.Group()
  g.add(cylinder(0.2, 0.2, 0.004, lit('#101014'), 0, 0.002, 0, 18))
  const extent = new THREE.Box3(new THREE.Vector3(-0.26, 0, -0.16), new THREE.Vector3(0.26, a.height + 0.12, 0.16))
  const phase = random() * 10
  return {
    solid: g,
    live,
    extent,
    update(t) {
      const u = t + phase
      a.upper.scale.set(1 + Math.sin(u * 1.3) * 0.012, 1 + Math.sin(u * 1.3) * 0.015, 1 + Math.sin(u * 1.3) * 0.03)
      // Il surveille le couloir, puis revient ; toutes les 13 s, la nuque craque.
      const crack = u % 13
      a.head.rotation.y = Math.sin(u * 0.35) * 0.55
      a.head.rotation.z = crack < 0.8 ? Math.sin((crack / 0.8) * Math.PI * 2) * 0.3 : 0
      for (const [i, ant] of a.antennae.entries()) ant.rotation.x = Math.sin(u * 2.1 + i) * 0.08
    },
  }
}

// ---------------------------------------------------------------- les danseurs

/**
 * Un habitué du Zorb, qui danse au tempo. Espèce : `label` (green, blue, violet ; au hasard
 * sinon) ; « dj » : le DJ, derrière ses platines, un casque sur les antennes.
 */
const clubDancer: Builder = ({ label, random }) => {
  const dj = label === 'dj'
  const species = label && SPECIES[label] ? label : SPECIES_IDS[Math.floor(random() * SPECIES_IDS.length)]
  const [top, bottom] = OUTFITS[Math.floor(random() * OUTFITS.length)]
  const a = alien(dj ? 'violet' : species, dj ? '#1d1d28' : top, bottom, 1, 0.9 + random() * 0.14)
  const live = new THREE.Group()
  live.add(a.root)
  if (dj) {
    const phones = new THREE.Group()
    phones.add(part(new THREE.TorusGeometry(0.118, 0.012, 6, 14, Math.PI), lit(C.black), 0, 0.13, 0))
    for (const side of [-1, 1]) phones.add(cylinder(0.04, 0.04, 0.03, lit('#ff4fd8'), side * 0.118, 0.12, 0, 10).rotateZ(Math.PI / 2))
    a.head.add(compact(phones))
  }
  const style = dj ? 3 : Math.floor(random() * 3)
  const phase = Math.floor(random() * 4)
  const turn = (random() - 0.5) * 1.2
  // Une ombre au sol pour partie fixe : c'est elle qui porte le volume de clic.
  const g = new THREE.Group()
  g.add(cylinder(0.13, 0.13, 0.004, lit('#101014'), 0, 0.002, 0, 14))
  const extent = new THREE.Box3(new THREE.Vector3(-0.15, 0, -0.13), new THREE.Vector3(0.15, a.height + 0.1, 0.13))
  const [left, right] = a.arms
  return {
    solid: g,
    live,
    extent,
    update(t) {
      const beat = beatAt(t) + phase
      const k = beatPhase(t)
      // Le rebond : on s'enfonce sur le temps, on remonte entre deux.
      const bounce = Math.sin(k * Math.PI)
      const sway = Math.sin(beat * Math.PI)
      a.root.position.y = (bounce * 0.035 - 0.012) * a.root.scale.y
      a.head.rotation.x = 0.12 - bounce * 0.16
      for (const [i, ant] of a.antennae.entries()) ant.rotation.x = -bounce * 0.5 + i * 0.1
      for (const [i, leg] of a.legs.entries()) leg.rotation.x = (i ? 1 : -1) * sway * 0.22
      a.upper.rotation.z = sway * 0.09
      if (style === 0) {
        // Les bras en l'air, à tour de rôle.
        a.root.rotation.y = turn + sway * 0.35
        left.shoulder.rotation.set(0, 0, 0.3 + Math.max(0, sway) * 2.4)
        right.shoulder.rotation.set(0, 0, -0.3 - Math.max(0, -sway) * 2.4)
        left.elbow.rotation.z = right.elbow.rotation.z = 0
      } else if (style === 1) {
        // Le robot : avant-bras à l'équerre, qui montent et descendent à contretemps.
        a.root.rotation.y = turn + Math.round(Math.sin(beat * Math.PI * 0.25)) * 0.7
        left.shoulder.rotation.set(-0.3 - Math.max(0, sway) * 1.1, 0, 0.25)
        right.shoulder.rotation.set(-0.3 - Math.max(0, -sway) * 1.1, 0, -0.25)
        left.elbow.rotation.x = right.elbow.rotation.x = -1.4
      } else if (style === 2) {
        // Les deux bras levés, qui pompent ; un tour complet toutes les huit mesures.
        a.root.rotation.y = turn + (Math.floor(beat / 32) % 2 ? (((beat % 32) / 32) * Math.PI * 2) : 0)
        for (const [i, arm] of a.arms.entries()) {
          arm.shoulder.rotation.set(0, 0, (i ? -1 : 1) * (2.5 + bounce * 0.35))
          arm.elbow.rotation.z = (i ? 1 : -1) * 0.5 * bounce
        }
      } else {
        // Le DJ : une main sur le disque, l'autre qui harangue la piste une mesure sur deux.
        a.root.rotation.y = sway * 0.12
        left.shoulder.rotation.set(-0.9, 0, 0.15)
        left.elbow.rotation.x = -0.7 + Math.sin(beat * Math.PI * 2) * 0.12
        const up = Math.floor(beat / 4) % 2 === 0
        right.shoulder.rotation.set(up ? 0 : -0.9, 0, up ? -2.6 - bounce * 0.3 : -0.15)
        right.elbow.rotation.x = up ? 0 : -0.7
      }
    },
  }
}

// ---------------------------------------------------------------- l'entrée

/** Enseigne au néon « LE ZORB », accrochée au mur : le tube grésille de temps en temps. */
const clubSign: Builder = ({ random }) => {
  const texture = drawnTexture(256, 96, (g) => {
    g.clearRect(0, 0, 256, 96)
    g.font = 'italic 900 52px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = '#ff3df0'
    g.shadowBlur = 14
    g.strokeStyle = '#ff7bf5'
    g.lineWidth = 3
    g.strokeText('LE ZORB', 128, 44)
    g.shadowColor = '#39ff9a'
    g.strokeStyle = '#8dffc4'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(34, 80)
    g.lineTo(222, 80)
    g.stroke()
  })
  const g = new THREE.Group()
  g.add(box(0.86, 0.34, 0.02, lit('#101014'), 0, 0.72, 0.01, 0.01))
  const live = new THREE.Group()
  const neon = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  live.add(part(new THREE.PlaneGeometry(0.82, 0.31), neon, 0, 0.72, 0.023))
  const phase = random() * 20
  return {
    solid: g,
    live,
    update(t) {
      const u = (t + phase) % 9
      neon.opacity = u > 8.6 && Math.sin(u * 90) > 0 ? 0.35 : 0.92 + Math.sin(t * 3) * 0.08
    },
  }
}

/** Cordon de file d'attente : deux poteaux de laiton et une corde de velours. Longueur : `label` (m). */
const clubRope: Builder = ({ label }) => {
  const len = Math.min(3, Math.max(0.5, Number(label) || 1.2))
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const x = (side * len) / 2
    g.add(cylinder(0.06, 0.07, 0.015, lit(C.brass), x, 0.008, 0, 14), cylinder(0.012, 0.012, 0.36, lit(C.brass), x, 0.19, 0, 8), sphere(0.024, lit(C.brass), x, 0.38, 0, 8))
  }
  // La corde pend entre les deux : une chaînette, en six tronçons.
  const n = 6
  const y = (k: number) => 0.34 - Math.sin(k * Math.PI) * 0.09
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n
    const x0 = (k0 - 0.5) * len, x1 = (k1 - 0.5) * len
    const seg = cylinder(0.014, 0.014, Math.hypot(x1 - x0, y(k1) - y(k0)), lit(C.rope), (x0 + x1) / 2, (y(k0) + y(k1)) / 2, 0, 6)
    seg.rotation.z = Math.atan2(y(k1) - y(k0), x1 - x0) + Math.PI / 2
    g.add(seg)
  }
  return { solid: compact(g) }
}

export const CLUB = {
  'club-bouncer': clubBouncer,
  'club-dancer': clubDancer,
  'club-sign': clubSign,
  'club-rope': clubRope,
} satisfies Record<string, Builder>
