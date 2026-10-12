import { tr } from '../i18n'
import { icon } from '../icons'
import { ARENA_CHARACTERS, ARENA_PALETTE, ARENA_RULES, blastDamage, type CharacterId } from '../../shared/arena.js'

/*
 * La démonstration d'un personnage, sur sa fiche au terminal : une courte scène vue de dessus, en
 * boucle, aux couleurs de la partie (le joueur en jaune, les siens en bleu, ceux d'en face en rouge,
 * les soins en vert d'eau ; cf. palette.ts), qui montre son attaque et ce qu'il est seul à faire :
 * la rafale de Rourke, la tomate de Marcel qui éclabousse un groupe puis éclate au bout de sa course,
 * le laser de Nico qui traverse deux adversaires et Boulon qui fouille un buisson, la seringue de
 * Betty qui traverse un coéquipier en pleine forme, pique, puis soigne, la fleur de Capucine qui
 * s'arme et mord qui passe, le cocktail de Jacques et sa flaque. Les chiffres qui sautent sont ceux
 * des règles (ARENA_CHARACTERS, blastDamage). Un simple canevas 2D : la scène ne tourne que tant
 * qu'elle est affichée, et pas du tout si l'on a demandé moins d'animations (une image arrêtée sur
 * le coup, et un bouton pour la lancer).
 */

const W = 300, H = 168
/** Une tuile de l'arène, en pixels de la scène. */
const T = 24
const C = ARENA_CHARACTERS
const P = ARENA_PALETTE
const FLOWER = C.capucine.weapon.flower!, FIRE = C.jacques.weapon.fire!

type Rel = 'self' | 'ally' | 'enemy'
type Pt = { x: number; y: number }

const clamp01 = (u: number) => Math.min(1, Math.max(0, u))
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const mix = (a: Pt, b: Pt, u: number): Pt => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2
/** Le long d'un chemin (une suite de points), à `speed` pixels par seconde, parti à `start`. */
function along(path: Pt[], speed: number, t: number, start: number): Pt {
  let left = Math.max(0, t - start) * speed
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1], path[i])
    if (left <= d) return mix(path[i - 1], path[i], d ? left / d : 1)
    left -= d
  }
  return path[path.length - 1]
}

/** Ce qui saute au-dessus d'une tête : un chiffre de dégâts (blanc) ou de soin (vert d'eau). */
interface Pop { at: number; who: Pt; text: string; heal?: boolean }

/** Ce qu'une scène dessine à l'instant `t` (s), et ce qu'elle dit de sa durée et de son image clé. */
interface Scene {
  length: number
  /** L'instant qu'on montre à l'arrêt : le coup. */
  key: number
  draw(p: Painter, t: number): void
}

class Painter {
  constructor(readonly g: CanvasRenderingContext2D) {}

  floor() {
    const g = this.g
    g.fillStyle = '#12151b'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#ffffff0d'
    g.lineWidth = 1
    g.beginPath()
    for (let x = T / 2; x < W; x += T) g.moveTo(x, 0), g.lineTo(x, H)
    for (let y = T / 2; y < H; y += T) g.moveTo(0, y), g.lineTo(W, y)
    g.stroke()
  }

  wall(x: number, y: number, w: number, h: number) {
    const g = this.g
    g.fillStyle = '#3a4250'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#4b5566'
    g.fillRect(x, y, w, 3)
  }

  bush(at: Pt, r: number) {
    const g = this.g
    g.fillStyle = '#3f8a34'
    for (const [dx, dy, k] of [[-0.45, 0.1, 0.62], [0.45, 0.15, 0.6], [0, -0.35, 0.66], [0, 0.3, 0.7]]) {
      g.beginPath()
      g.arc(at.x + dx * r, at.y + dy * r, r * k, 0, Math.PI * 2)
      g.fill()
    }
  }

  /**
   * Un combattant : son anneau à la couleur de ce qu'il est pour le joueur (une flèche pour lui,
   * quatre dents pour un adversaire, comme en partie), sa barre de vie au-dessus.
   */
  body(at: Pt, rel: Rel, hp: number, max: number, opts: { yaw?: number; fill?: string; flash?: number; tag?: string; ghost?: boolean } = {}) {
    const g = this.g
    const color = P[rel]
    g.save()
    if (opts.ghost) g.globalAlpha = 0.35
    g.fillStyle = opts.fill ?? '#2a2f3a'
    g.beginPath()
    g.arc(at.x, at.y, 8, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = '#0b0d10'
    g.beginPath()
    g.arc(at.x, at.y, 11, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 2
    g.strokeStyle = opts.flash && opts.flash > 0 ? '#ffffff' : color
    g.beginPath()
    g.arc(at.x, at.y, 11, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = color
    if (rel === 'enemy') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        g.beginPath()
        g.moveTo(at.x + Math.cos(a) * 11, at.y + Math.sin(a) * 11)
        g.lineTo(at.x + Math.cos(a - 0.2) * 15, at.y + Math.sin(a - 0.2) * 15)
        g.lineTo(at.x + Math.cos(a + 0.2) * 15, at.y + Math.sin(a + 0.2) * 15)
        g.fill()
      }
    } else if (rel === 'self') {
      const a = opts.yaw ?? 0
      g.beginPath()
      g.moveTo(at.x + Math.cos(a) * 18, at.y + Math.sin(a) * 18)
      g.lineTo(at.x + Math.cos(a + 0.5) * 12.5, at.y + Math.sin(a + 0.5) * 12.5)
      g.lineTo(at.x + Math.cos(a - 0.5) * 12.5, at.y + Math.sin(a - 0.5) * 12.5)
      g.fill()
    }
    // La barre de vie : sa couleur, graduée tous les 25 points.
    const bw = 26, x = at.x - bw / 2, y = at.y - 22
    g.fillStyle = '#0b0d10cc'
    g.fillRect(x - 1, y - 1, bw + 2, 6)
    g.fillStyle = color
    g.fillRect(x, y, bw * clamp01(hp / max), 4)
    g.fillStyle = '#0b0d10'
    for (let k = 25; k < max; k += 25) g.fillRect(x + (bw * k) / max, y, 1, 4)
    if (opts.tag) {
      g.font = '700 8px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillStyle = '#0b0d10cc'
      const w = g.measureText(opts.tag).width + 6
      g.fillRect(at.x - w / 2, y - 12, w, 10)
      g.fillStyle = P.heal
      g.fillText(opts.tag, at.x, y - 4)
    }
    g.restore()
  }

  /** Une traînée (de `from` vers `to`, dont on voit le bout) et sa tête. */
  streak(from: Pt, to: Pt, color: string, head: string, width = 2.5) {
    const g = this.g
    g.lineCap = 'round'
    g.strokeStyle = '#0b0d1088'
    g.lineWidth = width + 2.5
    g.beginPath()
    g.moveTo(from.x, from.y)
    g.lineTo(to.x, to.y)
    g.stroke()
    g.strokeStyle = color
    g.lineWidth = width
    g.beginPath()
    g.moveTo(from.x, from.y)
    g.lineTo(to.x, to.y)
    g.stroke()
    g.fillStyle = head
    g.beginPath()
    g.arc(to.x, to.y, width * 0.9, 0, Math.PI * 2)
    g.fill()
  }

  /** Un cercle au sol : `fill` le voile, le bord plein ou en tirets. */
  ring(at: Pt, r: number, color: string, alpha = 1, dashed = false, fill = 0) {
    const g = this.g
    g.save()
    g.globalAlpha = alpha
    if (fill) {
      g.fillStyle = color
      g.globalAlpha = alpha * fill
      g.beginPath()
      g.arc(at.x, at.y, r, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = alpha
    }
    g.strokeStyle = color
    g.lineWidth = 2
    if (dashed) g.setLineDash([5, 4])
    g.beginPath()
    g.arc(at.x, at.y, r, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }

  /** Un éclat : des gouttes qui partent en étoile et s'effacent (`u` de 0 à 1). */
  burst(at: Pt, color: string, r: number, u: number, n = 10) {
    if (u < 0 || u >= 1) return
    const g = this.g
    g.save()
    g.globalAlpha = 1 - u
    g.fillStyle = color
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.7
      const d = r * (0.3 + u * (0.7 + (i % 3) * 0.15))
      g.beginPath()
      g.arc(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, 2.2 * (1 - u * 0.6), 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }

  /** Une onde au sol, qui s'élargit jusqu'à `r` et s'efface. */
  wave(at: Pt, color: string, r: number, u: number) {
    if (u < 0 || u >= 1) return
    this.ring(at, r * (0.3 + 0.7 * u), color, 1 - u)
  }

  /** La cloche d'un objet lancé : en pointillés, de la main au point de chute, et la croix au bout. */
  arc(from: Pt, to: Pt, peak: number, color: string, alpha = 1) {
    const g = this.g
    g.save()
    g.globalAlpha = alpha
    g.fillStyle = color
    for (let i = 1; i < 16; i++) {
      const u = i / 16
      const p = this.lob(from, to, peak, u)
      g.beginPath()
      g.arc(p.x, p.y, 1.4, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = color
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(to.x - 4, to.y - 4)
    g.lineTo(to.x + 4, to.y + 4)
    g.moveTo(to.x + 4, to.y - 4)
    g.lineTo(to.x - 4, to.y + 4)
    g.stroke()
    g.restore()
  }

  /** Où est un objet lancé, à `u` de sa course (la hauteur, vue de dessus, le décale vers le haut). */
  lob(from: Pt, to: Pt, peak: number, u: number): Pt {
    const p = mix(from, to, u)
    return { x: p.x, y: p.y - peak * 4 * u * (1 - u) }
  }

  shadow(at: Pt) {
    const g = this.g
    g.fillStyle = '#0006'
    g.beginPath()
    g.ellipse(at.x, at.y, 4, 2, 0, 0, Math.PI * 2)
    g.fill()
  }

  /** Les chiffres qui sautent, montent et s'effacent. */
  pops(list: Pop[], t: number) {
    const g = this.g
    g.font = '800 11px system-ui, sans-serif'
    g.textAlign = 'center'
    g.lineWidth = 3
    g.strokeStyle = '#0b0d10'
    for (const p of list) {
      const u = (t - p.at) / 0.9
      if (u < 0 || u >= 1) continue
      const y = p.who.y - 30 - u * 14
      g.globalAlpha = Math.min(1, (1 - u) * 2)
      g.strokeText(p.text, p.who.x, y)
      g.fillStyle = p.heal ? P.heal : '#ffffff'
      g.fillText(p.text, p.who.x, y)
    }
    g.globalAlpha = 1
  }

  /** Un éclair blanc, à la bouche de l'arme. */
  flash(at: Pt, u: number, r = 6) {
    if (u < 0 || u >= 1) return
    const g = this.g
    g.save()
    g.globalAlpha = 1 - u
    g.fillStyle = '#fff6c0'
    g.beginPath()
    g.arc(at.x, at.y, r * (1 - u * 0.5), 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  /** L'anneau du rechargement, qui se referme autour du joueur (`u` de 0 à 1). */
  reload(at: Pt, u: number) {
    if (u <= 0 || u >= 1) return
    const g = this.g
    g.strokeStyle = P.self
    g.lineWidth = 2
    g.beginPath()
    g.arc(at.x, at.y, 17, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2)
    g.stroke()
  }
}

/** Les points de vie d'un combattant à `t` : ce qui l'a touché avant, soins compris. */
function hpAt(max: number, start: number, pops: Pop[], who: Pt, t: number) {
  let hp = start
  for (const p of pops) {
    if (p.who !== who || p.at > t) continue
    const n = Number(p.text.replace('+', ''))
    hp = p.heal ? Math.min(max, hp + n) : Math.max(0, hp - n)
  }
  return hp
}

const toward = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x)

// --------------------------------------------------------------- les scènes

/** Rourke : une rafale de huit balles sur un adversaire qui bouge, puis le rechargement. */
function rourke(): Scene {
  const w = C.rourke.weapon
  const me = { x: 46, y: 96 }
  const speed = 300
  const foeAt = (t: number) => ({ x: 236, y: 74 + Math.sin(t * 1.4) * 14 })
  const shots = Array.from({ length: w.burst ?? 8 }, (_, i) => {
    const at = 0.35 + i * w.interval * 1.3
    const end = foeAt(at + 0.6)
    const fly = dist(me, end) / speed
    // Un peu de dispersion : la rafale s'ouvre.
    const off = [0, 3, -2, 5, -4, 2, -5, 4][i % 8]
    return { at, fly, end: { x: end.x, y: end.y + off } }
  })
  const foe = { x: 0, y: 0 }
  const pops: Pop[] = shots.map((s) => ({ at: s.at + s.fly, who: foe, text: String(w.damage) }))
  const last = shots[shots.length - 1]
  const reloadAt = last.at + last.fly + 0.3
  return {
    length: reloadAt + w.reload + 0.5,
    key: shots[3].at + shots[3].fly,
    draw(p, t) {
      p.floor()
      Object.assign(foe, foeAt(t))
      for (const s of shots) {
        const u = (t - s.at) / s.fly
        p.flash({ x: me.x + 14, y: me.y + (s.end.y - me.y) * 0.08 }, (t - s.at) / 0.06, 5)
        if (u < 0 || u >= 1) continue
        p.streak(mix(me, s.end, Math.max(0, u - 0.12)), mix(me, s.end, u), P.self, '#ffffff', 2.2)
      }
      for (const s of shots) p.burst(s.end, '#ffd23c', 10, (t - s.at - s.fly) / 0.25, 5)
      p.body(foe, 'enemy', hpAt(100, 100, pops, foe, t), 100, { flash: pops.some((x) => t - x.at >= 0 && t - x.at < 0.08) ? 1 : 0 })
      p.body(me, 'self', 100, 100, { yaw: toward(me, foeAt(t)), fill: '#4fc3ff' })
      p.reload(me, (t - reloadAt) / w.reload)
      p.pops(pops, t)
    },
  }
}

/**
 * Marcel : une tomate qui éclabousse un groupe ; une autre qui éclate au bout de sa course, tout
 * près d'un adversaire qu'elle n'a pas touché : pas besoin de viser juste.
 */
function marcel(): Scene {
  const w = C.marcel.weapon
  const me = { x: 52, y: 98 }
  const a = { x: 196, y: 70 }, b = { x: 214, y: 86 }, c = { x: 166, y: 142 }
  const speed = 150
  const hit1 = { x: a.x, y: a.y }
  // Au bout de sa portée, dans la direction visée (un peu à côté de lui).
  const aim = Math.atan2(136 - me.y, 166 - me.x)
  const hit2 = { x: me.x + Math.cos(aim) * w.range * T, y: me.y + Math.sin(aim) * w.range * T }
  const t1 = 0.35, f1 = dist(me, hit1) / speed
  const t2 = 1.9, f2 = dist(me, hit2) / speed
  const reach = (w.blast + ARENA_RULES.body.r) * T
  const dmg = (from: Pt, to: Pt) => String(blastDamage(w, dist(from, to) / T))
  const pops: Pop[] = [
    { at: t1 + f1, who: a, text: dmg(hit1, a) },
    { at: t1 + f1, who: b, text: dmg(hit1, b) },
    { at: t2 + f2, who: c, text: dmg(hit2, c) },
  ]
  return {
    length: t2 + f2 + 1.6,
    key: t1 + f1 + 0.05,
    draw(p, t) {
      p.floor()
      for (const [at, f, to] of [[t1, f1, hit1], [t2, f2, hit2]] as [number, number, Pt][]) {
        const u = (t - at) / f
        p.flash({ x: me.x + 14, y: me.y }, (t - at) / 0.08, 7)
        if (u >= 0 && u < 1) {
          const pos = mix(me, to, u)
          p.g.fillStyle = '#e8321e'
          p.g.beginPath()
          p.g.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2)
          p.g.fill()
          p.g.fillStyle = '#4caf50'
          p.g.fillRect(pos.x - 1, pos.y - 6, 2, 3)
        }
        // L'éclaboussure : une onde jusqu'au bord de sa zone, du jus tout autour.
        p.wave(to, '#ff5a3c', reach, (t - at - f) / 0.45)
        p.burst(to, '#e8321e', reach, (t - at - f) / 0.5, 12)
      }
      for (const who of [a, b, c]) p.body(who, 'enemy', hpAt(100, 100, pops, who, t), 100, { flash: pops.some((x) => x.who === who && t - x.at >= 0 && t - x.at < 0.1) ? 1 : 0 })
      p.body(me, 'self', 170, 170, { yaw: t < t2 ? toward(me, hit1) : aim, fill: '#ff5a3c' })
      p.pops(pops, t)
    },
  }
}

/** Nico : le laser traverse deux adversaires alignés ; Boulon fouille un buisson et y trouve le troisième. */
function nico(): Scene {
  const w = C.nico.weapon
  const me = { x: 34, y: 108 }
  const a = { x: 128, y: 108 }, b = { x: 204, y: 108 }
  const bush = { x: 84, y: 56 }
  const d = { x: 84, y: 56 }
  const end1 = { x: me.x + w.range * T, y: me.y }
  const dir2 = toward(me, d)
  const end2 = { x: me.x + Math.cos(dir2) * w.range * T, y: me.y + Math.sin(dir2) * w.range * T }
  const t1 = 0.45, scan = 1.25, t2 = 2.1
  const pops: Pop[] = [
    { at: t1, who: a, text: String(w.damage) },
    { at: t1 + 0.02, who: b, text: String(w.damage) },
    { at: t2, who: d, text: String(w.damage) },
  ]
  return {
    length: t2 + 1.4,
    key: t1 + 0.05,
    draw(p, t) {
      p.floor()
      // Boulon, à l'épaule de Nico : il flotte, et balaie le buisson de son scanner.
      const bolt = { x: me.x - 7, y: me.y - 18 + Math.sin(t * 5) * 1.5 }
      const scanning = t >= scan && t < t2 + 0.6
      const seen = t >= scan + 0.25
      if (scanning) {
        const g = p.g
        g.save()
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 20)
        g.fillStyle = '#ff3b2f'
        g.beginPath()
        g.moveTo(bolt.x, bolt.y)
        const a0 = toward(bolt, bush)
        g.arc(bolt.x, bolt.y, dist(bolt, bush) + 16, a0 - 0.28, a0 + 0.28)
        g.closePath()
        g.fill()
        g.restore()
      }
      // Caché dans le buisson, on ne le voit pas ; Boulon le trouve.
      p.bush(bush, 17)
      if (seen) p.body(d, 'enemy', hpAt(100, 100, pops, d, t), 100, { flash: t - t2 >= 0 && t - t2 < 0.1 ? 1 : 0 })
      // Le laser : un trait qui part jusqu'au bout de la portée, et s'efface.
      for (const [at, end] of [[t1, end1], [t2, end2]] as [number, Pt][]) {
        const u = (t - at) / 0.35
        if (u < 0 || u >= 1) continue
        p.g.save()
        p.g.globalAlpha = 1 - u
        p.streak(me, end, P.self, '#ffffff', 3.2 * (1 - u * 0.5))
        p.g.restore()
        p.flash({ x: me.x + Math.cos(toward(me, end)) * 14, y: me.y + Math.sin(toward(me, end)) * 14 }, u * 2, 7)
      }
      for (const who of [a, b]) p.body(who, 'enemy', hpAt(100, 100, pops, who, t), 100, { flash: t - t1 >= 0 && t - t1 < 0.1 ? 1 : 0 })
      p.body(me, 'self', C.nico.hp, C.nico.hp, { yaw: t < scan ? 0 : dir2, fill: '#ff9a2e' })
      p.g.fillStyle = '#dfe3e8'
      p.g.beginPath()
      p.g.arc(bolt.x, bolt.y, 4, 0, Math.PI * 2)
      p.g.fill()
      p.g.fillStyle = '#3fe0ff'
      p.g.fillRect(bolt.x - 1, bolt.y - 1, 2, 2)
      p.pops(pops, t)
    },
  }
}

/** Betty : sa seringue traverse un coéquipier en pleine forme et pique ; puis elle soigne le blessé. */
function betty(): Scene {
  const w = C.betty.weapon
  const me = { x: 44, y: 100 }
  const foe = { x: 252, y: 60 }, full = { x: 150, y: 80 }, hurt = { x: 182, y: 130 }
  const speed = 190
  const shots = [
    { at: 0.35, to: foe, heal: false },
    { at: 1.75, to: hurt, heal: true },
    { at: 2.6, to: hurt, heal: true },
  ].map((s) => ({ ...s, fly: dist(me, s.to) / speed }))
  const pops: Pop[] = shots.map((s) => ({ at: s.at + s.fly, who: s.to, text: s.heal ? `+${w.heal}` : String(w.damage), heal: s.heal }))
  return {
    length: shots[2].at + shots[2].fly + 1.2,
    key: shots[1].at + shots[1].fly + 0.1,
    draw(p, t) {
      p.floor()
      for (const s of shots) {
        const u = (t - s.at) / s.fly
        // Le soin : un trait vert d'eau relie un instant Betty au soigné.
        const k = (t - s.at - s.fly) / 0.5
        if (s.heal && k >= 0 && k < 1) {
          p.g.save()
          p.g.globalAlpha = 1 - k
          p.g.strokeStyle = P.heal
          p.g.lineWidth = 2
          p.g.setLineDash([4, 3])
          p.g.beginPath()
          p.g.moveTo(me.x, me.y)
          p.g.lineTo(s.to.x, s.to.y)
          p.g.stroke()
          p.g.restore()
          p.wave(s.to, P.heal, 20, k)
        }
        if (u < 0 || u >= 1) continue
        const head = mix(me, s.to, u)
        p.streak(mix(me, s.to, Math.max(0, u - 0.15)), head, s.heal ? P.heal : P.self, '#ffffff', 2)
        // La seringue : le corps blanc, la dose rose pour piquer, vert d'eau pour soigner.
        const g = p.g, a = toward(me, s.to)
        g.save()
        g.translate(head.x, head.y)
        g.rotate(a)
        g.fillStyle = '#f2f4f7'
        g.fillRect(-9, -2, 9, 4)
        g.fillStyle = s.heal ? P.heal : '#ff5fa2'
        g.fillRect(-7, -1.5, 5, 3)
        g.fillStyle = '#c9ced6'
        g.fillRect(0, -0.5, 5, 1)
        g.restore()
      }
      // Un coéquipier en pleine forme sur sa ligne : la seringue le traverse (« PV max »).
      const aimingFull = t >= 0.1 && t < shots[0].at + shots[0].fly
      p.body(full, 'ally', 100, 100, { tag: aimingFull ? tr('PV max', 'Max HP') : undefined })
      p.body(hurt, 'ally', hpAt(100, 40, pops, hurt, t), 100, { flash: pops.some((x) => x.who === hurt && t - x.at >= 0 && t - x.at < 0.12) ? 1 : 0 })
      p.body(foe, 'enemy', hpAt(100, 100, pops, foe, t), 100, { flash: t - pops[0].at >= 0 && t - pops[0].at < 0.1 ? 1 : 0 })
      // Les croix du soin, qui montent du soigné.
      for (const s of shots) {
        const k = (t - s.at - s.fly) / 0.8
        if (!s.heal || k < 0 || k >= 1) continue
        p.g.save()
        p.g.globalAlpha = 1 - k
        p.g.fillStyle = P.heal
        for (const dx of [-8, 7]) {
          const y = s.to.y - 6 - k * 18 - (dx > 0 ? 5 : 0)
          p.g.fillRect(s.to.x + dx - 3, y - 1, 6, 2)
          p.g.fillRect(s.to.x + dx - 1, y - 3, 2, 6)
        }
        p.g.restore()
      }
      let aim = shots[0]
      for (const s of shots) if (t >= s.at - 0.2) aim = s
      p.body(me, 'self', C.betty.hp, C.betty.hp, { yaw: toward(me, aim.to), fill: '#ff7bc0' })
      p.pops(pops, t)
    },
  }
}

/** Capucine : une graine par-dessus le mur ; la fleur pousse, s'arme sur qui passe, mord, et fane. */
function capucine(): Scene {
  const me = { x: 40, y: 112 }
  const wall = { x: 106, y: 34, w: 12, h: 112 }
  const spot = { x: 196, y: 96 }
  const reach = (FLOWER.radius + ARENA_RULES.body.r) * T
  const throwAt = 0.45, fly = 0.8, landed = throwAt + fly
  const path = [{ x: 286, y: 22 }, { x: 236, y: 70 }, { x: 214, y: 126 }, { x: 262, y: 160 }]
  const walkFrom = 1.3, pace = 60
  const foeAt = (t: number) => along(path, pace, t, walkFrom)
  // Ses morsures, d'après le chemin : elle s'arme dès que la proie est à portée, mord `windup` plus
  // tard si elle y est encore, et recommence toutes les `every` secondes.
  const bites: { arm: number; at: number }[] = []
  const grown = landed + FLOWER.grow
  for (let t = grown, armAt = -1; t < landed + 4; t += 0.02) {
    const inside = dist(foeAt(t), spot) <= reach
    if (armAt < 0 && inside && (!bites.length || t >= bites[bites.length - 1].at + FLOWER.every - FLOWER.windup)) armAt = t
    if (armAt >= 0 && t >= armAt + FLOWER.windup) {
      if (inside) bites.push({ arm: armAt, at: t })
      armAt = -1
    }
  }
  const foe = { x: 0, y: 0 }
  const pops: Pop[] = bites.map((b) => ({ at: b.at, who: foe, text: String(C.capucine.weapon.damage) }))
  const wiltAt = landed + 3.6
  return {
    length: wiltAt + 1,
    key: bites.length ? bites[0].arm + 0.2 : landed + 0.5,
    draw(p, t) {
      p.floor()
      p.wall(wall.x, wall.y, wall.w, wall.h)
      Object.assign(foe, foeAt(t))
      const alive = t >= landed && t < wiltAt + 0.5
      // Sa portée au sol : à la couleur des siens (c'est la fleur du joueur).
      if (t < throwAt) p.arc(me, spot, 46, '#ffffff', 0.85)
      if (t >= throwAt && t < landed) p.ring(spot, reach * clamp01((t - throwAt) / fly), P.self, 0.8, false, 0.12)
      if (alive) p.ring(spot, reach, P.ally, t >= wiltAt ? 1 - (t - wiltAt) / 0.5 : 0.9, false, 0.08)
      // La graine, en cloche, et la poussière verte qu'elle laisse.
      const u = (t - throwAt) / fly
      if (u >= 0 && u < 1) {
        const pos = p.lob(me, spot, 46, u)
        p.shadow(mix(me, spot, u))
        p.g.fillStyle = '#c8a24a'
        p.g.beginPath()
        p.g.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2)
        p.g.fill()
        for (let k = 1; k < 5; k++) {
          const q = p.lob(me, spot, 46, Math.max(0, u - k * 0.05))
          p.g.fillStyle = `rgba(166, 255, 106, ${0.5 - k * 0.1})`
          p.g.fillRect(q.x - 1, q.y - 1, 2, 2)
        }
      }
      p.burst(spot, '#7a5230', 16, (t - landed) / 0.4, 9)
      if (alive) {
        // La fleur : elle jaillit d'un élan ; armée, sa tête se tourne vers sa proie et s'ouvre grand.
        const grow = easeOutBack(clamp01((t - landed) / FLOWER.grow))
        const wilt = clamp01((t - wiltAt) / 0.5)
        const arming = bites.find((b) => t >= b.arm && t < b.at)
        const bit = bites.find((b) => t >= b.at && t < b.at + 0.2)
        const a = arming || bit ? toward(spot, foe) : Math.sin(t * 2) * 0.6 - Math.PI / 2
        const lunge = bit ? Math.sin(((t - bit.at) / 0.2) * Math.PI) * 8 : 0
        const s = grow * (1 - wilt * 0.7)
        const g = p.g
        g.save()
        g.translate(spot.x, spot.y)
        g.fillStyle = wilt ? '#8a7340' : '#5fae45'
        for (let i = 0; i < 4; i++) {
          g.beginPath()
          g.ellipse(Math.cos(i * 1.57 + 0.4) * 7 * s, Math.sin(i * 1.57 + 0.4) * 7 * s, 6 * s, 2.5 * s, i * 1.57 + 0.4, 0, Math.PI * 2)
          g.fill()
        }
        const head = { x: Math.cos(a) * (6 + lunge) * s, y: Math.sin(a) * (6 + lunge) * s }
        const open = arming ? 0.9 : bit ? 0.1 : 0.45
        g.translate(head.x, head.y)
        g.rotate(a)
        g.fillStyle = wilt ? '#7a4a2c' : '#c8321e'
        g.beginPath()
        g.arc(0, 0, 7 * s * (arming ? 1.2 : 1), open, Math.PI * 2 - open)
        g.lineTo(0, 0)
        g.fill()
        if (arming && !wilt) {
          g.fillStyle = '#ff5a3c'
          g.beginPath()
          g.arc(0, 0, 4 * s, -open * 0.6, open * 0.6)
          g.lineTo(0, 0)
          g.fill()
        }
        g.restore()
      }
      p.body(foe, 'enemy', hpAt(100, 100, pops, foe, t), 100, { flash: pops.some((x) => t - x.at >= 0 && t - x.at < 0.1) ? 1 : 0 })
      p.body(me, 'self', C.capucine.hp, C.capucine.hp, { yaw: toward(me, spot), fill: '#8ad94a' })
      p.pops(pops, t)
    },
  }
}

/** Jacques : un cocktail par-dessus le mur, la boule de feu, et la flaque qui brûle qui s'y tient. */
function jacques(): Scene {
  const w = C.jacques.weapon
  const me = { x: 44, y: 104 }
  const wall = { x: 110, y: 46, w: 12, h: 96 }
  const spot = { x: 200, y: 96 }
  const throwAt = 0.45, fly = 0.85, landed = throwAt + fly
  const blast = (w.blast + ARENA_RULES.body.r) * T, burn = (FIRE.radius + ARENA_RULES.body.r) * T
  const a0 = { x: 204, y: 90 }, b0 = { x: 220, y: 110 }
  // Le premier reste dans les flammes un moment ; le second en sort tout de suite.
  const aAt = (t: number) => along([a0, { x: 262, y: 44 }], 60, t, landed + 0.9)
  const bAt = (t: number) => along([b0, { x: 270, y: 150 }], 70, t, landed + 0.1)
  const a = { ...a0 }, b = { ...b0 }
  const pops: Pop[] = [
    { at: landed, who: a, text: String(blastDamage(w, dist(spot, a0) / T)) },
    { at: landed, who: b, text: String(blastDamage(w, dist(spot, b0) / T)) },
  ].filter((x) => x.text !== '0')
  for (let t = landed + FIRE.every; t < landed + FIRE.life; t += FIRE.every) {
    if (dist(aAt(t), spot) <= burn) pops.push({ at: t, who: a, text: String(FIRE.damage) })
    if (dist(bAt(t), spot) <= burn) pops.push({ at: t, who: b, text: String(FIRE.damage) })
  }
  const out = landed + FIRE.life
  return {
    length: out + 0.9,
    key: landed + 0.08,
    draw(p, t) {
      p.floor()
      p.wall(wall.x, wall.y, wall.w, wall.h)
      Object.assign(a, aAt(t))
      Object.assign(b, bAt(t))
      if (t < throwAt) p.arc(me, spot, 50, '#ffffff', 0.85)
      if (t >= throwAt && t < landed) p.ring(spot, blast * clamp01((t - throwAt) / fly), P.self, 0.8, false, 0.12)
      // La flaque : une nappe verte, un liseré sombre, des flammèches orange tout le long du bord.
      if (t >= landed && t < out + 0.4) {
        const fade = t < out ? 1 : 1 - (t - out) / 0.4
        const g = p.g
        g.save()
        g.globalAlpha = 0.85 * fade
        const fill = g.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, FIRE.radius * T)
        fill.addColorStop(0, '#e2ff78')
        fill.addColorStop(0.6, '#96d628')
        fill.addColorStop(0.92, '#548c12')
        fill.addColorStop(1, '#284608')
        g.fillStyle = fill
        g.beginPath()
        g.arc(spot.x, spot.y, FIRE.radius * T * Math.min(1, (t - landed) / 0.15), 0, Math.PI * 2)
        g.fill()
        for (let i = 0; i < 14; i++) {
          const k = (i / 14) * Math.PI * 2
          const h = 5 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 6
          const x = spot.x + Math.cos(k) * FIRE.radius * T * 0.9, y = spot.y + Math.sin(k) * FIRE.radius * T * 0.9
          g.fillStyle = '#ff6a14'
          g.beginPath()
          g.moveTo(x - 2.5, y)
          g.lineTo(x, y - h * fade)
          g.lineTo(x + 2.5, y)
          g.fill()
          g.fillStyle = '#ffe45c'
          g.beginPath()
          g.moveTo(x - 1.2, y)
          g.lineTo(x, y - h * 0.55 * fade)
          g.lineTo(x + 1.2, y)
          g.fill()
        }
        g.restore()
        p.ring(spot, burn, P.ally, 0.8 * fade)
        // Le temps qui lui reste : un arc qui se rétracte.
        g.strokeStyle = P.ally
        g.lineWidth = 3
        g.beginPath()
        g.arc(spot.x, spot.y, burn + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01((out - t) / FIRE.life))
        g.stroke()
      }
      // Le cocktail : il tournoie en cloche, et éclate en boule de feu.
      const u = (t - throwAt) / fly
      if (u >= 0 && u < 1) {
        const pos = p.lob(me, spot, 50, u)
        p.shadow(mix(me, spot, u))
        const g = p.g
        g.save()
        g.translate(pos.x, pos.y)
        g.rotate(u * Math.PI * 5)
        g.fillStyle = '#d8e8f0'
        g.fillRect(-2, -7, 4, 9)
        g.fillStyle = '#b6ff3a'
        g.fillRect(-2, -3, 4, 5)
        g.restore()
      }
      p.wave(spot, '#ff8a1c', blast, (t - landed) / 0.35)
      p.burst(spot, '#ffd23c', blast, (t - landed) / 0.45, 14)
      p.body(a, 'enemy', hpAt(100, 100, pops, a, t), 100, { flash: pops.some((x) => x.who === a && t - x.at >= 0 && t - x.at < 0.1) ? 1 : 0 })
      p.body(b, 'enemy', hpAt(100, 100, pops, b, t), 100, { flash: pops.some((x) => x.who === b && t - x.at >= 0 && t - x.at < 0.1) ? 1 : 0 })
      p.body(me, 'self', C.jacques.hp, C.jacques.hp, { yaw: toward(me, spot), fill: '#b6ff3a' })
      p.pops(pops, t)
    },
  }
}

const SCENES: Record<CharacterId, () => Scene> = { rourke, marcel, nico, betty, capucine, jacques }

/**
 * La démonstration, sur la fiche : un canevas, et un bouton pour la lancer ou l'arrêter. Elle ne
 * tourne que tant qu'elle est dans la page et visible.
 */
export class AttackDemo {
  readonly root: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly painter: Painter
  private readonly toggle: HTMLButtonElement
  private scene: Scene | null = null
  private id: CharacterId | null = null
  private t = 0
  private last = 0
  private frame = 0
  private playing: boolean

  constructor() {
    this.root = document.createElement('figure')
    this.root.className = 'arena-demo'
    this.canvas.setAttribute('role', 'img')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = W * dpr
    this.canvas.height = H * dpr
    const g = this.canvas.getContext('2d')!
    g.scale(dpr, dpr)
    this.painter = new Painter(g)
    this.toggle = document.createElement('button')
    this.toggle.type = 'button'
    this.toggle.className = 'arena-demo-toggle'
    this.toggle.addEventListener('click', () => this.play(!this.playing))
    this.toggle.dataset.key = 'demo'
    this.root.append(this.canvas, this.toggle)
    // Moins d'animations demandées : une image arrêtée, qu'un bouton lance.
    this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches
    this.label()
  }

  /** Montre la scène de ce personnage, depuis son début (ou arrêtée sur son coup). */
  show(id: CharacterId, name: string) {
    if (id === this.id) return
    this.id = id
    this.scene = SCENES[id]()
    this.t = this.playing ? 0 : this.scene.key
    this.canvas.setAttribute('aria-label', tr(`Démonstration : l'attaque de ${name}`, `Demo: ${name}'s attack`))
    this.draw()
    if (this.playing) this.run()
  }

  play(on: boolean) {
    this.playing = on
    this.label()
    if (on) this.run()
    else if (this.scene) {
      this.t = this.scene.key
      this.draw()
    }
  }

  /** Relance la boucle (la fiche vient d'être affichée). */
  run() {
    if (!this.playing || this.frame) return
    this.last = performance.now()
    const tick = (now: number) => {
      this.frame = 0
      // Hors de la page, ou panneau fermé : elle s'arrête ; elle reprendra à son retour (cf. run).
      if (!this.playing || !this.root.isConnected || !this.root.offsetParent || document.hidden || !this.scene) return
      this.t = (this.t + Math.min(0.1, (now - this.last) / 1000)) % this.scene.length
      this.last = now
      this.draw()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private draw() {
    if (this.scene) this.scene.draw(this.painter, this.t)
  }

  private label() {
    this.toggle.replaceChildren(icon(this.playing ? 'pause' : 'play'))
    this.toggle.setAttribute('aria-label', this.playing ? tr('Arrêter la démonstration', 'Pause the demo') : tr('Lancer la démonstration', 'Play the demo'))
    this.toggle.title = this.toggle.getAttribute('aria-label')!
  }
}
