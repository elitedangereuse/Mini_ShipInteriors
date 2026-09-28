import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COBRA_EDGES, COBRA_VERTICES } from './cobra'
import {
  animatedScreen, barX, barZ, box, compact, cylinder, drawnTexture, ED_ORANGE, glass, glow, instanced, keepShared, lit,
  mesh, part, rng, setInstance, sphere, type Builder, type ClawControl, type ClawResult,
} from './kit'
import { FIGHT_TITLE } from '../../shared/fight-roster.js'
import { Fight } from '../arcade/fight'
import { emptyPad } from '../arcade/game'
import { Asteroids, AsteroidsPilot } from '../arcade/asteroids'
import { Invaders, InvadersPilot } from '../arcade/invaders'
import { Cargo, CargoPilot, COLS as CARGO_COLS, FREIGHT, FREIGHT_DARK, HIDDEN as CARGO_HIDDEN, ROWS as CARGO_ROWS } from '../arcade/cargo'
import { padScore, pixelText, records, type ArcadeGame, type GameId, type Pad } from '../arcade/game'
import { COLS as VIPER_COLS, ROWS as VIPER_ROWS, Viper, ViperPilot } from '../arcade/viper'
import { tr } from '../i18n'

/*
 * Salon d'arcade : bornes droites, borne cocktail, flippers, borne de course et pince à
 * peluches. Chaque écran est un canvas redessiné à cadence réduite (un par exemplaire) ;
 * frontons, plateaux et illustrations, dessinés une fois par variante, sont partagés.
 */

const C = {
  black: '#121318',
  panel: '#2a2a33',
  chrome: '#cfd6de',
  steel: '#8a9098',
  seat: '#1b1c22',
  cat: '#8a8f99',
  nose: '#e8457c',
}

const _o = new THREE.Object3D()
const _m = new THREE.Matrix4()
const _size = new THREE.Vector3()

let glareMaterial: THREE.MeshBasicMaterial | undefined

/** Reflet d'une vitre : deux traits de lumière en biais (texture partagée), posé à plat par-dessus le verre. */
function glare(w: number, d: number, x = 0, y = 0, z = 0): THREE.Mesh {
  if (!glareMaterial) {
    const map = drawnTexture(64, 64, (g) => {
      g.fillStyle = 'rgba(255, 255, 255, 0.22)'
      g.beginPath()
      g.moveTo(8, 64)
      g.lineTo(20, 64)
      g.lineTo(52, 0)
      g.lineTo(40, 0)
      g.fill()
      g.fillStyle = 'rgba(255, 255, 255, 0.12)'
      g.beginPath()
      g.moveTo(25, 64)
      g.lineTo(29, 64)
      g.lineTo(61, 0)
      g.lineTo(57, 0)
      g.fill()
    })
    glareMaterial = keepShared(new THREE.MeshBasicMaterial({ map: keepShared(map), transparent: true, depthWrite: false }))
  }
  const p = part(new THREE.PlaneGeometry(w, d), glareMaterial, x, y, z)
  p.rotation.x = -Math.PI / 2
  return p
}

/** Montée douce de 0 à 1 quand `u` va de 0 à 1. */
function ease(u: number): number {
  const v = Math.min(1, Math.max(0, u))
  return v * v * (3 - 2 * v)
}

// ---------------------------------------------------------------- jeux

type Draw = (c: CanvasRenderingContext2D, t: number) => void

const W = 96, H = 80

/** Projection de la Cobra Mk III en fil de fer (façon Elite, 1984). */
const drawElite: Draw = (c, t) => {
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  // Étoiles qui défilent.
  c.fillStyle = '#9aa'
  for (let i = 0; i < 18; i++) {
    const x = (i * 37 + t * (8 + (i % 3) * 6)) % W
    c.fillRect(W - x, (i * 23) % 50, 1, 1)
  }
  const ay = t * 0.9, ax = 0.35 + Math.sin(t * 0.6) * 0.25
  const pts = COBRA_VERTICES.map(([x, y, z]) => {
    const x1 = x * Math.cos(ay) - z * Math.sin(ay), z1 = x * Math.sin(ay) + z * Math.cos(ay)
    const y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
    const k = 34 / (z2 + 3)
    return [W / 2 + x1 * k, 26 - y1 * k] as const
  })
  c.strokeStyle = '#f2f2f2'
  c.lineWidth = 1
  c.beginPath()
  for (const [a, b] of COBRA_EDGES) {
    c.moveTo(pts[a][0], pts[a][1])
    c.lineTo(pts[b][0], pts[b][1])
  }
  c.stroke()
  // Tableau de bord : le scanner elliptique d'origine.
  c.strokeStyle = '#e8c33a'
  c.beginPath()
  c.ellipse(W / 2, 64, 26, 9, 0, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = '#e8c33a'
  c.fillRect(W / 2 + Math.cos(t) * 16, 64 + Math.sin(t) * 5, 2, 2)
  c.fillStyle = '#6f6'
  c.font = '7px monospace'
  c.fillText('JAMESON', 3, 8)
}

// --- Le Labyrinthe de Comète

/** Labyrinthe de 15 × 12 cases de 6 px, sous un bandeau de 8 px (score, vies). */
const MAZE = { cols: 15, rows: 12, cell: 6, x: 3, y: 8 }

/** Couloirs [x1, y1, x2, y2] (en cases) ; tout le reste est mur. */
const CORRIDORS = [
  [1, 1, 13, 1], [1, 4, 13, 4], [1, 7, 13, 7], [1, 10, 13, 10],
  [1, 1, 1, 10], [13, 1, 13, 10], [4, 1, 4, 7], [10, 1, 10, 7], [7, 1, 7, 4], [7, 7, 7, 10],
]

/** Tournée de Comète (coins successifs d'un circuit fermé) et ronde d'un robot autour de la base de recharge. */
const CAT_LOOP = [[1, 1], [7, 1], [7, 4], [10, 4], [10, 1], [13, 1], [13, 10], [1, 10], [1, 7], [4, 7], [4, 4], [1, 4]]
const ROBOT_LOOP = [[4, 4], [4, 7], [10, 7], [10, 4]]

const loopLength = (loop: number[][]) =>
  loop.reduce((n, a, i) => {
    const b = loop[(i + 1) % loop.length]
    return n + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
  }, 0)
const CAT_LAP = loopLength(CAT_LOOP), ROBOT_LAP = loopLength(ROBOT_LOOP)

/** Point courant d'un circuit, réutilisé (cf. along). */
const at = { x: 0, y: 0, dx: 0, dy: 0 }

/** Position (en cases) et direction à la distance `d` (0 ≤ d < tour) le long d'un circuit. */
function along(loop: number[][], d: number) {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
    if (d <= len || i === loop.length - 1) {
      at.dx = Math.sign(b[0] - a[0])
      at.dy = Math.sign(b[1] - a[1])
      at.x = a[0] + at.dx * d
      at.y = a[1] + at.dy * d
      break
    }
    d -= len
  }
  return at
}

/** Cases ouvertes (1 : croquette, 2 : poisson) et, pour chacune, sa distance le long de la tournée (-1 : hors tournée). */
const TREAT = new Uint8Array(MAZE.cols * MAZE.rows)
const EATEN_AT = new Float32Array(MAZE.cols * MAZE.rows).fill(-1)
for (const [x1, y1, x2, y2] of CORRIDORS) for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) TREAT[y * MAZE.cols + x] = 1
for (const [x, y] of [[1, 1], [13, 1], [1, 10], [13, 10]]) TREAT[y * MAZE.cols + x] = 2
for (let d = 0; d < CAT_LAP; d++) {
  const p = along(CAT_LOOP, d)
  const i = p.y * MAZE.cols + p.x
  if (EATEN_AT[i] < 0) EATEN_AT[i] = d
}

let mazeArt: HTMLCanvasElement | undefined

/** Murs du labyrinthe et base de recharge des robots, dessinés une fois. */
function mazeCanvas(): HTMLCanvasElement {
  if (mazeArt) return mazeArt
  const { cols, rows, cell, x: ox, y: oy } = MAZE
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && TREAT[y * cols + x] > 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (open(x, y)) continue
      const px = ox + x * cell, py = oy + y * cell
      g.fillStyle = '#141a58'
      g.fillRect(px, py, cell, cell)
      g.fillStyle = '#5b7bff'
      if (open(x - 1, y)) g.fillRect(px, py, 1, cell)
      if (open(x + 1, y)) g.fillRect(px + cell - 1, py, 1, cell)
      if (open(x, y - 1)) g.fillRect(px, py, cell, 1)
      if (open(x, y + 1)) g.fillRect(px, py + cell - 1, cell, 1)
    }
  }
  // Base de recharge au centre, et sa porte rose.
  g.fillStyle = '#05060f'
  g.fillRect(ox + 6 * cell + 1, oy + 5 * cell + 1, 3 * cell - 2, 2 * cell - 2)
  g.fillStyle = '#ff7ab8'
  g.fillRect(ox + 7 * cell, oy + 5 * cell, cell, 1)
  return (mazeArt = cv)
}

/** Comète vue de face (tête ronde, oreilles pointues) ; sa queue dépasse à l'opposé de sa course. */
function drawCat(c: CanvasRenderingContext2D, x: number, y: number, dx: number, chomp: boolean, wag: number) {
  c.fillStyle = '#9aa0aa'
  c.fillRect(x - 3, y - 2, 7, 5)
  c.fillRect(x - 2, y + 3, 5, 1)
  c.fillRect(x - 3, y - 4, 1, 2)
  c.fillRect(x - 2, y - 3, 1, 1)
  c.fillRect(x + 3, y - 4, 1, 2)
  c.fillRect(x + 2, y - 3, 1, 1)
  c.fillRect(dx < 0 ? x + 4 : x - 5, y + wag, 2, 1)
  c.fillStyle = '#1b1d24'
  c.fillRect(x - 2, y - 1, 1, 1)
  c.fillRect(x + 2, y - 1, 1, 1)
  c.fillStyle = '#ff7aa8'
  c.fillRect(x, y + 1, 1, chomp ? 2 : 1)
}

/** Robot aspirateur : un galet blanc cerclé de couleur, son voyant qui clignote. */
function drawRobot(c: CanvasRenderingContext2D, x: number, y: number, ring: string, led: string) {
  c.fillStyle = ring
  c.fillRect(x - 2, y - 3, 5, 7)
  c.fillRect(x - 3, y - 2, 7, 5)
  c.fillStyle = '#e4e8ee'
  c.fillRect(x - 2, y - 2, 5, 4)
  c.fillStyle = led
  c.fillRect(x, y - 1, 1, 1)
}

/** Comète court dans le labyrinthe en mangeant ses croquettes, poursuivie par des robots aspirateurs. */
const drawComete: Draw = (c, t) => {
  const { cols, cell, x: ox, y: oy } = MAZE
  const speed = 4.2, pause = 1.2, lap = CAT_LAP / speed + pause
  const k = t % lap
  const d = Math.max(0, k - pause) * speed
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  c.drawImage(mazeCanvas(), 0, 0)
  // Croquettes et poissons pas encore mangés.
  for (let i = 0; i < TREAT.length; i++) {
    if (!TREAT[i] || (EATEN_AT[i] >= 0 && EATEN_AT[i] < d)) continue
    const x = ox + (i % cols) * cell + 3, y = oy + Math.floor(i / cols) * cell + 3
    if (TREAT[i] === 2) {
      c.fillStyle = '#ff9a3c'
      c.fillRect(x - 2, y - 1, 3, 2)
      c.fillRect(x + 1, y - 2, 1, 4)
    } else {
      c.fillStyle = '#d9a05a'
      c.fillRect(x - 1, y - 1, 2, 2)
    }
  }
  // Un robot se recharge dans sa base, un autre fait sa ronde, deux talonnent Comète.
  const blink = Math.floor(t * 3) % 2 ? '#ff3b3b' : '#ffd0d0'
  drawRobot(c, ox + 7 * cell + 3, oy + 6 * cell, '#8fe06a', Math.floor(t * 1.5) % 2 ? '#7dffa8' : '#1f5a2a')
  const r = along(ROBOT_LOOP, (t * 2.6) % ROBOT_LAP)
  drawRobot(c, ox + r.x * cell + 3, oy + r.y * cell + 3, '#ffd23c', blink)
  for (let n = 0; n < 2; n++) {
    const behind = n ? 16 + Math.sin(t * 0.6 + 2) * 3 : 6 + Math.sin(t * 0.8) * 2.5
    const p = along(CAT_LOOP, (d - behind + CAT_LAP * 2) % CAT_LAP)
    drawRobot(c, ox + p.x * cell + 3, oy + p.y * cell + 3, n ? '#5ad8ff' : '#ff5a5a', blink)
  }
  const cat = along(CAT_LOOP, d % CAT_LAP)
  drawCat(c, ox + Math.round(cat.x * cell) + 3, oy + Math.round(cat.y * cell) + 3, cat.dx, d > 0 && Math.floor(t * 8) % 2 === 0, Math.floor(t * 5) % 2)
  // Bandeau : score, vies (des têtes de chat).
  c.fillStyle = '#fff'
  c.font = '7px monospace'
  c.fillText('1UP', 3, 7)
  c.fillText(String(Math.floor(t / lap) * 1000 + Math.floor(d) * 10).padStart(5, '0'), 22, 7)
  for (let i = 0; i < 2; i++) {
    c.fillStyle = '#9aa0aa'
    c.fillRect(80 + i * 7, 3, 5, 4)
    c.fillRect(80 + i * 7, 2, 1, 1)
    c.fillRect(84 + i * 7, 2, 1, 1)
  }
  if (k < pause && Math.floor(t * 4) % 2 === 0) {
    c.fillStyle = '#ffe14f'
    c.textAlign = 'center'
    c.fillText(tr('PRÊT !', 'READY!'), W / 2, oy + 7 * cell + 5)
    c.textAlign = 'start'
  }
}

// --- SRV Rally

/** Hauteur du sol de la lune (en px) à l'abscisse `x` du monde. */
const moonGround = (x: number) => 64 + Math.sin(x * 0.045) * 3 + Math.sin(x * 0.13 + 1) * 1.2

/** Abscisse du k-ième rocher à sauter (un tous les 60 px environ). */
const rockX = (k: number) => k * 60 + (((k * 37) % 23) + 23) % 23

/** Planète à anneaux dans le ciel noir. */
function ringedPlanet(c: CanvasRenderingContext2D, x: number, y: number) {
  c.strokeStyle = '#c9b48a'
  c.lineWidth = 1.5
  c.beginPath()
  c.ellipse(x, y, 19, 4.5, -0.25, Math.PI, Math.PI * 2)
  c.stroke()
  c.fillStyle = '#d9a86a'
  c.beginPath()
  c.arc(x, y, 9, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#b8784a'
  c.fillRect(x - 8, y - 3, 16, 2)
  c.fillRect(x - 9, y + 1, 18, 1)
  c.fillStyle = 'rgba(0, 0, 0, 0.35)'
  c.beginPath()
  c.arc(x + 3, y + 2, 8, 0, Math.PI * 2)
  c.fill()
  c.beginPath()
  c.ellipse(x, y, 19, 4.5, -0.25, 0, Math.PI)
  c.stroke()
}

/** Le SRV Scarab (six roues, verrière orange, tourelle), vu de profil, tourné vers la droite. */
function drawScarab(c: CanvasRenderingContext2D, spin: number, airborne: boolean, flicker: boolean) {
  for (let i = -1; i <= 1; i++) {
    const x = i * 8
    c.fillStyle = '#16181d'
    c.beginPath()
    c.arc(x, 4, 3.2, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = '#5a5f68'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(x + Math.cos(spin) * 2.6, 4 + Math.sin(spin) * 2.6)
    c.lineTo(x - Math.cos(spin) * 2.6, 4 - Math.sin(spin) * 2.6)
    c.stroke()
    c.fillStyle = '#d9741f'
    c.fillRect(x - 1, 3, 2, 2)
  }
  c.fillStyle = '#7a8292'
  c.fillRect(-12, -3, 24, 5)
  c.fillStyle = '#4a505c'
  c.fillRect(-12, 1, 24, 2)
  c.fillRect(-5, -7, 12, 4)
  c.fillStyle = '#ff8a1c'
  c.fillRect(1, -6, 6, 2)
  c.fillStyle = '#2a2e36'
  c.fillRect(-10, -9, 6, 2)
  c.fillRect(-4, -9, 8, 1)
  c.fillStyle = '#ffe9b0'
  c.fillRect(11, -2, 2, 2)
  c.globalAlpha = 0.16
  c.beginPath()
  c.moveTo(12, -1)
  c.lineTo(36, -7)
  c.lineTo(36, 5)
  c.fill()
  c.globalAlpha = 1
  // Propulseurs de saut.
  if (airborne) {
    c.fillStyle = flicker ? '#bfe8ff' : '#6fc8ff'
    c.fillRect(-9, 3, 2, flicker ? 5 : 3)
    c.fillRect(7, 3, 2, flicker ? 3 : 5)
  }
}

/** Le SRV file sur une lune et saute les rochers ; une planète à anneaux dans le ciel. */
const drawSrv: Draw = (c, t) => {
  const scroll = t * 28
  c.fillStyle = '#02030a'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#c8d0e0'
  for (let i = 0; i < 16; i++) c.fillRect((((i * 41 - scroll * 0.05) % W) + W) % W, (i * 17) % 44, 1, 1)
  ringedPlanet(c, 66, 18)
  // Montagnes lointaines (elles défilent plus lentement), puis le sol, arête éclairée.
  c.fillStyle = '#2c3038'
  for (let x = 0; x < W; x++) {
    const wx = x + scroll * 0.35
    const top = 50 + Math.sin(wx * 0.07) * 4 + Math.sin(wx * 0.19 + 2) * 2
    c.fillRect(x, top, 1, H - top)
  }
  c.fillStyle = '#7d828c'
  for (let x = 0; x < W; x++) {
    const top = moonGround(x + scroll)
    c.fillRect(x, top, 1, H - top)
  }
  c.fillStyle = '#a9afb9'
  for (let x = 0; x < W; x++) c.fillRect(x, moonGround(x + scroll), 1, 1)
  // Cratères.
  c.fillStyle = '#5c616b'
  for (let k = Math.floor(scroll / 37) - 1; k * 37 < scroll + W + 20; k++) {
    const wx = k * 37 + (((k * 53) % 17) + 17) % 17
    c.beginPath()
    c.ellipse(wx - scroll, moonGround(wx) + 5 + (((k % 3) + 3) % 3) * 3, 4 + (((k * 7) % 5) + 5) % 5, 1.3, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Rochers.
  for (let k = Math.floor(scroll / 60) - 1; rockX(k) < scroll + W + 10; k++) {
    const x = rockX(k) - scroll, y = moonGround(rockX(k)) + 1
    c.fillStyle = '#a0a5af'
    c.beginPath()
    c.moveTo(x - 5, y)
    c.lineTo(x - 3, y - 5)
    c.lineTo(x + 1, y - 7)
    c.lineTo(x + 4, y - 3)
    c.lineTo(x + 5, y)
    c.fill()
    c.fillStyle = '#5f646e'
    c.beginPath()
    c.moveTo(x + 1, y - 7)
    c.lineTo(x + 4, y - 3)
    c.lineTo(x + 5, y)
    c.lineTo(x + 1, y)
    c.fill()
  }
  // Le SRV : il saute par-dessus le rocher le plus proche, sinon il épouse le relief.
  const sx = 30, wx = scroll + sx
  let lift = 0, pitch = 0
  for (let k = Math.floor(wx / 60) - 1; k <= Math.floor(wx / 60) + 1; k++) {
    const dx = wx - rockX(k)
    if (Math.abs(dx) < 20) {
      const p = (dx + 20) / 40
      lift = 60 * p * (1 - p)
      pitch = (p - 0.5) * 0.5
    }
  }
  const slope = Math.atan2(moonGround(wx + 6) - moonGround(wx - 6), 12)
  c.save()
  c.translate(sx, moonGround(wx) - 7 - lift - (lift ? 0 : Math.abs(Math.sin(t * 9)) * 0.8))
  c.rotate(lift ? pitch : slope)
  drawScarab(c, scroll / 3.2, lift > 1, Math.floor(t * 12) % 2 === 0)
  c.restore()
  // Poussière soulevée par les roues arrière.
  if (!lift) {
    c.fillStyle = '#9aa0aa'
    for (let i = 0; i < 3; i++) {
      const k = (t * 3 + i / 3) % 1
      c.globalAlpha = 1 - k
      c.fillRect(sx - 14 - k * 10, moonGround(wx - 14) - 2 - k * 4, 1, 1)
    }
    c.globalAlpha = 1
  }
  c.fillStyle = ED_ORANGE
  c.font = '7px monospace'
  c.fillText(`${Math.floor(scroll / 3)} m`, 3, 8)
  c.fillStyle = '#39e0ff'
  c.fillRect(66, 3, 26 * (1 - ((t / 40) % 1) * 0.7), 3)
}

// --- Cargaison, Viper, Astéroïdes, Thargoid Invaders : les jeux jouables (cf. src/arcade/)

/**
 * Démonstration d'un jeu jouable : une vraie partie, jouée par son pilote automatique, dessinée
 * en petit ; une par écran. Elle a déjà `warmup` secondes de jeu quand l'écran s'allume (une
 * vignette du catalogue montre une partie en cours). Une partie perdue recommence trois
 * secondes plus tard.
 */
function liveDemo<G extends ArcadeGame>(
  make: () => G,
  pilot: (game: G) => (dt: number) => Pad,
  draw: (c: CanvasRenderingContext2D, game: G, t: number) => void,
  warmup: number,
): () => Draw {
  return () => {
    let game = make(), next = pilot(game), last = -1, lost = 0
    for (let i = 0; i < warmup / 0.03 && !game.over; i++) game.step(0.03, next(0.03))
    if (game.over) {
      game = make()
      next = pilot(game)
    }
    game.sounds.length = 0
    return (c, t) => {
      const dt = last < 0 ? 0 : Math.min(0.25, Math.max(0, t - last))
      last = t
      // L'écran ne se redessine que 12 fois par seconde : on découpe le temps en petits pas.
      const n = Math.ceil(dt / 0.03)
      for (let i = 0; i < n; i++) game.step(dt / n, next(dt / n))
      game.sounds.length = 0
      if (game.over && (lost += dt) > 3) {
        game = make()
        next = pilot(game)
        lost = 0
      }
      draw(c, game, t)
    }
  }
}

/** Record du vaisseau pour ce jeu (cf. src/arcade/scores.ts), en haut de l'écran. */
function hiScore(c: CanvasRenderingContext2D, id: GameId, x: number, y: number) {
  const best = records[id]
  if (!best) return
  c.fillStyle = '#ffe14f'
  pixelText(c, `HI ${padScore(best.score, 5)}`, x, y)
}

/** Cargaison en petit : la soute (cases de 3 px), le conteneur suivant, les lignes, le score. */
function drawCargoDemo(c: CanvasRenderingContext2D, game: Cargo, t: number) {
  const cell = 3, ox = 33, oy = 14
  c.fillStyle = '#07090d'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#3a3f4a'
  c.fillRect(ox - 2, oy - 3, 2, CARGO_ROWS * cell + 3)
  c.fillRect(ox + CARGO_COLS * cell, oy - 3, 2, CARGO_ROWS * cell + 3)
  c.fillStyle = '#10131a'
  c.fillRect(ox, oy, CARGO_COLS * cell, CARGO_ROWS * cell)
  c.fillStyle = Math.floor(t * 3) % 2 ? ED_ORANGE : '#5a3008'
  c.fillRect(ox + 3, oy - 3, 2, 2)
  c.fillRect(ox + CARGO_COLS * cell - 5, oy - 3, 2, 2)
  const floor = oy + CARGO_ROWS * cell
  for (let x = -2; x < CARGO_COLS * cell + 2; x += 3) {
    c.fillStyle = (x + 2) % 6 ? '#e9a917' : '#17181b'
    c.fillRect(ox + x, floor, 3, 3)
  }
  const flash = game.clearing && Math.floor(game.clearing.t * 16) % 2 === 0
  const cellAt = (x: number, y: number, kind: number) => {
    const px = ox + x * cell, py = oy + (y - CARGO_HIDDEN) * cell
    c.fillStyle = kind < 0 ? '#ffffff' : FREIGHT[kind]
    c.fillRect(px, py, cell, cell)
    if (kind < 0) return
    c.fillStyle = FREIGHT_DARK[kind]
    c.fillRect(px, py + cell - 1, cell, 1)
  }
  for (let y = CARGO_HIDDEN; y < CARGO_ROWS + CARGO_HIDDEN; y++) {
    for (let x = 0; x < CARGO_COLS; x++) {
      const v = game.board[y * CARGO_COLS + x]
      if (v) cellAt(x, y, flash && game.clearing!.rows.includes(y) ? -1 : v - 1)
    }
  }
  if (game.piece) for (const [x, y] of game.cellsOf(game.piece)) if (y >= CARGO_HIDDEN) cellAt(x, y, game.piece.kind)
  // Le suivant, les lignes, le score.
  const next = game.queue[0]
  if (next !== undefined) {
    for (const [x, y] of game.cellsOf({ id: 0, kind: next, rot: 0, x: 0, y: 0 })) {
      c.fillStyle = FREIGHT[next]
      c.fillRect(72 + x * 3, 24 + y * 3, 3, 3)
    }
  }
  c.fillStyle = '#9aa0aa'
  pixelText(c, tr('SUIV.', 'NEXT'), W - 1, 14, 1, 'right')
  pixelText(c, tr('LIGN.', 'LINES'), 2, 30)
  c.fillStyle = '#ffffff'
  pixelText(c, String(game.lines), 2, 40)
  pixelText(c, padScore(game.score, 5), 2, 58)
  hiScore(c, 'cargo', 2, 2)
}

/** Viper en petit : la zone de chargement (cases de 3 px), le train de conteneurs, la tête. */
function drawViperDemo(c: CanvasRenderingContext2D, game: Viper, t: number) {
  const cell = 3, ox = 3, oy = 17
  c.fillStyle = '#04060c'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#1c2436'
  for (let i = 0; i < 14; i++) c.fillRect((i * 37 + Math.floor(t * 2)) % W, (i * 23) % H, 1, 1)
  c.fillStyle = `rgba(89, 216, 255, ${0.45 + 0.2 * Math.sin(t * 4)})`
  c.fillRect(ox - 1, oy - 1, VIPER_COLS * cell + 2, 1)
  c.fillRect(ox - 1, oy + VIPER_ROWS * cell, VIPER_COLS * cell + 2, 1)
  c.fillRect(ox - 1, oy - 1, 1, VIPER_ROWS * cell + 2)
  c.fillRect(ox + VIPER_COLS * cell, oy - 1, 1, VIPER_ROWS * cell + 2)
  for (const m of game.mines) {
    c.fillStyle = Math.floor(t * 4 + m.x) % 2 ? '#ff3b3b' : '#8a1a1a'
    c.fillRect(ox + m.x * cell, oy + m.y * cell, cell, cell)
  }
  c.fillStyle = Math.floor(t * 4) % 2 ? '#ffffff' : ED_ORANGE
  c.fillRect(ox + game.food.x * cell, oy + game.food.y * cell, cell, cell)
  if (game.gold) {
    c.fillStyle = '#ffd23c'
    c.fillRect(ox + game.gold.x * cell, oy + game.gold.y * cell, cell, cell)
  }
  game.body.forEach((b, i) => {
    c.fillStyle = i === 0 ? '#dfe6f0' : i % 4 === 0 ? ED_ORANGE : '#8a93a1'
    c.fillRect(ox + b.x * cell, oy + b.y * cell, cell, cell)
  })
  const head = game.body[0]
  c.fillStyle = '#ff8a1c'
  c.fillRect(ox + head.x * cell + 1, oy + head.y * cell + 1, 1, 1)
  c.fillStyle = '#ffffff'
  pixelText(c, padScore(game.score, 5), 64, 2)
  hiScore(c, 'viper', 2, 2)
  if (game.over && Math.floor(t * 3) % 2) {
    c.fillStyle = '#ff5a4f'
    pixelText(c, 'GAME OVER', W / 2, 44, 1, 'center')
  }
}

/** Astéroïdes en petit : le champ de roches du jeu, tracé sans halo. */
function drawAsteroidsDemo(c: CanvasRenderingContext2D, game: Asteroids, t: number) {
  game.drawSmall(c, W, H, t)
  hiScore(c, 'asteroids', 50, 2)
}

const cargoDemo = liveDemo(() => new Cargo(), (g) => {
  const pilot = new CargoPilot(g)
  return (dt) => pilot.next(dt)
}, drawCargoDemo, 28)
const viperDemo = liveDemo(() => new Viper(), (g) => {
  const pilot = new ViperPilot(g)
  return () => pilot.next()
}, drawViperDemo, 9)
const asteroidsDemo = liveDemo(() => new Asteroids(), (g) => {
  const pilot = new AsteroidsPilot(g)
  return (dt) => pilot.next(dt)
}, drawAsteroidsDemo, 12)
const invadersDemo = liveDemo(() => new Invaders(), (g) => {
  const pilot = new InvadersPilot(g)
  return (dt) => pilot.next(dt)
}, (c, game, t) => {
  game.drawSmall(c, W, H, t)
  hiScore(c, 'invaders', 2, 2)
}, 10)

// ---------------------------------------------------------------- bornes

/**
 * Jeux des bornes : titre du fronton, flancs, néon, et l'écran (une animation, ou pour les jeux
 * jouables une fabrique de démonstration : chaque écran a sa partie).
 */
const GAMES: Record<string, { title: string; side: string; neon: string; draw: Draw | (() => Draw); live?: true }> = {
  fight: { title: FIGHT_TITLE, side: '#682c43', neon: '#ffbd68', live: true,
    draw: liveDemo(() => new Fight('demo'), () => () => emptyPad(), (c, game, t) => {
      c.save(); c.scale(W / game.width, H / game.height); game.draw(c, t); c.restore()
    }, 5),
  },
  cargo: { title: tr('CARGAISON', 'CARGO'), side: '#46561f', neon: '#9dff5a', draw: cargoDemo, live: true },
  viper: { title: 'VIPER', side: '#5a1446', neon: '#ffb03a', draw: viperDemo, live: true },
  asteroids: { title: tr('ASTÉROÏDES', 'ASTEROIDS'), side: '#7a1f1f', neon: '#ffe14f', draw: asteroidsDemo, live: true },
  elite: { title: 'ELITE', side: '#1f3f8a', neon: '#39e0ff', draw: drawElite },
  invaders: { title: 'THARGOID INVADERS', side: '#4a1f6a', neon: '#ff4fd8', draw: invadersDemo, live: true },
  comete: { title: tr('LE LABYRINTHE DE COMÈTE', 'COMÈTE\'S MAZE'), side: '#1d5f6b', neon: '#ff8ad8', draw: drawComete },
  srv: { title: 'SRV RALLY', side: '#8a4512', neon: ED_ORANGE, draw: drawSrv },
}

/** L'animation d'un écran : celle du jeu, ou une partie de démonstration à lui. */
const screenOf = (game: (typeof GAMES)[string]): Draw => (game.live ? (game.draw as () => Draw)() : (game.draw as Draw))

const marquees = new Map<string, THREE.MeshBasicMaterial>()

/**
 * Fronton lumineux : le titre en néon sur un dégradé (matériau partagé par tous les exemplaires).
 * Un titre trop long pour une ligne passe sur deux.
 */
function marquee(title: string, neon: string, bg: [string, string] = ['#12081f', '#2a1440']): THREE.MeshBasicMaterial {
  const key = `${title}|${neon}|${bg}`
  let m = marquees.get(key)
  if (!m) {
    const map = drawnTexture(256, 64, (c) => {
      const grad = c.createLinearGradient(0, 0, 256, 0)
      grad.addColorStop(0, bg[0])
      grad.addColorStop(0.5, bg[1])
      grad.addColorStop(1, bg[0])
      c.fillStyle = grad
      c.fillRect(0, 0, 256, 64)
      /** Taille de police (au plus `size`) pour que `text` tienne dans la largeur (les titres d'origine y tiennent tels quels). */
      const fit = (text: string, size: number) => {
        c.font = `800 ${size}px system-ui, sans-serif`
        return Math.min(size, Math.floor((size * 252) / c.measureText(text).width))
      }
      let lines = [title], size = fit(title, title.length > 10 ? 24 : 38)
      if (size < 20 && title.includes(' ')) {
        // Coupure à l'espace le plus proche du milieu.
        let cut = title.indexOf(' ')
        for (let i = cut; i >= 0; i = title.indexOf(' ', i + 1)) if (Math.abs(i - title.length / 2) < Math.abs(cut - title.length / 2)) cut = i
        lines = [title.slice(0, cut), title.slice(cut + 1)]
        size = Math.min(fit(lines[0], 25), fit(lines[1], 25))
      }
      c.font = `800 ${size}px system-ui, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.shadowColor = neon
      c.shadowBlur = 12
      c.fillStyle = '#fff'
      lines.forEach((l, i) => c.fillText(l, 128, lines.length > 1 ? 19 + i * 27 : 34))
    })
    marquees.set(key, (m = keepShared(new THREE.MeshBasicMaterial({ map: keepShared(map) }))))
  }
  return m
}

/**
 * Borne d'arcade (écran animé). Jeux : `cargo`, `viper`, `asteroids`, `invaders` (jouables, cf. src/arcade/),
 * `elite`, `comete`, `srv`.
 */
const arcade: Builder = ({ label = 'cargo' }) => {
  const game = GAMES[label] ?? GAMES.cargo
  const g = new THREE.Group()
  const side = lit(game.side), black = lit('#121318')
  for (const x of [-0.285, 0.285]) g.add(box(0.05, 0.95, 0.52, side, x, 0.475, 0))
  g.add(box(0.52, 0.95, 0.04, black, 0, 0.475, -0.24), box(0.52, 0.42, 0.3, black, 0, 0.21, 0.09))
  g.add(box(0.52, 0.025, 0.02, glow(game.neon), 0, 0.3, 0.245), box(0.06, 0.04, 0.012, glow('#ffd84f'), 0, 0.22, 0.246))
  // Pupitre incliné : joystick et trois boutons.
  const deck = new THREE.Group()
  deck.position.set(0, 0.47, 0.17)
  deck.rotation.x = 0.25
  deck.add(box(0.52, 0.05, 0.2, lit('#2a2a33'), 0, 0, 0))
  for (const offset of label === 'fight' ? [-0.13, 0.13] : [0]) {
    const stick = label === 'fight' ? offset - 0.075 : -0.12
    deck.add(cylinder(0.01, 0.01, 0.07, lit('#cfd3d8'), stick, 0.06, 0, 6), sphere(0.022, glow(offset > 0 ? '#ff75ad' : '#39e0ff'), stick, 0.1, 0, 8))
    ;['#39e0ff', '#ffe14f', '#ff4fd8'].forEach((col, i) => deck.add(cylinder(0.014, 0.014, 0.015, glow(col), label === 'fight' ? offset + i * 0.035 : 0.04 + i * 0.06, 0.03, 0, 10)))
  }
  g.add(deck)
  // Écran incliné dans son cadre, fronton.
  const bezel = new THREE.Group()
  bezel.position.set(0, 0.67, 0.02)
  bezel.rotation.x = -0.18
  bezel.add(box(0.52, 0.34, 0.04, black, 0, 0, 0))
  g.add(bezel, box(0.52, 0.14, 0.22, black, 0, 0.88, -0.07))

  const screen = animatedScreen(W, H, 12, screenOf(game))
  const live = new THREE.Group()
  const face = new THREE.Group()
  face.position.copy(bezel.position)
  face.rotation.copy(bezel.rotation)
  face.add(part(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0, 0.022))
  live.add(face, part(new THREE.PlaneGeometry(0.5, 0.12), marquee(game.title, game.neon), 0, 0.88, 0.042))
  return { solid: g, live, emitter: 'arcade', update: (t) => screen.tick(t) }
}

/**
 * Borne cocktail : une table basse, l'écran tourné vers le haut sous la vitre, un pupitre à
 * chaque petit bout pour deux joueurs face à face (le premier côté +z). Jeu : `label` (cf. GAMES).
 */
const arcadeTable: Builder = ({ label = 'cargo', random }) => {
  const game = GAMES[label] ?? GAMES.cargo
  const g = new THREE.Group()
  const side = lit(game.side), black = lit(C.black), chrome = lit(C.chrome)
  g.add(box(0.34, 0.05, 0.36, black, 0, 0.025, 0), box(0.44, 0.29, 0.42, side, 0, 0.195, 0, 0.012))
  g.add(box(0.45, 0.03, 0.43, black, 0, 0.355, 0, 0.006))
  // Liseré chromé autour de la vitre ; néon et monnayeur sur les grands côtés.
  for (const z of [-0.211, 0.211]) g.add(barX(0.007, 0.45, chrome, 0, 0.372, z, 8))
  for (const x of [-0.222, 0.222]) g.add(barZ(0.007, 0.43, chrome, x, 0.372, 0, 8), box(0.006, 0.014, 0.3, glow(game.neon), x, 0.3, 0))
  g.add(box(0.012, 0.08, 0.1, lit(C.panel), 0.221, 0.18, 0), box(0.004, 0.02, 0.012, glow('#ffd84f'), 0.228, 0.19, -0.022))
  g.add(box(0.004, 0.02, 0.012, glow('#ffd84f'), 0.228, 0.19, 0.022))
  // Pupitres : joystick à gauche, deux boutons à droite, pour chacun des deux joueurs.
  for (const s of [1, -1]) {
    const deck = new THREE.Group()
    deck.position.set(0, 0.325, s * 0.252)
    deck.rotation.set(s * 0.16, s > 0 ? 0 : Math.PI, 0)
    deck.add(box(0.3, 0.035, 0.1, lit(C.panel), 0, 0, 0, 0.008))
    deck.add(cylinder(0.006, 0.006, 0.045, chrome, -0.08, 0.04, 0, 6), sphere(0.015, glow('#ff3b3b'), -0.08, 0.065, 0, 8))
    deck.add(cylinder(0.014, 0.014, 0.012, glow('#39e0ff'), 0.035, 0.022, 0, 10), cylinder(0.014, 0.014, 0.012, glow('#ffe14f'), 0.08, 0.022, 0, 10))
    g.add(deck)
  }
  const screen = animatedScreen(W, H, 12, screenOf(game))
  const phase = random() * 60
  const live = new THREE.Group()
  const face = part(new THREE.PlaneGeometry(0.3, 0.25), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.3705, 0)
  face.rotation.x = -Math.PI / 2
  live.add(face, part(new THREE.BoxGeometry(0.42, 0.006, 0.4), glass('#d8ecff', 0.16), 0, 0.3735, 0), glare(0.42, 0.4, 0, 0.3768, 0))
  return { solid: g, live, emitter: 'arcade', update: (t) => screen.tick(t + phase) }
}

// ---------------------------------------------------------------- flipper

/** Petites étoiles d'un ciel dessiné. */
function starDots(g: CanvasRenderingContext2D, w: number, h: number, random: () => number, n: number) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.3 + random() * 0.7
    g.fillStyle = '#ffffff'
    g.fillRect(random() * w, random() * h, random() < 0.1 ? 2 : 1, random() < 0.1 ? 2 : 1)
  }
  g.globalAlpha = 1
}

/** Halo lumineux. */
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

/** Octogone régulier (Thargoïde, station). */
function octagon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  g.closePath()
}

interface PinballDef {
  title: string
  /** Caisse, liserés et bumpers, dégradé du plateau (bas, haut), voyants. */
  body: string
  trim: string
  field: [string, string]
  lamp: string
  /** Messages de l'afficheur à points. */
  messages: [string, string]
  /** Illustration du fronton (sous le titre). */
  art: (g: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void
  /** Motif peint au centre du plateau. */
  emblem: (g: CanvasRenderingContext2D, x: number, y: number, r: number) => void
}

const PINBALLS: Record<string, PinballDef> = {
  thargoid: {
    title: 'THARGOID ATTACK', body: '#15181a', trim: '#3dffa0', field: ['#06180e', '#15603a'], lamp: '#7dffa8',
    messages: ['HYPERDICTION', 'JACKPOT'],
    art: (g, w, h, random) => {
      starDots(g, w, h, random, 80)
      const x = w / 2, y = h * 0.62
      g.globalCompositeOperation = 'lighter'
      halo(g, x, y, 95, 'rgba(60, 255, 150, 0.4)')
      g.globalCompositeOperation = 'source-over'
      // Un Interceptor : cinq pétales autour d'un cœur vert.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        g.save()
        g.translate(x + Math.cos(a) * 30, y + Math.sin(a) * 30)
        g.rotate(a + Math.PI / 2)
        g.fillStyle = '#0b1a14'
        g.beginPath()
        g.ellipse(0, 0, 15, 34, 0, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#5dffb0'
        g.lineWidth = 2
        g.stroke()
        g.restore()
      }
      halo(g, x, y, 20, 'rgba(190, 255, 220, 1)')
      // Une Cobra qui s'enfuit, en bas à gauche.
      g.fillStyle = '#e8edf2'
      g.beginPath()
      g.moveTo(24, h - 30)
      g.lineTo(62, h - 44)
      g.lineTo(58, h - 30)
      g.lineTo(62, h - 18)
      g.closePath()
      g.fill()
      g.fillStyle = ED_ORANGE
      g.fillRect(58, h - 33, 6, 6)
    },
    emblem: (g, x, y, r) => {
      g.fillStyle = '#0a2a18'
      octagon(g, x, y, r)
      g.fill()
      g.strokeStyle = 'rgba(61, 255, 160, 0.6)'
      g.lineWidth = 2
      g.stroke()
      octagon(g, x, y, r * 0.45)
      g.fillStyle = 'rgba(61, 255, 160, 0.35)'
      g.fill()
    },
  },
  guardians: {
    title: tr('GARDIENS', 'GUARDIANS'), body: '#143a5c', trim: '#59d8ff', field: ['#061c2a', '#156482'], lamp: '#9ff4ff',
    messages: [tr('RELIQUE', 'RELIC'), tr('MULTIBILLE', 'MULTIBALL')],
    art: (g, w, h, random) => {
      starDots(g, w, h * 0.7, random, 70)
      g.fillStyle = '#061a22'
      g.fillRect(0, h * 0.8, w, h)
      for (const [x, s] of [[0.22, 0.8], [0.5, 1.15], [0.78, 0.9]] as const) {
        const bx = w * x, top = h * (0.8 - 0.36 * s), half = 18 * s
        g.fillStyle = '#10262e'
        g.beginPath()
        g.moveTo(bx - half, h * 0.8)
        g.lineTo(bx - half * 0.55, top)
        g.lineTo(bx + half * 0.55, top)
        g.lineTo(bx + half, h * 0.8)
        g.fill()
        g.strokeStyle = '#59d8ff'
        g.lineWidth = 2
        g.stroke()
        g.globalCompositeOperation = 'lighter'
        halo(g, bx, top + 18 * s, 18 * s, 'rgba(90, 220, 255, 0.9)')
        g.globalCompositeOperation = 'source-over'
      }
    },
    emblem: (g, x, y, r) => {
      g.fillStyle = '#082a3a'
      g.beginPath()
      g.moveTo(x, y - r)
      g.lineTo(x + r * 0.9, y + r * 0.6)
      g.lineTo(x - r * 0.9, y + r * 0.6)
      g.closePath()
      g.fill()
      g.strokeStyle = 'rgba(89, 216, 255, 0.6)'
      g.lineWidth = 2
      g.stroke()
      g.fillStyle = 'rgba(160, 240, 255, 0.45)'
      g.beginPath()
      g.arc(x, y + r * 0.1, r * 0.25, 0, Math.PI * 2)
      g.fill()
    },
  },
  lave: {
    title: 'LAVE STATION', body: '#7a1a12', trim: '#ff8a1c', field: ['#260a04', '#8a2c12'], lamp: '#ffc24f',
    messages: [tr('AMARRAGE OK', 'DOCKING GRANTED'), 'JACKPOT'],
    art: (g, w, h, random) => {
      const sky = g.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#12040a')
      sky.addColorStop(1, '#6a1a0c')
      g.fillStyle = sky
      g.fillRect(0, 0, w, h)
      starDots(g, w, h * 0.6, random, 50)
      halo(g, w * 0.2, h * 0.42, 60, 'rgba(255, 190, 90, 0.9)')
      // Lave, planète rouge, et sa station Coriolis.
      const grad = g.createRadialGradient(w * 0.7, h * 0.8, 10, w * 0.78, h * 0.9, 90)
      grad.addColorStop(0, '#d9542a')
      grad.addColorStop(1, '#4a1208')
      g.fillStyle = grad
      g.beginPath()
      g.arc(w * 0.78, h * 0.95, 90, 0, Math.PI * 2)
      g.fill()
      const x = w * 0.5, y = h * 0.55
      g.fillStyle = '#c9ced8'
      octagon(g, x, y, 34)
      g.fill()
      g.fillStyle = '#7d8594'
      octagon(g, x, y, 20)
      g.fill()
      g.fillStyle = '#12151c'
      g.fillRect(x - 11, y - 3, 22, 6)
      g.fillStyle = '#7dffa8'
      g.fillRect(x - 11, y + 4, 22, 1.5)
    },
    emblem: (g, x, y, r) => {
      g.fillStyle = '#5a1608'
      g.beginPath()
      g.arc(x, y, r * 0.75, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(255, 138, 28, 0.6)'
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(x, y, r * 1.1, r * 0.35, -0.3, 0, Math.PI * 2)
      g.stroke()
    },
  },
}

/** Plateau (repère de la caisse : x ∈ ±0,15, z ∈ ±0,26, +z côté joueur), posé à y = 0,03. */
const FIELD = { w: 0.3, l: 0.52, y: 0.03 }
const BUMPERS: [number, number][] = [[0, -0.115], [-0.055, -0.175], [0.055, -0.175]]
const LAMPS: [number, number][] = [
  [0, 0.09], [0, 0.058], [0, 0.026], [0, -0.006], // flèches du couloir central (chenillard)
  [-0.035, -0.215], [0, -0.222], [0.035, -0.215], // couloirs du haut
  [-0.1, -0.05], [0.1, -0.05], // orbites
  [-0.098, 0.1], [0.098, 0.1], // couloirs de retour
  [0, 0.228], // « rejouez »
]
/** Pivots des flippers ; au repos, leur pointe descend vers le centre. */
const FLIPPERS = { x: 0.065, z: 0.19, rest: 0.5, up: -0.4 }

/**
 * Demi-boucle de la bille (repère du plateau) : du flipper gauche, par l'orbite droite, l'arche et
 * les bumpers, jusqu'au flipper droit ; l'autre moitié est son miroir (un huit).
 */
const BALL_HALF: [number, number][] = [
  [-0.035, 0.198], [0.02, 0.1], [0.085, -0.04], [0.108, -0.13], [0.09, -0.195], [0.035, -0.228], [0.004, -0.205],
  [0, -0.176], [0.0275, -0.145], [0.043, -0.105], [0.028, -0.05], [-0.012, 0.03], [0.022, 0.135],
]
const BALL_LOOP = [...BALL_HALF, ...BALL_HALF.map(([x, z]): [number, number] => [-x, z])]
const BALL_STEPS = 240

let ballLoop: { points: Float32Array; bumpers: Uint8Array; period: number; flips: [number, number] } | undefined

/**
 * Trajet de la bille échantillonné à pas de temps égaux (calculé une fois) : elle ralentit en
 * haut du plateau et file en bas, comme sous l'effet de la pente.
 */
function ballPath() {
  if (ballLoop) return ballLoop
  const curve = new THREE.CatmullRomCurve3(BALL_LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true)
  const pts = curve.getSpacedPoints(600)
  const times = [0]
  for (let i = 1; i < pts.length; i++) {
    const z = (pts[i].z + pts[i - 1].z) / 2
    times.push(times[i - 1] + pts[i].distanceTo(pts[i - 1]) / Math.sqrt(0.05 + 1.3 * Math.max(0, z + 0.25)))
  }
  const period = times[times.length - 1]
  const points = new Float32Array(BALL_STEPS * 2)
  for (let k = 0, j = 0; k < BALL_STEPS; k++) {
    const target = (k / BALL_STEPS) * period
    while (times[j + 1] < target) j++
    const f = (target - times[j]) / (times[j + 1] - times[j])
    points[k * 2] = pts[j].x + (pts[j + 1].x - pts[j].x) * f
    points[k * 2 + 1] = pts[j].z + (pts[j + 1].z - pts[j].z) * f
  }
  /** Fraction de la boucle où la bille passe au plus près de (x, z). */
  const when = (x: number, z: number) => {
    let best = 0
    for (let k = 1; k < BALL_STEPS; k++) {
      if (Math.hypot(points[k * 2] - x, points[k * 2 + 1] - z) < Math.hypot(points[best * 2] - x, points[best * 2 + 1] - z)) best = k
    }
    return best / BALL_STEPS
  }
  // Bumpers allumés à chaque pas : ceux que la bille a frôlés dans les 0,22 s qui précèdent.
  const near = new Uint8Array(BALL_STEPS), bumpers = new Uint8Array(BALL_STEPS)
  for (let k = 0; k < BALL_STEPS; k++) {
    BUMPERS.forEach(([x, z], i) => {
      if (Math.hypot(points[k * 2] - x, points[k * 2 + 1] - z) < 0.046) near[k] |= 1 << i
    })
  }
  const glowing = Math.round((0.22 / period) * BALL_STEPS)
  for (let k = 0; k < BALL_STEPS; k++) for (let j = 0; j <= glowing; j++) bumpers[k] |= near[(k - j + BALL_STEPS) % BALL_STEPS]
  const flipper = BALL_HALF.length
  ballLoop = { points, bumpers, period, flips: [when(BALL_LOOP[0][0], BALL_LOOP[0][1]), when(BALL_LOOP[flipper][0], BALL_LOOP[flipper][1])] }
  return ballLoop
}

const pinballPrints = new Map<string, { field: THREE.MeshLambertMaterial; art: THREE.MeshBasicMaterial }>()

/** Plateau peint et illustration du fronton d'un thème (dessinés une fois, partagés). */
function pinballPrint(id: string) {
  let p = pinballPrints.get(id)
  if (!p) {
    const def = PINBALLS[id]
    const field = drawnTexture(128, 224, (g) => {
      const w = 128, h = 224
      const u = (x: number) => ((x + FIELD.w / 2) / FIELD.w) * w, v = (z: number) => ((z + FIELD.l / 2) / FIELD.l) * h
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, def.field[1])
      grad.addColorStop(1, def.field[0])
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      def.emblem(g, u(0), v(0.04), 30)
      // Anneaux sous les bumpers, pastilles sous les voyants, flèches du couloir central.
      g.strokeStyle = def.trim
      g.lineWidth = 2
      g.globalAlpha = 0.55
      for (const [x, z] of BUMPERS) {
        g.beginPath()
        g.arc(u(x), v(z), 14, 0, Math.PI * 2)
        g.stroke()
      }
      g.globalAlpha = 1
      g.fillStyle = 'rgba(0, 0, 0, 0.5)'
      for (const [x, z] of LAMPS) {
        g.beginPath()
        g.arc(u(x), v(z), 5.5, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = def.trim
      g.globalAlpha = 0.4
      for (const z of [0.09, 0.058, 0.026, -0.006]) {
        g.beginPath()
        g.moveTo(u(0) - 9, v(z) + 5)
        g.lineTo(u(0), v(z) - 7)
        g.lineTo(u(0) + 9, v(z) + 5)
        g.lineTo(u(0), v(z) + 1)
        g.fill()
      }
      // Flèches des orbites et des couloirs de retour, séparations des couloirs du haut.
      g.globalAlpha = 0.7
      for (const [x, z, a] of [[-0.1, -0.05, -0.35], [0.1, -0.05, 0.35], [-0.098, 0.1, 0.5], [0.098, 0.1, -0.5]]) {
        g.save()
        g.translate(u(x), v(z))
        g.rotate(a)
        g.beginPath()
        g.moveTo(-8, 9)
        g.lineTo(0, -10)
        g.lineTo(8, 9)
        g.lineTo(0, 4)
        g.fill()
        g.restore()
      }
      for (const x of [-0.0175, 0.0175]) g.fillRect(u(x) - 1, v(-0.23), 2, 14)
      g.globalAlpha = 1
      // Tablier devant les flippers, au nom du jeu.
      g.fillStyle = def.body
      g.fillRect(0, v(0.238), w, h)
      g.fillStyle = def.trim
      g.fillRect(0, v(0.238), w, 2)
      g.font = '800 8px system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(def.title, w / 2, v(0.25) + 1)
    })
    const art = drawnTexture(256, 224, (g) => {
      g.fillStyle = '#05060a'
      g.fillRect(0, 0, 256, 224)
      def.art(g, 256, 224, rng(id.length * 7919))
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = '900 40px system-ui, sans-serif'
      const size = Math.min(40, Math.floor((40 * 232) / g.measureText(def.title).width))
      g.font = `900 ${size}px system-ui, sans-serif`
      g.shadowColor = def.trim
      g.shadowBlur = 14
      g.fillStyle = '#ffffff'
      g.fillText(def.title, 128, 32)
      g.fillText(def.title, 128, 32)
      g.shadowBlur = 0
      g.strokeStyle = def.trim
      g.lineWidth = 5
      g.strokeRect(3, 3, 250, 218)
    })
    p = {
      field: keepShared(new THREE.MeshLambertMaterial({ map: keepShared(field) })),
      art: keepShared(new THREE.MeshBasicMaterial({ map: keepShared(art) })),
    }
    pinballPrints.set(id, p)
  }
  return p
}

// --- Afficheur à points (64 × 16 points orange, dans un canvas de 128 × 32)

const DOT = { cols: 64, rows: 16, on: '#ff8a1c', off: '#2e1404' }

/** Chiffres de 3 × 5 points (rangées de 3 bits, de haut en bas). */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']

let dotGrid: { dim: HTMLCanvasElement; gaps: HTMLCanvasElement } | undefined
const dotTexts = new Map<string, HTMLCanvasElement>()

/** Points éteints et interstices noirs de l'afficheur (dessinés une fois). */
function dotMatrix() {
  if (dotGrid) return dotGrid
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas')
    cv.width = DOT.cols * 2
    cv.height = DOT.rows * 2
    draw(cv.getContext('2d')!)
    return cv
  }
  const dim = make((g) => {
    g.fillStyle = DOT.off
    for (let y = 0; y < DOT.rows; y++) for (let x = 0; x < DOT.cols; x++) g.fillRect(x * 2, y * 2, 1, 1)
  })
  const gaps = make((g) => {
    g.fillStyle = '#000'
    for (let x = 1; x < DOT.cols * 2; x += 2) g.fillRect(x, 0, 1, DOT.rows * 2)
    for (let y = 1; y < DOT.rows * 2; y += 2) g.fillRect(0, y, DOT.cols * 2, 1)
  })
  return (dotGrid = { dim, gaps })
}

/** Texte en points orange, à l'échelle de l'afficheur (un pixel par point ; dessiné une fois par texte). */
function dotText(text: string): HTMLCanvasElement {
  let cv = dotTexts.get(text)
  if (!cv) {
    const font = '700 11px system-ui, sans-serif'
    cv = document.createElement('canvas')
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.font = font
    cv.width = Math.ceil(g.measureText(text).width) + 2
    cv.height = DOT.rows
    g.font = font
    g.textBaseline = 'middle'
    g.fillStyle = '#fff'
    g.fillText(text, 1, 8.5)
    const img = g.getImageData(0, 0, cv.width, cv.height)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = img.data[i + 3] > 110 ? 255 : 0
      img.data[i] = 255
      img.data[i + 1] = 138
      img.data[i + 2] = 28
    }
    g.putImageData(img, 0, 0)
    dotTexts.set(text, cv)
  }
  return cv
}

/** Afficheur du flipper : le score, le titre qui défile, un message qui clignote. */
function drawDmd(c: CanvasRenderingContext2D, t: number, def: PinballDef) {
  const { dim, gaps } = dotMatrix()
  c.fillStyle = '#000'
  c.fillRect(0, 0, 128, 32)
  c.drawImage(dim, 0, 0)
  c.imageSmoothingEnabled = false
  const k = t % 10
  if (k < 4) {
    // Score : sept chiffres de 3 × 5, grossis deux fois.
    let score = Math.floor(t * 7331) % 10000000
    c.fillStyle = DOT.on
    for (let n = 6; n >= 0; n--) {
      const bits = DIGITS[score % 10], x0 = 5 + n * 8
      for (let b = 0; b < 15; b++) if (bits.charCodeAt(b) === 49) c.fillRect((x0 + (b % 3) * 2) * 2, (3 + Math.floor(b / 3) * 2) * 2, 4, 4)
      score = Math.floor(score / 10)
    }
  } else {
    const text = dotText(k < 7 ? def.title : def.messages[Math.floor(t / 10) % 2])
    const w = text.width
    if (w <= DOT.cols - 2 && k >= 7) {
      if (Math.floor(t * 5) % 3) c.drawImage(text, (DOT.cols - w), 0, w * 2, 32)
    } else {
      const x = DOT.cols - ((k - (k < 7 ? 4 : 7)) / 3) * (DOT.cols + w)
      c.drawImage(text, Math.round(x) * 2, 0, w * 2, 32)
    }
  }
  c.drawImage(gaps, 0, 0)
}

/** Pale de flipper : un moyeu, une pale effilée (le long de +x depuis le pivot). */
function flipperGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10),
    new THREE.BoxGeometry(0.046, 0.012, 0.011).translate(0.024, 0, 0),
    new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8).translate(0.047, 0, 0),
  ])!
}

const TILT = 0.06, TUB = { y: 0.37, z: 0.012 }

/**
 * Flipper sur quatre pieds : plateau incliné sous la vitre, bumpers qui s'allument, voyants qui
 * clignotent, flippers qui battent, une bille qui fait sa boucle ; au fronton, une illustration et
 * l'afficheur à points. Thème : `label` (thargoid, guardians, lave).
 */
const pinball: Builder = ({ label, random }) => {
  const id = PINBALLS[label ?? ''] ? label! : 'thargoid'
  const def = PINBALLS[id], print = pinballPrint(id)
  const g = new THREE.Group()
  const body = lit(def.body), black = lit(C.black), chrome = lit(C.chrome), white = lit('#eef0f2'), trim = glow(def.trim)
  // Caisse inclinée (l'arrière plus haut) ; tout ce qui est sur le plateau suit son repère.
  const tub = new THREE.Group()
  tub.position.set(0, TUB.y, TUB.z)
  tub.rotation.x = TILT
  tub.add(box(0.34, 0.1, 0.56, body, 0, -0.02, 0, 0.01))
  for (const x of [-0.16, 0.16]) tub.add(box(0.02, 0.04, 0.56, body, x, 0.05, 0), box(0.024, 0.006, 0.56, chrome, x, 0.073, 0))
  tub.add(box(0.3, 0.04, 0.02, body, 0, 0.05, -0.27), box(0.3, 0.04, 0.02, body, 0, 0.05, 0.27))
  tub.add(box(0.34, 0.012, 0.036, chrome, 0, 0.074, 0.272), box(0.34, 0.01, 0.006, trim, 0, 0.0, 0.281))
  const field = mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.l), print.field, 0, FIELD.y, 0)
  field.rotation.x = -Math.PI / 2
  tub.add(field)
  // Sur le plateau : bumpers, lance-billes, guides, arche du haut, cibles, couloir de lancement.
  for (const [x, z] of BUMPERS) tub.add(cylinder(0.022, 0.024, 0.018, white, x, FIELD.y + 0.009, z, 12), cylinder(0.027, 0.027, 0.004, black, x, FIELD.y + 0.004, z, 12))
  for (const s of [-1, 1]) {
    // Lance-billes : un triangle de plastique blanc cerclé de caoutchouc rouge, la pointe vers le centre.
    const sling = new THREE.Group()
    sling.position.set(s * 0.08, FIELD.y, 0.128)
    sling.rotation.y = -s * (Math.PI / 2 - 0.3)
    sling.scale.set(1.3, 1, 0.8)
    sling.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 3), white, 0, 0.009, 0), mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.008, 3), lit('#c8281e'), 0, 0.004, 0))
    const guide = box(0.004, 0.012, 0.09, chrome, s * 0.1, FIELD.y + 0.006, 0.145)
    guide.rotation.y = -s * 0.5
    tub.add(sling, guide, cylinder(0.006, 0.006, 0.016, chrome, s * FLIPPERS.x, FIELD.y + 0.008, FLIPPERS.z, 8))
  }
  const arch = mesh(new THREE.TorusGeometry(0.143, 0.005, 4, 16, Math.PI), chrome, 0, FIELD.y + 0.006, -0.115)
  arch.rotation.x = -Math.PI / 2
  tub.add(arch)
  for (const z of [-0.02, 0.005, 0.03]) tub.add(box(0.006, 0.02, 0.02, lit(def.lamp), -0.138, FIELD.y + 0.01, z))
  tub.add(box(0.004, 0.012, 0.34, chrome, 0.128, FIELD.y + 0.006, 0.09))
  // Façade : monnayeur, bouton de départ, lanceur.
  tub.add(box(0.12, 0.05, 0.006, lit(C.panel), 0, -0.03, 0.282))
  for (const x of [-0.025, 0.025]) tub.add(box(0.02, 0.012, 0.004, glow('#ff3b2f'), x, -0.025, 0.2855))
  tub.add(barZ(0.008, 0.008, glow('#ffe14f'), -0.13, 0.045, 0.283, 10), barZ(0.005, 0.026, chrome, 0.13, 0.045, 0.293, 6))
  tub.add(sphere(0.009, lit(C.seat), 0.13, 0.045, 0.309, 8))
  g.add(tub)
  // Pieds : plus longs à l'arrière, sous la caisse inclinée.
  for (const lz of [-0.24, 0.24]) {
    const h = TUB.y - 0.07 * Math.cos(TILT) - lz * Math.sin(TILT)
    const z = TUB.z - 0.07 * Math.sin(TILT) + lz * Math.cos(TILT)
    for (const x of [-0.15, 0.15]) {
      g.add(box(0.026, h, 0.026, black, x, h / 2, z), box(0.034, 0.04, 0.034, chrome, x, h - 0.025, z))
      g.add(cylinder(0.018, 0.02, 0.012, chrome, x, 0.006, z, 8))
    }
  }
  // Fronton : illustration rétroéclairée, afficheur entre deux haut-parleurs.
  g.add(box(0.34, 0.45, 0.08, body, 0, 0.675, -0.27, 0.01), box(0.35, 0.014, 0.088, chrome, 0, 0.905, -0.27))
  g.add(mesh(new THREE.PlaneGeometry(0.3, 0.2625), print.art, 0, 0.72, -0.2295))
  g.add(box(0.32, 0.1, 0.014, black, 0, 0.515, -0.223), box(0.34, 0.008, 0.006, trim, 0, 0.47, -0.214))
  for (const x of [-0.128, 0.128]) g.add(barZ(0.022, 0.004, lit('#2a2e36'), x, 0.515, -0.214, 12), barZ(0.008, 0.006, lit(C.steel), x, 0.515, -0.213, 8))

  const live = new THREE.Group()
  const top = new THREE.Group()
  top.position.copy(tub.position)
  top.rotation.copy(tub.rotation)
  const pane = part(new THREE.PlaneGeometry(0.3, 0.54), glass('#d8ecff', 0.14), 0, 0.068, 0)
  pane.rotation.x = -Math.PI / 2
  const caps = instanced(new THREE.CylinderGeometry(0.02, 0.022, 0.01, 12), BUMPERS.map(() => def.trim))
  BUMPERS.forEach(([x, z], i) => setInstance(caps, i, x, FIELD.y + 0.023, z))
  const lamps = instanced(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 10), LAMPS.map(() => def.lamp))
  LAMPS.forEach(([x, z], i) => setInstance(lamps, i, x, FIELD.y + 0.0012, z))
  const flippers = instanced(flipperGeometry(), ['#f4f4f4', '#f4f4f4'], lit('#ffffff'))
  const ball = part(new THREE.SphereGeometry(0.011, 12, 8), lit('#eef2f6'))
  top.add(pane, glare(0.3, 0.54, 0, 0.0685, 0), caps, lamps, flippers, ball)
  const dmd = animatedScreen(128, 32, 12, (c, t) => drawDmd(c, t, def))
  live.add(top, part(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial({ map: dmd.texture }), 0, 0.515, -0.2155))

  const path = ballPath(), phase = random() * 30
  const bumperOn = new THREE.Color(def.trim), bumperOff = bumperOn.clone().multiplyScalar(0.16)
  const lampOn = new THREE.Color(def.lamp), lampOff = lampOn.clone().multiplyScalar(0.14)
  let bumperState = -1, lampStep = -1
  /** Angle d'un flipper, `s` secondes après l'arrivée de la bille : il frappe (un rien avant), tient, retombe. */
  const flip = (s: number) => FLIPPERS.rest + (FLIPPERS.up - FLIPPERS.rest) * (ease((s + 0.02) / 0.05) - ease((s - 0.12) / 0.1))
  return {
    solid: g,
    live,
    emitter: 'arcade',
    update: (t) => {
      const tt = t + phase
      dmd.tick(tt)
      // La bille, et les bumpers qu'elle frôle.
      const u = ((tt / path.period) % 1) * BALL_STEPS, i0 = Math.floor(u) % BALL_STEPS, i1 = (i0 + 1) % BALL_STEPS, f = u - Math.floor(u)
      const bx = path.points[i0 * 2] + (path.points[i1 * 2] - path.points[i0 * 2]) * f
      const bz = path.points[i0 * 2 + 1] + (path.points[i1 * 2 + 1] - path.points[i0 * 2 + 1]) * f
      ball.position.set(bx, FIELD.y + 0.011, bz)
      const state = path.bumpers[i0]
      if (state !== bumperState) {
        bumperState = state
        for (let i = 0; i < BUMPERS.length; i++) caps.setColorAt(i, state & (1 << i) ? bumperOn : bumperOff)
        caps.instanceColor!.needsUpdate = true
      }
      // Les flippers frappent quand la bille arrive (un rien avant).
      const loop = (tt / path.period) % 1
      const left = flip(((loop - path.flips[0] + 1) % 1) * path.period)
      const right = flip(((loop - path.flips[1] + 1) % 1) * path.period)
      setInstance(flippers, 0, -FLIPPERS.x, FIELD.y + 0.007, FLIPPERS.z, 1, -left)
      setInstance(flippers, 1, FLIPPERS.x, FIELD.y + 0.007, FLIPPERS.z, 1, Math.PI + right)
      flippers.instanceMatrix.needsUpdate = true
      // Voyants : chenillard au centre, couloirs et orbites qui clignotent.
      const step = Math.floor(tt * 6)
      if (step !== lampStep) {
        lampStep = step
        for (let i = 0; i < LAMPS.length; i++) {
          const on = i < 4 ? step % 5 === 3 - i || step % 10 === 9
            : i < 7 ? (step >> 1) % 3 === i - 4
            : i < 9 ? ((step >> 1) + i) % 2 === 0
            : i < 11 ? true
            : (step >> 2) % 2 === 0
          lamps.setColorAt(i, on ? lampOn : lampOff)
        }
        lamps.instanceColor!.needsUpdate = true
      }
    },
  }
}

// ---------------------------------------------------------------- borne de course

const RW = 128, RH = 96

/** Virage de la route à l'instant `t` (négatif : à gauche) ; le volant de la borne le suit. */
const canyonCurve = (t: number) => Math.sin(t * 0.37) * 0.8 + Math.sin(t * 0.91 + 1) * 0.3
/** Cumul des virages : le décor du fond glisse d'autant. */
const canyonDrift = (t: number) => (-Math.cos(t * 0.37) * 0.8) / 0.37 - (Math.cos(t * 0.91 + 1) * 0.3) / 0.91

/** Ciel du canyon, du violet au couchant, en bandes de 2 px (calculé une fois). */
const CANYON_SKY = Array.from({ length: 18 }, (_, i) => new THREE.Color('#1c0a2a').lerp(new THREE.Color('#ff9a4a'), (i / 17) ** 1.6).getStyle())

/** CANYON RUN : un vaisseau file au ras d'une route, au fond d'un canyon rouge, en pseudo-3D. */
const drawCanyon: Draw = (c, t) => {
  const horizon = 36, curve = canyonCurve(t), drift = canyonDrift(t) * 14
  for (let i = 0; i < CANYON_SKY.length; i++) {
    c.fillStyle = CANYON_SKY[i]
    c.fillRect(0, i * 2, RW, 2)
  }
  c.fillStyle = '#ffe2a0'
  c.beginPath()
  c.arc(RW / 2 + 20 - curve * 18, 22, 6, 0, Math.PI * 2)
  c.fill()
  // Falaises lointaines : hautes sur les côtés, ouvertes au milieu, là où file la route.
  for (let x = 0; x < RW; x++) {
    const side = Math.abs(x - RW / 2 - curve * 20) / (RW / 2)
    const wx = x + drift
    const top = horizon - 3 - side * side * 26 - Math.abs(Math.sin(wx * 0.11)) * 4 - Math.sin(wx * 0.037) * 3
    c.fillStyle = '#7a2616'
    c.fillRect(x, top, 1, horizon - top + 1)
    c.fillStyle = '#c4532c'
    c.fillRect(x, top, 1, 1)
  }
  // Route : pour chaque rangée, sa profondeur ; bandes qui défilent vers nous.
  for (let y = horizon; y < RH; y++) {
    const p = (y - horizon + 1) / (RH - horizon), z = 1 / p
    const cx = RW / 2 + curve * 70 * (1 - p) * (1 - p) - curve * 6 * p
    const half = 3 + p * 58, band = Math.floor(z * 2.4 + t * 10) & 1
    c.fillStyle = band ? '#b4532f' : '#a44a2a'
    c.fillRect(0, y, RW, 1)
    const wall = half * 1.9 + 8
    c.fillStyle = band ? '#6e2416' : '#7c2c1a'
    c.fillRect(0, y, cx - wall, 1)
    c.fillRect(cx + wall, y, RW, 1)
    c.fillStyle = band ? '#ece4d8' : '#c8281e'
    c.fillRect(cx - half * 1.12, y, half * 2.24, 1)
    c.fillStyle = band ? '#3c3a44' : '#34323e'
    c.fillRect(cx - half, y, half * 2, 1)
    if (band) {
      c.fillStyle = '#f2e6c8'
      c.fillRect(cx - Math.max(0.5, half * 0.03), y, Math.max(1, half * 0.06), 1)
    }
  }
  // Portique de contrôle, tous les 7 de profondeur : deux pylônes et une bande à damier.
  const gate = 7 - ((t * 10) / 2.4) % 7
  const gz = gate < 0.28 ? gate + 7 : gate, gp = 1 / gz
  const gy = horizon - 1 + gp * (RH - horizon)
  const gcx = RW / 2 + curve * 70 * (1 - gp) * (1 - gp) - curve * 6 * gp, gh = gp * 58 * 1.25
  const post = Math.max(1, gp * 5), tall = gp * 70
  c.fillStyle = '#2a2e36'
  c.fillRect(gcx - gh - post, gy - tall, post, tall)
  c.fillRect(gcx + gh, gy - tall, post, tall)
  const sq = Math.max(1, gp * 6)
  for (let x = gcx - gh, n = 0; x < gcx + gh; x += sq, n++) {
    c.fillStyle = n % 2 ? '#ffffff' : '#17181b'
    c.fillRect(x, gy - tall, sq, sq)
    c.fillStyle = n % 2 ? '#17181b' : '#ffffff'
    c.fillRect(x, gy - tall + sq, sq, sq)
  }
  // Le vaisseau du joueur, vu de dos, qui s'incline dans les virages.
  c.save()
  c.translate(RW / 2, 80 + Math.sin(t * 7) * 0.8)
  c.fillStyle = 'rgba(0, 0, 0, 0.35)'
  c.beginPath()
  c.ellipse(0, 11, 14, 2, 0, 0, Math.PI * 2)
  c.fill()
  c.rotate(curve * 0.2)
  c.fillStyle = '#8e949e'
  c.beginPath()
  c.moveTo(-17, 1)
  c.lineTo(-6, -6)
  c.lineTo(6, -6)
  c.lineTo(17, 1)
  c.lineTo(10, 5)
  c.lineTo(-10, 5)
  c.closePath()
  c.fill()
  c.fillStyle = '#c9cdd4'
  c.fillRect(-6, -6, 12, 3)
  c.fillStyle = '#39e0ff'
  c.fillRect(-3, -8, 6, 2)
  const hot = Math.floor(t * 12) % 2 === 0
  c.fillStyle = ED_ORANGE
  c.fillRect(-10, 0, 6, 3)
  c.fillRect(4, 0, 6, 3)
  c.fillStyle = hot ? '#fff3c4' : '#ffc27a'
  c.fillRect(-8, 1, 2, 1)
  c.fillRect(6, 1, 2, 1)
  c.restore()
  c.font = '8px monospace'
  c.fillStyle = '#ffe14f'
  c.fillText(`TIME ${59 - Math.floor(t % 60)}`, 4, 10)
  c.fillText(`${Math.round(420 - Math.abs(curve) * 80 + Math.sin(t * 3) * 4)} KM/H`, 78, 10)
}

const RACERS: Record<string, { body: string; dark: string; stripe: string; neon: string }> = {
  red: { body: '#c62a22', dark: '#5a1410', stripe: '#f4f4f4', neon: '#ffe14f' },
  blue: { body: '#2358c4', dark: '#122a5e', stripe: '#f4f4f4', neon: '#39e0ff' },
  yellow: { body: '#e8b420', dark: '#6a5210', stripe: '#1b1d24', neon: '#ff4fd8' },
}

/**
 * Borne de course assise : baquet côté +z, volant et tableau de bord, grand écran au fond
 * (CANYON RUN) sous sa visière, fronton lumineux. Carrosserie : `label` (red, blue, yellow).
 */
const arcadeRacer: Builder = ({ label, random }) => {
  const paint = RACERS[label ?? ''] ?? RACERS.red
  const g = new THREE.Group()
  const body = lit(paint.body), dark = lit(paint.dark), stripe = lit(paint.stripe), black = lit(C.black), seat = lit(C.seat)
  // Plancher, socle du siège (bandes de course), néons au ras du sol, pédalier.
  g.add(box(0.6, 0.05, 0.9, dark, 0, 0.025, 0, 0.01), box(0.46, 0.15, 0.34, body, 0, 0.125, 0.24, 0.015))
  for (const x of [-0.232, 0.232]) g.add(box(0.004, 0.028, 0.3, stripe, x, 0.13, 0.24))
  for (const x of [-0.301, 0.301]) g.add(box(0.004, 0.012, 0.84, glow(paint.neon), x, 0.03, 0))
  for (const x of [-0.06, 0.06]) {
    const pedal = box(0.05, 0.012, 0.08, lit(C.chrome), x, 0.075, -0.04)
    pedal.rotation.x = -0.5
    g.add(pedal)
  }
  // Baquet : assise, joues, dossier incliné, appui-tête, levier de vitesses.
  g.add(box(0.3, 0.06, 0.28, seat, 0, 0.23, 0.22, 0.02))
  for (const x of [-0.16, 0.16]) g.add(box(0.05, 0.09, 0.28, body, x, 0.265, 0.22, 0.02))
  const back = new THREE.Group()
  back.position.set(0, 0.25, 0.345)
  back.rotation.x = 0.17
  back.add(box(0.3, 0.38, 0.06, seat, 0, 0.19, 0, 0.02), box(0.05, 0.34, 0.004, stripe, 0, 0.18, -0.031))
  for (const x of [-0.145, 0.145]) back.add(box(0.05, 0.3, 0.09, body, x, 0.15, -0.01, 0.02))
  back.add(box(0.2, 0.09, 0.05, seat, 0, 0.42, 0.005, 0.02))
  g.add(back)
  g.add(box(0.05, 0.06, 0.08, black, 0.21, 0.23, 0.1), cylinder(0.006, 0.006, 0.1, lit(C.chrome), 0.21, 0.3, 0.1, 6), sphere(0.018, lit(C.seat), 0.21, 0.355, 0.1, 8))
  // Caisson de l'écran : flancs peints, dos noir, visière, fronton.
  for (const s of [-1, 1]) g.add(box(0.04, 0.9, 0.36, body, s * 0.28, 0.45, -0.27, 0.012), box(0.004, 0.62, 0.05, stripe, s * 0.3015, 0.47, -0.2))
  g.add(box(0.52, 0.86, 0.3, black, 0, 0.43, -0.3))
  const bezel = new THREE.Group()
  bezel.position.set(0, 0.6, -0.138)
  bezel.rotation.x = -0.12
  bezel.add(box(0.52, 0.42, 0.03, black, 0, 0, 0, 0.01))
  const visor = box(0.56, 0.03, 0.15, body, 0, 0.845, -0.12, 0.01)
  visor.rotation.x = 0.12
  g.add(bezel, visor, box(0.56, 0.12, 0.1, black, 0, 0.9, -0.3, 0.01))
  g.add(mesh(new THREE.PlaneGeometry(0.54, 0.11), marquee('CANYON RUN', ED_ORANGE, ['#1c0604', '#5a1408']), 0, 0.9, -0.2495))
  // Tableau de bord incliné vers le pilote : deux cadrans, colonne de direction.
  const dash = new THREE.Group()
  dash.position.set(0, 0.36, -0.07)
  dash.rotation.x = 0.35
  dash.add(box(0.5, 0.1, 0.16, black, 0, 0, 0, 0.015))
  for (const [x, col] of [[-0.14, '#39e0ff'], [0.14, ED_ORANGE]] as const) {
    dash.add(cylinder(0.034, 0.034, 0.006, lit('#0b0c10'), x, 0.052, 0.01, 14), cylinder(0.028, 0.028, 0.008, glow(col), x, 0.053, 0.01, 14))
    dash.add(box(0.004, 0.009, 0.024, lit('#0b0c10'), x + 0.006, 0.058, 0.004))
  }
  dash.add(barZ(0.018, 0.1, lit(C.steel), 0, 0.03, 0.08, 10))
  g.add(dash)

  const screen = animatedScreen(RW, RH, 12, drawCanyon)
  const phase = random() * 60
  const live = new THREE.Group()
  const face = new THREE.Group()
  face.position.copy(bezel.position)
  face.rotation.copy(bezel.rotation)
  face.add(part(new THREE.PlaneGeometry(0.46, 0.345), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0, 0.0155))
  // Volant : il suit les virages de la route à l'écran.
  const model = new THREE.Group()
  model.add(mesh(new THREE.TorusGeometry(0.075, 0.011, 6, 18), lit(C.seat)))
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const spoke = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.008), lit(C.steel), Math.cos(a - Math.PI / 2) * 0.035, Math.sin(a - Math.PI / 2) * 0.035, 0)
    spoke.rotation.z = a - Math.PI / 2
    model.add(spoke)
  }
  model.add(barZ(0.02, 0.02, lit(C.steel), 0, 0, 0, 10), barZ(0.008, 0.022, glow(paint.body), 0, 0, 0.002, 8))
  const wheel = compact(model)
  const column = new THREE.Group()
  column.position.set(0, 0.44, 0.045)
  column.rotation.x = -0.45
  column.add(wheel)
  live.add(face, column)
  return {
    solid: g,
    live,
    emitter: 'arcade',
    update: (t) => {
      screen.tick(t + phase)
      // Braquage modéré : au-delà, les trois branches semblent à peine bouger (symétrie d'un tiers de tour).
      wheel.rotation.z = -canyonCurve(t + phase) * 0.5
    },
  }
}

// ---------------------------------------------------------------- pince à peluches

const CLAWS: Record<string, { body: string; neon: string }> = {
  pink: { body: '#ff6fae', neon: '#ffe14f' },
  cyan: { body: '#35c6d9', neon: '#ff4fd8' },
  yellow: { body: '#ffc93c', neon: '#39e0ff' },
}

/** Peluche de Comète (chatte grise, nez rose), assise, taille `s`. */
function cometePlush(s: number): THREE.Group {
  const p = new THREE.Group()
  const grey = lit(C.cat)
  const body = sphere(0.032 * s, grey, 0, 0.028 * s, 0, 8)
  body.scale.set(1, 0.85, 1.1)
  p.add(body, sphere(0.024 * s, grey, 0, 0.064 * s, 0.012 * s, 8))
  for (const x of [-0.013, 0.013]) p.add(mesh(new THREE.ConeGeometry(0.008 * s, 0.018 * s, 4), grey, x * s, 0.087 * s, 0.012 * s))
  p.add(sphere(0.0045 * s, lit(C.nose), 0, 0.062 * s, 0.036 * s, 5))
  return p
}

/** Peluche de Thargoïde : un octogone vert au cœur lumineux. */
function thargoidPlush(): THREE.Group {
  const p = new THREE.Group()
  p.add(mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.022, 8), lit('#3fbf5f'), 0, 0.011, 0))
  p.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 8), glow('#9dffc0'), 0, 0.023, 0))
  return p
}

const BALLS = ['#ff8ad8', '#ffe14f', '#6ab0ff', '#f4f0ea', '#ff9a3c', '#8fe06a']

/**
 * Pince : position de repos (au-dessus de la goulotte), hauteur du moyeu (en haut, en bas),
 * hauteur de la Comète visée (posée sur un Thargoïde du tas), durée d'une partie.
 */
const CLAW = { hx: -0.155, hz: 0.155, up: 0.74, down: 0.59, rest: 0.458, period: 11, reach: 0.19 }

/**
 * Pince à peluches : meuble à trappe à lots et monnayeur, cage vitrée pleine de peluches (Comète,
 * Thargoïdes, boules), portique et pince qui vont chercher une Comète… et la lâchent en remontant.
 * Couleur du meuble : `label` (pink, cyan, yellow).
 */
const clawMachine: Builder = ({ label, random }) => {
  const paint = CLAWS[label ?? ''] ?? CLAWS.pink
  const g = new THREE.Group()
  const body = lit(paint.body), black = lit(C.black), chrome = lit(C.chrome), neon = glow(paint.neon)
  // Meuble du bas : trappe à lots (cadre lumineux), monnayeur, pupitre.
  g.add(box(0.46, 0.04, 0.46, black, 0, 0.02, 0), box(0.5, 0.38, 0.5, body, 0, 0.23, 0, 0.015), box(0.506, 0.012, 0.506, neon, 0, 0.405, 0))
  g.add(box(0.15, 0.12, 0.02, lit('#0b0c10'), -0.11, 0.16, 0.245), box(0.13, 0.055, 0.006, lit('#3a3e46'), -0.11, 0.185, 0.254))
  for (const y of [0.225, 0.095]) g.add(box(0.17, 0.008, 0.006, neon, -0.11, y, 0.253))
  for (const x of [-0.19, -0.03]) g.add(box(0.008, 0.138, 0.006, neon, x, 0.16, 0.253))
  g.add(box(0.09, 0.13, 0.008, chrome, 0.12, 0.2, 0.254), box(0.04, 0.006, 0.004, black, 0.12, 0.24, 0.259))
  g.add(box(0.05, 0.02, 0.004, glow('#ffd84f'), 0.12, 0.205, 0.259), barZ(0.01, 0.006, glow('#ff3b3b'), 0.12, 0.165, 0.259, 8))
  g.add(box(0.44, 0.035, 0.08, lit(C.panel), 0, 0.43, 0.25, 0.008))
  g.add(cylinder(0.007, 0.007, 0.05, chrome, -0.08, 0.47, 0.255, 6), sphere(0.016, glow('#ff3b3b'), -0.08, 0.5, 0.255, 8))
  g.add(cylinder(0.024, 0.026, 0.014, glow(paint.neon), 0.08, 0.452, 0.255, 12))
  // Cage : montants, fond, goulotte des lots, rails du portique, plafonnier, toit, fronton.
  for (const x of [-0.235, 0.235]) for (const z of [-0.235, 0.235]) g.add(box(0.03, 0.46, 0.03, body, x, 0.645, z))
  g.add(box(0.46, 0.01, 0.46, lit('#2a2340'), 0, 0.425, 0), box(0.12, 0.004, 0.12, lit('#050507'), -0.155, 0.431, 0.155))
  g.add(box(0.13, 0.06, 0.006, chrome, -0.155, 0.46, 0.092), box(0.006, 0.06, 0.13, chrome, -0.092, 0.46, 0.155))
  for (const x of [-0.21, 0.21]) g.add(box(0.02, 0.02, 0.44, chrome, x, 0.845, 0))
  g.add(box(0.44, 0.006, 0.44, glow('#fff3e0'), 0, 0.857, 0), box(0.5, 0.06, 0.5, body, 0, 0.89, 0, 0.012))
  g.add(box(0.46, 0.1, 0.04, black, 0, 0.97, -0.02, 0.008))
  g.add(mesh(new THREE.PlaneGeometry(0.44, 0.09), marquee(tr('PINCE À COMÈTE', 'COMÈTE CLAW'), paint.neon, ['#1f0a1a', '#4a1440']), 0, 0.97, 0.0005))
  // Le tas de peluches, sur deux couches, hors de la goulotte ; la Comète visée trône sur un Thargoïde.
  const [tx, tz] = [[0.08, -0.06], [0.09, 0.07], [-0.02, -0.1], [0.04, 0.0]][Math.floor(random() * 4)]
  const heap = new THREE.Group()
  const seat = thargoidPlush()
  seat.position.set(tx, 0.43, tz)
  heap.add(seat)
  const pile = (x: number, y: number, z: number) => {
    if ((x < -0.08 && z > 0.08) || Math.hypot(x - tx, z - tz) < 0.06) return
    const kind = random()
    const p = kind < 0.4 ? cometePlush(0.9 + random() * 0.2) : kind < 0.7 ? thargoidPlush() : new THREE.Group()
    if (kind >= 0.7) p.add(sphere(0.022 + random() * 0.008, lit(BALLS[Math.floor(random() * BALLS.length)]), 0, 0.026, 0, 8))
    p.position.set(x, y, z)
    p.rotation.set((random() - 0.5) * 0.6, random() * Math.PI * 2, (random() - 0.5) * 0.6)
    heap.add(p)
  }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pile(-0.18 + i * 0.09 + (random() - 0.5) * 0.03, 0.43, -0.18 + j * 0.09 + (random() - 0.5) * 0.03)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pile(-0.1 + i * 0.09 + (random() - 0.5) * 0.03, 0.46, -0.12 + j * 0.09 + (random() - 0.5) * 0.03)

  // Tas et peluche visée restent à part, sans ombre : sous le toit, ils seraient dans la pénombre.
  const lot = compact(heap), prize = compact(cometePlush(1.1))
  for (const o of [...lot.children, ...prize.children]) o.castShadow = o.receiveShadow = false
  const live = new THREE.Group()
  live.add(lot, part(new THREE.BoxGeometry(0.46, 0.44, 0.46), glass('#e0f0ff', 0.14), 0, 0.645, 0))
  // Portique, chariot, câble, moyeu, trois griffes et leurs crochets : un seul maillage instancié.
  const rig = instanced(new THREE.BoxGeometry(1, 1, 1), ['#9aa2ac', '#26282e', '#1c1f25', C.chrome, ...Array(6).fill(C.chrome)], lit('#ffffff'))
  const turn = random() * 0.8 - 0.4
  const bulbs = instanced(new THREE.SphereGeometry(0.009, 8, 6), Array(9).fill('#fff3b0'))
  for (let i = 0; i < 9; i++) setInstance(bulbs, i, -0.2 + i * 0.05, 0.905, 0.253)
  live.add(rig, prize, bulbs)
  const prong = new THREE.Matrix4().makeTranslation(0, -0.035, 0).multiply(new THREE.Matrix4().makeScale(0.007, 0.07, 0.007))
  const hook = new THREE.Matrix4().makeTranslation(0, -0.066, -0.008).multiply(new THREE.Matrix4().makeScale(0.007, 0.007, 0.02))
  const on = new THREE.Color('#fff3b0'), off = new THREE.Color('#5a4a28')
  const phase = random() * CLAW.period
  /** Hauteur du moyeu quand la Comète glisse (5,85 s), et temps de sa chute jusqu'au tas. */
  const slip = CLAW.up - (CLAW.up - CLAW.down) * (1 - ease(0.85 / 1.2)) - (CLAW.down - CLAW.rest)
  const fallTime = Math.sqrt((slip - CLAW.rest) / 1.5)
  let bulbStep = -1

  /*
   * Quand personne ne joue, la pince fait sa démonstration (une Comète attrapée… et lâchée en
   * remontant). Un joueur la déplace, puis la lâche : elle s'ouvre, descend, se referme, remonte,
   * revient au-dessus de la goulotte et s'ouvre. Bien visée, elle attrape la Comète, qui peut
   * encore glisser en route ; gagnée, la peluche tombe dans la trappe à lots.
   */
  /** Pince affichée : elle suit en douceur la démonstration ou la partie. */
  const at = { x: CLAW.hx, z: CLAW.hz, hub: CLAW.up, open: 0 }
  type Stage = 'aim' | 'open' | 'down' | 'close' | 'up' | 'home' | 'release' | 'reset'
  const STAGES: Record<Stage, number> = { aim: Infinity, open: 0.35, down: 1.1, close: 0.45, up: 1.1, home: 1, release: 0.4, reset: 0.4 }
  let game: {
    stage: Stage
    since: number
    x: number
    z: number
    from: { x: number; z: number }
    held: boolean
    /** Moment de la remontée (de 0 à 1) où la Comète glisse ; Infinity : elle tient bon. */
    slipAt: number
    result: ClawResult
    done?: (r: ClawResult) => void
  } | null = null
  /** Le joueur a rendu la main : la démonstration reprend quand la partie est finie, pince au repos. */
  let released = false
  /** Peluche qui tombe (vers le tas, ou dans la goulotte), et peluche gagnée (dans la trappe, puis de retour). */
  let fall: { from: number; x: number; z: number; since: number; into: 'heap' | 'chute' } | null = null
  let wonAt = -Infinity
  let now = 0
  /** Hauteur de la Comète dans la démonstration, à l'instant k du cycle. */
  const demoPrize = (k: number, hub: number) => {
    const s = k - 5.85
    if (k > 5 && s < 0) return hub - (CLAW.down - CLAW.rest)
    if (s >= 0 && s < fallTime) return slip - 1.5 * s * s
    if (s >= fallTime && s < fallTime + 0.15) return CLAW.rest + 0.012 - 2.15 * (s - fallTime - 0.075) ** 2
    return CLAW.rest
  }
  const demoHub = (k: number) => CLAW.up - (CLAW.up - CLAW.down) * (ease((k - 3.4) / 1.2) - ease((k - 5) / 1.2))
  const next = (stage: Stage) => {
    game!.stage = stage
    game!.since = now
  }

  const control: ClawControl = {
    kind: 'claw',
    get busy() {
      return !!game && game.stage !== 'aim'
    },
    take(on) {
      if (!on) {
        released = true
        if (game?.stage === 'aim') game = null
        return
      }
      released = false
      if (game) return
      // La démonstration tenait peut-être la Comète : elle la lâche.
      const k = (now + phase) % CLAW.period
      const y = demoPrize(k, demoHub(k))
      if (y > CLAW.rest + 0.005 && wonAt < now - 3.8) fall = { from: y, x: tx, z: tz, since: now, into: 'heap' }
      game = { stage: 'aim', since: now, x: at.x, z: at.z, from: { x: at.x, z: at.z }, held: false, slipAt: Infinity, result: 'miss' }
    },
    steer(x, z, dt) {
      if (game?.stage !== 'aim') return
      game.x = THREE.MathUtils.clamp(game.x + x * 0.24 * dt, -CLAW.reach, CLAW.reach)
      game.z = THREE.MathUtils.clamp(game.z + z * 0.24 * dt, -CLAW.reach, CLAW.reach)
    },
    drop(done) {
      if (game?.stage !== 'aim') return false
      game.done = done
      game.held = false
      game.result = 'miss'
      next('open')
      return true
    },
  }

  /** Fait avancer la partie ; rend la cible de la pince (position, hauteur du moyeu, ouverture). */
  const play = (g: NonNullable<typeof game>) => {
    let u = Math.min(1, (now - g.since) / STAGES[g.stage])
    if (g.stage === 'home') u = Math.min(1, (now - g.since) / (0.4 + Math.hypot(g.from.x - CLAW.hx, g.from.z - CLAW.hz) / 0.22))
    const e = ease(u)
    let { x, z } = g
    let hub = CLAW.up, open = 0
    switch (g.stage) {
      case 'open': open = e; break
      case 'down': open = 1; hub = CLAW.up - (CLAW.up - CLAW.down) * e; break
      case 'close': open = 1 - e; hub = CLAW.down; break
      case 'up': hub = CLAW.down + (CLAW.up - CLAW.down) * e; break
      case 'home': x = g.from.x + (CLAW.hx - g.from.x) * e; z = g.from.z + (CLAW.hz - g.from.z) * e; break
      case 'release': x = CLAW.hx; z = CLAW.hz; open = e; break
      case 'reset': x = CLAW.hx; z = CLAW.hz; open = 1 - e; break
    }
    if (u < 1) return { x, z, hub, open }
    // Fin de l'étape.
    const d = Math.hypot(g.x - tx, g.z - tz)
    switch (g.stage) {
      case 'open': next('down'); break
      case 'down': next('close'); break
      case 'close':
        // Bien centrée sur la Comète, la pince la prend presque toujours, et la lâche une fois sur
        // quatre en remontant ; à côté, elle la prend une fois sur deux, et la lâche plus souvent.
        g.held = wonAt < now - 3.8 && Math.random() < (d < 0.03 ? 0.9 : d < 0.06 ? 0.45 : 0)
        g.slipAt = g.held && Math.random() < (d < 0.03 ? 0.25 : 0.55) ? 0.45 + Math.random() * 0.4 : Infinity
        next('up')
        break
      case 'up': g.from = { x: g.x, z: g.z }; next('home'); break
      case 'home': next('release'); break
      case 'release': next('reset'); break
      case 'reset': {
        const done = g.done
        g.x = CLAW.hx
        g.z = CLAW.hz
        g.done = undefined
        next('aim')
        if (released) game = null
        done?.(g.result)
        break
      }
    }
    return { x, z, hub, open }
  }

  return {
    solid: g,
    live,
    emitter: 'arcade',
    control,
    update: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - now))
      now = t
      const k = (t + phase) % CLAW.period
      let x: number, z: number, hub: number, open: number
      if (game) ({ x, z, hub, open } = play(game))
      else {
        // Aller (x puis z), ouvrir, descendre, fermer, remonter, retour (z puis x), ouvrir au-dessus de la goulotte.
        x = CLAW.hx + (tx - CLAW.hx) * (ease(k - 1) - ease(k - 7.2))
        z = CLAW.hz + (tz - CLAW.hz) * (ease(k - 2) - ease(k - 6.2))
        open = ease((k - 3) / 0.4) - ease((k - 4.6) / 0.4) + ease((k - 8.2) / 0.4) - ease((k - 8.6) / 0.4)
        hub = demoHub(k)
      }
      const follow = 1 - Math.exp(-14 * dt)
      at.x += (x - at.x) * follow
      at.z += (z - at.z) * follow
      at.hub += (hub - at.hub) * follow
      at.open += (open - at.open) * follow
      setInstance(rig, 0, 0, 0.828, at.z, _size.set(0.42, 0.014, 0.028))
      setInstance(rig, 1, at.x, 0.814, at.z, _size.set(0.05, 0.026, 0.05))
      setInstance(rig, 2, at.x, (0.8 + at.hub) / 2, at.z, _size.set(0.004, 0.8 - at.hub, 0.004))
      setInstance(rig, 3, at.x, at.hub, at.z, _size.set(0.034, 0.022, 0.034))
      for (let n = 0; n < 3; n++) {
        const a = (n / 3) * Math.PI * 2
        _o.position.set(at.x + Math.sin(a) * 0.016, at.hub - 0.008, at.z + Math.cos(a) * 0.016)
        _o.rotation.set(0.15 - 0.75 * at.open, a, 0, 'YXZ')
        _o.updateMatrix()
        rig.setMatrixAt(4 + n, _m.multiplyMatrices(_o.matrix, prong))
        rig.setMatrixAt(7 + n, _m.multiplyMatrices(_o.matrix, hook))
      }
      rig.instanceMatrix.needsUpdate = true

      // La Comète : tenue par la pince, qui tombe, gagnée, ou dans la démonstration.
      let px = tx, py = CLAW.rest, pz = tz, wobble = 0, scale = 1
      const held = game?.held && ['up', 'home', 'release'].includes(game.stage)
      if (game?.held && game.stage === 'up' && (now - game.since) / STAGES.up > game.slipAt) {
        // Elle glisse en remontant.
        game.held = false
        game.result = 'slip'
        fall = { from: at.hub - (CLAW.down - CLAW.rest), x: at.x, z: at.z, since: now, into: 'heap' }
      }
      if (game?.held && game.stage === 'release' && now - game.since > 0.15) {
        game.held = false
        game.result = 'win'
        fall = { from: at.hub - (CLAW.down - CLAW.rest), x: at.x, z: at.z, since: now, into: 'chute' }
      }
      const since = now - wonAt
      if (since < 3.8) {
        // Gagnée : dans la trappe à lots, puis de retour sur le tas.
        if (since < 2.6) [px, py, pz, scale] = [-0.11, 0.105, 0.2, 0.85]
        else if (since < 3.5) scale = 0
        else scale = ease((since - 3.5) / 0.3)
      } else if (fall) {
        const s = now - fall.since
        const floor = fall.into === 'chute' ? 0.3 : CLAW.rest
        px = fall.into === 'heap' ? fall.x + (tx - fall.x) * Math.min(1, s * 4) : fall.x
        pz = fall.into === 'heap' ? fall.z + (tz - fall.z) * Math.min(1, s * 4) : fall.z
        py = fall.from - 1.5 * s * s
        if (py <= floor) {
          if (fall.into === 'chute') wonAt = now
          fall = null
          py = floor
        }
      } else if (held) {
        px = at.x
        pz = at.z
        py = at.hub - (CLAW.down - CLAW.rest)
        wobble = Math.sin(now * 14) * 0.08
      } else if (!game) {
        py = demoPrize(k, at.hub)
        wobble = k > 5 && k < 5.85 ? Math.sin(k * 14) * 0.08 : 0
      }
      prize.position.set(px, py, pz)
      prize.scale.setScalar(Math.max(0.001, scale))
      prize.rotation.set(0, turn, wobble)
      // Guirlande du toit : un chenillard (plus vif pendant une partie).
      const step = Math.floor((t + phase) * (game ? 10 : 6))
      if (step !== bulbStep) {
        bulbStep = step
        for (let i = 0; i < 9; i++) bulbs.setColorAt(i, (i + step) % 3 === 0 ? on : off)
        bulbs.instanceColor!.needsUpdate = true
      }
    },
  }
}

export const ARCADE = {
  arcade,
  'arcade-table': arcadeTable,
  pinball,
  'arcade-racer': arcadeRacer,
  'claw-machine': clawMachine,
} satisfies Record<string, Builder>
