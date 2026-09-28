import { tr } from '../i18n'
import { ED_ORANGE, rng } from './kit'

/*
 * Les affiches des faux films d'Elite, dessinées au canvas : illustration pleine page, titre
 * composé pour chaque film, accroche, bloc de générique, mention de sortie. On les voit de loin
 * et de biais : de grandes masses, des contrastes francs, et le détail pour qui s'approche.
 */

export const POSTER_W = 320
export const POSTER_H = 468
const W = POSTER_W, H = POSTER_H

type Ctx = CanvasRenderingContext2D

interface Feature {
  /** Illustration, sur toute l'affiche. */
  art: (c: Ctx, r: () => number) => void
  /** Titre, composé à la façon du film ; renvoie le bas du titre. */
  title: (c: Ctx) => number
  tagline: string
  /** Couleur de l'accroche. */
  ink: string
  /** Fond du bas de l'affiche, sous le générique. */
  foot: string
}

// ---------------------------------------------------------------- outils de dessin

/** Ciel étoilé : quelques étoiles vives et beaucoup de poussière. */
function stars(c: Ctx, r: () => number, n: number, top = 0, bottom = H, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const s = r() < 0.08 ? 1.6 + r() * 1.2 : 0.6 + r() * 0.8
    c.globalAlpha = alpha * (0.25 + r() * 0.75)
    c.fillStyle = r() < 0.15 ? '#ffe2c4' : r() < 0.3 ? '#cfe0ff' : '#ffffff'
    c.fillRect(r() * W, top + r() * (bottom - top), s, s)
  }
  c.globalAlpha = 1
}

/** Étoile brillante, en croix. */
function sparkle(c: Ctx, x: number, y: number, size: number, color: string) {
  const halo = c.createRadialGradient(x, y, 0, x, y, size)
  halo.addColorStop(0, color)
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
  c.fillStyle = halo
  c.fillRect(x - size, y - size, size * 2, size * 2)
  c.fillStyle = '#ffffff'
  c.globalAlpha = 0.9
  c.fillRect(x - size * 1.4, y - 0.5, size * 2.8, 1)
  c.fillRect(x - 0.5, y - size * 1.4, 1, size * 2.8)
  c.globalAlpha = 1
}

/** Texte centré, espacé ; `maxWidth` le resserre s'il déborde. */
function spaced(c: Ctx, text: string, y: number, font: string, color: string, tracking = 0, maxWidth = W - 28) {
  c.font = font
  c.fillStyle = color
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  c.letterSpacing = `${tracking}px`
  // L'espacement s'ajoute aussi après la dernière lettre : on recentre.
  c.fillText(text, W / 2 + tracking / 2, y, maxWidth)
  c.letterSpacing = '0px'
}

/** Coins de visée du HUD d'Elite autour d'un point. */
function brackets(c: Ctx, x: number, y: number, s: number, color: string) {
  c.strokeStyle = color
  c.lineWidth = 1.5
  const k = s * 0.45
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    c.beginPath()
    c.moveTo(x + dx * s, y + dy * (s - k))
    c.lineTo(x + dx * s, y + dy * s)
    c.lineTo(x + dx * (s - k), y + dy * s)
    c.stroke()
  }
}

/** Silhouette de buste de profil, tournée vers +x (`dir` = 1) ou -x. */
function bust(c: Ctx, x: number, y: number, s: number, dir: 1 | -1, hair: 'short' | 'bun') {
  c.save()
  c.translate(x, y)
  c.scale(dir * s, s)
  c.beginPath()
  // Épaules et dos, col de la combinaison de vol.
  c.moveTo(-60, 120)
  c.bezierCurveTo(-58, 70, -40, 52, -14, 46)
  c.lineTo(-10, 30)
  // Nuque, crâne, front, nez, lèvres, menton.
  c.bezierCurveTo(-22, 22, -26, -2, -18, -18)
  c.bezierCurveTo(-8, -36, 16, -38, 26, -24)
  c.bezierCurveTo(30, -16, 30, -8, 31, -2)
  c.lineTo(37, 8)
  c.lineTo(31, 11)
  c.lineTo(33, 17)
  c.lineTo(30, 20)
  c.bezierCurveTo(30, 28, 24, 32, 14, 32)
  c.lineTo(16, 44)
  c.bezierCurveTo(40, 52, 56, 72, 58, 120)
  c.closePath()
  c.fill()
  if (hair === 'bun') {
    c.beginPath()
    c.arc(-20, -22, 11, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

// ---------------------------------------------------------------- les films

const FEATURES: Record<string, Feature> = {
  // Le trajet le plus long d'Elite : 0,22 année-lumière de supercroisière jusqu'à Hutton Orbital.
  hutton: {
    tagline: tr('0,22 année-lumière. Une éternité.', '0.22 light years. An eternity.'),
    ink: '#ffb47a',
    foot: '#07060d',
    art(c, r) {
      const sky = c.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#03040b')
      sky.addColorStop(0.5, '#0b0e2a')
      sky.addColorStop(0.78, '#2a0f1c')
      sky.addColorStop(1, '#07060d')
      c.fillStyle = sky
      c.fillRect(0, 0, W, H)
      // La Voie lactée en écharpe, et sa poussière d'étoiles.
      c.save()
      c.translate(W / 2, 150)
      c.rotate(-0.5)
      const band = c.createLinearGradient(0, -60, 0, 60)
      band.addColorStop(0, 'rgba(120, 130, 220, 0)')
      band.addColorStop(0.5, 'rgba(150, 140, 230, 0.22)')
      band.addColorStop(1, 'rgba(120, 130, 220, 0)')
      c.fillStyle = band
      c.fillRect(-300, -60, 600, 120)
      c.restore()
      stars(c, r, 260, 0, 330)
      // Proxima, naine rouge, en bas de l'affiche : couronne, disque, granulation.
      const [px, py, pr] = [70, 470, 200]
      const corona = c.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.6)
      corona.addColorStop(0, 'rgba(255, 110, 50, 0.55)')
      corona.addColorStop(1, 'rgba(255, 60, 30, 0)')
      c.fillStyle = corona
      c.fillRect(0, 150, W, H - 150)
      const disc = c.createRadialGradient(px + 60, py - 150, 10, px, py, pr)
      disc.addColorStop(0, '#ffd9a0')
      disc.addColorStop(0.35, '#ff8a3c')
      disc.addColorStop(0.8, '#c8321c')
      disc.addColorStop(1, '#6e120c')
      c.fillStyle = disc
      c.beginPath()
      c.arc(px, py, pr, 0, Math.PI * 2)
      c.fill()
      c.save()
      c.clip()
      for (let i = 0; i < 160; i++) {
        const a = r() * Math.PI * 2, d = r() * pr
        c.fillStyle = r() < 0.5 ? 'rgba(120, 20, 10, 0.1)' : 'rgba(255, 220, 160, 0.08)'
        c.beginPath()
        c.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, 3 + r() * 9, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
      // La trajectoire : une longue courbe depuis l'étoile, fine, puis la traînée bleue du vaisseau.
      const [sx, sy] = [226, 104]
      c.strokeStyle = 'rgba(200, 220, 255, 0.35)'
      c.lineWidth = 1
      c.setLineDash([2, 5])
      c.beginPath()
      c.moveTo(150, 300)
      c.quadraticCurveTo(150, 170, sx, sy)
      c.stroke()
      c.setLineDash([])
      const trail = c.createLinearGradient(170, 200, sx, sy)
      trail.addColorStop(0, 'rgba(120, 190, 255, 0)')
      trail.addColorStop(1, 'rgba(190, 230, 255, 0.95)')
      c.strokeStyle = trail
      c.lineWidth = 2.5
      c.beginPath()
      c.moveTo(166, 196)
      c.quadraticCurveTo(178, 136, sx, sy)
      c.stroke()
      sparkle(c, sx, sy, 9, 'rgba(160, 210, 255, 0.9)')
      // Hutton Orbital, tout là-haut : un point, les coins de visée, la distance qui n'en finit pas.
      sparkle(c, 262, 52, 6, 'rgba(255, 230, 200, 0.8)')
      brackets(c, 262, 52, 11, ED_ORANGE)
      c.font = '600 9px ui-monospace, Menlo, monospace'
      c.fillStyle = ED_ORANGE
      c.textAlign = 'right'
      c.fillText('HUTTON ORBITAL', 250, 76)
      c.fillStyle = 'rgba(255, 180, 110, 0.8)'
      c.fillText(tr('6 784 234 SL', '6,784,234 LS'), 250, 87)
    },
    title(c) {
      c.shadowColor = 'rgba(255, 150, 80, 0.55)'
      c.shadowBlur = 14
      spaced(c, 'HUTTON', 340, '200 50px "Helvetica Neue", system-ui, sans-serif', '#fff6ec', 12)
      spaced(c, 'ORBITAL', 380, '200 34px "Helvetica Neue", system-ui, sans-serif', '#ffd9b8', 16)
      c.shadowBlur = 0
      return 380
    },
  },

  // Un film d'horreur : un Interceptor thargoïde, vu d'un cockpit à la verrière fêlée.
  thargoid: {
    tagline: tr('Dans l\'espace, personne ne vous entend scanner.', 'In space, no one can hear you scan.'),
    ink: '#8dffc0',
    foot: '#010504',
    art(c, r) {
      const sky = c.createRadialGradient(W / 2, 140, 10, W / 2, 180, 330)
      sky.addColorStop(0, '#1d5a4a')
      sky.addColorStop(0.45, '#062019')
      sky.addColorStop(1, '#010504')
      c.fillStyle = sky
      c.fillRect(0, 0, W, H)
      stars(c, r, 120, 0, 300, 0.7)
      // L'Interceptor : huit pétales sombres autour d'un cœur qui luit.
      const [tx, ty] = [W / 2, 128]
      c.save()
      c.translate(tx, ty)
      c.rotate(0.2)
      for (let i = 0; i < 8; i++) {
        c.save()
        c.rotate((i / 8) * Math.PI * 2)
        const long = i % 2 ? 108 : 150
        const petal = c.createLinearGradient(0, 0, 0, -long)
        petal.addColorStop(0, '#16342b')
        petal.addColorStop(1, '#2e5646')
        c.fillStyle = petal
        c.beginPath()
        c.moveTo(-10, 0)
        c.bezierCurveTo(-34, -long * 0.4, -18, -long * 0.85, 0, -long)
        c.bezierCurveTo(18, -long * 0.85, 34, -long * 0.4, 10, 0)
        c.closePath()
        c.fill()
        c.strokeStyle = 'rgba(120, 255, 190, 0.35)'
        c.lineWidth = 1.2
        c.stroke()
        // Nervure luminescente de chaque pétale.
        c.strokeStyle = 'rgba(90, 255, 170, 0.55)'
        c.lineWidth = 1.5
        c.beginPath()
        c.moveTo(0, -18)
        c.bezierCurveTo(-5, -long * 0.5, 4, -long * 0.7, 0, -long * 0.92)
        c.stroke()
        c.restore()
      }
      const heart = c.createRadialGradient(0, 0, 0, 0, 0, 46)
      heart.addColorStop(0, '#f4fff0')
      heart.addColorStop(0.25, '#7dffb0')
      heart.addColorStop(0.6, 'rgba(40, 200, 120, 0.5)')
      heart.addColorStop(1, 'rgba(20, 120, 80, 0)')
      c.fillStyle = heart
      c.beginPath()
      c.arc(0, 0, 46, 0, Math.PI * 2)
      c.fill()
      c.restore()
      // Brume verte qui monte du bas.
      const fog = c.createLinearGradient(0, 180, 0, 330)
      fog.addColorStop(0, 'rgba(60, 200, 130, 0)')
      fog.addColorStop(1, 'rgba(60, 200, 130, 0.22)')
      c.fillStyle = fog
      c.fillRect(0, 180, W, 150)
      // La verrière du cockpit, au premier plan : montants noirs, reflets verts sur leurs arêtes.
      c.fillStyle = '#020605'
      c.beginPath()
      c.rect(0, 0, W, H)
      c.moveTo(22, 330)
      c.lineTo(8, 60)
      c.quadraticCurveTo(W / 2, -30, W - 8, 60)
      c.lineTo(W - 22, 330)
      c.closePath()
      c.fill('evenodd')
      c.strokeStyle = 'rgba(110, 255, 180, 0.45)'
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(22, 330)
      c.lineTo(8, 60)
      c.quadraticCurveTo(W / 2, -30, W - 8, 60)
      c.lineTo(W - 22, 330)
      c.stroke()
      // La fêlure : un impact, des éclats qui rayonnent.
      const [ix, iy] = [232, 210]
      c.strokeStyle = 'rgba(230, 255, 240, 0.75)'
      c.lineWidth = 1
      for (let i = 0; i < 9; i++) {
        let a = (i / 9) * Math.PI * 2 + r() * 0.4, x = ix, y = iy
        c.beginPath()
        c.moveTo(x, y)
        for (let k = 0, len = 20 + r() * 50; k < 4; k++) {
          a += (r() - 0.5) * 0.7
          x += Math.cos(a) * len / 4
          y += Math.sin(a) * len / 4
          c.lineTo(x, y)
        }
        c.stroke()
      }
      c.beginPath()
      c.arc(ix, iy, 6, 0, Math.PI * 2)
      c.stroke()
      // Alerte du HUD.
      c.font = '700 10px ui-monospace, Menlo, monospace'
      c.fillStyle = '#ff5a3c'
      c.textAlign = 'left'
      c.fillText(tr('⚠ CAPTEURS PERTURBÉS', '⚠ SENSORS DISRUPTED'), 40, 300)
    },
    title(c) {
      spaced(c, tr('LA NUIT', 'NIGHT OF THE'), 342, '700 16px "Helvetica Neue", system-ui, sans-serif', '#ff5a3c', 9)
      c.shadowColor = 'rgba(80, 255, 160, 0.8)'
      c.shadowBlur = 18
      spaced(c, tr('DES THARGOÏDES', 'THARGOIDS'), 382, '900 44px Impact, "Arial Narrow", "Helvetica Neue", sans-serif', '#f2fff6', 1, W - 30)
      c.shadowBlur = 0
      return 382
    },
  },

  // Une comédie romantique : deux CMDR, deux cafés, un hublot sur Shinrarta Dezhra.
  jameson: {
    tagline: tr('Une comédie romantique à Shinrarta Dezhra.', 'A romantic comedy in Shinrarta Dezhra.'),
    ink: '#ffd9a0',
    foot: '#3a1633',
    art(c, r) {
      const sky = c.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#ffe3cc')
      sky.addColorStop(0.42, '#ff9fa8')
      sky.addColorStop(0.7, '#b0507a')
      sky.addColorStop(1, '#3a1633')
      c.fillStyle = sky
      c.fillRect(0, 0, W, H)
      // Le hublot : l'espace, la planète, l'anneau de Jameson Memorial.
      const [hx, hy, hr] = [W / 2, 158, 112]
      c.save()
      c.beginPath()
      c.arc(hx, hy, hr, 0, Math.PI * 2)
      c.clip()
      const space = c.createLinearGradient(0, hy - hr, 0, hy + hr)
      space.addColorStop(0, '#1a1440')
      space.addColorStop(1, '#4a2a6a')
      c.fillStyle = space
      c.fillRect(hx - hr, hy - hr, hr * 2, hr * 2)
      stars(c, r, 70, hy - hr, hy + hr)
      const planet = c.createRadialGradient(hx - 70, hy + 20, 10, hx - 30, hy + 80, 150)
      planet.addColorStop(0, '#bfe8ff')
      planet.addColorStop(0.4, '#4a9ad0')
      planet.addColorStop(1, '#10284a')
      c.fillStyle = planet
      c.beginPath()
      c.arc(hx - 30, hy + 120, 120, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = 'rgba(200, 240, 255, 0.6)'
      c.lineWidth = 3
      c.beginPath()
      c.arc(hx - 30, hy + 120, 121, Math.PI * 1.05, Math.PI * 1.95)
      c.stroke()
      // La station Orbis : un anneau incliné, son moyeu.
      c.strokeStyle = '#e8e2f0'
      c.lineWidth = 4
      c.beginPath()
      c.ellipse(hx + 48, hy - 42, 30, 10, -0.35, 0, Math.PI * 2)
      c.stroke()
      c.fillStyle = '#e8e2f0'
      c.fillRect(hx + 46, hy - 58, 4, 32)
      sparkle(c, hx + 48, hy - 42, 5, 'rgba(255, 220, 180, 0.9)')
      c.restore()
      // Cadre du hublot et ses rivets.
      c.strokeStyle = '#f5e6d6'
      c.lineWidth = 12
      c.beginPath()
      c.arc(hx, hy, hr + 5, 0, Math.PI * 2)
      c.stroke()
      c.strokeStyle = '#c7a98c'
      c.lineWidth = 2
      c.beginPath()
      c.arc(hx, hy, hr + 11, 0, Math.PI * 2)
      c.stroke()
      c.fillStyle = '#b8977a'
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        c.beginPath()
        c.arc(hx + Math.cos(a) * (hr + 5), hy + Math.sin(a) * (hr + 5), 1.8, 0, Math.PI * 2)
        c.fill()
      }
      // Les deux CMDR, face à face, penchés l'un vers l'autre.
      c.fillStyle = '#4a1d3e'
      bust(c, 70, 238, 0.95, 1, 'short')
      bust(c, 250, 238, 0.95, -1, 'bun')
      // La table du café, les deux tasses, la vapeur qui dessine un cœur.
      c.fillStyle = '#5a2447'
      c.fillRect(40, 300, 240, 10)
      c.fillStyle = '#fff4ea'
      for (const x of [132, 172]) {
        c.fillRect(x, 282, 18, 18)
        c.strokeStyle = '#fff4ea'
        c.lineWidth = 3
        c.beginPath()
        c.arc(x + (x < 150 ? -1 : 19), 291, 5, x < 150 ? Math.PI / 2 : -Math.PI / 2, x < 150 ? Math.PI * 1.5 : Math.PI / 2)
        c.stroke()
      }
      c.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      c.lineWidth = 2
      for (const [x, d] of [[141, 1], [181, -1]] as const) {
        c.beginPath()
        c.moveTo(x, 278)
        c.bezierCurveTo(x - 6 * d, 268, x + 8 * d, 262, x + 6 * d, 252)
        c.stroke()
      }
      const love = c.createRadialGradient(161, 232, 2, 161, 232, 30)
      love.addColorStop(0, 'rgba(255, 190, 200, 0.7)')
      love.addColorStop(1, 'rgba(255, 190, 200, 0)')
      c.fillStyle = love
      c.fillRect(131, 202, 60, 60)
      c.fillStyle = '#ff5d7e'
      c.beginPath()
      c.moveTo(161, 246)
      c.bezierCurveTo(146, 236, 146, 220, 155, 219)
      c.bezierCurveTo(159, 218, 161, 222, 161, 225)
      c.bezierCurveTo(161, 222, 163, 218, 167, 219)
      c.bezierCurveTo(176, 220, 176, 236, 161, 246)
      c.fill()
    },
    title(c) {
      c.shadowColor = 'rgba(58, 22, 51, 0.6)'
      c.shadowBlur = 8
      spaced(c, tr('Le dernier café', 'The last coffee'), 346, 'italic 600 36px Georgia, "Times New Roman", serif', '#fff4ea', 0)
      spaced(c, tr('DE JAMESON', 'AT JAMESON\'S'), 374, '700 20px "Helvetica Neue", system-ui, sans-serif', '#ffc9a0', 8)
      c.shadowBlur = 0
      return 378
    },
  },
}

export const POSTER_FEATURES = Object.keys(FEATURES)

/** Le générique en petits caractères serrés, comme sur les vraies affiches. */
const BILLING = [
  tr('ELITE DANGEREUSE PRÉSENTE UNE PRODUCTION DU PONT SUPÉRIEUR', 'ELITE DANGEREUSE PRESENTS AN UPPER DECK PRODUCTION'),
  tr('AVEC COMÈTE · JACQUES · MOUSTACHE   MUSIQUE RADIO DANGEREUSE', 'WITH COMÈTE · JACQUES · MOUSTACHE   MUSIC RADIO DANGEREUSE'),
  tr('SCÉNARIO L.J.P.C.   IMAGE ET MONTAGE LA VERMINE   UN FILM DE L\'ÉQUIPAGE', 'WRITTEN BY L.J.P.C.   CAMERA AND EDITING LA VERMINE   A FILM BY THE CREW'),
]

/** Dessine l'affiche d'un film (`label` : hutton, thargoid, jameson). */
export function drawPoster(c: Ctx, label: string) {
  const f = FEATURES[label] ?? FEATURES.hutton
  const r = rng([...label].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7))
  f.art(c, r)
  // Le bas s'assombrit sous le titre, pour qu'on le lise.
  const fade = c.createLinearGradient(0, 300, 0, H)
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  fade.addColorStop(0.35, f.foot)
  fade.addColorStop(1, f.foot)
  c.fillStyle = fade
  c.fillRect(0, 300, W, H - 300)
  // En haut, la mention du studio.
  spaced(c, tr('ELITE DANGEREUSE PRÉSENTE', 'ELITE DANGEREUSE PRESENTS'), 20, '600 9px "Helvetica Neue", system-ui, sans-serif', 'rgba(255, 255, 255, 0.72)', 3)
  const bottom = f.title(c)
  spaced(c, f.tagline, bottom + 21, 'italic 12px Georgia, serif', f.ink, 0, W - 36)
  // Le générique : trois lignes serrées, grises.
  BILLING.forEach((line, i) => spaced(c, line, bottom + 38 + i * 9, '600 8px "Arial Narrow", "Helvetica Neue", sans-serif', 'rgba(255, 255, 255, 0.45)', 0, W - 40))
  spaced(c, tr('PROCHAINEMENT À BORD', 'COMING SOON ABOARD'), H - 9, '800 11px "Helvetica Neue", system-ui, sans-serif', ED_ORANGE, 4)
  // Grain du papier et reflet du caisson lumineux.
  for (let i = 0; i < 900; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)'
    c.fillRect(r() * W, r() * H, 1, 1)
  }
  const sheen = c.createLinearGradient(0, 0, W, H * 0.6)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
  sheen.addColorStop(0.3, 'rgba(255, 255, 255, 0)')
  c.fillStyle = sheen
  c.fillRect(0, 0, W, H)
}
