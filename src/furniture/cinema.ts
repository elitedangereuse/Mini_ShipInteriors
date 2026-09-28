import * as THREE from 'three'
import {
  animatedScreen, barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glass, glow, instanced, lit, mesh, part, setInstance, sphere,
  type Builder,
} from './kit'
import { renderQuality } from '../quality'
import { tr } from '../i18n'

/*
 * Le cinéma du pont supérieur : grand écran entre deux rideaux de velours, rangées de fauteuils,
 * projecteur à bobines et son faisceau, machine à pop-corn, affiches lumineuses, panneau de sortie.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  velvet: '#8e1b2a',
  velvetDark: '#5e0f1a',
  velvetDeep: '#3d0a12',
  gold: '#d9a441',
  goldDark: '#9c7328',
  black: '#101114',
  frame: '#1d1f24',
  steel: '#3a3e46',
  chrome: '#c9cdd4',
  wood: '#4a2c1c',
  popcorn: '#fff1c4',
  butter: '#ffd35a',
}

// ---------------------------------------------------------------- le film

/**
 * Horloge du film, recalée une fois sur l'heure (tout le monde voit la même scène), puis sur
 * l'horloge des meubles (le mode photo la fige). La lumière de l'écran la suit (cf. main.ts).
 */
export const film = { time: 0 }
export const CINEMA_SCREEN = { width: 3.3, height: 1.32, centerY: 0.94, depth: 0.075 } as const
let projection: { mode: 'trailer' | 'twitch'; title: string; image: HTMLImageElement | null } | null = null
let projectionRequest = 0

/** Sur l'écran 3D, une affiche indique la séance commune sous le lecteur intégré. */
export function setProjection(mode: 'trailer' | 'twitch' | null, title = '', imageUrl = '') {
  const request = ++projectionRequest
  if (mode === null) {
    // Sans séance, l'écran et sa lumière reprennent le film animé d'origine.
    projection = null
    return
  }
  projection = { mode, title, image: null }
  if (mode === 'trailer' && imageUrl) {
    const image = new Image()
    image.onload = () => { if (request === projectionRequest && projection) projection.image = image }
    image.src = imageUrl
  }
}
let filmOffset: number | null = null
const LOOP = 48

/** Scènes du film, en secondes dans la boucle : amorce, croisière, saut, station, carton final. */
const SCENES = [
  { end: 6, light: 0.7, color: '#d8dde6' },
  { end: 18, light: 0.45, color: '#8fa8ff' },
  { end: 26, light: 0.9, color: '#9fd8ff' },
  { end: 38, light: 0.6, color: '#ffb56b' },
  { end: 46, light: 0.55, color: '#ff9a3c' },
  { end: 48, light: 0.08, color: '#8fa8ff' },
]

/** Lumière que l'écran jette dans la salle : intensité (0 à ~1,3) et couleur de la scène en cours. */
export function filmGlow(time: number): { k: number; color: string } {
  if (projection) return { k: projection.mode === 'twitch' ? 0.75 : 0.55, color: projection.mode === 'twitch' ? '#a970ff' : '#9bc8e8' }
  const t = ((time % LOOP) + LOOP) % LOOP
  const scene = SCENES.find((s) => t < s.end) ?? SCENES[0]
  let k = scene.light
  // Le saut FSD s'emballe et finit sur un éclair blanc.
  if (scene === SCENES[2]) k = 0.5 + ((t - 18) / 8) ** 2 * 0.5 + (t > 25.4 ? 0.3 : 0)
  // Fondus entre les scènes.
  const start = SCENES[SCENES.indexOf(scene) - 1]?.end ?? 0
  k *= Math.min(1, (t - start) / 0.6, (scene.end - t) / 0.6 + 0.25)
  return { k, color: scene.color }
}

const W = 640, H = 256

/** Étoiles du film, tirées une fois. */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1 + 1) % 1
  return { x: r(1) * W, y: r(2) * H, s: 0.6 + r(3) * 1.6, v: 4 + r(4) * 16 }
})

function starfield(g: CanvasRenderingContext2D, t: number, speed: number) {
  g.fillStyle = '#fff'
  for (const s of STARS) {
    const x = ((s.x - t * s.v * speed) % W + W) % W
    g.globalAlpha = 0.4 + s.s * 0.3
    g.fillRect(x, s.y, s.s, s.s)
  }
  g.globalAlpha = 1
}

/** Silhouette de Cobra Mk III vue de profil : un coin bas, et la lueur des propulseurs. */
function cobra(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  const glowing = g.createRadialGradient(-34, 0, 0, -34, 0, 18)
  glowing.addColorStop(0, 'rgba(140, 200, 255, 0.95)')
  glowing.addColorStop(1, 'rgba(140, 200, 255, 0)')
  g.fillStyle = glowing
  g.fillRect(-56, -18, 30, 36)
  g.fillStyle = '#c9cdd4'
  g.beginPath()
  g.moveTo(40, 2)
  g.lineTo(-30, -9)
  g.lineTo(-36, 4)
  g.lineTo(-30, 9)
  g.closePath()
  g.fill()
  g.fillStyle = '#7a8292'
  g.fillRect(-30, 2, 60, 3)
  g.fillStyle = ED_ORANGE
  g.fillRect(4, -3, 10, 2)
  g.restore()
}

function titleCard(g: CanvasRenderingContext2D, lines: [string, string, number][], alpha: number) {
  g.globalAlpha = Math.max(0, Math.min(1, alpha))
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const [text, font, y] of lines) {
    g.font = font
    g.fillText(text, W / 2, y)
  }
  g.globalAlpha = 1
}

/** Une image du film, à l'instant `time` de la boucle. */
function drawFilm(g: CanvasRenderingContext2D, time: number) {
  if (projection) {
    g.fillStyle = '#070b13'
    g.fillRect(0, 0, W, H)
    if (projection.image) {
      const image = projection.image
      const scale = Math.max(W / image.width, H / image.height)
      const w = image.width * scale, h = image.height * scale
      g.drawImage(image, (W - w) / 2, (H - h) / 2, w, h)
      g.fillStyle = 'rgba(3, 7, 14, .64)'
      g.fillRect(0, H - 73, W, 73)
    }
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    g.fillStyle = projection.mode === 'twitch' ? '#b38cff' : '#ffcb7e'
    g.font = '800 23px system-ui, sans-serif'
    g.fillText(projection.mode === 'twitch' ? '● EN DIRECT · TWITCH' : '▶ SÉANCE EN COURS', 22, H - 44)
    g.fillStyle = '#fff5e8'
    g.font = '600 26px Georgia, serif'
    g.fillText(projection.title.slice(0, 43), 22, H - 14, W - 44)
    return
  }
  const t = ((time % LOOP) + LOOP) % LOOP
  g.fillStyle = '#05060a'
  g.fillRect(0, 0, W, H)
  if (t < 6) {
    // Amorce : fond gris, cercles de visée, le compte à rebours balayé.
    const n = 5 - Math.floor(t)
    g.fillStyle = '#9a9ea6'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#7b7f87'
    g.beginPath()
    g.moveTo(W / 2, H / 2)
    g.arc(W / 2, H / 2, 300, -Math.PI / 2, -Math.PI / 2 + (t % 1) * Math.PI * 2)
    g.fill()
    g.strokeStyle = '#e8eaee'
    g.lineWidth = 4
    for (const r of [70, 90]) {
      g.beginPath()
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillRect(0, H / 2 - 1, W, 2)
    g.fillRect(W / 2 - 1, 0, 2, H)
    g.fillStyle = '#17181b'
    g.font = '700 120px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (n > 0) g.fillText(String(n), W / 2, H / 2 + 6)
  } else if (t < 18) {
    // Croisière : une géante gazeuse à anneaux, un Cobra passe devant.
    starfield(g, t, 0.4)
    const p = g.createRadialGradient(470, 110, 10, 500, 130, 120)
    p.addColorStop(0, '#ffd08a')
    p.addColorStop(0.6, '#c0643f')
    p.addColorStop(1, '#3a1a14')
    g.fillStyle = p
    g.beginPath()
    g.arc(500, 130, 92, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255, 220, 170, 0.55)'
    g.lineWidth = 6
    g.beginPath()
    g.ellipse(500, 132, 160, 26, -0.18, 0, Math.PI * 2)
    g.stroke()
    cobra(g, -80 + (t - 6) * 62, 150 - (t - 6) * 3, 1.5)
    g.fillStyle = ED_ORANGE
    titleCard(g, [[tr('ELITE DANGEREUSE PRÉSENTE', 'ELITE DANGEREUSE PRESENTS'), '600 26px system-ui, sans-serif', 50]], Math.min(t - 7.5, 12.5 - t))
  } else if (t < 26) {
    // Saut FSD : traînées d'étoiles qui s'allongent, tunnel bleu, puis l'éclair.
    const k = (t - 18) / 8
    const tunnel = g.createRadialGradient(W / 2, H / 2, 5, W / 2, H / 2, 320)
    tunnel.addColorStop(0, `rgba(210, 240, 255, ${0.3 + k * 0.6})`)
    tunnel.addColorStop(0.35, `rgba(60, 120, 255, ${0.15 + k * 0.4})`)
    tunnel.addColorStop(1, 'rgba(5, 6, 10, 0)')
    g.fillStyle = tunnel
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#dff4ff'
    g.lineWidth = 1.5
    for (const [i, s] of STARS.entries()) {
      const a = (i / STARS.length) * Math.PI * 2 + s.x
      const d = ((s.y / H + t * (0.3 + k * 1.4)) % 1) * 380
      const len = 6 + k * k * 120
      g.globalAlpha = Math.min(1, d / 120)
      g.beginPath()
      g.moveTo(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 0.6)
      g.lineTo(W / 2 + Math.cos(a) * (d + len), H / 2 + Math.sin(a) * (d + len) * 0.6)
      g.stroke()
    }
    g.globalAlpha = 1
    if (t > 25.4) {
      g.fillStyle = `rgba(255, 255, 255, ${(t - 25.4) / 0.6})`
      g.fillRect(0, 0, W, H)
    }
  } else if (t < 38) {
    // Arrivée : une station Coriolis tourne, le Cobra vise la fente.
    starfield(g, t, 0.1)
    const sun = g.createRadialGradient(80, 60, 0, 80, 60, 140)
    sun.addColorStop(0, 'rgba(255, 230, 190, 0.9)')
    sun.addColorStop(1, 'rgba(255, 150, 60, 0)')
    g.fillStyle = sun
    g.fillRect(0, 0, 260, 220)
    const a = (t - 26) * 0.35
    g.save()
    g.translate(W / 2, H / 2)
    g.rotate(a)
    g.fillStyle = '#5d6470'
    g.strokeStyle = '#aab2bf'
    g.lineWidth = 2
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const b = (i / 8) * Math.PI * 2 + Math.PI / 8
      g.lineTo(Math.cos(b) * 92, Math.sin(b) * 92)
    }
    g.closePath()
    g.fill()
    g.stroke()
    g.fillStyle = '#0b0d12'
    g.fillRect(-30, -9, 60, 18)
    g.strokeStyle = ED_ORANGE
    g.strokeRect(-30, -9, 60, 18)
    g.restore()
    const k = (t - 26) / 12
    cobra(g, 120 + k * 200, 210 - k * 82, 1.3 - k * 1.1)
  } else if (t < 46) {
    // Carton final.
    starfield(g, t, 0.05)
    g.fillStyle = ED_ORANGE
    titleCard(g, [
      [tr('PROCHAINEMENT', 'COMING SOON'), '800 58px system-ui, sans-serif', 108],
      [tr('dans votre Fleet Carrier', 'in your Fleet Carrier'), '400 24px system-ui, sans-serif', 160],
      ['o7', '700 22px system-ui, sans-serif', 202],
    ], Math.min((t - 38) / 1.2, (46 - t) / 1.2))
    // En attendant une vraie séance, le carton dit où elle se choisit.
    g.fillStyle = '#9fd8ff'
    titleCard(g, [[tr('Votre séance se choisit à la régie, au fond de la salle', 'Pick the screening at the booth, at the back of the room'),
      '600 21px system-ui, sans-serif', 238]], Math.min((t - 39) / 1.2, (46 - t) / 1.2))
  }
  // Grain de pellicule et vignettage.
  g.fillStyle = 'rgba(255, 255, 255, 0.05)'
  for (let i = 0; i < 14; i++) g.fillRect(((time * 977 + i * 131) % 1) * W, ((time * 613 + i * 71) % 1) * H, 2, 2)
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.6, W / 2, H / 2, W * 0.62)
  v.addColorStop(0, 'rgba(0, 0, 0, 0)')
  v.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
}

// ---------------------------------------------------------------- l'écran

/**
 * Rideau de velours plissé : des plis en demi-cylindres, du sol à `h`, repliés vers le bord
 * extérieur (`side` : -1 à gauche, 1 à droite), retenus par une embrasse dorée.
 */
function curtain(g: THREE.Group, x: number, w: number, h: number, side: -1 | 1) {
  const folds = 6, r = w / folds / 2
  for (let i = 0; i < folds; i++) {
    const fx = x + side * (i - (folds - 1) / 2) * r * 2
    const fold = mesh(new THREE.CylinderGeometry(r, r, h, 8, 1, false, 0, Math.PI), lit(i % 2 ? C.velvet : C.velvetDark), fx, h / 2, 0.06)
    fold.rotation.y = -Math.PI / 2
    g.add(fold)
  }
  // Embrasse : le rideau se resserre, une corde dorée et son pompon.
  g.add(box(w * 0.9, 0.035, 0.14, lit(C.gold), x, h * 0.42, 0.07, 0.015))
  g.add(cylinder(0.02, 0.035, 0.08, lit(C.gold), x - side * w * 0.45, h * 0.37, 0.14, 8))
}

/**
 * Grand écran de cinéma, accroché au mur : cadre noir mat, toile où passe le film (bande-annonce
 * en boucle, cf. drawFilm), rideaux de velours et lambrequin frangé d'or, petite scène bordée
 * de veilleuses. Largeur totale : 4,6.
 */
const cinemaScreen: Builder = () => {
  const g = new THREE.Group()
  const { width: SW, height: SH, centerY: SY } = CINEMA_SCREEN
  // Mur de fond en velours sombre, cadre noir mat autour de la toile.
  g.add(box(4.6, 1.78, 0.03, lit(C.velvetDeep), 0, 0.89, 0.015))
  g.add(box(SW + 0.16, SH + 0.14, 0.05, lit(C.black), 0, SY, 0.045))
  // Lambrequin : un bandeau plissé et sa frange dorée.
  g.add(box(4.6, 0.2, 0.12, lit(C.velvet), 0, 1.72, 0.08, 0.02), box(4.62, 0.035, 0.13, lit(C.gold), 0, 1.61, 0.085))
  for (let i = 0; i < 23; i++) g.add(box(0.1, 0.16, 0.02, lit(i % 2 ? C.velvet : C.velvetDark), -2.2 + i * 0.2, 1.7, 0.15))
  curtain(g, -2.0, 0.6, 1.62, -1)
  curtain(g, 2.0, 0.6, 1.62, 1)
  // Petite scène en bois sombre, bordée de veilleuses.
  g.add(box(4.2, 0.1, 0.44, lit(C.wood), 0, 0.05, 0.22, 0.01), box(4.22, 0.02, 0.02, lit(C.goldDark), 0, 0.1, 0.44))
  for (let i = 0; i < 12; i++) g.add(box(0.05, 0.02, 0.01, glow('#ffc67a'), -1.93 + i * 0.35, 0.05, 0.445))
  // Haut-parleurs de façade, sous la toile, derrière la toile tendue.
  for (const x of [-1.2, 0, 1.2]) g.add(box(0.36, 0.16, 0.04, lit(C.frame), x, 0.18, 0.06, 0.01))

  const screen = animatedScreen(W, H, 12, drawFilm)
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }), 0, SY, CINEMA_SCREEN.depth))
  return {
    solid: g,
    live,
    update(t) {
      filmOffset ??= Date.now() / 1000 - t
      film.time = t + filmOffset
      screen.tick(film.time)
    },
  }
}

// ---------------------------------------------------------------- les fauteuils

/** Espacement des fauteuils d'une rangée. */
export const CINEMA_SEAT_PITCH = 0.58
/** Fauteuils par rangée. */
export const CINEMA_ROW_SEATS = 6

/**
 * Rangée de six fauteuils de cinéma en velours, sur un piétement commun : dossiers hauts et
 * galbés, accoudoirs partagés avec porte-gobelet, numéros dorés au dos, veilleuses d'allée aux
 * deux bouts. Face à +z ; tient entre z = -0,3 (dossiers) et z = 0,22 (bord des assises).
 * Velours : `label` (rouge par défaut, « blue » pour le bleu nuit).
 */
const cinemaRow: Builder = ({ label }) => {
  const g = new THREE.Group()
  const n = CINEMA_ROW_SEATS, p = CINEMA_SEAT_PITCH, width = n * p
  const velvet = lit(label === 'blue' ? '#243a6b' : C.velvet), velvetDark = lit(label === 'blue' ? '#182848' : C.velvetDark)
  // Dans la pénombre, des dos noirs feraient des rangées noires : coques et accoudoirs restent bordeaux.
  const frame = lit(label === 'blue' ? '#1a2238' : '#3a1a20'), gold = lit(C.gold)
  // Piétement : une poutre au sol, un pied par accoudoir.
  g.add(box(width, 0.04, 0.1, frame, 0, 0.02, -0.12))
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * p
    // Assise, bord avant arrondi ; dossier galbé, plus sombre en bas ; têtière.
    g.add(box(p - 0.1, 0.1, 0.38, velvet, x, 0.22, 0.02, 0.04))
    g.add(box(p - 0.1, 0.4, 0.1, velvet, x, 0.44, -0.24, 0.045), box(p - 0.08, 0.14, 0.11, velvetDark, x, 0.26, -0.24, 0.03))
    g.add(box(p - 0.14, 0.08, 0.11, velvetDark, x, 0.66, -0.235, 0.04))
    // Coque arrière et numéro de place.
    g.add(box(p - 0.08, 0.5, 0.02, velvetDark, x, 0.42, -0.295, 0.008), box(0.07, 0.035, 0.004, gold, x, 0.58, -0.306))
  }
  // Accoudoirs (entre les places et aux deux bouts), porte-gobelets sur le dessus.
  for (let i = 0; i <= n; i++) {
    const x = (i - n / 2) * p
    g.add(box(0.05, 0.26, 0.38, frame, x, 0.13, -0.04, 0.01), box(0.07, 0.03, 0.44, lit('#5a3a2a'), x, 0.3, -0.03, 0.012))
    g.add(cylinder(0.026, 0.02, 0.012, lit(C.black), x, 0.318, 0.15, 10))
  }
  // Veilleuses d'allée, au bas des flancs de la rangée.
  for (const s of [-1, 1]) g.add(box(0.012, 0.03, 0.12, glow('#ffb45e'), s * (width / 2 + 0.03), 0.05, 0.02))
  return { solid: g }
}

/**
 * Fauteuil de régie, isolé au fond : velours bleu, liserés d'or et pupitre de diffusion. On le
 * repère sans message : un rai de lumière bleue qui respire et son halo au sol, comme sur une
 * scène.
 */
const projectionChair: Builder = () => {
  const g = new THREE.Group()
  const blue = lit('#244a73'), dark = lit('#152b48'), gold = lit(C.gold)
  g.add(box(0.72, 0.13, 0.47, blue, 0, 0.24, 0.02, 0.045))
  g.add(box(0.72, 0.56, 0.13, dark, 0, 0.52, -0.25, 0.04))
  g.add(box(0.72, 0.035, 0.06, gold, 0, 0.79, -0.25, 0.01))
  for (const x of [-0.37, 0.37]) {
    g.add(box(0.075, 0.37, 0.49, dark, x, 0.22, 0.02, 0.015))
    g.add(box(0.08, 0.035, 0.49, gold, x, 0.42, 0.02, 0.01))
  }
  g.add(box(0.69, 0.045, 0.12, lit(C.frame), 0, 0.025, -0.12))
  // Pupitre sur l'accoudoir droit : voyant ON AIR et trois touches rétroéclairées.
  g.add(box(0.23, 0.055, 0.28, lit(C.frame), 0.43, 0.46, 0.13, 0.012))
  g.add(box(0.18, 0.007, 0.13, glow('#55b7ee'), 0.43, 0.491, 0.07))
  for (let i = 0; i < 3; i++) g.add(box(0.043, 0.008, 0.04, glow(i === 0 ? '#ffb45e' : '#74d0fa'), 0.37 + i * 0.06, 0.491, 0.21))
  // Halo au sol, au-dessus du tapis de la salle (2 cm).
  const halo = drawnTexture(128, 128, (c) => {
    const r = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(116, 208, 250, 0.8)')
    r.addColorStop(0.55, 'rgba(85, 183, 238, 0.4)')
    r.addColorStop(1, 'rgba(85, 183, 238, 0)')
    c.fillStyle = r
    c.fillRect(0, 0, 128, 128)
  })
  const haloMat = new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const pool = part(new THREE.CircleGeometry(0.72, 32), haloMat, 0, 0.03, 0.1)
  pool.rotation.x = -Math.PI / 2
  // Rai de lumière qui tombe sur le fauteuil, comme sur une scène : il dépasse du mur sud, qui
  // cache le fauteuil dans la vue par défaut. Opacité portée par les sommets, nulle en haut.
  const H = 2.1
  const shaft = new THREE.CylinderGeometry(0.16, 0.62, H, 24, 6, true)
  const pos = shaft.attributes.position
  const alpha = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    const k = 0.5 + pos.getY(i) / H
    alpha.set([1, 1, 1, (1 - k) ** 1.5 * 0.5], i * 4)
  }
  shaft.setAttribute('color', new THREE.BufferAttribute(alpha, 4))
  const shaftMat = new THREE.MeshBasicMaterial({ color: '#74d0fa', vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  const beam = part(shaft, shaftMat, 0, 0.03 + H / 2, 0.1)
  const live = new THREE.Group()
  live.add(pool, beam)
  return { solid: g, live, update: (t) => {
    const k = Math.sin(t * 1.4)
    haloMat.opacity = 0.7 + 0.3 * k
    shaftMat.opacity = 0.8 + 0.2 * k
  } }
}

// ---------------------------------------------------------------- pop-corn

/**
 * Machine à pop-corn sur son chariot : caisse rouge à liserés dorés, cuve vitrée éclairée où
 * saute le maïs, marmite qui se renverse de temps en temps, fronton « POP-CORN », cornets rayés
 * sur la tablette. Face à +z.
 */
const popcornMachine: Builder = ({ random }) => {
  const g = new THREE.Group()
  const red = lit('#c0262d'), gold = lit(C.gold), chrome = lit(C.chrome), black = lit(C.black)
  // Chariot : caisse, portillon, roues, poignée.
  g.add(box(0.5, 0.42, 0.38, red, 0, 0.27, 0, 0.02), box(0.52, 0.03, 0.4, gold, 0, 0.495, 0))
  g.add(box(0.3, 0.26, 0.01, lit('#a01e25'), 0, 0.27, 0.195, 0.01), box(0.06, 0.012, 0.012, gold, 0.1, 0.3, 0.205))
  for (const x of [-0.2, 0.2]) {
    const wheel = barX(0.055, 0.03, black, x, 0.055, 0.12, 14)
    g.add(wheel, barX(0.02, 0.035, chrome, x, 0.055, 0.12, 8))
  }
  g.add(cylinder(0.025, 0.03, 0.06, black, -0.2, 0.03, -0.14, 8), cylinder(0.025, 0.03, 0.06, black, 0.2, 0.03, -0.14, 8))
  g.add(barX(0.01, 0.46, chrome, 0, 0.44, -0.22, 8))
  // Cuve vitrée : montants dorés, fond de pop-corn, toit rouge et fronton lumineux.
  for (const x of [-0.22, 0.22]) for (const z of [-0.16, 0.16]) g.add(box(0.025, 0.42, 0.025, gold, x, 0.72, z))
  g.add(box(0.44, 0.07, 0.32, lit(C.popcorn), 0, 0.545, 0), box(0.5, 0.03, 0.38, gold, 0, 0.94, 0), box(0.44, 0.06, 0.34, red, 0, 0.98, 0, 0.02))
  const marquee = drawnTexture(256, 64, (c) => {
    c.fillStyle = '#c0262d'
    c.fillRect(0, 0, 256, 64)
    c.strokeStyle = '#ffd35a'
    c.lineWidth = 4
    c.strokeRect(4, 4, 248, 56)
    c.fillStyle = '#fff4d6'
    c.font = '800 38px Georgia, serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('POP-CORN', 128, 34)
  })
  const sign = part(new THREE.PlaneGeometry(0.46, 0.115), new THREE.MeshBasicMaterial({ map: marquee }), 0, 1.07, 0.02)
  g.add(box(0.48, 0.13, 0.03, gold, 0, 1.07, 0), sign)
  // Tablette latérale et cornets rayés rouge et blanc.
  g.add(box(0.16, 0.02, 0.26, gold, 0.33, 0.47, 0.02))
  const stripes = drawnTexture(64, 64, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff4e6' : '#c0262d'
      c.fillRect(i * 8, 0, 8, 64)
    }
  })
  const cone = new THREE.MeshLambertMaterial({ map: stripes })
  for (const [x, z] of [[0.3, -0.05], [0.36, 0.06], [0.3, 0.1]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.09, 12, 1, true), cone, x, 0.525, z))
    g.add(sphere(0.034, lit(C.popcorn), x, 0.57, z, 8))
  }

  // Ce qui bouge : la marmite suspendue qui bascule, le maïs qui saute dans la cuve.
  const live = new THREE.Group()
  const kettle = new THREE.Group()
  kettle.position.set(0, 0.86, 0)
  kettle.add(cylinder(0.006, 0.006, 0.07, chrome, 0, 0.035, 0, 6), cylinder(0.075, 0.06, 0.07, chrome, 0, -0.03, 0, 14))
  kettle.add(cylinder(0.07, 0.07, 0.012, lit(C.butter), 0, 0.006, 0, 14))
  live.add(kettle)
  const COUNT = 26
  const kernels = instanced(new THREE.IcosahedronGeometry(0.014, 0), Array.from({ length: COUNT }, (_, i) => (i % 4 ? C.popcorn : C.butter)), lit('#ffffff'))
  const hops = Array.from({ length: COUNT }, () => ({ x: (random() - 0.5) * 0.36, z: (random() - 0.5) * 0.24, phase: random(), speed: 0.7 + random() * 0.8, h: 0.08 + random() * 0.18 }))
  live.add(kernels)
  // La vitre : un pavé translucide, dans `live` (le verre ne se fusionne pas).
  live.add(part(new THREE.BoxGeometry(0.44, 0.36, 0.32), glass('#fff6dc', 0.16), 0, 0.74, 0))
  return {
    solid: g,
    live,
    update(t) {
      // Toutes les 7 s, la marmite bascule et déverse une fournée.
      const tip = Math.max(0, Math.sin(((t % 7) / 7) * Math.PI * 2 - 1.2))
      kettle.rotation.z = -tip * 0.7
      if (renderQuality.light) return
      for (const [i, k] of hops.entries()) {
        const u = (t * k.speed + k.phase) % 1
        setInstance(kernels, i, k.x, 0.59 + Math.sin(u * Math.PI) * k.h, k.z, 1, u * 6)
      }
      kernels.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- projecteur

/**
 * Projecteur à bobines sur sa console murale, tourné vers +z : les deux bobines tournent, un
 * faisceau pâle file jusqu'à l'écran, des poussières y dansent. Portée : `label` (défaut 7,4).
 * Le faisceau vise la toile (3,3 × 1,32, centrée à 0,94 de haut) depuis l'objectif (y = 1,22).
 */
const filmProjector: Builder = ({ label, random }) => {
  const reach = Number(label) || 7.4
  const g = new THREE.Group()
  const dark = lit(C.steel), black = lit(C.black), chrome = lit(C.chrome)
  // Console : deux équerres et une tablette.
  g.add(box(0.5, 0.04, 0.34, lit(C.frame), 0, 1.0, 0.17))
  for (const x of [-0.2, 0.2]) {
    const strut = box(0.03, 0.34, 0.03, lit(C.frame), x, 0.86, 0.12)
    strut.rotation.x = 0.7
    g.add(strut)
  }
  // Corps, objectif, lanterne et ses ailettes.
  g.add(box(0.26, 0.18, 0.22, dark, 0, 1.11, 0.17, 0.02), box(0.1, 0.12, 0.14, black, -0.14, 1.11, 0.12, 0.01))
  for (let i = 0; i < 4; i++) g.add(box(0.012, 0.13, 0.12, black, -0.2 - i * 0.02, 1.11, 0.12))
  g.add(barZ(0.045, 0.1, black, 0.04, 1.14, 0.32, 14), barZ(0.036, 0.012, glow('#fff6de'), 0.04, 1.14, 0.376, 14))
  g.add(barZ(0.05, 0.02, chrome, 0.04, 1.14, 0.27, 14))

  const live = new THREE.Group()
  const reels: THREE.Object3D[] = []
  for (const [x, y, z] of [[0.05, 1.33, 0.08], [0.05, 1.3, 0.28]] as const) {
    const reel = new THREE.Group()
    reel.position.set(x, y, z)
    const disc = barX(0.1, 0.02, lit('#8a9099'), 0, 0, 0, 18)
    reel.add(disc, barX(0.07, 0.024, black, 0, 0, 0, 16), barX(0.02, 0.03, chrome, 0, 0, 0, 8))
    for (let k = 0; k < 3; k++) {
      const spoke = box(0.026, 0.16, 0.02, lit('#8a9099'), 0, 0, 0)
      spoke.rotation.x = (k * Math.PI) / 3
      reel.add(spoke)
    }
    reels.push(reel)
    live.add(reel)
  }
  g.add(cylinder(0.008, 0.008, 0.2, chrome, 0.05, 1.23, 0.08, 6), cylinder(0.008, 0.008, 0.16, chrome, 0.05, 1.22, 0.28, 6))

  // Faisceau : pyramide ouverte de l'objectif à la toile, qui s'éteint en approchant de l'écran.
  const lens = new THREE.Vector3(0.04, 1.14, 0.38)
  const corners = [[-1.65, 0.28], [1.65, 0.28], [1.65, 1.6], [-1.65, 1.6]].map(([x, y]) => new THREE.Vector3(x, y, reach))
  const pos: number[] = [], alpha: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4]
    pos.push(lens.x, lens.y, lens.z, a.x, a.y, a.z, b.x, b.y, b.z)
    alpha.push(1, 0.25, 0.25)
  }
  const beamGeo = new THREE.BufferGeometry()
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  beamGeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1))
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#cfe0ff') }, uStrength: { value: 0.1 } },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor * vAlpha * uStrength, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  live.add(new THREE.Mesh(beamGeo, beamMat))
  // Poussières dans le faisceau.
  const DUST = 40
  const dust = instanced(new THREE.PlaneGeometry(0.012, 0.012), Array.from({ length: DUST }, () => '#fff4dc'))
  const motes = Array.from({ length: DUST }, () => ({ u: random(), sx: random() - 0.5, sy: random() - 0.5, speed: 0.01 + random() * 0.02, phase: random() * 6 }))
  live.add(dust)
  const tint = new THREE.Color()
  return {
    solid: g,
    live,
    update(t) {
      for (const [i, r] of reels.entries()) r.rotation.x = t * (i ? 2.4 : 1.8)
      // Le faisceau prend la couleur de la scène et palpite avec elle.
      const { k, color } = filmGlow(film.time)
      beamMat.uniforms.uStrength.value = 0.05 + k * 0.1
      beamMat.uniforms.uColor.value.copy(tint.set(color)).lerp(new THREE.Color('#ffffff'), 0.5)
      dust.visible = !renderQuality.light
      if (!dust.visible) return
      for (const [i, m] of motes.entries()) {
        const u = (m.u + t * m.speed) % 1
        const x = lens.x + (m.sx * 3 - lens.x) * u + Math.sin(t * 0.7 + m.phase) * 0.03
        const y = lens.y + (0.94 + m.sy * 1.2 - lens.y) * u + Math.sin(t * 0.5 + m.phase) * 0.03
        setInstance(dust, i, x, y, lens.z + (reach - lens.z) * u, 1, t + m.phase)
      }
      dust.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- affiches et signalétique

/** Films à l'affiche : titre, accroche, et le fond de l'affiche. */
const FEATURES: Record<string, { title: string[]; line: string; sky: [string, string]; draw: (c: CanvasRenderingContext2D) => void }> = {
  hutton: {
    title: ['HUTTON', 'ORBITAL'],
    line: tr('0,22 année-lumière. Une éternité.', '0.22 light years. An eternity.'),
    sky: ['#0b1030', '#3a2c6a'],
    draw: (c) => {
      c.fillStyle = '#ffd08a'
      c.beginPath()
      c.arc(60, 150, 26, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#c9cdd4'
      c.fillRect(150, 118, 34, 50)
      c.fillStyle = '#e8eef4'
      c.beginPath()
      c.moveTo(185, 140)
      c.lineTo(235, 132)
      c.lineTo(235, 150)
      c.closePath()
      c.fill()
      c.strokeStyle = 'rgba(255,255,255,0.5)'
      c.setLineDash([4, 6])
      c.beginPath()
      c.moveTo(86, 150)
      c.lineTo(148, 142)
      c.stroke()
      c.setLineDash([])
    },
  },
  thargoid: {
    title: ['LA NUIT', 'DES THARGOÏDES'],
    line: tr('Dans l\'espace, personne ne vous entend scanner.', 'In space, no one can hear you scan.'),
    sky: ['#03140a', '#0e3b24'],
    draw: (c) => {
      c.fillStyle = '#2a5a3a'
      c.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        c.lineTo(128 + Math.cos(a) * 80, 150 + Math.sin(a) * 38)
        c.lineTo(128 + Math.cos(a + 0.39) * 44, 150 + Math.sin(a + 0.39) * 20)
      }
      c.closePath()
      c.fill()
      c.fillStyle = '#6aff9a'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        c.beginPath()
        c.arc(128 + Math.cos(a) * 58, 150 + Math.sin(a) * 27, 4, 0, Math.PI * 2)
        c.fill()
      }
    },
  },
  jameson: {
    title: ['LE DERNIER', 'CAFÉ DE JAMESON'],
    line: tr('Une comédie romantique à Shinrarta Dezhra.', 'A romantic comedy in Shinrarta Dezhra.'),
    sky: ['#2a0e18', '#8a3a2a'],
    draw: (c) => {
      c.fillStyle = '#fff4e6'
      c.fillRect(100, 130, 56, 44)
      c.strokeStyle = '#fff4e6'
      c.lineWidth = 8
      c.beginPath()
      c.arc(160, 150, 14, -Math.PI / 2, Math.PI / 2)
      c.stroke()
      c.strokeStyle = 'rgba(255,255,255,0.6)'
      c.lineWidth = 3
      for (const x of [115, 128, 141]) {
        c.beginPath()
        c.moveTo(x, 120)
        c.bezierCurveTo(x - 8, 108, x + 8, 100, x, 86)
        c.stroke()
      }
    },
  },
}

/**
 * Caisson lumineux d'affiche de cinéma, accroché au mur : cadre doré, affiche rétroéclairée d'un
 * faux film d'Elite. Film : `label` (hutton, thargoid, jameson).
 */
const moviePoster: Builder = ({ label }) => {
  const f = FEATURES[label ?? ''] ?? FEATURES.hutton
  const g = new THREE.Group()
  g.add(box(0.46, 0.64, 0.05, lit(C.goldDark), 0, 0.62, 0.025, 0.01), box(0.4, 0.58, 0.02, lit(C.black), 0, 0.62, 0.045))
  const art = drawnTexture(256, 372, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, 372)
    sky.addColorStop(0, f.sky[0])
    sky.addColorStop(1, f.sky[1])
    c.fillStyle = sky
    c.fillRect(0, 0, 256, 372)
    c.fillStyle = 'rgba(255,255,255,0.8)'
    for (let i = 0; i < 40; i++) c.fillRect((i * 97) % 256, (i * 53) % 230, 1.5, 1.5)
    f.draw(c)
    c.fillStyle = '#fff4e6'
    c.textAlign = 'center'
    c.font = '800 30px Georgia, serif'
    f.title.forEach((line, i) => c.fillText(line, 128, 240 + i * 34))
    c.font = 'italic 13px Georgia, serif'
    c.fillStyle = '#ffd35a'
    c.fillText(f.line, 128, 318, 236)
    c.font = '600 11px system-ui, sans-serif'
    c.fillStyle = 'rgba(255,255,255,0.7)'
    c.fillText(tr('BIENTÔT DANS VOTRE CINÉMA DE BORD', 'SOON IN YOUR ONBOARD CINEMA'), 128, 350)
  })
  g.add(part(new THREE.PlaneGeometry(0.38, 0.555), new THREE.MeshBasicMaterial({ map: art }), 0, 0.62, 0.057))
  return { solid: g }
}

/** Panneau « Sortie » lumineux, vert, accroché au mur. */
const exitSign: Builder = () => {
  const g = new THREE.Group()
  const face = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#0f8a46'
    c.fillRect(0, 0, 256, 96)
    c.fillStyle = '#eafff2'
    c.font = '800 44px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('SORTIE', 'EXIT'), 150, 50)
    // Le petit bonhomme qui court vers la porte.
    c.beginPath()
    c.arc(38, 24, 8, 0, Math.PI * 2)
    c.fill()
    c.lineWidth = 8
    c.strokeStyle = '#eafff2'
    c.beginPath()
    c.moveTo(36, 34)
    c.lineTo(30, 58)
    c.lineTo(18, 78)
    c.moveTo(30, 58)
    c.lineTo(46, 76)
    c.moveTo(20, 44)
    c.lineTo(50, 42)
    c.stroke()
  })
  g.add(box(0.3, 0.12, 0.03, lit(C.frame), 0, 0.86, 0.015, 0.008))
  g.add(part(new THREE.PlaneGeometry(0.27, 0.1), new THREE.MeshBasicMaterial({ map: face }), 0, 0.86, 0.031))
  return { solid: g }
}

export const CINEMA = {
  'cinema-screen': cinemaScreen,
  'cinema-row': cinemaRow,
  'projection-chair': projectionChair,
  'popcorn-machine': popcornMachine,
  'film-projector': filmProjector,
  'movie-poster': moviePoster,
  'exit-sign': exitSign,
} satisfies Record<string, Builder>
