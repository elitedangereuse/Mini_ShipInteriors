import * as THREE from 'three'
import { EN, tr } from '../i18n'
import { box, drawnTexture, keepShared, lit, mesh, rng, sphere, type Builder } from './kit'

/*
 * Affiches des quartiers : les grands films de science-fiction (et quelques autres) revus à la
 * façon d'une affiche de cinéma, et des pin-up rétro dans le goût des années 40 et 50, version
 * Elite. Tout est dessiné au canvas, une fois par affiche (texture partagée), à grands aplats :
 * on les voit de loin et de biais. Accrochées au mur : dos au mur, contenu vers +z.
 */

const W = 256, H = 384
type Ctx = CanvasRenderingContext2D

// ---------------------------------------------------------------- outils de dessin

function linear(c: Ctx, y0: number, y1: number, stops: string[]) {
  const g = c.createLinearGradient(0, y0, 0, y1)
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s))
  return g
}

function stars(c: Ctx, r: () => number, n: number, top = 0, bottom = H) {
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.3 + r() * 0.7
    c.fillStyle = r() < 0.2 ? '#ffe2c4' : '#ffffff'
    const s = r() < 0.08 ? 2 : 1
    c.fillRect(r() * W, top + r() * (bottom - top), s, s)
  }
  c.globalAlpha = 1
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  c.fillStyle = fill
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  c.fillStyle = fill
  c.beginPath()
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  c.fill()
}

function poly(c: Ctx, pts: [number, number][], fill: string | CanvasGradient) {
  c.fillStyle = fill
  c.beginPath()
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fill()
}

/** Halo lumineux. */
function halo(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g
  c.fillRect(x - r, y - r, r * 2, r * 2)
}

/** Titre centré, resserré s'il déborde de `max`. */
function title(c: Ctx, text: string, y: number, font: string, fill: string | CanvasGradient, stroke?: string, lineWidth = 2, max = W - 20) {
  c.font = font
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  const width = c.measureText(text).width
  const k = Math.min(1, max / Math.max(1, width))
  c.save()
  c.translate(W / 2, y)
  c.scale(k, 1)
  if (stroke) {
    c.strokeStyle = stroke
    c.lineWidth = lineWidth
    c.lineJoin = 'round'
    c.strokeText(text, 0, 0)
  }
  c.fillStyle = fill
  c.fillText(text, 0, 0)
  c.restore()
}

/** Bloc de générique en bas de l'affiche : de fines lignes de petits caractères. */
function credits(c: Ctx, color: string, y = H - 28) {
  c.fillStyle = color
  c.globalAlpha = 0.75
  c.font = '600 6px sans-serif'
  c.textAlign = 'center'
  c.fillText(tr('UNE PRODUCTION DES STUDIOS DE LAVE · EN SUPERCROISIÈRE PARTOUT', 'A LAVE STUDIOS PRODUCTION · NOW IN SUPERCRUISE EVERYWHERE'), W / 2, y)
  for (let i = 0; i < 2; i++) c.fillRect(30, y + 6 + i * 6, W - 60, 2)
  c.globalAlpha = 1
}

// ---------------------------------------------------------------- les films

interface Film {
  label: string
  draw: (c: Ctx, r: () => number) => void
}

export const FILMS: Record<string, Film> = {
  terminator: {
    label: 'Terminator',
    draw(c) {
      c.fillStyle = '#05070b'
      c.fillRect(0, 0, W, H)
      halo(c, W / 2, 150, 150, 'rgba(60,110,170,0.45)')
      // Le crâne de métal : calotte, orbites, pommettes, mâchoire à dents.
      const steel = c.createLinearGradient(60, 60, 200, 260)
      steel.addColorStop(0, '#e9eef5')
      steel.addColorStop(0.5, '#7d8796')
      steel.addColorStop(1, '#2a3038')
      ellipse(c, 128, 130, 70, 78, steel)
      poly(c, [[70, 150], [186, 150], [172, 232], [150, 250], [106, 250], [84, 232]], steel)
      for (const x of [98, 158]) {
        ellipse(c, x, 142, 22, 18, '#0b0d12')
        halo(c, x, 142, 26, 'rgba(255,40,30,0.9)')
        disc(c, x, 142, 6, '#ff3b2f')
        disc(c, x, 142, 2.5, '#fff1e0')
      }
      poly(c, [[122, 168], [134, 168], [138, 190], [118, 190]], '#141820')
      c.fillStyle = '#d7dde6'
      for (let i = 0; i < 9; i++) c.fillRect(92 + i * 8, 204, 6, 16)
      c.fillStyle = '#10141a'
      c.fillRect(90, 212, 76, 2)
      title(c, 'TERMINATOR', 300, '900 42px sans-serif', linear(c, 268, 300, ['#dfe8ff', '#6f86b8', '#dfe8ff']), '#0b1a3a', 3)
      c.fillStyle = '#c0151a'
      c.fillRect(30, 310, W - 60, 3)
      title(c, tr('IL REVIENDRA.', 'HE\'LL BE BACK.'), 332, '700 13px sans-serif', '#b9c6dc')
      credits(c, '#6f7a90')
    },
  },
  starwars: {
    label: 'Star Wars',
    draw(c, r) {
      c.fillStyle = '#02030a'
      c.fillRect(0, 0, W, H)
      stars(c, r, 260)
      c.fillStyle = '#4fb4ff'
      c.font = 'italic 600 9px sans-serif'
      c.textAlign = 'left'
      c.fillText(tr('Il y a bien longtemps, dans une galaxie', 'A long time ago in a galaxy far,'), 22, 34)
      c.fillText(tr('lointaine, très lointaine…', 'far away…'), 22, 46)
      // Planète, étoile de la mort, et deux lames croisées.
      disc(c, 190, 250, 70, linear(c, 180, 320, ['#e0a45a', '#7a3e1c']))
      disc(c, 70, 205, 26, linear(c, 180, 230, ['#9aa3ad', '#4a525c']))
      disc(c, 62, 197, 7, '#2c3138')
      c.strokeStyle = '#2c3138'
      c.lineWidth = 1.5
      c.beginPath()
      c.moveTo(44, 205)
      c.lineTo(96, 205)
      c.stroke()
      for (const [x0, y0, x1, y1, col] of [[80, 330, 200, 150, '#4fb4ff'], [180, 330, 60, 150, '#ff3b3b']] as const) {
        c.strokeStyle = col
        c.lineWidth = 7
        c.globalAlpha = 0.45
        c.beginPath()
        c.moveTo(x0, y0)
        c.lineTo(x1, y1)
        c.stroke()
        c.globalAlpha = 1
        c.strokeStyle = '#ffffff'
        c.lineWidth = 2.5
        c.stroke()
      }
      // Le titre, lettres jaunes évidées.
      c.textAlign = 'center'
      for (const [text, y] of [['STAR', 108], ['WARS', 160]] as const) {
        c.font = '900 58px sans-serif'
        c.lineWidth = 4
        c.strokeStyle = '#ffd23c'
        c.lineJoin = 'miter'
        c.strokeText(text, W / 2, y)
      }
      title(c, tr('LA GUERRE DES ÉTOILES', 'EPISODE IV · A NEW HOPE'), 352, '700 12px sans-serif', '#ffd23c')
      credits(c, '#8a8f9e', H - 18)
    },
  },
  bttf: {
    label: tr('Retour vers le futur', 'Back to the Future'),
    draw(c) {
      c.fillStyle = linear(c, 0, H, ['#1a0b3a', '#b43a2a', '#ffb347'])
      c.fillRect(0, 0, W, H)
      // Les traînées de feu des pneus, qui foncent vers nous.
      for (const x of [104, 152]) {
        const g = c.createLinearGradient(0, 230, 0, H)
        g.addColorStop(0, 'rgba(255,220,120,0.2)')
        g.addColorStop(1, 'rgba(255,90,20,1)')
        poly(c, [[x - 2, 232], [x + 2, 232], [x + (x < 128 ? -20 : 60), H], [x + (x < 128 ? -60 : 20), H]], g)
      }
      // La voiture à portes papillon, de face, sous un halo électrique.
      halo(c, 128, 200, 90, 'rgba(120,200,255,0.55)')
      poly(c, [[70, 232], [186, 232], [176, 204], [150, 188], [106, 188], [80, 204]], '#c8ced6')
      poly(c, [[96, 204], [160, 204], [150, 190], [106, 190]], '#28323e')
      c.fillStyle = '#fff6c8'
      c.fillRect(76, 214, 18, 6)
      c.fillRect(162, 214, 18, 6)
      poly(c, [[106, 190], [60, 150], [70, 146], [112, 188]], '#aeb6c0')
      poly(c, [[150, 190], [196, 150], [186, 146], [144, 188]], '#aeb6c0')
      c.strokeStyle = '#bfe8ff'
      c.lineWidth = 1.5
      for (let i = 0; i < 6; i++) {
        c.beginPath()
        c.moveTo(128, 196)
        c.lineTo(128 + Math.cos(i) * 80, 196 + Math.sin(i * 2.3) * 60)
        c.stroke()
      }
      // Le titre : dégradé de feu, italique.
      const fire = linear(c, 40, 120, ['#fff27a', '#ff9a1c', '#d4231c'])
      c.save()
      c.transform(1, 0, -0.18, 1, 20, 0)
      if (!EN) {
        title(c, 'RETOUR', 62, 'italic 900 38px sans-serif', fire, '#4a0d0d', 3)
        title(c, 'VERS LE', 92, 'italic 900 22px sans-serif', fire, '#4a0d0d', 3)
        title(c, 'FUTUR', 130, 'italic 900 42px sans-serif', fire, '#4a0d0d', 3)
      } else {
        title(c, 'BACK', 62, 'italic 900 38px sans-serif', fire, '#4a0d0d', 3)
        title(c, 'TO THE', 92, 'italic 900 22px sans-serif', fire, '#4a0d0d', 3)
        title(c, 'FUTURE', 130, 'italic 900 42px sans-serif', fire, '#4a0d0d', 3)
      }
      c.restore()
      title(c, tr('IL EST EN RETARD POUR L\'AVENIR.', 'HE\'S LATE FOR THE FUTURE.'), H - 44, '700 10px sans-serif', '#2a0d05')
      credits(c, '#3a1208', H - 26)
    },
  },
  alien: {
    label: 'Alien',
    draw(c) {
      c.fillStyle = '#020403'
      c.fillRect(0, 0, W, H)
      // L'œuf, fendu, qui luit de vert.
      const shell = c.createRadialGradient(128, 230, 10, 128, 240, 90)
      shell.addColorStop(0, '#6c7a62')
      shell.addColorStop(1, '#101510')
      ellipse(c, 128, 240, 62, 82, shell)
      halo(c, 128, 180, 50, 'rgba(140,255,120,0.9)')
      c.strokeStyle = '#baff9a'
      c.lineWidth = 2.5
      c.beginPath()
      c.moveTo(106, 170)
      c.lineTo(118, 184)
      c.lineTo(112, 196)
      c.moveTo(150, 172)
      c.lineTo(140, 186)
      c.lineTo(147, 198)
      c.stroke()
      // Sol de pierre, rayé de lumière.
      c.fillStyle = '#0c120d'
      for (let i = 0; i < 9; i++) c.fillRect(0, 322 + i * 5, W, 2)
      c.font = '300 36px sans-serif'
      c.fillStyle = '#e6efe4'
      c.textAlign = 'center'
      c.fillText('A  L  I  E  N', W / 2, 72)
      title(c, tr('DANS L\'ESPACE, PERSONNE', 'IN SPACE NO ONE'), 110, '600 10px sans-serif', '#9fb39a')
      title(c, tr('NE VOUS ENTEND CRIER.', 'CAN HEAR YOU SCREAM.'), 124, '600 10px sans-serif', '#9fb39a')
      credits(c, '#56645a')
    },
  },
  bladerunner: {
    label: 'Blade Runner',
    draw(c, r) {
      c.fillStyle = linear(c, 0, H, ['#12091f', '#3a1034', '#d9582a'])
      c.fillRect(0, 0, W, H)
      // Tours de la ville, fenêtres allumées, néons.
      for (let i = 0; i < 12; i++) {
        const x = i * 22 - 4, h = 120 + r() * 170, w = 18 + r() * 12
        c.fillStyle = '#0a0612'
        c.fillRect(x, H - h, w, h)
        for (let k = 0; k < 30; k++) {
          c.fillStyle = r() < 0.5 ? '#ffb45a' : '#59d8ff'
          c.globalAlpha = 0.4 + r() * 0.6
          c.fillRect(x + 2 + Math.floor(r() * (w - 4)), H - h + 4 + r() * (h - 8), 2, 2)
        }
        c.globalAlpha = 1
      }
      for (const [x, y, col] of [[40, 210, '#ff3bd0'], [196, 180, '#39e0ff'], [120, 240, '#ff5a2a']] as const) {
        halo(c, x, y, 26, col)
        c.fillStyle = col
        c.fillRect(x - 10, y - 3, 20, 6)
      }
      // La voiture volante, feux allumés.
      poly(c, [[120, 120], [168, 116], [176, 124], [124, 130]], '#1a1420')
      halo(c, 118, 124, 14, 'rgba(255,240,200,0.9)')
      // La pluie.
      c.strokeStyle = 'rgba(200,220,255,0.25)'
      c.lineWidth = 1
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(x - 3, y + 12)
        c.stroke()
      }
      title(c, 'BLADE RUNNER', 70, '800 30px sans-serif', '#ff4a3a', '#2a0508', 3)
      title(c, tr('L\'HOMME A FAIT LE RÉPLICANT…', 'MAN HAS MADE HIS MATCH…'), 90, '600 9px sans-serif', '#ffc9a8')
      credits(c, '#ffb08a')
    },
  },
  odyssey2001: {
    label: tr('2001 : l\'odyssée de l\'espace', '2001: A Space Odyssey'),
    draw(c, r) {
      c.fillStyle = '#f2efe8'
      c.fillRect(0, 0, W, H)
      // Fenêtre sur l'espace : la roue de la station, et l'alignement des astres.
      c.fillStyle = '#05060c'
      c.fillRect(18, 18, W - 36, 250)
      c.save()
      c.beginPath()
      c.rect(18, 18, W - 36, 250)
      c.clip()
      stars(c, r, 120, 18, 268)
      disc(c, 128, 330, 130, linear(c, 200, 330, ['#6aa0e8', '#0a1a3a']))
      halo(c, 128, 200, 60, 'rgba(255,245,220,0.95)')
      c.strokeStyle = '#d8dde6'
      c.lineWidth = 7
      c.beginPath()
      c.ellipse(128, 110, 62, 22, -0.25, 0, Math.PI * 2)
      c.stroke()
      c.lineWidth = 3
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.3
        c.beginPath()
        c.moveTo(128, 110)
        c.lineTo(128 + Math.cos(a) * 60, 110 + Math.sin(a) * 20)
        c.stroke()
      }
      // Le monolithe, noir, dressé devant tout.
      c.fillStyle = '#000'
      c.fillRect(112, 150, 32, 118)
      c.restore()
      title(c, '2001', 318, '200 52px sans-serif', '#1a1a1a')
      title(c, tr('L\'ODYSSÉE DE L\'ESPACE', 'A SPACE ODYSSEY'), 342, '600 14px sans-serif', '#1a1a1a')
      credits(c, '#6d6a64', H - 22)
    },
  },
  ghostbusters: {
    label: tr('SOS Fantômes', 'Ghostbusters'),
    draw(c) {
      c.fillStyle = '#f4f1ea'
      c.fillRect(0, 0, W, H)
      // Un fantôme rigolard dans un panneau d'interdiction.
      disc(c, 128, 160, 92, '#d42a24')
      disc(c, 128, 160, 76, '#f4f1ea')
      c.fillStyle = '#ffffff'
      c.strokeStyle = '#1a1a1a'
      c.lineWidth = 4
      c.beginPath()
      c.moveTo(92, 214)
      c.quadraticCurveTo(84, 120, 128, 108)
      c.quadraticCurveTo(172, 120, 166, 196)
      c.quadraticCurveTo(150, 204, 144, 222)
      c.quadraticCurveTo(128, 206, 112, 224)
      c.quadraticCurveTo(104, 208, 92, 214)
      c.fill()
      c.stroke()
      ellipse(c, 114, 148, 8, 12, '#1a1a1a')
      ellipse(c, 142, 148, 8, 12, '#1a1a1a')
      ellipse(c, 128, 178, 12, 9, '#1a1a1a')
      c.strokeStyle = '#d42a24'
      c.lineWidth = 15
      c.beginPath()
      c.moveTo(74, 106)
      c.lineTo(182, 214)
      c.stroke()
      title(c, tr('SOS FANTÔMES', 'GHOSTBUSTERS'), 296, '900 30px sans-serif', '#1a1a1a')
      title(c, tr('QUI ALLEZ-VOUS APPELER ?', 'WHO YOU GONNA CALL?'), 320, '700 12px sans-serif', '#d42a24')
      credits(c, '#6d6a64')
    },
  },
  matrix: {
    label: 'Matrix',
    draw(c, r) {
      c.fillStyle = '#010702'
      c.fillRect(0, 0, W, H)
      c.font = '10px monospace'
      c.textAlign = 'center'
      for (let col = 0; col < 22; col++) {
        const x = 6 + col * 11.6, len = 8 + Math.floor(r() * 26), top = r() * 200
        for (let k = 0; k < len; k++) {
          c.fillStyle = k === len - 1 ? '#d8ffd8' : `rgba(60,255,110,${0.15 + (k / len) * 0.8})`
          c.fillText(String.fromCharCode(0x30a0 + Math.floor(r() * 90)), x, top + k * 11)
        }
      }
      // Silhouette en long manteau, lunettes noires, détachée sur un halo vert.
      halo(c, 128, 240, 110, 'rgba(40,255,100,0.35)')
      poly(c, [[112, 190], [144, 190], [162, 330], [94, 330]], '#050505')
      disc(c, 128, 170, 20, '#050505')
      c.fillStyle = '#2aff6a'
      c.fillRect(116, 166, 24, 3)
      title(c, tr('MATRIX', 'THE MATRIX'), 70, '900 40px sans-serif', linear(c, 36, 70, ['#d8ffe0', '#2aff6a']), '#02240c', 3)
      title(c, tr('BIENVENUE DANS LE MONDE RÉEL.', 'WELCOME TO THE REAL WORLD.'), 92, '600 9px sans-serif', '#9fffb8')
      credits(c, '#3a8a50')
    },
  },
  et: {
    label: tr('E.T. l\'extra-terrestre', 'E.T. the Extra-Terrestrial'),
    draw(c, r) {
      c.fillStyle = linear(c, 0, H, ['#050a24', '#1a2d6a', '#2a3d5a'])
      c.fillRect(0, 0, W, H)
      stars(c, r, 140, 0, 260)
      disc(c, 150, 150, 92, linear(c, 60, 240, ['#fffbe8', '#e8dcb8']))
      for (let i = 0; i < 6; i++) disc(c, 110 + r() * 80, 110 + r() * 80, 4 + r() * 10, 'rgba(180,170,140,0.35)')
      // Le vélo et ses deux passagers, en ombre chinoise devant la lune.
      c.strokeStyle = '#050a18'
      c.fillStyle = '#050a18'
      c.lineWidth = 3
      for (const x of [118, 166]) {
        c.beginPath()
        c.arc(x, 176, 13, 0, Math.PI * 2)
        c.stroke()
      }
      c.beginPath()
      c.moveTo(118, 176)
      c.lineTo(140, 158)
      c.lineTo(166, 176)
      c.moveTo(140, 158)
      c.lineTo(150, 156)
      c.stroke()
      ellipse(c, 140, 140, 9, 16, '#050a18', 0.2)
      disc(c, 142, 120, 8, '#050a18')
      disc(c, 160, 140, 7, '#050a18')
      ellipse(c, 158, 150, 8, 7, '#050a18')
      // La forêt, en bas.
      for (let i = 0; i < 16; i++) {
        const x = i * 17, h = 50 + r() * 40
        poly(c, [[x - 12, H - 60], [x + 6, H - 60 - h], [x + 24, H - 60]], '#030712')
      }
      c.fillStyle = '#030712'
      c.fillRect(0, H - 62, W, 62)
      title(c, 'E.T.', 300, '800 44px sans-serif', '#e9ecff')
      title(c, tr('L\'EXTRA-TERRESTRE', 'THE EXTRA-TERRESTRIAL'), 322, '600 12px sans-serif', '#b9c3ff')
      credits(c, '#6a73a8')
    },
  },
  jaws: {
    label: tr('Les Dents de la mer', 'Jaws'),
    draw(c) {
      c.fillStyle = '#d8e6f2'
      c.fillRect(0, 0, W, 104)
      c.fillStyle = linear(c, 104, H, ['#2a6fb0', '#08203f'])
      c.fillRect(0, 104, W, H - 104)
      // La nageuse, en surface.
      ellipse(c, 128, 106, 26, 5, '#e8b89a')
      disc(c, 102, 104, 5, '#6a3a1c')
      // Le requin qui monte des profondeurs, gueule ouverte.
      poly(c, [[128, 150], [196, 330], [128, 384], [60, 330]], '#b8c4cc')
      poly(c, [[92, 176], [164, 176], [150, 214], [106, 214]], '#5a0d12')
      c.fillStyle = '#ffffff'
      for (let i = 0; i < 8; i++) {
        poly(c, [[94 + i * 9, 176], [102 + i * 9, 176], [98 + i * 9, 188]], '#ffffff')
        poly(c, [[108 + i * 6, 214], [114 + i * 6, 214], [111 + i * 6, 204]], '#ffffff')
      }
      disc(c, 102, 236, 4, '#0a0a0a')
      disc(c, 154, 236, 4, '#0a0a0a')
      title(c, tr('LES DENTS', 'JAWS'), 40, '900 30px sans-serif', '#b01a1a')
      if (!EN) title(c, 'DE LA MER', 70, '900 26px sans-serif', '#b01a1a')
      credits(c, '#9fb6d0')
    },
  },
}

// ---------------------------------------------------------------- les pin-up

/** Une personne, dessinée par ses articulations (repère de l'affiche). */
interface Pose {
  head: [number, number]
  /** Épaules, coudes, mains (gauche puis droite, vues de face). */
  shoulders: [[number, number], [number, number]]
  elbows: [[number, number], [number, number]]
  hands: [[number, number], [number, number]]
  /** Hanches, genoux, pieds. */
  hips: [[number, number], [number, number]]
  knees: [[number, number], [number, number]]
  feet: [[number, number], [number, number]]
  waist?: number
}

/** Membre effilé d'une articulation à l'autre, bouts arrondis. */
function limb(c: Ctx, [x0, y0]: [number, number], [x1, y1]: [number, number], w0: number, w1: number, fill: string) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2
  const dx = Math.cos(a), dy = Math.sin(a)
  poly(c, [[x0 + dx * w0, y0 + dy * w0], [x1 + dx * w1, y1 + dy * w1], [x1 - dx * w1, y1 - dy * w1], [x0 - dx * w0, y0 - dy * w0]], fill)
  disc(c, x0, y0, w0, fill)
  disc(c, x1, y1, w1, fill)
}

interface Look {
  skin: string
  hair: string
  /** Haut (buste) et bas (hanches) de la tenue ; `skirt` : jupe évasée jusqu'aux genoux. */
  top: string
  bottom: string
  skirt?: boolean
  legs?: string
  shoes: string
  lips?: string
  /** Coiffure : boucles en rouleaux, cheveux courts, ou casque de cosmonaute. */
  style: 'victory' | 'short' | 'bubble'
  broad?: boolean
}

/** Dessine la silhouette d'une pin-up (ou d'un pin-up) dans sa pose. */
function figure(c: Ctx, p: Pose, l: Look) {
  const [ls, rs] = p.shoulders, [lh, rh] = p.hips
  const w = l.broad ? 1.35 : 1
  const legs = l.legs ?? l.skin
  // Jambes : cuisses, mollets, chaussures.
  for (let i = 0; i < 2; i++) {
    limb(c, p.hips[i], p.knees[i], 13 * w, 9 * w, legs)
    limb(c, p.knees[i], p.feet[i], 9 * w, 5, legs)
    ellipse(c, p.feet[i][0] + 3, p.feet[i][1] + 2, 9, 5, l.shoes)
  }
  // Buste : épaules, taille, hanches.
  const waist = p.waist ?? (ls[1] + lh[1]) / 2 + 4
  const mid = (ls[0] + rs[0] + lh[0] + rh[0]) / 4
  const wx = l.broad ? 20 : 13
  poly(c, [ls, rs, [mid + wx, waist], [mid - wx, waist]], l.broad ? l.skin : l.top)
  poly(c, [[mid - wx, waist], [mid + wx, waist], [rh[0] + 4, rh[1] + 6], [lh[0] - 4, lh[1] + 6]], l.bottom)
  if (l.skirt) {
    const kx = (p.knees[0][0] + p.knees[1][0]) / 2, ky = Math.min(p.knees[0][1], p.knees[1][1]) + 4
    poly(c, [[mid - wx, waist], [mid + wx, waist], [kx + 34, ky], [kx - 34, ky]], l.bottom)
  }
  if (l.broad) {
    // Pectoraux et abdominaux du costaud, au trait.
    c.strokeStyle = 'rgba(90,40,20,0.45)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(mid - 16, ls[1] + 18)
    c.quadraticCurveTo(mid - 8, ls[1] + 30, mid, ls[1] + 20)
    c.quadraticCurveTo(mid + 8, ls[1] + 30, mid + 16, ls[1] + 18)
    c.stroke()
  }
  // Bras, cou, tête.
  for (let i = 0; i < 2; i++) {
    limb(c, p.shoulders[i], p.elbows[i], 8 * w, 6 * w, l.skin)
    limb(c, p.elbows[i], p.hands[i], 6 * w, 4.5, l.skin)
    disc(c, p.hands[i][0], p.hands[i][1], 5.5, l.skin)
  }
  const [hx, hy] = p.head
  limb(c, [(ls[0] + rs[0]) / 2, ls[1]], [hx, hy + 12], 6 * w, 5 * w, l.skin)
  if (l.style === 'victory') {
    // Rouleaux « victory rolls » et boucles sur les épaules.
    ellipse(c, hx, hy + 6, 21, 22, l.hair)
    for (const s of [-1, 1]) disc(c, hx + s * 13, hy - 12, 10, l.hair)
  } else if (l.style === 'short') ellipse(c, hx, hy - 6, 17, 13, l.hair)
  ellipse(c, hx, hy + 2, 14, 17, l.skin)
  if (l.style === 'victory') ellipse(c, hx, hy - 12, 15, 7, l.hair)
  // Visage : yeux fermés à longs cils (un clin d'œil), sourire.
  c.strokeStyle = '#2a1a14'
  c.lineWidth = 1.5
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(hx + s * 5, hy, 3, 0.2 * Math.PI, 0.8 * Math.PI)
    c.stroke()
  }
  ellipse(c, hx, hy + 9, 4, 2.2, l.lips ?? '#c0392b')
  if (l.style === 'bubble') {
    c.strokeStyle = 'rgba(220,245,255,0.9)'
    c.lineWidth = 2
    c.fillStyle = 'rgba(180,230,255,0.25)'
    c.beginPath()
    c.arc(hx, hy + 2, 26, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    ellipse(c, hx - 9, hy - 10, 5, 3, 'rgba(255,255,255,0.8)', -0.5)
  }
}

/** Bandeau au nom de l'affiche, en ruban. */
function ribbon(c: Ctx, text: string, y: number, fill: string, ink: string) {
  poly(c, [[14, y - 16], [W - 14, y - 16], [W - 26, y], [W - 14, y + 16], [14, y + 16], [26, y]], fill)
  title(c, text, y + 6, '800 16px sans-serif', ink)
}

/** Fond façon « nose art » : rayons de soleil autour d'un point. */
function rays(c: Ctx, x: number, y: number, a: string, b: string) {
  c.fillStyle = a
  c.fillRect(0, 0, W, H)
  c.fillStyle = b
  for (let i = 0; i < 18; i++) {
    const t0 = (i / 18) * Math.PI * 2, t1 = t0 + Math.PI / 18
    poly(c, [[x, y], [x + Math.cos(t0) * 500, y + Math.sin(t0) * 500], [x + Math.cos(t1) * 500, y + Math.sin(t1) * 500]], b)
  }
}

const SKIN = ['#f2c9a8', '#d9a07a', '#8d5a3b', '#f7d6bf']

export const PINUPS: Record<string, Film> = {
  sailor: {
    label: tr('Salut de la flotte', 'Fleet salute'),
    draw(c) {
      rays(c, 128, 150, '#9fd0ef', '#b8def5')
      // Une Cobra au loin, et la pin-up en marinière qui salue : o7.
      poly(c, [[190, 70], [230, 78], [214, 86], [178, 84]], '#5b6470')
      figure(c, {
        head: [128, 96],
        shoulders: [[110, 124], [146, 124]], elbows: [[98, 156], [168, 108]], hands: [[112, 178], [140, 90]],
        hips: [[114, 196], [140, 196]], knees: [[110, 262], [150, 258]], feet: [[106, 330], [162, 322]],
      }, { skin: SKIN[0], hair: '#e0b04a', top: '#f4f4f0', bottom: '#1c2f5c', skirt: true, shoes: '#b01a1a', style: 'victory' })
      // Col marin et béret.
      poly(c, [[110, 124], [146, 124], [140, 142], [116, 142]], '#1c2f5c')
      poly(c, [[124, 138], [132, 138], [128, 150]], '#d42a24')
      ellipse(c, 128, 76, 18, 6, '#f4f4f0')
      title(c, 'o7', 60, '900 34px sans-serif', '#1c2f5c')
      ribbon(c, tr('SALUT DE LA FLOTTE !', 'GREETINGS FROM THE FLEET!'), 356, '#d42a24', '#fff6e8')
    },
  },
  rocket: {
    label: tr('Miss Hutton Orbital', 'Miss Hutton Orbital'),
    draw(c, r) {
      c.fillStyle = linear(c, 0, H, ['#0b0a2a', '#3a1a5a'])
      c.fillRect(0, 0, W, H)
      stars(c, r, 160)
      disc(c, 50, 70, 30, linear(c, 40, 100, ['#ffd08a', '#c0643f']))
      // La fusée rétro, en biais, et sa flamme.
      c.save()
      c.translate(128, 230)
      c.rotate(-0.45)
      poly(c, [[-110, 0], [-150, -18], [-150, 18]], '#ff9a1c')
      poly(c, [[-110, 0], [-132, -10], [-132, 10]], '#fff27a')
      ellipse(c, 0, 0, 110, 26, '#d8dde6')
      poly(c, [[70, -20], [124, 0], [70, 20]], '#d42a24')
      poly(c, [[-90, -20], [-120, -44], [-70, -22]], '#d42a24')
      poly(c, [[-90, 20], [-120, 44], [-70, 22]], '#d42a24')
      disc(c, 30, -2, 9, '#59d8ff')
      c.restore()
      figure(c, {
        head: [120, 110],
        shoulders: [[104, 138], [138, 138]], elbows: [[86, 114], [158, 120]], hands: [[80, 88], [176, 102]],
        hips: [[112, 196], [134, 196]], knees: [[92, 236], [150, 232]], feet: [[98, 290], [146, 286]],
      }, { skin: SKIN[3], hair: '#b8322a', top: '#c9ced8', bottom: '#c9ced8', legs: '#c9ced8', shoes: '#d42a24', style: 'bubble' })
      ribbon(c, tr('MISS HUTTON ORBITAL', 'MISS HUTTON ORBITAL'), 350, '#ffd23c', '#3a1a5a')
      title(c, tr('0,22 AL DE PUR BONHEUR', '0.22 LY OF PURE BLISS'), 34, '700 11px sans-serif', '#ffd9a8')
    },
  },
  moon: {
    label: tr('Miss Colonia', 'Miss Colonia'),
    draw(c, r) {
      c.fillStyle = linear(c, 0, H, ['#1a0d33', '#48206a', '#1a0d33'])
      c.fillRect(0, 0, W, H)
      stars(c, r, 140)
      // Assise sur un croissant de lune, robe du soir, jambes croisées.
      c.fillStyle = '#ffe9a8'
      c.beginPath()
      c.arc(120, 220, 90, 0.35 * Math.PI, 1.35 * Math.PI)
      c.arc(150, 200, 78, 1.3 * Math.PI, 0.38 * Math.PI, true)
      c.fill()
      figure(c, {
        head: [150, 96],
        shoulders: [[134, 124], [166, 124]], elbows: [[122, 150], [180, 148]], hands: [[106, 166], [190, 170]],
        hips: [[138, 178], [160, 178]], knees: [[180, 206], [174, 212]], feet: [[160, 274], [180, 280]],
        waist: 152,
      }, { skin: SKIN[1], hair: '#2a1a14', top: '#8a2a8a', bottom: '#8a2a8a', legs: SKIN[1], shoes: '#1a0d33', style: 'victory', lips: '#8a1a3a' })
      ribbon(c, 'MISS COLONIA 3310', 352, '#ffe9a8', '#48206a')
      title(c, tr('22 000 AL DE CHARME', '22,000 LY OF CHARM'), 36, '700 11px sans-serif', '#ffe9a8')
    },
  },
  mechanic: {
    label: tr('On peut le faire !', 'We can do it!'),
    draw(c) {
      rays(c, 128, 160, '#ffd23c', '#ffe27a')
      // Bleu de travail, bandana à pois, le bras levé pour montrer qu'on en est capable.
      figure(c, {
        head: [120, 100],
        shoulders: [[102, 128], [138, 128]], elbows: [[152, 118], [84, 162]], hands: [[150, 88], [94, 194]],
        hips: [[108, 200], [134, 200]], knees: [[102, 266], [144, 264]], feet: [[100, 332], [150, 330]],
      }, { skin: SKIN[2], hair: '#1a1210', top: '#2f5a9a', bottom: '#2f5a9a', legs: '#2f5a9a', shoes: '#3a2418', style: 'short' })
      ellipse(c, 120, 86, 20, 8, '#d42a24')
      c.fillStyle = '#ffffff'
      for (const [x, y] of [[110, 84], [122, 86], [130, 82]]) c.fillRect(x, y, 2, 2)
      // Une clé géante, posée à côté.
      c.save()
      c.translate(196, 250)
      c.rotate(0.3)
      c.fillStyle = '#9aa3ad'
      c.fillRect(-7, -90, 14, 150)
      disc(c, 0, -96, 22, '#9aa3ad')
      c.fillStyle = '#ffd23c'
      c.fillRect(-8, -126, 16, 30)
      c.restore()
      poly(c, [[20, 20], [236, 20], [236, 62], [20, 62]], '#1c2f5c')
      title(c, tr('ON PEUT LE FAIRE, CMDR !', 'WE CAN DO IT, CMDR!'), 49, '900 17px sans-serif', '#ffffff', undefined, 2, W - 56)
      ribbon(c, tr('INGÉNIEURS DE LA CALE', 'THE HOLD ENGINEERS'), 358, '#d42a24', '#fff6e8')
    },
  },
  beach: {
    label: tr('Vacances sur Terre', 'Earth holidays'),
    draw(c) {
      c.fillStyle = linear(c, 0, 220, ['#6ec8f0', '#c8ecff'])
      c.fillRect(0, 0, W, 220)
      disc(c, 200, 60, 22, '#fff1b0')
      // Une planète à anneaux dans le ciel, la mer, le sable.
      disc(c, 60, 70, 16, '#f0cf96')
      c.strokeStyle = '#e6d2aa'
      c.lineWidth = 3
      c.beginPath()
      c.ellipse(60, 70, 30, 7, -0.3, 0, Math.PI * 2)
      c.stroke()
      c.fillStyle = '#2a8ac0'
      c.fillRect(0, 200, W, 40)
      c.fillStyle = '#f2dca0'
      c.fillRect(0, 236, W, H - 236)
      // Grand chapeau de paille, maillot rouge à pois, ballon de plage.
      figure(c, {
        head: [104, 132],
        shoulders: [[88, 160], [120, 160]], elbows: [[74, 188], [136, 186]], hands: [[70, 214], [150, 204]],
        hips: [[96, 226], [120, 226]], knees: [[150, 250], [146, 258]], feet: [[204, 256], [200, 270]],
      }, { skin: SKIN[0], hair: '#6a3a1c', top: '#d42a24', bottom: '#d42a24', shoes: '#f4f4f0', style: 'victory' })
      c.fillStyle = '#ffffff'
      for (const [x, y] of [[98, 168], [110, 180], [100, 196], [112, 214], [104, 222]]) c.fillRect(x, y, 3, 3)
      ellipse(c, 104, 116, 36, 9, '#e9c46a')
      ellipse(c, 104, 110, 18, 10, '#e9c46a')
      c.fillStyle = '#d42a24'
      c.fillRect(86, 112, 36, 4)
      for (let i = 0; i < 4; i++) {
        c.fillStyle = ['#d42a24', '#ffffff', '#2f5a9a', '#ffd23c'][i]
        c.beginPath()
        c.moveTo(176, 214)
        c.arc(176, 214, 18, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2)
        c.fill()
      }
      ribbon(c, tr('VACANCES SUR TERRE', 'EARTH HOLIDAYS'), 346, '#2a8ac0', '#ffffff')
      title(c, tr('Permis de Sol requis', 'Sol permit required'), 376, 'italic 600 10px sans-serif', '#6a3a1c')
    },
  },
  beefcake: {
    label: tr('Monsieur Fédération', 'Mister Federation'),
    draw(c) {
      rays(c, 128, 170, '#2f5a9a', '#3d6db0')
      // Le costaud en maillot rayé, qui gonfle les deux biceps. Moustache réglementaire.
      figure(c, {
        head: [128, 92],
        shoulders: [[100, 124], [156, 124]], elbows: [[70, 118], [186, 118]], hands: [[74, 86], [182, 86]],
        hips: [[112, 210], [144, 210]], knees: [[106, 272], [150, 272]], feet: [[100, 334], [156, 334]],
        waist: 184,
      }, { skin: SKIN[1], hair: '#2a1a14', top: SKIN[1], bottom: '#d42a24', shoes: '#f4f4f0', style: 'short', lips: '#7a3a2a', broad: true })
      c.fillStyle = '#ffffff'
      for (let i = 0; i < 3; i++) c.fillRect(106, 190 + i * 8, 44, 3)
      ellipse(c, 128, 99, 9, 3, '#2a1a14')
      for (const x of [70, 186]) disc(c, x, 110, 12, SKIN[1])
      ribbon(c, tr('MONSIEUR FÉDÉRATION', 'MISTER FEDERATION'), 356, '#ffd23c', '#1c2f5c')
      title(c, tr('100 % MUSCLES, 0 % THARGOÏDE', '100% MUSCLE, 0% THARGOID'), 36, '800 12px sans-serif', '#ffffff')
    },
  },
}

// ---------------------------------------------------------------- affiche encadrée

const materials = new Map<string, THREE.MeshLambertMaterial>()

function artMaterial(key: string, draw: (c: Ctx, r: () => number) => void) {
  let m = materials.get(key)
  if (!m) {
    const random = rng([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))
    const map = keepShared(drawnTexture(W, H, (c) => draw(c, random)))
    materials.set(key, (m = keepShared(new THREE.MeshLambertMaterial({ map }))))
  }
  return m
}

/** Affiche sous un cadre mince (noir pour les films, doré pour les pin-up), accrochée au mur. */
function framed(key: string, draw: Film['draw'], frame: string): ReturnType<Builder> {
  const g = new THREE.Group()
  const w = 0.36, h = 0.54, y = 0.6
  g.add(box(w + 0.03, h + 0.03, 0.016, lit(frame), 0, y, 0.008, 0.004))
  g.add(mesh(new THREE.PlaneGeometry(w, h), artMaterial(key, draw), 0, y, 0.0165))
  return { solid: g }
}

/** Affiche de film. Film : `label` (cf. FILMS). */
const filmPoster: Builder = ({ label }) => {
  const id = FILMS[label ?? ''] ? label! : 'terminator'
  return framed(`film:${id}`, FILMS[id].draw, '#141414')
}

/** Pin-up rétro, punaisée : un coin retroussé. Modèle : `label` (cf. PINUPS). */
const pinupPoster: Builder = ({ label }) => {
  const id = PINUPS[label ?? ''] ? label! : 'sailor'
  const g = new THREE.Group()
  const w = 0.34, h = 0.51, y = 0.6
  g.add(box(w + 0.01, h + 0.01, 0.006, lit('#efe6cf'), 0, y, 0.003))
  g.add(mesh(new THREE.PlaneGeometry(w, h), artMaterial(`pinup:${id}`, PINUPS[id].draw), 0, y, 0.0065))
  for (const [x, yy] of [[-0.155, 0.84], [0.155, 0.84], [-0.155, 0.36]]) g.add(sphere(0.008, lit('#c0392b'), x, yy, 0.012, 6))
  // Le coin du bas à droite, décollé.
  const corner = mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(w / 2, y - h / 2 + 0.06, 0.007), new THREE.Vector3(w / 2 - 0.06, y - h / 2, 0.007), new THREE.Vector3(w / 2 - 0.02, y - h / 2 + 0.02, 0.03)]), lit('#f6f0de'))
  corner.geometry.computeVertexNormals()
  g.add(corner)
  return { solid: g }
}

export const POSTER_ART = {
  'film-poster': filmPoster,
  'pinup-poster': pinupPoster,
} satisfies Record<string, Builder>
