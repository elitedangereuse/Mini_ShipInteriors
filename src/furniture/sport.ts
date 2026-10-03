import * as THREE from 'three'
import { barX, barZ, box, cylinder, decal, drawnTexture, glow, keepShared, lit, mesh, part, type Builder, type TargetControl } from './kit'

/*
 * Zone sportive du pont supérieur : le demi-terrain de basket (panier sur glissière) et celui de
 * foot (cage et gardien en carton). Le panier et le gardien glissent le long de leur mur, menés
 * par le mini-jeu (cf. src/court.ts), qui lit ici leurs cotes.
 */

const C = {
  steel: '#59616e',
  steelDark: '#2c3038',
  white: '#f2f4f6',
  rim: '#ff6a1c',
  ball: '#e2742a',
  cardboard: '#b08a5c',
}

/** Course du panier et du gardien de part et d'autre du milieu de leur mur. */
export const TARGET_TRAVEL = 1.25

/** Panier (repère du meuble : dos au mur, face à +z) : cercle, planche. */
export const HOOP = { rimY: 1.25, rimR: 0.23, rimZ: 0.53, boardZ: 0.27, boardW: 0.9, boardBottom: 1.18, boardTop: 1.8 }
/** Cage (même repère) : ouverture, ligne de but, et le gardien en carton devant elle. */
export const GOAL = { half: 1.5, height: 1.05, lineZ: 0.6, post: 0.035, keeperZ: 1.0, keeperW: 0.7, keeperH: 0.84 }
export const BALL_RADIUS = { 'gym-basket': 0.08, 'gym-foot': 0.08 } as const

// ---------------------------------------------------------------- ballons

const ballTextures = {
  // Basket : cuir orange, coutures noires.
  basket: () => drawnTexture(256, 128, (c) => {
    c.fillStyle = C.ball
    c.fillRect(0, 0, 256, 128)
    c.strokeStyle = '#2a1608'
    c.lineWidth = 4
    c.beginPath()
    for (const x of [0, 64, 128, 192, 256]) { c.moveTo(x, 0); c.lineTo(x, 128) }
    c.moveTo(0, 64); c.lineTo(256, 64)
    c.stroke()
    c.lineWidth = 3
    for (const x of [64, 192]) {
      c.beginPath(); c.ellipse(x, 64, 40, 62, 0, 0, Math.PI * 2); c.stroke()
    }
  }),
  // Foot : blanc, pavés noirs.
  foot: () => drawnTexture(256, 128, (c) => {
    c.fillStyle = '#f4f4f0'
    c.fillRect(0, 0, 256, 128)
    c.fillStyle = '#1b1d22'
    const patch = (x: number, y: number, r: number) => {
      c.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        c.lineTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r)
      }
      c.fill()
    }
    for (let i = 0; i < 5; i++) {
      patch(26 + i * 51, 64, 13)
      patch(i * 51, 28, 11)
      patch(i * 51 + 8, 100, 11)
    }
    patch(256, 28, 11)
  }),
}
const ballMaterials = new Map<string, THREE.Material>()
/** Ballon du jeu (un maillage à part : il vole). */
export function sportBall(game: keyof typeof BALL_RADIUS): THREE.Mesh {
  const kind = game === 'gym-basket' ? 'basket' : 'foot'
  let material = ballMaterials.get(kind)
  if (!material) ballMaterials.set(kind, (material = keepShared(new THREE.MeshLambertMaterial({ map: keepShared(ballTextures[kind]()) }))))
  const ball = mesh(new THREE.SphereGeometry(BALL_RADIUS[game], 18, 12), material)
  ball.receiveShadow = false
  return ball
}

// ---------------------------------------------------------------- basket

const NET = () => drawnTexture(128, 64, (c) => {
  c.strokeStyle = '#ffffff'
  c.lineWidth = 2.5
  c.beginPath()
  for (let i = -4; i <= 12; i++) {
    c.moveTo(i * 16, 0); c.lineTo(i * 16 + 32, 64)
    c.moveTo(i * 16, 0); c.lineTo(i * 16 - 32, 64)
  }
  c.stroke()
})

/**
 * Panier de basket sur glissière, dos au mur : deux rails, un chariot et son mât, la planche, le
 * cercle et son filet. Il dépasse des murs, comme l'écran du cinéma.
 */
const basketHoop: Builder = () => {
  const solid = new THREE.Group(), live = new THREE.Group(), cart = new THREE.Group()
  const steel = lit(C.steel), dark = lit(C.steelDark)
  const rail = TARGET_TRAVEL * 2 + 0.5
  for (const y of [0.62, 0.92]) solid.add(box(rail, 0.045, 0.05, steel, 0, y, 0.03))
  for (const x of [-rail / 2, rail / 2]) solid.add(box(0.06, 0.4, 0.07, dark, x, 0.77, 0.035))
  cart.add(box(0.34, 0.42, 0.05, dark, 0, 0.77, 0.085, 0.01), box(0.08, 1.02, 0.08, steel, 0, 1.16, 0.15))
  cart.add(box(0.07, 0.07, 0.1, steel, 0, 1.5, 0.21))
  const board = drawnTexture(288, 198, (c) => {
    c.fillStyle = '#f6f8fa'
    c.fillRect(0, 0, 288, 198)
    c.strokeStyle = C.rim
    c.lineWidth = 9
    c.strokeRect(5, 5, 278, 188)
    c.lineWidth = 7
    c.strokeRect(92, 96, 104, 78)
  })
  const face = new THREE.MeshLambertMaterial({ map: board })
  const height = HOOP.boardTop - HOOP.boardBottom
  const middle = (HOOP.boardTop + HOOP.boardBottom) / 2
  cart.add(box(HOOP.boardW, height, 0.03, dark, 0, middle, HOOP.boardZ - 0.016), part(new THREE.PlaneGeometry(HOOP.boardW, height), face, 0, middle, HOOP.boardZ))
  const rim = part(new THREE.TorusGeometry(HOOP.rimR, 0.014, 8, 28), lit(C.rim), 0, HOOP.rimY, HOOP.rimZ)
  rim.rotation.x = Math.PI / 2
  cart.add(rim, box(0.09, 0.03, HOOP.rimZ - HOOP.rimR - HOOP.boardZ + 0.02, lit(C.rim), 0, HOOP.rimY - 0.01, (HOOP.boardZ + HOOP.rimZ - HOOP.rimR) / 2))
  const net = part(
    new THREE.CylinderGeometry(HOOP.rimR - 0.008, HOOP.rimR * 0.62, 0.26, 18, 1, true),
    new THREE.MeshBasicMaterial({ map: NET(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
    0, HOOP.rimY - 0.13, HOOP.rimZ,
  )
  cart.add(net)
  live.add(cart)
  let now = 0, swish = -10
  const control: TargetControl = {
    kind: 'target',
    slide: (offset) => { cart.position.x = offset },
    hit: () => { swish = now },
  }
  return {
    solid, live, control,
    extent: new THREE.Box3(new THREE.Vector3(-rail / 2, 0.5, 0), new THREE.Vector3(rail / 2, 1.0, 0.3)),
    update: (t) => {
      now = t
      // Le filet claque au passage du ballon.
      const k = Math.min(1, (t - swish) / 0.45)
      net.scale.set(1 - 0.18 * Math.sin(k * Math.PI), 1 + 0.3 * Math.sin(k * Math.PI), 1 - 0.18 * Math.sin(k * Math.PI))
    },
  }
}

// ---------------------------------------------------------------- foot

/** Le gardien : une silhouette peinte sur du carton, bras écartés, comme aux stands de tir au but. */
const KEEPER = () => drawnTexture(224, 268, (c) => {
  c.lineJoin = 'round'
  c.lineCap = 'round'
  const body = () => {
    c.beginPath()
    c.arc(112, 44, 30, 0, Math.PI * 2) // tête
    c.moveTo(74, 82); c.lineTo(150, 82); c.lineTo(160, 178); c.lineTo(64, 178); c.closePath() // maillot
    c.moveTo(72, 96); c.lineTo(20, 52) // bras
    c.moveTo(152, 96); c.lineTo(204, 52)
    c.moveTo(86, 178); c.lineTo(72, 250) // jambes
    c.moveTo(138, 178); c.lineTo(152, 250)
  }
  // Le détourage du carton, puis la peinture.
  c.strokeStyle = C.cardboard
  c.fillStyle = C.cardboard
  c.lineWidth = 46
  body(); c.stroke(); c.fill()
  c.lineWidth = 26
  c.strokeStyle = '#f2c230'
  c.beginPath(); c.moveTo(72, 96); c.lineTo(24, 56); c.moveTo(152, 96); c.lineTo(200, 56); c.stroke()
  c.strokeStyle = '#1d2330'
  c.beginPath(); c.moveTo(86, 196); c.lineTo(74, 246); c.moveTo(138, 196); c.lineTo(150, 246); c.stroke()
  c.fillStyle = '#f2c230'
  c.beginPath(); c.moveTo(74, 82); c.lineTo(150, 82); c.lineTo(160, 178); c.lineTo(64, 178); c.closePath(); c.fill()
  c.fillStyle = '#1d2330'
  c.fillRect(64, 166, 96, 34)
  c.font = 'bold 54px sans-serif'
  c.textAlign = 'center'
  c.fillText('1', 112, 150)
  c.fillStyle = '#f0c8a0'
  c.beginPath(); c.arc(112, 44, 26, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#1d2330'
  c.beginPath(); c.arc(112, 36, 26, Math.PI, 0); c.fill() // casquette
  c.fillRect(84, 32, 62, 7)
  c.beginPath(); c.arc(102, 48, 3, 0, Math.PI * 2); c.arc(122, 48, 3, 0, Math.PI * 2); c.fill()
  c.lineWidth = 3
  c.beginPath(); c.arc(112, 54, 9, 0.2, Math.PI - 0.2); c.stroke()
  // Les gants.
  c.fillStyle = '#ffffff'
  for (const x of [20, 204]) { c.beginPath(); c.arc(x, 50, 17, 0, Math.PI * 2); c.fill() }
})

const GOAL_NET = () => {
  const t = drawnTexture(64, 64, (c) => {
    c.strokeStyle = '#ffffff'
    c.lineWidth = 3
    c.strokeRect(0, 0, 64, 64)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/**
 * Cage de foot, dos au mur : poteaux, barre, filets ; devant la ligne, un gardien de carton sur
 * son rail.
 */
const footGoal: Builder = () => {
  const solid = new THREE.Group(), live = new THREE.Group(), cart = new THREE.Group()
  const white = lit(C.white), steel = lit(C.steel)
  const { half, height, lineZ, post } = GOAL
  for (const x of [-half - post, half + post]) {
    solid.add(cylinder(post, post, height + post, white, x, (height + post) / 2, lineZ, 10))
    solid.add(barZ(0.02, lineZ, white, x, height + post, lineZ / 2, 8), cylinder(0.02, 0.02, height + post, white, x, (height + post) / 2, 0.03, 8))
  }
  solid.add(barX(post, half * 2 + post * 4, white, 0, height + post, lineZ, 10), barX(0.02, half * 2 + post * 4, white, 0, height + post, 0.03, 8))
  // Les filets : le fond, le toit et les deux flancs, d'une même maille.
  const netting = (w: number, h: number) => {
    const map = GOAL_NET()
    map.repeat.set(w / 0.15, h / 0.15)
    return part(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.35, opacity: 0.8, side: THREE.DoubleSide }))
  }
  const back = netting(half * 2 + post * 2, height)
  back.position.set(0, height / 2, 0.04)
  const roof = netting(half * 2 + post * 2, lineZ)
  roof.rotation.x = Math.PI / 2
  roof.position.set(0, height + post, lineZ / 2)
  live.add(back, roof)
  for (const x of [-half - post, half + post]) {
    const side = netting(lineZ, height)
    side.rotation.y = Math.PI / 2
    side.position.set(x, height / 2, lineZ / 2)
    live.add(side)
  }
  // Le rail du gardien, au sol, et son chariot.
  const { keeperZ, keeperW, keeperH } = GOAL
  solid.add(box(half * 2 + 0.2, 0.025, 0.07, steel, 0, 0.0125, keeperZ))
  const card = part(
    new THREE.PlaneGeometry(keeperW, keeperH),
    new THREE.MeshLambertMaterial({ map: KEEPER(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    0, keeperH / 2 + 0.05, 0,
  )
  cart.add(card, box(0.3, 0.05, 0.14, lit(C.steelDark), 0, 0.045, 0), box(0.04, 0.34, 0.03, lit(C.cardboard), 0, 0.2, -0.02))
  cart.position.z = keeperZ
  live.add(cart)
  let now = 0, struck = -10
  const control: TargetControl = {
    kind: 'target',
    slide: (offset) => { cart.position.x = offset },
    hit: () => { struck = now },
  }
  return {
    solid, live, control,
    update: (t) => {
      now = t
      // Touché, le carton bascule en arrière puis se redresse.
      const k = Math.min(1, (t - struck) / 0.6)
      card.rotation.x = -0.5 * Math.sin(k * Math.PI) * (1 - k)
    },
  }
}

// ---------------------------------------------------------------- sols, marques, ballons

/** Marquages d'un demi-terrain (100 pixels par tuile ; le haut du dessin est au pied de la cible). */
const FLOORS: Record<string, (c: CanvasRenderingContext2D, w: number, h: number) => void> = {
  basket(c, w, h) {
    // Parquet : des lames dans la longueur, de trois tons.
    const tones = ['#c98f4f', '#c4894a', '#cf9757']
    for (let x = 0, i = 0; x < w; x += 19, i++) {
      c.fillStyle = tones[(i * 7) % 3]
      c.fillRect(x, 0, 18.5, h)
      c.fillStyle = '#a8733a'
      for (let y = ((i * 97) % 140) - 140; y < h; y += 140) c.fillRect(x, y, 18.5, 1.5)
    }
    const mid = w / 2
    c.fillStyle = '#b5432e'
    c.fillRect(mid - 95, 14, 190, 250) // la raquette
    c.strokeStyle = '#ffffff'
    c.lineWidth = 6
    c.strokeRect(14, 14, w - 28, h - 28)
    c.strokeRect(mid - 95, 14, 190, 250)
    c.beginPath(); c.arc(mid, 264, 70, 0, Math.PI); c.stroke() // cercle des lancers francs
    c.setLineDash([12, 10])
    c.beginPath(); c.arc(mid, 264, 70, Math.PI, Math.PI * 2); c.stroke()
    c.setLineDash([])
    c.beginPath(); c.moveTo(mid - 262, 14); c.lineTo(mid - 262, 96); c.arc(mid, 64, 264, Math.PI - 0.12, 0.12, true); c.lineTo(mid + 262, 14); c.stroke() // ligne à trois points
    c.beginPath(); c.arc(mid, h - 14, 90, Math.PI, 0); c.stroke() // rond central
  },
  foot(c, w, h) {
    // Pelouse tondue en bandes.
    for (let y = 0, i = 0; y < h; y += 60, i++) {
      c.fillStyle = i % 2 ? '#3f9b4b' : '#368c43'
      c.fillRect(0, y, w, 60)
    }
    const mid = w / 2
    c.strokeStyle = '#ffffff'
    c.fillStyle = '#ffffff'
    c.lineWidth = 6
    c.strokeRect(14, 14, w - 28, h - 28)
    c.strokeRect(mid - 250, 14, 500, 300) // surface de réparation
    c.strokeRect(mid - 180, 14, 360, 150) // surface de but
    c.beginPath(); c.arc(mid, 400, 9, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.arc(mid, 400, 150, Math.PI * 0.2, Math.PI * 0.8); c.stroke()
    c.beginPath(); c.arc(mid, h - 14, 90, Math.PI, 0); c.stroke()
  },
}

/**
 * Sol d'un demi-terrain (`label` : `basket` ou `foot`, puis sa taille « largeur x longueur »), posé
 * au milieu de la pièce, la cible du côté de -z.
 */
const courtFloor: Builder = ({ label = 'basket:5.7x6.7' }) => {
  const [kind, size] = label.split(':')
  const [w, d] = (size ?? '5.7x6.7').split('x').map(Number)
  const g = new THREE.Group()
  // Un vrai revêtement, plein, un cran au-dessus des dalles : le décalage de profondeur d'un
  // décalque perd la moitié du terrain quand la caméra est posée dessus (vue de dos du mini-jeu).
  const floor = decal(drawnTexture(Math.round(w * 100), Math.round(d * 100), (c) => (FLOORS[kind] ?? FLOORS.basket)(c, w * 100, d * 100)), w, d, 0.012)
  const material = floor.material as THREE.MeshLambertMaterial
  material.polygonOffset = false
  material.transparent = false
  g.add(floor)
  return { solid: g }
}

/** Marque d'où l'on tire : un cercle lumineux au sol, deux semelles peintes. */
const shootSpot: Builder = ({ label }) => {
  const g = new THREE.Group()
  const color = label === 'foot' ? '#ffffff' : '#ffd24a'
  const ring = mesh(new THREE.RingGeometry(0.27, 0.32, 32), glow(color), 0, 0.02, 0)
  ring.rotation.x = -Math.PI / 2
  ring.castShadow = false
  g.add(ring)
  for (const x of [-0.08, 0.08]) g.add(box(0.07, 0.004, 0.16, glow(color), x, 0.02, 0, 0))
  return { solid: g }
}

/** Chariot à ballons (`label` : `basket` ou `foot`) : six ballons sur deux étages. */
const ballRack: Builder = ({ label }) => {
  const game = label === 'foot' ? 'gym-foot' : 'gym-basket'
  const g = new THREE.Group()
  const steel = lit(C.steel), r = BALL_RADIUS[game]
  for (const x of [-0.3, 0.3]) for (const z of [-0.11, 0.11]) g.add(cylinder(0.014, 0.014, 0.5, steel, x, 0.27, z, 6), cylinder(0.025, 0.025, 0.03, lit(C.steelDark), x, 0.015, z, 8))
  for (const y of [0.16, 0.42]) {
    for (const z of [-0.11, 0.11]) g.add(barX(0.012, 0.6, steel, 0, y, z, 6))
    for (let i = 0; i < 3; i++) {
      const ball = sportBall(game)
      ball.position.set(-0.2 + i * 0.2, y + r * 0.8, 0)
      ball.rotation.set(i * 1.3 + y * 5, i * 2.1, 0)
      g.add(ball)
    }
  }
  return { solid: g }
}

export const SPORT = {
  'basket-hoop': basketHoop,
  'foot-goal': footGoal,
  'court-floor': courtFloor,
  'shoot-spot': shootSpot,
  'ball-rack': ballRack,
} satisfies Record<string, Builder>
