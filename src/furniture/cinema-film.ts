import { tr } from '../i18n'
import { ED_ORANGE, rng } from './kit'

/*
 * Le film d'attente du cinéma, quand aucune séance ne passe : une bande-annonce dessinée au
 * canvas, en 16:9 comme les vidéos de la régie. Amorce à compte à rebours, lever de soleil sur
 * une géante gazeuse à anneaux, saut FSD, arrivée à une station Coriolis, carton final.
 * Le temps est celui de la boucle (en secondes) : tout le bord voit la même image.
 */

export const FILM_W = 640
export const FILM_H = 360
const W = FILM_W, H = FILM_H

type Ctx = CanvasRenderingContext2D

/** Durée de la boucle, en secondes. */
export const FILM_LOOP = 56

/** Scènes, en secondes dans la boucle : lumière qu'elles jettent dans la salle et sa couleur. */
const SCENES = [
  { end: 5, light: 0.7, color: '#d8dde6' },
  { end: 17, light: 0.45, color: '#ffc58a' },
  { end: 26, light: 0.9, color: '#9fd8ff' },
  { end: 42, light: 0.6, color: '#ffb56b' },
  { end: 54, light: 0.55, color: '#ff9a3c' },
  { end: 56, light: 0.08, color: '#8fa8ff' },
]

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** Le soleil se lève derrière la géante gazeuse (0 : caché, 1 : levé). */
const sunrise = (t: number) => smooth(8, 13, t)

/** Lumière que la bande-annonce jette dans la salle, à l'instant `t` de la boucle. */
export function trailerGlow(t: number): { k: number; color: string } {
  const i = SCENES.findIndex((s) => t < s.end)
  const scene = SCENES[i] ?? SCENES[0]
  let k = scene.light
  if (i === 1) k = 0.3 + 0.55 * sunrise(t)
  // Le saut FSD s'emballe et finit sur un éclair blanc.
  if (i === 2) k = 0.5 + ((t - 17) / 9) ** 2 * 0.5 + (t > 25.4 ? 0.3 : 0)
  const start = SCENES[i - 1]?.end ?? 0
  k *= Math.min(1, (t - start) / 0.6, (scene.end - t) / 0.6 + 0.25)
  return { k, color: scene.color }
}

// ---------------------------------------------------------------- décors dessinés une fois

const cache = new Map<string, HTMLCanvasElement>()

/** Calque dessiné à la première demande, puis réutilisé à chaque image. */
function layer(key: string, w: number, h: number, draw: (c: Ctx) => void): HTMLCanvasElement {
  let canvas = cache.get(key)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d')!)
    cache.set(key, canvas)
  }
  return canvas
}

/** Étoiles, avec une profondeur pour la parallaxe. */
const STARS = (() => {
  const r = rng(4242)
  return Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H, s: r() < 0.1 ? 1.8 : 0.6 + r() * 0.9, a: 0.3 + r() * 0.7, d: 0.2 + r() * 0.8 }))
})()

function starfield(g: Ctx, dx: number, dy = 0, alpha = 1) {
  g.fillStyle = '#ffffff'
  for (const s of STARS) {
    g.globalAlpha = s.a * alpha
    g.fillRect(((s.x - dx * s.d) % W + W) % W, ((s.y - dy * s.d) % H + H) % H, s.s, s.s)
  }
  g.globalAlpha = 1
}

/** Nébuleuse, plus large que l'écran : on la fait glisser lentement. */
const nebula = () => layer('nebula', W * 1.5, H, (c) => {
  const r = rng(77)
  c.fillStyle = '#04050a'
  c.fillRect(0, 0, W * 1.5, H)
  const tints = ['120, 60, 170', '40, 90, 190', '200, 90, 60', '60, 140, 170']
  for (let i = 0; i < 26; i++) {
    const x = r() * W * 1.5, y = H * 0.2 + r() * H * 0.6, rad = 60 + r() * 170
    const blob = c.createRadialGradient(x, y, 0, x, y, rad)
    blob.addColorStop(0, `rgba(${tints[i % 4]}, ${0.1 + r() * 0.12})`)
    blob.addColorStop(1, `rgba(${tints[i % 4]}, 0)`)
    c.fillStyle = blob
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
})

/** Géante gazeuse : centre et rayon, puis le disque à bandes, dans l'ombre. */
const GIANT = { x: W / 2 - 60, y: 200 + 900, r: 900 }
const giant = () => layer('giant', W, H + 80, (c) => {
  const r = rng(9)
  c.save()
  c.beginPath()
  c.arc(GIANT.x, GIANT.y, GIANT.r, 0, Math.PI * 2)
  c.clip()
  const bands = c.createLinearGradient(0, 200, 0, H + 80)
  const tones = ['#3a2416', '#27170f', '#4a2e1b', '#2d1b12', '#3f2718', '#211309', '#35201a']
  tones.forEach((tone, i) => bands.addColorStop(i / (tones.length - 1), tone))
  c.fillStyle = bands
  c.fillRect(0, 190, W, H - 110)
  // Remous des bandes : de longues ellipses plus claires ou plus sombres.
  for (let i = 0; i < 40; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255, 200, 150, 0.05)' : 'rgba(0, 0, 0, 0.12)'
    c.beginPath()
    c.ellipse(r() * W, 205 + r() * (H - 120), 30 + r() * 120, 2 + r() * 6, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Le côté nuit : le disque s'assombrit loin du limbe éclairé.
  const night = c.createLinearGradient(0, 200, 0, H)
  night.addColorStop(0, 'rgba(0, 0, 0, 0)')
  night.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
  c.fillStyle = night
  c.fillRect(0, 190, W, H)
  c.restore()
})

// ---------------------------------------------------------------- acteurs

/** Cobra Mk III vu de dessus, le nez vers +x : coque à l'éclairage rasant, deux tuyères. */
function cobra(g: Ctx, x: number, y: number, s: number, angle: number, thrust = 1) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.scale(s, s)
  const exhaust = g.createRadialGradient(-30, 0, 0, -30, 0, 26 * thrust)
  exhaust.addColorStop(0, 'rgba(170, 220, 255, 0.95)')
  exhaust.addColorStop(0.4, 'rgba(90, 160, 255, 0.45)')
  exhaust.addColorStop(1, 'rgba(90, 160, 255, 0)')
  g.fillStyle = exhaust
  g.fillRect(-58, -26, 34, 52)
  const half = [[34, 0], [10, -8], [-16, -28], [-23, -29], [-21, -12], [-25, -6], [-25, 0]]
  g.beginPath()
  half.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
  for (let i = half.length - 1; i >= 0; i--) g.lineTo(half[i][0], -half[i][1])
  g.closePath()
  const hull = g.createLinearGradient(0, -28, 0, 28)
  hull.addColorStop(0, '#e6e9ee')
  hull.addColorStop(0.5, '#a9b0bc')
  hull.addColorStop(1, '#5c6370')
  g.fillStyle = hull
  g.fill()
  g.strokeStyle = 'rgba(40, 44, 52, 0.7)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(30, 0)
  g.lineTo(-24, 0)
  g.moveTo(8, -7)
  g.lineTo(-20, -10)
  g.moveTo(8, 7)
  g.lineTo(-20, 10)
  g.stroke()
  // Verrière et ses reflets, bande orange, tuyères.
  g.fillStyle = '#1b2230'
  g.beginPath()
  g.moveTo(22, 0)
  g.lineTo(12, -4)
  g.lineTo(8, 0)
  g.lineTo(12, 4)
  g.fill()
  g.fillStyle = ED_ORANGE
  g.fillRect(-6, -18, 8, 2.5)
  g.fillStyle = '#d8f0ff'
  g.fillRect(-27, -6, 3, 4)
  g.fillRect(-27, 2, 3, 4)
  g.restore()
}

/** Cuboctaèdre de la station Coriolis : sommets, faces (six carrés, huit triangles). */
const CORIOLIS = (() => {
  const V = [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]]
  const at = (x: number, y: number, z: number) => V.findIndex((v) => v[0] === x && v[1] === y && v[2] === z)
  const faces = [[0, 4, 1, 5], [2, 6, 3, 7], [0, 8, 2, 9], [1, 10, 3, 11], [4, 8, 6, 10], [5, 9, 7, 11]]
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) faces.push([at(sx, sy, 0), at(sx, 0, sz), at(0, sy, sz)])
  return { V, faces }
})()
const LIGHT = (() => {
  const l = [-0.55, 0.5, 0.67]
  const n = Math.hypot(...l)
  return l.map((v) => v / n)
})()

/**
 * La station, qui tourne sur l'axe de sa fente d'amarrage (face +z, vers nous), inclinée pour
 * qu'on voie ses flancs. Renvoie la position de la fente à l'écran.
 */
function coriolis(g: Ctx, cx: number, cy: number, size: number, spin: number, t: number): { x: number; y: number } {
  const [cs, ss] = [Math.cos(spin), Math.sin(spin)]
  const [cxr, sxr] = [Math.cos(0.42), Math.sin(0.42)]
  const [cyr, syr] = [Math.cos(-0.38), Math.sin(-0.38)]
  const turn = ([x, y, z]: number[]) => {
    let [a, b] = [x * cs - y * ss, x * ss + y * cs]
    x = a
    y = b
    ;[a, b] = [y * cxr - z * sxr, y * sxr + z * cxr]
    y = a
    z = b
    ;[a, b] = [x * cyr + z * syr, -x * syr + z * cyr]
    return [a, y, b]
  }
  const P = CORIOLIS.V.map(turn)
  const screen = ([x, y]: number[]) => [cx + x * size, cy - y * size]
  const faces = CORIOLIS.faces.map((f) => {
    const c = [0, 1, 2].map((k) => f.reduce((s, i) => s + P[i][k], 0) / f.length)
    return { f, c }
  }).filter(({ c }) => c[2] > 0.02).sort((a, b) => a.c[2] - b.c[2])
  for (const { f, c } of faces) {
    const n = Math.hypot(c[0], c[1], c[2])
    const lum = 0.28 + 0.72 * Math.max(0, (c[0] * LIGHT[0] + c[1] * LIGHT[1] + c[2] * LIGHT[2]) / n)
    const tone = f.length === 4 ? [150, 158, 172] : [128, 136, 150]
    g.fillStyle = `rgb(${tone.map((v) => Math.round(v * lum)).join(',')})`
    g.strokeStyle = 'rgba(20, 24, 30, 0.6)'
    g.lineWidth = 1.2
    g.beginPath()
    f.forEach((i, k) => (k ? g.lineTo(...(screen(P[i]) as [number, number])) : g.moveTo(...(screen(P[i]) as [number, number]))))
    g.closePath()
    g.fill()
    g.stroke()
    // Panneaux : une ligne à mi-hauteur de chaque face.
    if (f.length === 4) {
      const [a, b, cc, d] = f.map((i) => screen(P[i]))
      g.strokeStyle = 'rgba(20, 24, 30, 0.25)'
      g.beginPath()
      g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
      g.lineTo((cc[0] + d[0]) / 2, (cc[1] + d[1]) / 2)
      g.stroke()
    }
  }
  // La fente d'amarrage, sur la face avant : fond noir, liseré vert, feux de piste.
  const slot = [[-0.5, -0.13], [0.5, -0.13], [0.5, 0.13], [-0.5, 0.13]].map(([x, y]) => screen(turn([x, y, 1])))
  g.fillStyle = '#05070a'
  g.beginPath()
  slot.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  g.fill()
  g.strokeStyle = 'rgba(120, 255, 170, 0.85)'
  g.lineWidth = 1.5
  g.stroke()
  const blink = Math.floor(t * 3)
  for (let i = 0; i <= 6; i++) {
    for (const [side, color] of [[0, '#ff4a3a'], [3, '#6dff9a']] as const) {
      const [a, b] = [slot[side], slot[side === 0 ? 1 : 2]]
      if ((i + blink) % 3 === 0) continue
      g.fillStyle = color
      g.fillRect(a[0] + (b[0] - a[0]) * (i / 6) - 1, a[1] + (b[1] - a[1]) * (i / 6) - 1, 2, 2)
    }
  }
  // Feux de position aux sommets visibles.
  P.forEach((p, i) => {
    if (p[2] < 0.2 || (i + Math.floor(t * 1.5)) % 4) return
    const [x, y] = screen(p)
    g.fillStyle = i % 2 ? '#ff5a4a' : '#ffffff'
    g.fillRect(x - 1.5, y - 1.5, 3, 3)
  })
  const [x, y] = screen(turn([0, 0, 1]))
  return { x, y }
}

/** Texte centré, espacé. */
function caption(g: Ctx, text: string, y: number, font: string, fill: string | CanvasGradient, tracking = 0) {
  g.font = font
  g.fillStyle = fill
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.letterSpacing = `${tracking}px`
  g.fillText(text, W / 2 + tracking / 2, y, W - 40)
  g.letterSpacing = '0px'
}

/** Coins du HUD d'Elite, autour de l'image. */
function hudCorners(g: Ctx, alpha: number) {
  g.strokeStyle = `rgba(255, 138, 28, ${alpha})`
  g.lineWidth = 2
  for (const [x, y, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [W - 24, H - 24, -1, -1], [24, H - 24, 1, -1]]) {
    g.beginPath()
    g.moveTo(x, y + dy * 26)
    g.lineTo(x, y)
    g.lineTo(x + dx * 26, y)
    g.stroke()
  }
}

// ---------------------------------------------------------------- les scènes

/** Amorce : fond gris, cercles de visée, le compte à rebours balayé, rayures de pellicule. */
function leader(g: Ctx, t: number) {
  const n = 5 - Math.floor(t)
  g.fillStyle = '#9a9ea6'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#7b7f87'
  g.beginPath()
  g.moveTo(W / 2, H / 2)
  g.arc(W / 2, H / 2, 420, -Math.PI / 2, -Math.PI / 2 + (t % 1) * Math.PI * 2)
  g.fill()
  g.strokeStyle = '#e8eaee'
  g.lineWidth = 5
  for (const r of [98, 124]) {
    g.beginPath()
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2)
    g.stroke()
  }
  g.fillStyle = '#e8eaee'
  g.fillRect(0, H / 2 - 1, W, 2)
  g.fillRect(W / 2 - 1, 0, 2, H)
  g.fillStyle = '#17181b'
  g.font = '700 150px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (n > 0) g.fillText(String(n), W / 2, H / 2 + 8)
  // Rayures et poussières qui sautent d'une image à l'autre.
  const r = rng(Math.floor(t * 12) + 1)
  g.fillStyle = 'rgba(30, 30, 30, 0.35)'
  for (let i = 0; i < 3; i++) g.fillRect(r() * W, 0, 1, H)
  for (let i = 0; i < 6; i++) g.fillRect(r() * W, r() * H, 2 + r() * 4, 2 + r() * 3)
}

/** Lever de soleil sur une géante gazeuse à anneaux ; le Cobra passe ; le studio se présente. */
function giantRise(g: Ctx, t: number) {
  const u = t - 5, sun = sunrise(t)
  const drift = u * 2.5
  g.fillStyle = '#020308'
  g.fillRect(0, 0, W, H)
  starfield(g, u * 4, 0, 1 - sun * 0.6)
  // Le soleil monte derrière le limbe.
  const [sx, sy] = [W * 0.66, 214 - sun * 44 + drift]
  const glare = g.createRadialGradient(sx, sy, 0, sx, sy, 260)
  glare.addColorStop(0, `rgba(255, 244, 220, ${0.2 + sun * 0.8})`)
  glare.addColorStop(0.08, `rgba(255, 210, 150, ${0.15 + sun * 0.5})`)
  glare.addColorStop(1, 'rgba(255, 150, 80, 0)')
  g.fillStyle = glare
  g.fillRect(0, 0, W, H)
  g.drawImage(giant(), 0, drift)
  // Le limbe s'allume, l'atmosphère rougeoie.
  const [cx, cy, R] = [GIANT.x, GIANT.y + drift, GIANT.r]
  g.save()
  g.globalCompositeOperation = 'lighter'
  for (const [width, alpha] of [[14, 0.12], [5, 0.3], [1.5, 0.8]] as const) {
    g.strokeStyle = `rgba(255, 190, 120, ${alpha * (0.25 + sun * 0.75)})`
    g.lineWidth = width
    g.beginPath()
    g.arc(cx, cy, R - width / 2, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42)
    g.stroke()
  }
  // Reflet anamorphique et fantômes de l'objectif.
  if (sun > 0) {
    const streak = g.createLinearGradient(0, 0, W, 0)
    streak.addColorStop(0, 'rgba(120, 170, 255, 0)')
    streak.addColorStop(sx / W, `rgba(170, 210, 255, ${0.55 * sun})`)
    streak.addColorStop(1, 'rgba(120, 170, 255, 0)')
    g.fillStyle = streak
    g.fillRect(0, sy - 1.5, W, 3)
    for (const [k, rad, col] of [[0.4, 18, '120, 200, 255'], [0.75, 10, '255, 170, 120'], [1.25, 30, '140, 255, 200']] as const) {
      const [gx, gy] = [sx + (W / 2 - sx) * k * 2, sy + (H / 2 - sy) * k * 2]
      const ghost = g.createRadialGradient(gx, gy, 0, gx, gy, rad)
      ghost.addColorStop(0, `rgba(${col}, ${0.14 * sun})`)
      ghost.addColorStop(1, `rgba(${col}, 0)`)
      g.fillStyle = ghost
      g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2)
    }
  }
  g.restore()
  // Les anneaux, devant la planète : la moitié qui passe de notre côté.
  g.save()
  g.translate(cx, 296 + drift)
  g.rotate(-0.07)
  for (const [rx, alpha, width] of [[640, 0.3, 10], [610, 0.5, 4], [585, 0.25, 7], [560, 0.4, 2]] as const) {
    g.strokeStyle = `rgba(225, 190, 150, ${alpha * (0.55 + sun * 0.45)})`
    g.lineWidth = width
    g.beginPath()
    g.ellipse(0, 0, rx, rx * 0.075, 0, 0.02, Math.PI - 0.02)
    g.stroke()
  }
  g.restore()
  // Le Cobra passe au-dessus du limbe.
  if (u > 3.5 && u < 11.5) {
    const k = (u - 3.5) / 8
    cobra(g, W + 70 - k * (W + 160), 150 - k * 30 + drift * 0.3, 0.95, Math.PI - 0.16)
  }
  caption(g, tr('ELITE DANGEREUSE PRÉSENTE', 'ELITE DANGEREUSE PRESENTS'), 64, '500 22px "Helvetica Neue", system-ui, sans-serif',
    `rgba(255, 230, 200, ${Math.max(0, Math.min(1, u - 5.5, 11.5 - u))})`, 10)
}

/** Saut FSD : le HUD compte, les étoiles s'étirent, le tunnel, puis l'éclair. */
function jump(g: Ctx, t: number) {
  const u = t - 17
  g.fillStyle = '#020308'
  g.fillRect(0, 0, W, H)
  if (u < 3.5) {
    // Charge : léger tremblement, étoiles qui commencent à filer vers les bords.
    const k = u / 3.5
    const shake = k * 2
    g.save()
    g.translate(Math.sin(t * 57) * shake, Math.cos(t * 43) * shake)
    g.strokeStyle = '#ffffff'
    for (const s of STARS) {
      const [dx, dy] = [s.x - W / 2, s.y - H / 2]
      const len = 1 + k * k * 22 * s.d
      const d = Math.hypot(dx, dy) || 1
      g.globalAlpha = s.a
      g.lineWidth = s.s
      g.beginPath()
      g.moveTo(s.x, s.y)
      g.lineTo(s.x + (dx / d) * len, s.y + (dy / d) * len)
      g.stroke()
    }
    g.globalAlpha = 1
    g.restore()
    hudCorners(g, 0.8)
    caption(g, tr('RÉACTEUR FSD EN CHARGE', 'FRAME SHIFT DRIVE CHARGING'), H - 58, '700 16px ui-monospace, Menlo, monospace', ED_ORANGE, 4)
    const n = Math.max(1, 4 - Math.floor(u / (3.5 / 4)))
    caption(g, String(n), H / 2, '300 72px "Helvetica Neue", system-ui, sans-serif', `rgba(255, 138, 28, ${0.35 + 0.65 * (1 - (u % (3.5 / 4)) / (3.5 / 4))})`)
    const bar = Math.min(1, k * 1.05)
    g.fillStyle = 'rgba(255, 138, 28, 0.25)'
    g.fillRect(W / 2 - 120, H - 40, 240, 5)
    g.fillStyle = ED_ORANGE
    g.fillRect(W / 2 - 120, H - 40, 240 * bar, 5)
    return
  }
  // Le tunnel de l'hyperespace : lueur, anneaux qui passent, traînées qui tournent.
  const k = (u - 3.5) / 5.5
  const tunnel = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, 400)
  tunnel.addColorStop(0, `rgba(235, 248, 255, ${0.4 + k * 0.6})`)
  tunnel.addColorStop(0.18, `rgba(120, 170, 255, ${0.3 + k * 0.4})`)
  tunnel.addColorStop(0.5, `rgba(70, 40, 160, ${0.2 + k * 0.3})`)
  tunnel.addColorStop(1, 'rgba(2, 3, 8, 0)')
  g.fillStyle = tunnel
  g.fillRect(0, 0, W, H)
  g.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    const p = ((u * (0.5 + k) + i / 5) % 1) ** 2
    g.strokeStyle = `rgba(170, 210, 255, ${0.35 * p})`
    g.beginPath()
    g.ellipse(W / 2, H / 2, 20 + p * 460, 12 + p * 280, 0, 0, Math.PI * 2)
    g.stroke()
  }
  const spin = u * 0.4
  for (const [i, s] of STARS.entries()) {
    const a = (i / STARS.length) * Math.PI * 2 + s.x + spin
    const d = ((s.y / H + u * (0.35 + k * 1.3)) % 1) * 420
    const len = 8 + k * k * 150
    g.globalAlpha = Math.min(1, d / 100)
    g.strokeStyle = i % 7 === 0 ? '#ffd2a0' : i % 3 === 0 ? '#9fc4ff' : '#eef8ff'
    g.lineWidth = 1 + s.s * 0.6
    g.beginPath()
    g.moveTo(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 0.62)
    g.lineTo(W / 2 + Math.cos(a) * (d + len), H / 2 + Math.sin(a) * (d + len) * 0.62)
    g.stroke()
  }
  g.globalAlpha = 1
  if (u > 8.4) {
    g.fillStyle = `rgba(255, 255, 255, ${(u - 8.4) / 0.6})`
    g.fillRect(0, 0, W, H)
  }
}

/** Arrivée : une Coriolis qui tourne, du trafic qui sort, le Cobra qui vise la fente. */
function station(g: Ctx, t: number) {
  const u = t - 26
  g.drawImage(nebula(), -u * 8, 0)
  starfield(g, u * 3, 0, 0.8)
  const sun = g.createRadialGradient(70, 40, 0, 70, 40, 220)
  sun.addColorStop(0, 'rgba(255, 240, 215, 0.95)')
  sun.addColorStop(0.1, 'rgba(255, 200, 140, 0.45)')
  sun.addColorStop(1, 'rgba(255, 150, 60, 0)')
  g.fillStyle = sun
  g.fillRect(0, 0, 300, 260)
  const slot = coriolis(g, W * 0.57, H * 0.47, 88 + u * 1.6, u * 0.22, t)
  // Le trafic : des vaisseaux qui quittent la station et grossissent en venant vers nous.
  for (let i = 0; i < 3; i++) {
    const p = (u * 0.09 + i / 3) % 1
    const [ex, ey] = [[W + 40, H * 0.2], [W * 0.9, H + 40], [-40, H * 0.15]][i]
    const [x, y] = [slot.x + (ex - slot.x) * p * p, slot.y + (ey - slot.y) * p * p]
    const rad = 2 + p * 9
    const light = g.createRadialGradient(x, y, 0, x, y, rad)
    light.addColorStop(0, 'rgba(240, 250, 255, 0.95)')
    light.addColorStop(1, 'rgba(150, 200, 255, 0)')
    g.fillStyle = light
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // Le Cobra, qui file vers la fente en rapetissant.
  if (u > 1.5) {
    const k = smooth(1.5, 15, u)
    const [x0, y0] = [W * 0.12, H * 1.05]
    const [x, y] = [x0 + (slot.x - x0) * k, y0 + (slot.y - y0) * k]
    cobra(g, x, y, 1.5 * (1 - k) + 0.08, Math.atan2(slot.y - y0, slot.x - x0))
  }
  // L'éclair de sortie de saut se dissipe.
  if (u < 0.8) {
    g.fillStyle = `rgba(255, 255, 255, ${1 - u / 0.8})`
    g.fillRect(0, 0, W, H)
  }
  const hud = Math.max(0, Math.min(1, u - 9.5, 15.5 - u))
  if (hud > 0) {
    g.globalAlpha = hud
    hudCorners(g, 0.8)
    g.font = '700 14px ui-monospace, Menlo, monospace'
    g.fillStyle = ED_ORANGE
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(tr('AMARRAGE AUTORISÉ · PLATEFORME 07', 'DOCKING GRANTED · PAD 07'), 40, H - 44)
    g.globalAlpha = 1
  }
}

/** Carton final : « Prochainement », un reflet qui le balaie, et la régie où choisir sa séance. */
function titleCard(g: Ctx, t: number) {
  const u = t - 42
  g.drawImage(nebula(), -W * 0.5 + u * 5, 0)
  starfield(g, u * 1.5, 0, 0.6)
  const fade = Math.max(0, Math.min(1, u / 1.2, (12 - u) / 1.2))
  g.globalAlpha = fade
  for (const y of [112, 232]) {
    const line = g.createLinearGradient(80, 0, W - 80, 0)
    line.addColorStop(0, 'rgba(255, 138, 28, 0)')
    line.addColorStop(0.5, 'rgba(255, 138, 28, 0.8)')
    line.addColorStop(1, 'rgba(255, 138, 28, 0)')
    g.fillStyle = line
    g.fillRect(80, y, W - 160, 1.5)
  }
  const title = tr('PROCHAINEMENT', 'COMING SOON')
  const font = '800 64px "Helvetica Neue", system-ui, sans-serif'
  g.shadowColor = 'rgba(255, 120, 20, 0.6)'
  g.shadowBlur = 20
  caption(g, title, 160, font, ED_ORANGE, 6)
  g.shadowBlur = 0
  // Le reflet passe sur les lettres.
  const x = ((u - 0.8) / 2.6) * (W + 400) - 200
  if (x > -200 && x < W + 200) {
    const sweep = g.createLinearGradient(x - 60, 0, x + 60, 0)
    sweep.addColorStop(0, 'rgba(255, 255, 255, 0)')
    sweep.addColorStop(0.5, 'rgba(255, 250, 235, 0.9)')
    sweep.addColorStop(1, 'rgba(255, 255, 255, 0)')
    caption(g, title, 160, font, sweep, 6)
  }
  caption(g, tr('dans votre Fleet Carrier', 'in your Fleet Carrier'), 207, '400 26px "Helvetica Neue", system-ui, sans-serif', '#ffd9b0', 1)
  caption(g, 'o7', 262, '700 26px "Helvetica Neue", system-ui, sans-serif', ED_ORANGE)
  // En attendant une vraie séance, le carton dit où elle se choisit.
  g.globalAlpha = Math.max(0, Math.min(1, (u - 1.5) / 1.2, (12 - u) / 1.2))
  caption(g, tr('Votre séance se choisit à la régie, au fond de la salle', 'Pick the screening at the booth, at the back of the room'),
    318, '600 21px "Helvetica Neue", system-ui, sans-serif', '#9fd8ff')
  g.globalAlpha = 1
}

/** Une image de la bande-annonce, à l'instant `t` de la boucle. */
export function drawTrailer(g: Ctx, t: number) {
  if (t < 5) leader(g, t)
  else if (t < 17) giantRise(g, t)
  else if (t < 26) jump(g, t)
  else if (t < 42) station(g, t)
  else if (t < 54) titleCard(g, t)
  else {
    g.fillStyle = '#020308'
    g.fillRect(0, 0, W, H)
  }
  // Fondus au noir entre les scènes (le saut s'enchaîne sur l'arrivée par l'éclair blanc).
  const i = SCENES.findIndex((s) => t < s.end)
  const start = SCENES[i - 1]?.end ?? 0, end = SCENES[i]?.end ?? FILM_LOOP
  const black = 1 - Math.min(1, i === 3 ? 1 : (t - start) / 0.5, i === 2 ? 1 : (end - t) / 0.5)
  if (black > 0) {
    g.fillStyle = `rgba(2, 3, 8, ${black})`
    g.fillRect(0, 0, W, H)
  }
  // Grain de pellicule, léger scintillement, vignettage.
  const r = rng(Math.floor(t * 12) + 99)
  g.fillStyle = 'rgba(255, 255, 255, 0.06)'
  for (let k = 0; k < 24; k++) g.fillRect(r() * W, r() * H, 2, 2)
  g.fillStyle = `rgba(0, 0, 0, ${r() * 0.05})`
  g.fillRect(0, 0, W, H)
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, W * 0.62)
  v.addColorStop(0, 'rgba(0, 0, 0, 0)')
  v.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
}
