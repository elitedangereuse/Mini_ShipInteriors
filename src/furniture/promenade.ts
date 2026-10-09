import * as THREE from 'three'
import { barZ, beamMaterial, box, compact, cylinder, decal, drawnTexture, ED_ORANGE, glow, holoMaterial, lit, mat, mesh, part, type Builder } from './kit'
import { COBRA_PLAN, cobraHullGeometry } from './cobra'
import { brushed, EDGE, rivet, seam, STEEL } from './corridor'
import { tr } from '../i18n'

/*
 * La Promenade : l'atrium vitré où la coursive s'élargit, avant le poste de pilotage. Au milieu,
 * sur une place ronde incrustée de laiton dans les tôles du sol, le monument du bord : une maquette de Cobra
 * Mk III en lévitation au-dessus de son socle, sous les projecteurs encastrés dans le sol, et ses
 * deux pupitres gravés. Autour : des colonnes lumineuses et des jardinières.
 */

const BRASS = '#c9a24a'
const brass = lit(BRASS, 'metal')
const stone = lit('#191c22', 'metal')
const hullPaint = lit('#cdd2da', 'metal')
const hullShade = lit('#9aa1ad', 'metal')
const panel = lit('#555c69', 'metal')
const dark = lit('#2b2f37', 'metal')

// ---------------------------------------------------------------- le Cobra

/** Pose la même pièce des deux côtés du vaisseau (x et -x), inclinée comme l'aile si `roll`. */
function mirrored(g: THREE.Group, make: () => THREE.Mesh, x: number, y: number, z: number, roll = 0) {
  for (const s of [-1, 1]) {
    const m = make()
    m.position.set(s * x, y, z)
    m.rotation.z = -s * roll
    g.add(m)
  }
}

/** Hauteur du bord d'attaque des ailes. */
const TIP = -0.015
/** Pente du dessus d'une aile, de l'épaule au bord d'attaque. */
const WING_ROLL = 0.183
/** Hauteur du dessus de l'aile à la distance `x` de l'axe. */
const wingY = (x: number) => 0.085 - (x - 0.46) * 0.185 + 0.004

/**
 * Maquette de Cobra Mk III (nez à +z, demi-envergure 1) : la coque en facettes, la verrière, le
 * dos, les prises d'air, les panneaux et les bandes orange des ailes, les deux tuyères, les canons
 * du nez, le ventre. Rend aussi ce qui s'anime : les jets des tuyères, les feux.
 */
export function cobraShip() {
  const g = new THREE.Group()
  g.add(mesh(cobraHullGeometry(), hullPaint))
  // La verrière, sur la pente du nez : son vitrage, son cadre, ses montants.
  const canopy = new THREE.Group()
  canopy.position.set(0, 0.083, 0.59)
  canopy.rotation.x = 0.295
  canopy.add(box(0.3, 0.016, 0.22, dark), box(0.26, 0.012, 0.18, glow('#6fd0ff'), 0, 0.006, 0))
  for (const x of [-0.065, 0.065]) canopy.add(box(0.012, 0.014, 0.18, dark, x, 0.01, 0))
  canopy.add(box(0.26, 0.014, 0.012, dark, 0, 0.01, -0.02))
  g.add(canopy)
  // Le dos : la bosse du fuselage, son arête, deux trappes, les bossages des points d'emport.
  g.add(box(0.36, 0.03, 0.34, hullShade, 0, 0.208, -0.26, 0.01), box(0.1, 0.03, 0.56, panel, 0, 0.214, -0.16, 0.008))
  mirrored(g, () => box(0.1, 0.008, 0.14, panel), 0.17, 0.202, 0.02)
  mirrored(g, () => box(0.05, 0.03, 0.12, dark, 0, 0, 0, 0.01), 0.2, 0.185, 0.3)
  // Les flancs du fuselage : prises d'air et leurs lames.
  mirrored(g, () => box(0.035, 0.07, 0.3, dark), 0.385, 0.145, -0.16, -0.62)
  for (const z of [-0.26, -0.16, -0.06]) mirrored(g, () => box(0.04, 0.012, 0.06, hullShade), 0.39, 0.15, z, -0.62)
  // Les ailes : un panneau sombre, la bande orange du bord de fuite, une trappe, les nacelles de bout d'aile.
  mirrored(g, () => box(0.24, 0.006, 0.17, panel), 0.66, wingY(0.66), -0.13, WING_ROLL)
  mirrored(g, () => box(0.42, 0.006, 0.045, lit(ED_ORANGE)), 0.72, wingY(0.72), -0.4, WING_ROLL)
  mirrored(g, () => box(0.12, 0.006, 0.1, hullShade), 0.56, wingY(0.56), 0.16, WING_ROLL)
  mirrored(g, () => box(0.045, 0.045, 0.22, panel, 0, 0, 0, 0.012), 0.995, TIP, -0.38)
  // Le nez : le liseré orange du bord, les deux canons.
  g.add(box(0.5, 0.014, 0.02, lit(ED_ORANGE), 0, 0.002, 0.745))
  mirrored(g, () => barZ(0.012, 0.18, dark), 0.13, -0.03, 0.74)
  // La poupe : les deux tuyères dans leur carénage, et la grille entre elles.
  mirrored(g, () => box(0.3, 0.16, 0.1, dark, 0, 0, 0, 0.02), 0.21, 0.035, -0.63)
  mirrored(g, () => box(0.24, 0.1, 0.02, glow('#b8e4ff')), 0.21, 0.035, -0.685)
  g.add(box(0.08, 0.1, 0.04, panel, 0, 0.035, -0.62))
  // Le ventre : la quille, la trappe de soute et son liseré, les logements du train.
  g.add(box(0.5, 0.012, 0.5, panel, 0, -0.118, -0.2), box(0.26, 0.008, 0.2, dark, 0, -0.126, -0.22), box(0.26, 0.008, 0.012, glow(ED_ORANGE), 0, -0.127, -0.11))
  mirrored(g, () => box(0.1, 0.01, 0.16, dark), 0.3, -0.118, -0.4)
  g.add(box(0.1, 0.01, 0.14, dark, 0, -0.075, 0.42))
  // Feux de navigation : rouge à bâbord, vert à tribord.
  g.add(box(0.03, 0.03, 0.03, mat.lampRed, 1.02, TIP, -0.3), box(0.03, 0.03, 0.03, mat.lampGreen, -1.02, TIP, -0.3))

  const ship = new THREE.Group()
  ship.add(compact(g))
  // Les jets des tuyères : vifs à la sortie, ils s'effilent.
  const plumes = [-0.21, 0.21].map((x) => {
    // Mélange normal : en additif, un jet ne se voit pas devant une cloison claire.
    const m = beamMaterial(false)
    m.uniforms.uColor.value.set('#6fc0ff')
    const p = part(new THREE.CylinderGeometry(0.012, 0.075, 0.5, 14, 1, true), m, x, 0.035, -0.94)
    p.rotation.x = -Math.PI / 2
    p.scale.x = 1.5
    ship.add(p)
    return m
  })
  // Le feu à éclats, sur le dos.
  const strobe = part(new THREE.BoxGeometry(0.03, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0, 0.235, -0.44)
  ship.add(strobe)
  return {
    ship,
    update(t: number) {
      for (const [i, m] of plumes.entries()) {
        m.uniforms.uTime.value = t + i
        m.uniforms.uIntensity.value = 0.8 + 0.2 * Math.sin(t * 3.1 + i * 2)
      }
      // Deux éclats brefs, puis une pause.
      strobe.visible = t % 1.6 < 0.07 || (t % 1.6 > 0.2 && t % 1.6 < 0.27)
    },
  }
}
// ---------------------------------------------------------------- le monument

/** Rayon de la place. */
const PLAZA = 2.3
/** Hauteur de la maquette au-dessus du sol. */
const SHIP_Y = 1.02
/** Les projecteurs encastrés autour du socle : leur nombre, leur distance au centre. */
const SPOTS = 6, SPOT_R = 1.22

/** La Promenade, en tuiles : sa largeur (x), sa profondeur (z), et ce que ses deux alcôves laissent de chaque côté. */
const FLOOR_W = 5, FLOOR_D = 10, ALCOVE = 1

/**
 * Le sol de la Promenade, d'un seul tenant : les mêmes tôles claires que la coursive (cf.
 * corridor.ts), l'allée qui la prolonge de part et d'autre, et la place ronde incrustée au milieu,
 * ton sur ton : un disque d'acier plus soutenu, des cercles et une rose des vents de laiton, des
 * graduations, et le nom du vaisseau gravé sur son pourtour. Hors de la pièce (les quatre coins,
 * de part et d'autre des alcôves), rien.
 */
function floorTexture(): THREE.CanvasTexture {
  const U = 204.8, W = FLOOR_W * U, H = FLOOR_D * U, cx = W / 2, cy = H / 2, u = U
  return drawnTexture(W, H, (g) => {
    // La forme de la pièce : un rectangle, et une alcôve au nord et au sud.
    const room = new Path2D()
    room.rect(0, ALCOVE * U, W, H - 2 * ALCOVE * U)
    room.rect(ALCOVE * U, 0, W - 2 * ALCOVE * U, H)
    g.save()
    g.clip(room)
    g.fillStyle = STEEL.plate
    g.fillRect(0, 0, W, H)
    // L'allée de la coursive, qui traverse jusqu'au poste de pilotage.
    g.fillStyle = STEEL.lane
    g.fillRect(0, cy - EDGE * U, W, 2 * EDGE * U)
    brushed(g, 0, 0, W, H)
    // Les tôles : un joint par tuile, des rivets aux croisements.
    for (let i = 1; i < FLOOR_W; i++) seam(g, i * U, 0, i * U, H)
    for (let j = 1; j < FLOOR_D; j++) seam(g, 0, j * U, W, j * U)
    for (let i = 0; i <= FLOOR_W; i++) for (let j = 0; j <= FLOOR_D; j++) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rivet(g, i * U + dx * 12, j * U + dy * 12)
    // Les rives, au pied des cloisons et des verrières.
    g.strokeStyle = STEEL.rim
    g.lineWidth = 0.48 * U
    g.stroke(room)
    // Les deux filets de l'allée, peints.
    g.fillStyle = STEEL.paint
    for (const s of [-1, 1]) g.fillRect(0, cy + s * EDGE * U - 2, W, 4)
    g.restore()

    // La place.
    g.translate(cx, cy)
    const disc = g.createRadialGradient(0, 0, 0, 0, 0, PLAZA * u)
    disc.addColorStop(0, '#b9bfce')
    disc.addColorStop(0.7, '#a9b0c1')
    disc.addColorStop(1, '#9aa1b4')
    g.fillStyle = disc
    g.beginPath()
    g.arc(0, 0, PLAZA * u, 0, Math.PI * 2)
    g.fill()
    // Ses dalles : des joints en rayons et en cercles.
    g.strokeStyle = STEEL.seam
    g.lineWidth = 2
    for (const r of [0.9, 1.55]) {
      g.beginPath()
      g.arc(0, 0, r * u, 0, Math.PI * 2)
      g.stroke()
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.PI / 24
      g.beginPath()
      g.moveTo(Math.cos(a) * 0.9 * u, Math.sin(a) * 0.9 * u)
      g.lineTo(Math.cos(a) * PLAZA * u, Math.sin(a) * PLAZA * u)
      g.stroke()
    }
    // Le laiton : le cerclage de la place, deux cercles, un filet.
    g.strokeStyle = BRASS_INLAY
    for (const [r, w] of [[PLAZA - 0.04, 9], [1.86, 3], [1.55, 5], [0.78, 4]]) {
      g.lineWidth = w
      g.beginPath()
      g.arc(0, 0, r * u, 0, Math.PI * 2)
      g.stroke()
    }
    // Les graduations, gravées.
    g.strokeStyle = STEEL.ink
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      const long = i % 9 === 0
      g.lineWidth = long ? 5 : 2
      g.beginPath()
      g.moveTo(Math.cos(a) * 1.86 * u, Math.sin(a) * 1.86 * u)
      g.lineTo(Math.cos(a) * (long ? 1.98 : 1.93) * u, Math.sin(a) * (long ? 1.98 : 1.93) * u)
      g.stroke()
    }
    // La rose des vents : huit pointes, une moitié de laiton, l'autre d'acier sombre.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, len = (i % 4 === 0 ? 1.5 : i % 2 === 0 ? 1.2 : 0) * u
      if (!len) continue
      for (const s of [-1, 1]) {
        g.beginPath()
        g.moveTo(Math.cos(a) * len, Math.sin(a) * len)
        g.lineTo(Math.cos(a + s * 0.42) * 0.8 * u, Math.sin(a + s * 0.42) * 0.8 * u)
        g.lineTo(Math.cos(a) * 0.78 * u, Math.sin(a) * 0.78 * u)
        g.closePath()
        g.fillStyle = s > 0 ? BRASS_INLAY : '#7b8397'
        g.fill()
        g.strokeStyle = STEEL.seam
        g.lineWidth = 1.5
        g.stroke()
      }
    }
    // Le pourtour : le nom du vaisseau, deux fois, gravé lettre à lettre le long du cercle.
    g.fillStyle = STEEL.ink
    g.font = '700 30px system-ui, "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const text = 'COBRA MK III  ·  FAULCON DELACY  ·  '
    for (let k = 0; k < 2; k++) {
      ;[...text].forEach((ch, i) => {
        g.save()
        g.rotate(k * Math.PI + (i / text.length) * Math.PI - Math.PI / 2)
        g.translate(0, -2.1 * u)
        g.fillText(ch, 0, 0)
        g.restore()
      })
    }
  })
}

/** Laiton des incrustations du sol : plus soutenu que celui du mobilier, pour trancher sur l'acier clair. */
const BRASS_INLAY = '#b98a2c'

/** Le sol de la Promenade (5 × 10, posé au milieu) : cf. floorTexture. On marche dessus. */
const promenadeFloor: Builder = () => ({ solid: new THREE.Group().add(decal(floorTexture(), FLOOR_W, FLOOR_D)) })

/** La plaque gravée : le nom, le constructeur, le plan du vaisseau, sa fiche. */
function plaqueTexture(): THREE.CanvasTexture {
  return drawnTexture(640, 400, (g) => {
    const metal = g.createLinearGradient(0, 0, 640, 400)
    metal.addColorStop(0, '#d8b660')
    metal.addColorStop(0.45, '#b68f3c')
    metal.addColorStop(0.55, '#c9a551')
    metal.addColorStop(1, '#9f7a2c')
    g.fillStyle = metal
    g.fillRect(0, 0, 640, 400)
    // Le brossé du laiton.
    g.globalAlpha = 0.07
    g.fillStyle = '#fff'
    for (let y = 0; y < 400; y += 3) g.fillRect(0, y, 640, 1)
    g.globalAlpha = 1
    const ink = '#2a1c08'
    g.strokeStyle = g.fillStyle = ink
    g.lineWidth = 5
    g.strokeRect(14, 14, 612, 372)
    g.lineWidth = 1.5
    g.strokeRect(24, 24, 592, 352)
    // Quatre vis.
    for (const [x, y] of [[36, 36], [604, 36], [36, 364], [604, 364]]) {
      g.beginPath()
      g.arc(x, y, 5, 0, Math.PI * 2)
      g.fill()
    }
    g.textBaseline = 'alphabetic'
    g.font = '800 64px system-ui, "Segoe UI", sans-serif'
    g.fillText('COBRA MK III', 52, 104)
    g.font = '600 22px system-ui, "Segoe UI", sans-serif'
    g.fillText(tr('FAULCON DELACY  ·  VAISSEAU POLYVALENT', 'FAULCON DELACY  ·  MULTIPURPOSE SHIP'), 54, 138)
    g.fillRect(52, 154, 536, 3)
    // La fiche.
    const rows = [
      [tr('Longueur', 'Length'), tr('27,1 m', '27.1 m')],
      [tr('Envergure', 'Wingspan'), tr('44,0 m', '44.0 m')],
      [tr('Masse à vide', 'Hull mass'), '180 t'],
      [tr('Équipage', 'Crew'), '2'],
      [tr('Aire d\'appontage', 'Landing pad'), tr('petite', 'small')],
    ]
    rows.forEach(([label, value], i) => {
      const y = 196 + i * 32
      g.font = '500 22px system-ui, "Segoe UI", sans-serif'
      g.fillText(label, 54, y)
      g.font = '700 22px system-ui, "Segoe UI", sans-serif'
      g.fillText(value, 250, y)
    })
    // Le plan, vu de dessus, nez en haut.
    const cx = 470, cy = 250, k = 108
    g.lineWidth = 3
    g.beginPath()
    COBRA_PLAN.forEach(([x, z], i) => (i ? g.lineTo(cx + x * k, cy - z * k) : g.moveTo(cx + x * k, cy - z * k)))
    g.closePath()
    g.stroke()
    g.lineWidth = 1.5
    g.beginPath()
    for (const s of [-1, 1]) {
      g.moveTo(cx + s * 0.16 * k, cy - 0.74 * k)
      g.lineTo(cx + s * 0.3 * k, cy - 0.08 * k)
      g.lineTo(cx + s * 0.3 * k, cy + 0.6 * k)
    }
    g.strokeRect(cx - 0.13 * k, cy - 0.68 * k, 0.26 * k, 0.18 * k)
    g.stroke()
    g.font = 'italic 500 19px Georgia, serif'
    g.fillText(tr('« Le vaisseau de légende des commandants, depuis 3100. »', '“The commanders\' ship of legend, since 3100.”'), 54, 362)
  })
}

/** Pupitre du monument (face à +z) : un pied, la plaque inclinée dans son cadre, une réglette qui l'éclaire. */
function lectern(plaque: THREE.Texture): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.2, 0.03, 0.16, stone, 0, 0.015, 0, 0.008), box(0.06, 0.4, 0.05, dark, 0, 0.22, 0), box(0.012, 0.36, 0.006, glow(ED_ORANGE), 0, 0.22, 0.027))
  const desk = new THREE.Group()
  desk.position.set(0, 0.46, 0.02)
  desk.rotation.x = -0.95
  desk.add(box(0.56, 0.36, 0.024, dark, 0, 0, -0.014, 0.008), part(new THREE.PlaneGeometry(0.52, 0.325), new THREE.MeshBasicMaterial({ map: plaque, color: '#e8e2d6' }), 0, 0, 0))
  // La réglette, en haut de la plaque.
  desk.add(box(0.5, 0.03, 0.04, dark, 0, 0.19, 0.02, 0.008), box(0.46, 0.008, 0.012, glow('#fff0d0'), 0, 0.175, 0.03))
  g.add(desk)
  return g
}

/**
 * Monument de la Promenade : une maquette de Cobra Mk III (1,6 d'envergure) en lévitation au-dessus
 * d'un socle rond à gradins, sous six projecteurs encastrés dans le sol dont les faisceaux se
 * relaient ; deux pupitres à plaque de laiton, tournés vers la coursive (-x et +x) ; autour, la
 * place (4,6 de diamètre, incrustée dans le sol, cf. `promenade-floor`), qu'on traverse : seuls le socle et les pupitres arrêtent (cf. `extent`).
 */
const cobraMonument: Builder = () => {
  const g = new THREE.Group()
  // Deux filets lumineux dans le sol : le bord de la place, et le cercle des projecteurs.
  for (const [r, color] of [[PLAZA - 0.03, ED_ORANGE], [SPOT_R, '#7fe0ff']] as const) {
    g.add(part(new THREE.RingGeometry(r - 0.012, r + 0.012, 72).rotateX(-Math.PI / 2), glow(color), 0, 0.011, 0))
  }
  // Le socle : trois gradins, un jonc lumineux, un bandeau de laiton, des ailettes, la platine du projecteur.
  g.add(cylinder(0.64, 0.68, 0.07, stone, 0, 0.035, 0, 48))
  const cord = mesh(new THREE.TorusGeometry(0.645, 0.012, 6, 56), glow(ED_ORANGE), 0, 0.072, 0)
  cord.rotation.x = Math.PI / 2
  g.add(cord, cylinder(0.52, 0.58, 0.1, mat.steelDark, 0, 0.12, 0, 48), cylinder(0.525, 0.525, 0.022, brass, 0, 0.176, 0, 48))
  g.add(cylinder(0.36, 0.45, 0.17, stone, 0, 0.27, 0, 32), cylinder(0.37, 0.37, 0.02, brass, 0, 0.355, 0, 32), cylinder(0.3, 0.3, 0.014, glow('#bfefff'), 0, 0.367, 0, 32))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const fin = box(0.03, 0.16, 0.12, mat.steel, Math.cos(a) * 0.44, 0.26, Math.sin(a) * 0.44, 0.008)
    fin.rotation.y = -a + Math.PI / 2
    g.add(fin)
  }
  // Les pupitres, de part et d'autre, face à qui arrive par la coursive.
  const plaque = plaqueTexture()
  for (const s of [-1, 1]) {
    const l = lectern(plaque)
    l.position.set(s * 0.92, 0, 0)
    l.rotation.y = (s * Math.PI) / 2
    g.add(l)
  }

  const live = new THREE.Group()
  // Les projecteurs : une collerette et une lentille dans le sol, un faisceau jusqu'à la maquette.
  const up = new THREE.Vector3(0, 1, 0)
  const beams = Array.from({ length: SPOTS }, (_, i) => {
    const a = (i / SPOTS) * Math.PI * 2 + Math.PI / SPOTS
    const from = new THREE.Vector3(Math.cos(a) * SPOT_R, 0.02, Math.sin(a) * SPOT_R)
    const color = i % 2 ? '#ffc98a' : '#8fe6ff'
    g.add(cylinder(0.075, 0.085, 0.022, dark, from.x, 0.011, from.z, 16), cylinder(0.05, 0.05, 0.006, glow(color), from.x, 0.024, from.z, 16))
    const to = new THREE.Vector3(0, SHIP_Y - 0.05, 0)
    const m = beamMaterial()
    m.uniforms.uColor.value.set(color)
    const cone = part(new THREE.CylinderGeometry(0.34, 0.045, from.distanceTo(to), 20, 1, true), m)
    cone.position.copy(from).lerp(to, 0.5)
    cone.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize())
    live.add(cone)
    return m
  })
  const cobra = cobraShip()
  const ship = new THREE.Group()
  ship.add(cobra.ship)
  ship.scale.setScalar(0.8)
  live.add(ship)
  // Le faisceau du socle, et deux anneaux d'hologramme qui tournent autour de la maquette.
  live.add(part(new THREE.CylinderGeometry(0.26, 0.3, SHIP_Y - 0.5, 24, 1, true), holoMaterial(null, '#8ff0ff', 0.12, 1), 0, 0.37 + (SHIP_Y - 0.5) / 2, 0))
  const rings = [0, 1].map((i) => {
    const r = part(new THREE.TorusGeometry(0.98 + i * 0.1, 0.005, 4, 64), holoMaterial(null, i ? ED_ORANGE : '#8ff0ff', 0.6), 0, SHIP_Y, 0)
    live.add(r)
    return r
  })
  return {
    solid: g,
    live,
    update(t) {
      ship.rotation.set(Math.sin(t * 0.45) * 0.07, t * 0.22, Math.sin(t * 0.6) * 0.16, 'YXZ')
      ship.position.y = SHIP_Y + Math.sin(t * 0.9) * 0.035
      cobra.update(t)
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.22, 0, t * 0.3)
      rings[1].rotation.set(Math.PI / 2 + Math.cos(t * 0.4) * 0.18, 0, -t * 0.2)
      // Les faisceaux se relaient autour du socle : une vague qui tourne, sur un fond qui respire.
      for (const [i, m] of beams.entries()) {
        const wave = Math.max(0, Math.sin(t * 0.8 - (i / SPOTS) * Math.PI * 2))
        m.uniforms.uTime.value = t * 0.05
        m.uniforms.uIntensity.value = 0.1 + 0.05 * Math.sin(t * 0.5 + i) + 0.22 * wave * wave
      }
    },
    extent: new THREE.Box3(new THREE.Vector3(-1.08, 0, -0.66), new THREE.Vector3(1.08, 1.3, 0.66)),
  }
}

// ---------------------------------------------------------------- autour de la place

/**
 * Colonne lumineuse (0,9 de haut) : un fût sombre, un filet de lumière sur chaque face, une tête
 * de laiton. Elle éclaire (cf. lighting/emitters.ts).
 */
const promenadeLamp: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.11, 0.13, 0.04, stone, 0, 0.02, 0, 16), box(0.1, 0.8, 0.1, dark, 0, 0.44, 0, 0.012))
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const strip = box(0.03, 0.66, 0.008, glow('#ffe2b0'), Math.sin(a) * 0.051, 0.45, Math.cos(a) * 0.051)
    strip.rotation.y = a
    g.add(strip)
  }
  g.add(box(0.13, 0.03, 0.13, brass, 0, 0.855, 0, 0.008), box(0.07, 0.012, 0.07, glow('#fff0d0'), 0, 0.876, 0))
  return { solid: g }
}

/**
 * Jardinière (1,6 × 0,36, le long de x) : un bac de pierre sombre, un jonc de laiton, un filet
 * orange au pied, et des fougères et des buissons qui débordent.
 */
const promenadePlanter: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(1.6, 0.3, 0.36, stone, 0, 0.15, 0, 0.02), box(1.62, 0.025, 0.38, brass, 0, 0.3, 0, 0.008), box(1.5, 0.02, 0.28, lit('#3a2a1c'), 0, 0.312, 0))
  g.add(box(1.5, 0.012, 0.012, glow(ED_ORANGE), 0, 0.03, 0.184))
  const greens = ['#2f7d4f', '#3f9460', '#5aa86a', '#2a6a4a']
  for (let k = 0; k < 6; k++) {
    const x = -0.62 + k * 0.25 + (random() - 0.5) * 0.06, z = (random() - 0.5) * 0.08
    if (k % 2) {
      // Un buisson : trois boules de feuillage.
      const color = lit(greens[Math.floor(random() * greens.length)])
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.09 + random() * 0.04, 0), color, x + (random() - 0.5) * 0.12, 0.4 + random() * 0.08, z + (random() - 0.5) * 0.1))
      if (random() < 0.7) g.add(mesh(new THREE.IcosahedronGeometry(0.025, 0), lit(random() < 0.5 ? '#ffd0e4' : '#ffe9a0'), x, 0.52, z + 0.06))
      continue
    }
    // Une fougère : des frondes qui retombent tout autour.
    const color = lit(greens[Math.floor(random() * greens.length)])
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Group()
      frond.position.set(x, 0.33, z)
      frond.rotation.y = (i / 7) * Math.PI * 2 + random() * 0.4
      const blade = new THREE.Group()
      blade.rotation.x = -(0.5 + random() * 0.45)
      blade.add(box(0.055, 0.012, 0.24 + random() * 0.1, color, 0, 0, 0.12))
      frond.add(blade)
      g.add(frond)
    }
  }
  return { solid: g }
}

export const PROMENADE = {
  'promenade-floor': promenadeFloor,
  'cobra-monument': cobraMonument,
  'promenade-lamp': promenadeLamp,
  'promenade-planter': promenadePlanter,
} satisfies Record<string, Builder>
