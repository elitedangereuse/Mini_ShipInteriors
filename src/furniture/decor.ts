import * as THREE from 'three'
import { cobraGeometry } from './cobra'
import { fabric, FABRIC, LEAVES } from './cozy'
import {
  animatedScreen, barZ, box, cylinder, drawnTexture, ED_ORANGE, glass, glow, holoMaterial, instanced, keepShared, lit,
  mesh, part, rng, setInstance, sphere, type Builder,
} from './kit'
import { tr } from '../i18n'

/*
 * Décoration des cabines (mode aménagement) : de quoi accrocher aux murs (affiches, cadres,
 * horloge, écran GalNet, étagère, applique, néon), des meubles et des plantes en plus, et
 * les petits objets qu'on pose sur les meubles (tasse, lampe à lave, globe, bougies…).
 *
 * Un objet accroché est construit dos au mur : origine sur la face du mur, au niveau du sol,
 * contenu vers +z. Les images (affiches, cadres, globes) sont dessinées une fois par variante.
 */

const C = {
  wood: '#9a6a45',
  woodDark: '#6b4630',
  woodLight: '#c49a6c',
  cream: '#fbf4e6',
  paper: '#f1e6cf',
  white: '#eef1f4',
  chrome: '#b9c1cc',
  steel: '#4f5866',
  steelDark: '#2a2e36',
  black: '#17181b',
  soil: '#3a2a1e',
  terracotta: '#b8653f',
  brass: '#c9a24a',
  lamp: '#ffdca6',
}

// ---------------------------------------------------------------- images

const printed = new Map<string, THREE.MeshLambertMaterial>()

/** Matériau imprimé (affiche, cadre, globe), dessiné une fois et partagé par tous les exemplaires. */
function printMaterial(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, random: () => number) => void) {
  let m = printed.get(key)
  if (!m) {
    const random = rng([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
    const map = keepShared(drawnTexture(w, h, (g) => draw(g, random)))
    printed.set(key, (m = keepShared(new THREE.MeshLambertMaterial({ map }))))
  }
  return m
}

function stars(g: CanvasRenderingContext2D, w: number, h: number, random: () => number, n: number) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.3 + random() * 0.7
    g.fillStyle = random() < 0.15 ? '#ffd9a8' : '#ffffff'
    const s = random() < 0.1 ? 2 : 1
    g.fillRect(random() * w, random() * h, s, s)
  }
  g.globalAlpha = 1
}

/** Halo lumineux (étoile, nébuleuse). */
function glowDisc(g: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)') {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

/** Planète éclairée de biais, avec ses anneaux au besoin. */
function planet(g: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string, ring?: string) {
  if (ring) {
    g.strokeStyle = ring
    g.lineWidth = r * 0.12
    g.beginPath()
    g.ellipse(x, y, r * 1.9, r * 0.45, -0.3, Math.PI, Math.PI * 2)
    g.stroke()
  }
  const grad = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r)
  grad.addColorStop(0, light)
  grad.addColorStop(1, dark)
  g.fillStyle = grad
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  if (ring) {
    g.beginPath()
    g.ellipse(x, y, r * 1.9, r * 0.45, -0.3, 0, Math.PI)
    g.stroke()
  }
}

/** La station Coriolis vue de face : un octogone et sa fente d'amarrage. */
function coriolis(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#c9ced8'
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  g.fill()
  g.fillStyle = '#7d8594'
  g.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62)
  }
  g.fill()
  g.fillStyle = '#12151c'
  g.fillRect(x - r * 0.32, y - r * 0.08, r * 0.64, r * 0.16)
  g.fillStyle = '#7dffa8'
  g.fillRect(x - r * 0.32, y + r * 0.1, r * 0.64, r * 0.03)
}

interface PosterDef {
  label: string
  title: string
  lines: [string, string]
  sky: [string, string]
  art: (g: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void
}

/** Affiches de voyage, à la façon des vieilles réclames, aux couleurs d'Elite. */
export const POSTERS: Record<string, PosterDef> = {
  colonia: {
    label: 'Colonia', title: 'COLONIA', sky: ['#12072e', '#8e2c6a'],
    lines: [tr('22 000 al de la Bulle', '22,000 ly from the Bubble'), tr('Le voyage d\'une vie', 'The journey of a lifetime')],
    art: (g, w, h, random) => {
      stars(g, w, h, random, 120)
      g.globalCompositeOperation = 'lighter'
      glowDisc(g, w * 0.45, h * 0.42, 110, 'rgba(255, 90, 170, 0.55)')
      glowDisc(g, w * 0.62, h * 0.5, 80, 'rgba(90, 140, 255, 0.5)')
      glowDisc(g, w * 0.4, h * 0.6, 60, 'rgba(255, 190, 110, 0.35)')
      for (let i = 0; i < 26; i++) glowDisc(g, w * 0.5 + (random() - 0.5) * 60, h * 0.47 + (random() - 0.5) * 50, 2 + random() * 5, 'rgba(255,255,255,0.95)')
      g.globalCompositeOperation = 'source-over'
    },
  },
  jameson: {
    label: 'Jameson Memorial', title: 'JAMESON MEMORIAL', sky: ['#081626', '#1f5e6e'],
    lines: ['Shinrarta Dezhra', tr('Réservé aux pilotes Elite', 'Elite pilots only')],
    art: (g, w, h, random) => {
      stars(g, w, h, random, 90)
      glowDisc(g, w * 0.22, h * 0.2, 70, 'rgba(255, 190, 90, 0.9)')
      planet(g, w * 0.78, h * 0.86, 90, '#6fa6c9', '#1c3348')
      coriolis(g, w * 0.52, h * 0.48, 58)
    },
  },
  hutton: {
    label: 'Hutton Orbital', title: 'HUTTON ORBITAL', sky: ['#2a1206', '#c06a2a'],
    lines: [tr('0,22 al de supercroisière', '0.22 ly of supercruise'), tr('Ça vaut le détour', 'Well worth the detour')],
    art: (g, w, h, random) => {
      stars(g, w, h * 0.6, random, 60)
      glowDisc(g, w * 0.5, h * 0.95, 160, 'rgba(255, 170, 80, 0.8)')
      // La tasse, trophée de ceux qui ont fait le trajet.
      const x = w * 0.42, y = h * 0.34, mw = 86, mh = 96
      g.fillStyle = '#f7f1e6'
      g.fillRect(x - mw / 2, y, mw, mh)
      g.beginPath()
      g.ellipse(x, y, mw / 2, 10, 0, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#f7f1e6'
      g.lineWidth = 12
      g.beginPath()
      g.arc(x + mw / 2, y + mh / 2, 24, -Math.PI / 2, Math.PI / 2)
      g.stroke()
      g.fillStyle = ED_ORANGE
      g.fillRect(x - mw / 2, y + 30, mw, 16)
      g.fillStyle = '#3a1a08'
      g.font = '800 22px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('HO', x, y + 78)
    },
  },
  sagittarius: {
    label: 'Sagittarius A*', title: 'SAGITTARIUS A*', sky: ['#050308', '#2a1236'],
    lines: [tr('Le cœur de la galaxie', 'The heart of the galaxy'), tr('25 900 al de Sol', '25,900 ly from Sol')],
    art: (g, w, h, random) => {
      stars(g, w, h, random, 140)
      const x = w * 0.5, y = h * 0.45
      g.globalCompositeOperation = 'lighter'
      glowDisc(g, x, y, 110, 'rgba(255, 150, 60, 0.45)')
      g.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = ['#fff3c4', '#ffc46a', '#ff8a3c', '#d9542a', '#ffe2a0'][i]
        g.lineWidth = 7 - i
        g.beginPath()
        g.ellipse(x, y, 92 - i * 7, 22 - i * 1.5, -0.2, 0, Math.PI * 2)
        g.stroke()
      }
      g.fillStyle = '#000'
      g.beginPath()
      g.arc(x, y, 30, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(255, 220, 160, 0.8)'
      g.lineWidth = 2
      g.stroke()
    },
  },
  thargoid: {
    label: tr('Thargoïdes', 'Thargoids'), title: tr('RESTEZ VIGILANTS', 'STAY VIGILANT'), sky: ['#010805', '#0e3a24'],
    lines: [tr('Signalez toute activité', 'Report all Thargoid'), tr('thargoïde à Aegis', 'activity to Aegis')],
    art: (g, w, h, random) => {
      stars(g, w, h, random, 70)
      const x = w * 0.5, y = h * 0.44
      g.globalCompositeOperation = 'lighter'
      glowDisc(g, x, y, 120, 'rgba(70, 255, 170, 0.35)')
      g.globalCompositeOperation = 'source-over'
      // Silhouette d'Interceptor : une fleur à cinq pétales.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        g.save()
        g.translate(x + Math.cos(a) * 36, y + Math.sin(a) * 36)
        g.rotate(a + Math.PI / 2)
        g.fillStyle = '#0b1a14'
        g.beginPath()
        g.ellipse(0, 0, 20, 44, 0, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#5dffb0'
        g.lineWidth = 2
        g.stroke()
        g.restore()
      }
      glowDisc(g, x, y, 22, 'rgba(160, 255, 210, 1)', 'rgba(40, 200, 120, 0)')
    },
  },
  beagle: {
    label: 'Beagle Point', title: 'BEAGLE POINT', sky: ['#000000', '#101a3a'],
    lines: [tr('65 279 al de Sol', '65,279 ly from Sol'), tr('Au bout de la galaxie', 'At the edge of the galaxy')],
    art: (g, w, h, random) => {
      stars(g, w, h * 0.5, random, 25)
      // La galaxie, vue de son bord : une bande d'étoiles à l'horizon.
      g.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 420; i++) {
        const x = random() * w, y = h * 0.72 + (random() - 0.5) * 60 * (1 - Math.abs(x / w - 0.5))
        glowDisc(g, x, y, 1 + random() * 2.5, `rgba(${200 + random() * 55}, ${170 + random() * 60}, 255, 0.8)`)
      }
      glowDisc(g, w * 0.5, h * 0.72, 120, 'rgba(120, 140, 255, 0.35)')
      g.globalCompositeOperation = 'source-over'
      planet(g, w * 0.28, h * 0.3, 26, '#d9c7a8', '#4a3f33')
    },
  },
  comete: {
    label: 'Comète', title: 'COMÈTE', sky: ['#fbe3c4', '#e89a6a'],
    lines: [tr('Chat du bord', 'Ship\'s cat'), tr('Ne pas nourrir après un saut', 'Do not feed after a jump')],
    art: (g, w, h) => {
      const x = w * 0.5, y = h * 0.46
      g.fillStyle = '#8a8f99'
      for (const s of [-1, 1]) {
        g.beginPath()
        g.moveTo(x + s * 62, y - 20)
        g.lineTo(x + s * 50, y - 88)
        g.lineTo(x + s * 14, y - 52)
        g.fill()
      }
      g.beginPath()
      g.ellipse(x, y, 72, 62, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#f2c4c4'
      for (const s of [-1, 1]) {
        g.beginPath()
        g.moveTo(x + s * 52, y - 34)
        g.lineTo(x + s * 46, y - 70)
        g.lineTo(x + s * 26, y - 48)
        g.fill()
      }
      g.fillStyle = '#1b1d24'
      for (const s of [-1, 1]) {
        g.beginPath()
        g.ellipse(x + s * 26, y - 6, 9, 13, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#e8457c'
      g.beginPath()
      g.moveTo(x - 8, y + 16)
      g.lineTo(x + 8, y + 16)
      g.lineTo(x, y + 24)
      g.fill()
      g.strokeStyle = '#3a3e46'
      g.lineWidth = 2
      for (const s of [-1, 1]) {
        for (const dy of [-4, 6]) {
          g.beginPath()
          g.moveTo(x + s * 30, y + 22 + dy)
          g.lineTo(x + s * 76, y + 16 + dy * 1.6)
          g.stroke()
        }
      }
    },
  },
  guardians: {
    label: tr('Gardiens', 'Guardians'), title: tr('LES GARDIENS', 'THE GUARDIANS'), sky: ['#02141c', '#0a3f52'],
    lines: [tr('Ruines de Synuefe', 'Ruins of Synuefe'), tr('Un peuple disparu', 'A lost civilisation')],
    art: (g, w, h, random) => {
      stars(g, w, h * 0.5, random, 60)
      g.fillStyle = '#081a20'
      g.fillRect(0, h * 0.78, w, h)
      for (const [x, s] of [[0.28, 0.8], [0.52, 1.1], [0.76, 0.9]] as const) {
        const bx = w * x, top = h * (0.78 - 0.34 * s), half = 16 * s
        g.fillStyle = '#10262e'
        g.beginPath()
        g.moveTo(bx - half, h * 0.78)
        g.lineTo(bx - half * 0.6, top)
        g.lineTo(bx + half * 0.6, top)
        g.lineTo(bx + half, h * 0.78)
        g.fill()
        g.strokeStyle = '#59d8ff'
        g.lineWidth = 2
        g.stroke()
        g.globalCompositeOperation = 'lighter'
        glowDisc(g, bx, top + 20 * s, 18 * s, 'rgba(90, 220, 255, 0.9)')
        g.globalCompositeOperation = 'source-over'
      }
    },
  },
}

/** Réclame : papier crème, illustration, grand titre et deux lignes. */
function posterMaterial(id: string) {
  const def = POSTERS[id] ?? POSTERS.colonia
  return printMaterial(`poster:${id}`, 256, 360, (g, random) => {
    const W = 256, H = 360, m = 10, art = H - 96
    g.fillStyle = C.paper
    g.fillRect(0, 0, W, H)
    const sky = g.createLinearGradient(0, m, 0, art)
    sky.addColorStop(0, def.sky[0])
    sky.addColorStop(1, def.sky[1])
    g.fillStyle = sky
    g.fillRect(m, m, W - 2 * m, art - m)
    g.save()
    g.beginPath()
    g.rect(m, m, W - 2 * m, art - m)
    g.clip()
    g.translate(m, m)
    def.art(g, W - 2 * m, art - m, random)
    g.restore()
    g.fillStyle = '#2a1d14'
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = `800 ${def.title.length > 12 ? 24 : 34}px system-ui, "Segoe UI", sans-serif`
    g.fillText(def.title, W / 2, art + 40)
    g.fillStyle = '#6b4630'
    g.font = '600 15px system-ui, "Segoe UI", sans-serif'
    def.lines.forEach((l, i) => g.fillText(l, W / 2, art + 62 + i * 18))
  })
}

// ---------------------------------------------------------------- aux murs

/** Affiche de voyage (variante : cf. POSTERS), punaisée au mur. */
const poster: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(box(0.37, 0.52, 0.012, lit(C.paper), 0, 0.6, 0.006))
  g.add(mesh(new THREE.PlaneGeometry(0.36, 0.506), posterMaterial(label ?? 'colonia'), 0, 0.6, 0.0125))
  for (const [x, y] of [[-0.16, 0.83], [0.16, 0.83], [-0.16, 0.37], [0.16, 0.37]]) g.add(sphere(0.008, lit('#c0392b'), x, y, 0.016, 6))
  return { solid: g }
}

/** Tableaux encadrés (paysages spatiaux). */
export const FRAMES: Record<string, { label: string; draw: (g: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void }> = {
  ringed: {
    label: tr('Géante à anneaux', 'Ringed giant'),
    draw: (g, w, h, random) => {
      g.fillStyle = '#070a18'
      g.fillRect(0, 0, w, h)
      stars(g, w, h, random, 80)
      planet(g, w * 0.55, h * 0.42, 46, '#f0cf96', '#7a4a2a', 'rgba(230, 210, 170, 0.8)')
      g.fillStyle = '#2b2622'
      g.beginPath()
      g.ellipse(w * 0.3, h * 1.15, w * 0.6, h * 0.35, 0, 0, Math.PI * 2)
      g.fill()
    },
  },
  earthlike: {
    label: tr('Monde terrestre', 'Earth-like world'),
    draw: (g, w, h, random) => {
      g.fillStyle = '#03060e'
      g.fillRect(0, 0, w, h)
      stars(g, w, h, random, 90)
      planet(g, w * 0.4, h * 0.55, 62, '#7fc4ff', '#0d2a5a')
      g.globalAlpha = 0.8
      g.fillStyle = '#5aa35a'
      for (let i = 0; i < 6; i++) {
        g.beginPath()
        g.ellipse(w * 0.4 + (random() - 0.5) * 70, h * 0.55 + (random() - 0.5) * 60, 8 + random() * 14, 5 + random() * 8, random() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      planet(g, w * 0.82, h * 0.25, 12, '#d9d9d9', '#555')
    },
  },
  nebula: {
    label: tr('Nébuleuse', 'Nebula'),
    draw: (g, w, h, random) => {
      g.fillStyle = '#05030c'
      g.fillRect(0, 0, w, h)
      stars(g, w, h, random, 110)
      g.globalCompositeOperation = 'lighter'
      glowDisc(g, w * 0.35, h * 0.5, 80, 'rgba(90, 120, 255, 0.55)')
      glowDisc(g, w * 0.6, h * 0.45, 70, 'rgba(255, 80, 150, 0.5)')
      glowDisc(g, w * 0.5, h * 0.6, 50, 'rgba(120, 255, 200, 0.3)')
      g.globalCompositeOperation = 'source-over'
    },
  },
  station: {
    label: tr('Station Coriolis', 'Coriolis station'),
    draw: (g, w, h, random) => {
      g.fillStyle = '#060912'
      g.fillRect(0, 0, w, h)
      stars(g, w, h, random, 70)
      planet(g, w * 0.2, h * 0.9, 90, '#c48a5a', '#3a2214')
      coriolis(g, w * 0.62, h * 0.42, 40)
    },
  },
}

/** Tableau encadré de bois (variante : cf. FRAMES). */
const frame: Builder = ({ label }) => {
  const id = FRAMES[label ?? ''] ? label! : 'ringed'
  const g = new THREE.Group()
  const wood = lit(C.woodDark, 'wood')
  g.add(box(0.46, 0.34, 0.02, wood, 0, 0.62, 0.01))
  g.add(box(0.4, 0.28, 0.004, lit(C.cream), 0, 0.62, 0.022))
  g.add(mesh(new THREE.PlaneGeometry(0.36, 0.24), printMaterial(`frame:${id}`, 256, 172, (c, random) => FRAMES[id].draw(c, 256, 172, random)), 0, 0.62, 0.0245))
  return { solid: g }
}

/** Horloge murale : elle donne l'heure de l'appareil du joueur. */
const wallClock: Builder = () => {
  const g = new THREE.Group()
  const rim = barZ(0.13, 0.03, lit(C.steelDark, 'metal'), 0, 0.72, 0.015, 28)
  g.add(rim, barZ(0.118, 0.032, lit(C.cream), 0, 0.72, 0.017, 28))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.add(box(0.008, i % 3 ? 0.012 : 0.022, 0.004, lit(C.black), Math.sin(a) * 0.1, 0.72 + Math.cos(a) * 0.1, 0.034))
  }
  g.add(sphere(0.008, lit(ED_ORANGE), 0, 0.72, 0.036, 6))
  const live = new THREE.Group()
  const hand = (len: number, w: number, color: string) => {
    const pivot = new THREE.Group()
    pivot.position.set(0, 0.72, 0.036)
    pivot.add(part(new THREE.BoxGeometry(w, len, 0.003), lit(color), 0, len / 2 - 0.01, 0))
    live.add(pivot)
    return pivot
  }
  const hours = hand(0.06, 0.012, C.black), minutes = hand(0.09, 0.008, C.black), seconds = hand(0.095, 0.003, '#c0392b')
  let last = -1
  return {
    solid: g,
    live,
    update: () => {
      const now = new Date()
      const s = now.getSeconds()
      if (s === last) return
      last = s
      const m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60
      seconds.rotation.z = -(s / 60) * Math.PI * 2
      minutes.rotation.z = -(m / 60) * Math.PI * 2
      hours.rotation.z = -(h / 12) * Math.PI * 2
    },
  }
}

const HEADLINES = [
  tr('Des Thargoïdes aperçus près de Maia', 'Thargoids sighted near Maia'),
  tr('La painite s\'envole à Jameson Memorial', 'Painite prices soar at Jameson Memorial'),
  tr('Hutton Orbital : record de visiteurs (trois)', 'Hutton Orbital: record visitor numbers (three)'),
  tr('Colonia fête un nouveau record de colons', 'Colonia celebrates a record number of colonists'),
  tr('Les Ingénieurs rouvrent leurs ateliers', 'Engineers reopen their workshops'),
  tr('Un CMDR rejoint Sagittarius A* en Sidewinder', 'CMDR reaches Sagittarius A* in a Sidewinder'),
]

/** Shared GalNet casing, also used by the crew's honours screen. */
export function wallScreenHousing(w = 0.64, h = 0.38, y = 0.56): THREE.Group {
  const g = new THREE.Group()
  g.add(box(w, h, 0.03, lit(C.black), 0, y, 0.015, 0.01),
    box(0.1, 0.04, 0.02, lit(C.steelDark, 'metal'), 0, y, 0.005))
  return g
}

/** Écran mural : le fil d'infos de GalNet qui défile, et une planète qui tourne. */
const wallScreen: Builder = () => {
  const g = wallScreenHousing()
  const screen = animatedScreen(160, 90, 12, (c, t) => {
    const grad = c.createLinearGradient(0, 0, 0, 90)
    grad.addColorStop(0, '#081626')
    grad.addColorStop(1, '#102c44')
    c.fillStyle = grad
    c.fillRect(0, 0, 160, 90)
    c.fillStyle = ED_ORANGE
    c.fillRect(0, 0, 160, 14)
    c.fillStyle = '#1a0c02'
    c.font = '800 10px system-ui, sans-serif'
    c.fillText('GALNET', 5, 11)
    c.fillStyle = '#ffe2c0'
    c.font = '9px system-ui, sans-serif'
    c.fillText(tr('EN DIRECT', 'LIVE'), 118, 11)
    // Planète qui tourne (ses bandes glissent).
    const px = 42, py = 48, r = 22
    c.save()
    c.beginPath()
    c.arc(px, py, r, 0, Math.PI * 2)
    c.clip()
    for (let i = -2; i < 8; i++) {
      c.fillStyle = i % 2 ? '#c9894a' : '#e8c890'
      c.fillRect(px - r, py - r + (((i * 7 + t * 4) % 50) + 50) % 50 - 4, r * 2, 5)
    }
    const shade = c.createRadialGradient(px - 8, py - 8, 4, px, py, r)
    shade.addColorStop(0, 'rgba(255,255,255,0.15)')
    shade.addColorStop(1, 'rgba(0,0,0,0.55)')
    c.fillStyle = shade
    c.fillRect(px - r, py - r, r * 2, r * 2)
    c.restore()
    c.fillStyle = '#9fd8ff'
    c.font = '700 9px system-ui, sans-serif'
    c.fillText(tr('SYSTÈME', 'SYSTEM'), 74, 34)
    c.fillStyle = '#e6f2ff'
    c.font = '8px system-ui, sans-serif'
    c.fillText(tr('Classe G · 4 planètes', 'Class G · 4 planets'), 74, 46)
    const traffic = 40 + (Math.floor(t / 7) % 30)
    c.fillText(tr(`Trafic : ${traffic} vaisseaux`, `Traffic: ${traffic} ships`), 74, 57)
    // Bandeau d'infos.
    c.fillStyle = 'rgba(0,0,0,0.55)'
    c.fillRect(0, 74, 160, 16)
    const news = HEADLINES.join('   ·   ')
    c.fillStyle = '#ffffff'
    c.font = '9px system-ui, sans-serif'
    const width = c.measureText(news).width + 40
    c.fillText(news, 160 - ((t * 28) % width), 85)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.6, 0.34), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.56, 0.031))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/** Étagère murale : une planche sur deux équerres, prête à recevoir des objets. */
const wallShelf: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.62, 0.025, 0.16, lit(C.wood, 'wood'), 0, 0.5, 0.08, 0.006))
  for (const x of [-0.24, 0.24]) {
    g.add(box(0.02, 0.1, 0.012, lit(C.steelDark, 'metal'), x, 0.44, 0.006))
    const strut = box(0.012, 0.13, 0.012, lit(C.steelDark, 'metal'), x, 0.445, 0.06)
    strut.rotation.x = -0.9
    g.add(strut)
  }
  return { solid: g }
}

/** Applique murale : une demi-coupe lumineuse. */
const sconce: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.06, 0.12, 0.012, lit(C.brass, 'metal'), 0, 0.72, 0.006), barZ(0.008, 0.06, lit(C.brass, 'metal'), 0, 0.7, 0.04, 6))
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.07, 14, 1, false, 0, Math.PI), glow(C.lamp), 0, 0.74, 0.06))
  return { solid: g }
}

/** Couleurs du néon mural : halo du tube et cœur presque blanc. Rose : celle d'origine. */
export const NEON_COLORS: Record<string, { label: string; tube: string; core: string }> = {
  pink: { label: tr('Rose', 'Pink'), tube: '#ff4fd8', core: '#ffd6f6' },
  orange: { label: tr('Orange Elite', 'Elite orange'), tube: '#ff8a1c', core: '#ffe2bf' },
  cyan: { label: tr('Cyan', 'Cyan'), tube: '#39d5ff', core: '#d6f6ff' },
  green: { label: tr('Vert', 'Green'), tube: '#4dff7a', core: '#dcffe4' },
  purple: { label: tr('Violet', 'Purple'), tube: '#9a5cff', core: '#e6dcff' },
  white: { label: tr('Blanc', 'White'), tube: '#bfd4ff', core: '#ffffff' },
}

const neonTextures = new Map<string, THREE.Texture>()

/**
 * Néon mural, sans plaque : le tube seul, qui grésille de temps en temps.
 * `label` : « texte|couleur » (cf. NEON_COLORS ; rose par défaut).
 */
const wallNeon: Builder = ({ label = 'o7' }) => {
  const [text, colorId] = label.split('|')
  const color = NEON_COLORS[colorId] ?? NEON_COLORS.pink
  const key = `${text}|${color.tube}`
  let texture = neonTextures.get(key)
  if (!texture) {
    texture = keepShared(
      drawnTexture(512, 192, (c) => {
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.font = `800 ${text.length > 6 ? 76 : text.length > 2 ? 108 : 164}px system-ui, sans-serif`
        c.shadowColor = color.tube
        c.shadowBlur = 26
        c.fillStyle = color.core
        c.fillText(text, 256, 100)
        c.fillText(text, 256, 100)
      }),
    )
    neonTextures.set(key, texture)
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  // Pas de plaque : deux fixations discrètes suffisent à accrocher le tube au mur.
  const g = new THREE.Group()
  for (const x of [-0.3, 0.3]) g.add(barZ(0.008, 0.02, lit(C.steelDark, 'metal'), x, 0.74, 0.01, 6))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.8, 0.3), material, 0, 0.74, 0.02))
  return {
    solid: g,
    live,
    update: (t) => {
      const crisis = Math.sin(t * 0.6) + Math.sin(t * 2.7) * 0.5 > 1.3
      material.opacity = crisis && Math.sin(t * 70) > 0 ? 0.35 : 1
    },
  }
}

// ---------------------------------------------------------------- mobilier

/** Fauteuil club, tissu : `label`. */
const armchair: Builder = ({ label }) => {
  const g = new THREE.Group()
  const cloth = fabric(label, 'teal')
  g.add(box(0.56, 0.14, 0.52, cloth, 0, 0.13, 0.02, 0.04), box(0.4, 0.09, 0.4, cloth, 0, 0.24, 0.06, 0.04))
  g.add(box(0.56, 0.36, 0.14, cloth, 0, 0.34, -0.2, 0.05))
  for (const x of [-0.24, 0.24]) g.add(box(0.1, 0.24, 0.5, cloth, x, 0.25, 0.02, 0.04))
  g.add(box(0.2, 0.16, 0.06, lit(FABRIC.cream, 'cloth'), 0.05, 0.36, -0.1, 0.03))
  for (const x of [-0.22, 0.22]) for (const z of [-0.19, 0.22]) g.add(cylinder(0.018, 0.014, 0.06, lit(C.woodDark, 'wood'), x, 0.03, z, 6))
  return { solid: g }
}

/** Guéridon rond, plateau nu. */
const sideTable: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.17, 0.17, 0.025, lit(C.wood, 'wood'), 0, 0.3, 0, 20), cylinder(0.02, 0.025, 0.28, lit(C.woodDark, 'wood'), 0, 0.15, 0, 8))
  g.add(cylinder(0.1, 0.12, 0.02, lit(C.woodDark, 'wood'), 0, 0.01, 0, 14))
  return { solid: g }
}

/** Commode à trois tiroirs, dessus nu. */
const dresser: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.8, 0.42, 0.36, lit(C.wood, 'wood'), 0, 0.23, 0, 0.015), box(0.84, 0.03, 0.38, lit(C.woodDark, 'wood'), 0, 0.455, 0, 0.01))
  for (let i = 0; i < 3; i++) {
    const y = 0.1 + i * 0.12
    g.add(box(0.74, 0.1, 0.01, lit(C.woodLight, 'wood'), 0, y, 0.182), box(0.1, 0.015, 0.015, lit(C.brass, 'metal'), 0, y, 0.192))
  }
  for (const x of [-0.36, 0.36]) g.add(box(0.04, 0.03, 0.3, lit(C.woodDark, 'wood'), x, 0.015, 0))
  return { solid: g }
}

/** Caisse de fret, cerclée d'orange et marquée au pochoir. */
const crate: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.46, 0.4, 0.46, lit('#5a5f3a'), 0, 0.2, 0, 0.02))
  for (const y of [0.05, 0.35]) g.add(box(0.47, 0.035, 0.47, lit(ED_ORANGE), 0, y, 0))
  for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) g.add(box(0.05, 0.4, 0.05, lit('#3a3e2a'), x, 0.2, z))
  g.add(box(0.2, 0.1, 0.005, lit('#e9e2c6'), 0, 0.2, 0.232), box(0.12, 0.02, 0.004, lit(C.black), 0, 0.22, 0.235), box(0.08, 0.02, 0.004, lit(C.black), 0, 0.18, 0.235))
  return { solid: g }
}

/** Grande plante à larges feuilles (monstera) dans un pot de céramique. */
const monstera: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.16, 0.13, 0.26, lit('#2f3a44'), 0, 0.13, 0, 14), cylinder(0.15, 0.15, 0.02, lit(C.soil), 0, 0.255, 0, 14))
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + random() * 0.4
    const stem = new THREE.Group()
    stem.position.set(0, 0.26, 0)
    stem.rotation.y = a
    const h = 0.25 + random() * 0.3
    const s = cylinder(0.007, 0.009, h, lit('#4f7a3a'), 0, h / 2, 0.02, 5)
    s.rotation.x = 0.35
    const leaf = mesh(new THREE.CircleGeometry(0.1 + random() * 0.04, 9), lit(LEAVES[i % 4]), 0, h + 0.01, 0.1 + h * 0.3)
    leaf.rotation.x = -Math.PI / 2 + 0.5 + random() * 0.4
    leaf.scale.set(1, 1.3, 1)
    stem.add(s, leaf)
    g.add(stem)
  }
  return { solid: g }
}

/** Couleurs des plantes exobiologiques : tige, bulbes lumineux. */
const EXOBIO: Record<string, { stem: string; bulb: string }> = {
  anemone: { stem: '#5a2a6a', bulb: '#ff6ad5' },
  brain: { stem: '#1f4a5a', bulb: '#5ff2ff' },
  crystal: { stem: '#3a4a2a', bulb: '#b8ff5a' },
}

/** Spécimen d'exobiologie en pot : des bulbes qui pulsent doucement dans la pénombre. */
const exobioPlant: Builder = ({ label, random }) => {
  const c = EXOBIO[label ?? ''] ?? EXOBIO.anemone
  const g = new THREE.Group()
  g.add(cylinder(0.15, 0.12, 0.22, lit(C.steelDark, 'metal'), 0, 0.11, 0, 14), cylinder(0.14, 0.14, 0.02, lit('#22182a'), 0, 0.215, 0, 14))
  g.add(cylinder(0.152, 0.152, 0.02, glow(c.bulb), 0, 0.17, 0, 14))
  const tips: [number, number, number][] = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + random() * 0.5, r = 0.03 + random() * 0.07, h = 0.2 + random() * 0.3
    const stalk = cylinder(0.012, 0.018, h, lit(c.stem), Math.cos(a) * r * 0.5, 0.22 + h / 2, Math.sin(a) * r * 0.5, 5)
    stalk.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25)
    g.add(stalk)
    tips.push([Math.cos(a) * (r * 0.5 + h * 0.25), 0.22 + h, Math.sin(a) * (r * 0.5 + h * 0.25)])
  }
  const bulbs = instanced(new THREE.IcosahedronGeometry(0.035, 1), tips.map(() => c.bulb))
  const live = new THREE.Group()
  live.add(bulbs)
  return {
    solid: g,
    live,
    update: (t) => {
      tips.forEach(([x, y, z], i) => setInstance(bulbs, i, x, y + Math.sin(t * 1.3 + i) * 0.008, z, 0.8 + 0.3 * Math.sin(t * 2 + i * 1.7)))
      bulbs.instanceMatrix.needsUpdate = true
    },
  }
}

/** Lunette astronomique en laiton sur trépied, pointée vers les hublots. */
const telescope: Builder = () => {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = box(0.02, 0.5, 0.02, lit(C.woodDark, 'wood'), Math.cos(a) * 0.1, 0.24, Math.sin(a) * 0.1)
    leg.rotation.set(-Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35)
    g.add(leg)
  }
  g.add(sphere(0.03, lit(C.brass, 'metal'), 0, 0.5, 0, 8))
  const tube = new THREE.Group()
  tube.position.set(0, 0.52, 0)
  tube.rotation.x = -0.5
  tube.add(barZ(0.04, 0.5, lit(C.brass, 'metal'), 0, 0, 0.05, 14), barZ(0.05, 0.08, lit(C.woodDark, 'wood'), 0, 0, 0.3, 14), barZ(0.018, 0.08, lit(C.black), 0, 0, -0.22, 8))
  g.add(tube)
  return { solid: g }
}

/** Guitare folk sur son support. */
const guitar: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.26, 0.02, 0.2, lit(C.steelDark, 'metal'), 0, 0.01, 0), box(0.02, 0.3, 0.02, lit(C.steelDark, 'metal'), 0, 0.15, -0.08))
  const body = new THREE.Group()
  body.position.set(0, 0.03, 0)
  body.rotation.x = -0.18
  const wood = lit('#c98a4a')
  body.add(cylinder(0.11, 0.11, 0.07, wood, 0, 0.14, 0, 18).rotateX(Math.PI / 2), cylinder(0.085, 0.085, 0.07, wood, 0, 0.3, 0, 18).rotateX(Math.PI / 2))
  body.add(cylinder(0.035, 0.035, 0.072, lit(C.black), 0, 0.24, 0, 12).rotateX(Math.PI / 2))
  body.add(box(0.04, 0.34, 0.025, lit(C.woodDark, 'wood'), 0, 0.52, 0.02), box(0.06, 0.08, 0.025, lit(C.woodDark, 'wood'), 0, 0.72, 0.02))
  body.add(box(0.1, 0.012, 0.012, lit(C.black), 0, 0.12, 0.04))
  g.add(body)
  return { solid: g }
}

/** Vitrine : une maquette de Cobra Mk III qui tourne lentement sous verre. */
const displayCase: Builder = ({ label }) => {
  const hull = SHIP_COLORS[label ?? ''] ?? SHIP_COLORS.silver
  const g = new THREE.Group()
  g.add(box(0.4, 0.4, 0.4, lit(C.steelDark, 'metal'), 0, 0.2, 0, 0.02), box(0.42, 0.02, 0.42, lit(ED_ORANGE), 0, 0.41, 0))
  g.add(box(0.42, 0.03, 0.42, lit(C.steelDark, 'metal'), 0, 0.88, 0), box(0.3, 0.012, 0.012, glow(C.lamp), 0, 0.862, 0.18))
  for (const [x, z] of [[-0.195, -0.195], [0.195, -0.195], [-0.195, 0.195], [0.195, 0.195]]) g.add(box(0.015, 0.46, 0.015, lit(C.chrome, 'metal'), x, 0.64, z))
  g.add(box(0.14, 0.03, 0.005, lit(C.brass, 'metal'), 0, 0.3, 0.202))
  const live = new THREE.Group()
  live.add(part(new THREE.BoxGeometry(0.38, 0.45, 0.38), glass('#d8ecff', 0.14), 0, 0.64, 0))
  const ship = part(cobraGeometry(), lit(hull), 0, 0.62, 0)
  ship.scale.setScalar(0.15)
  live.add(ship)
  return {
    solid: g,
    live,
    update: (t) => {
      ship.rotation.set(0.15 + Math.sin(t * 0.7) * 0.05, t * 0.5, 0)
      ship.position.y = 0.62 + Math.sin(t * 1.1) * 0.01
    },
  }
}

/** Tapis rond, trois cercles. Palette : `label` (warm, blue, bath, neon, rubber, cf. RUGS dans cozy.ts). */
const ROUND_RUGS: Record<string, [string, string, string]> = {
  warm: ['#b8563a', '#efe0c4', '#d9a441'],
  blue: ['#34507a', '#e9e2d0', '#8fae7e'],
  bath: ['#6fa8b8', '#dff0f4', '#ffffff'],
  neon: ['#241640', '#3a2766', '#ff4fd8'],
  rubber: ['#2a2d33', '#3a3e46', '#5a5f68'],
}
const rugRound: Builder = ({ label }) => {
  const [border, field, center] = ROUND_RUGS[label ?? ''] ?? ROUND_RUGS.warm
  const g = new THREE.Group()
  g.add(cylinder(0.7, 0.7, 0.012, lit(border), 0, 0.012, 0, 40), cylinder(0.6, 0.6, 0.014, lit(field), 0, 0.014, 0, 40))
  g.add(cylinder(0.24, 0.24, 0.016, lit(center), 0, 0.015, 0, 32))
  return { solid: g }
}

// ---------------------------------------------------------------- petits objets

/** La tasse de Hutton Orbital, souvenir de ceux qui ont fait le trajet. */
const mug: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.035, 0.032, 0.075, lit(C.white), 0, 0.0375, 0, 14), cylinder(0.036, 0.036, 0.018, lit(ED_ORANGE), 0, 0.045, 0, 14))
  g.add(cylinder(0.03, 0.03, 0.004, lit('#4a2c1c'), 0, 0.072, 0, 12))
  const handle = mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 10), lit(C.white), 0.038, 0.04, 0)
  g.add(handle)
  return { solid: g }
}

const LAVA: Record<string, { liquid: string; blob: string }> = {
  orange: { liquid: '#ffcf7a', blob: '#ff5a1c' },
  violet: { liquid: '#c9a0ff', blob: '#ff3bb0' },
  green: { liquid: '#b8ffd0', blob: '#29d97a' },
}

/** Lampe à lave : des bulles qui montent et redescendent, hypnotiques. Couleur : `label`. */
const lavaLamp: Builder = ({ label, random }) => {
  const c = LAVA[label ?? ''] ?? LAVA.orange
  const g = new THREE.Group()
  g.add(cylinder(0.035, 0.055, 0.08, lit(C.chrome, 'metal'), 0, 0.04, 0, 14), cylinder(0.02, 0.035, 0.05, lit(C.chrome, 'metal'), 0, 0.31, 0, 14))
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.028, 0.045, 0.2, 16, 1, true), holoMaterial(null, c.liquid, 0.35, 0, true), 0, 0.18, 0))
  const blobs = instanced(new THREE.SphereGeometry(1, 10, 8), [c.blob, c.blob, c.blob, c.blob])
  const seeds = [0, 1, 2, 3].map(() => ({ phase: random() * 6, speed: 0.25 + random() * 0.2, size: 0.012 + random() * 0.01 }))
  const scale = new THREE.Vector3()
  live.add(blobs)
  return {
    solid: g,
    live,
    update: (t) => {
      seeds.forEach((s, i) => {
        const k = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase)
        setInstance(blobs, i, Math.sin(t * 0.3 + i) * 0.008, 0.1 + k * 0.15, Math.cos(t * 0.4 + i) * 0.008, scale.set(s.size, s.size * 1.4, s.size))
      })
      blobs.instanceMatrix.needsUpdate = true
    },
  }
}

/** Globes : Terre, Mars, géante gazeuse (textures équirectangulaires). */
export const GLOBES: Record<string, { label: string; draw: (g: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void }> = {
  earth: {
    label: tr('Terre', 'Earth'),
    draw: (g, w, h, random) => {
      g.fillStyle = '#2f6fb0'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 18; i++) {
        g.fillStyle = random() < 0.7 ? '#4f9a4a' : '#b89a5a'
        g.beginPath()
        g.ellipse(random() * w, h * 0.2 + random() * h * 0.6, 8 + random() * 26, 6 + random() * 16, random() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#f4f8ff'
      g.fillRect(0, 0, w, h * 0.07)
      g.fillRect(0, h * 0.93, w, h * 0.07)
    },
  },
  mars: {
    label: 'Mars',
    draw: (g, w, h, random) => {
      g.fillStyle = '#b5552e'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 22; i++) {
        g.fillStyle = random() < 0.5 ? '#8a3a1e' : '#d9804a'
        g.beginPath()
        g.ellipse(random() * w, random() * h, 6 + random() * 22, 4 + random() * 10, random() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#f4f0ea'
      g.fillRect(0, 0, w, h * 0.06)
    },
  },
  gas: {
    label: tr('Géante gazeuse', 'Gas giant'),
    draw: (g, w, h) => {
      for (let y = 0; y < h; y += 4) {
        const k = Math.sin(y * 0.19) * 0.5 + Math.sin(y * 0.07) * 0.5
        g.fillStyle = k > 0.3 ? '#e8c890' : k > -0.2 ? '#c9894a' : '#a8683a'
        g.fillRect(0, y, w, 4)
      }
      g.fillStyle = '#c0442a'
      g.beginPath()
      g.ellipse(w * 0.6, h * 0.62, 14, 7, 0, 0, Math.PI * 2)
      g.fill()
    },
  },
}

/** Globe sur pied, qui tourne lentement. Planète : `label` (cf. GLOBES). */
const globe: Builder = ({ label }) => {
  const id = GLOBES[label ?? ''] ? label! : 'earth'
  const g = new THREE.Group()
  g.add(cylinder(0.05, 0.06, 0.02, lit(C.woodDark, 'wood'), 0, 0.01, 0, 14), cylinder(0.008, 0.008, 0.06, lit(C.brass, 'metal'), 0, 0.05, 0, 6))
  const arc = mesh(new THREE.TorusGeometry(0.085, 0.005, 5, 24, Math.PI), lit(C.brass, 'metal'), 0, 0.16, 0)
  arc.rotation.set(0, Math.PI / 2, 0.41)
  g.add(arc)
  const live = new THREE.Group()
  const ball = part(new THREE.SphereGeometry(0.075, 24, 16), printMaterial(`globe:${id}`, 256, 128, (c, random) => GLOBES[id].draw(c, 256, 128, random)), 0, 0.16, 0)
  ball.rotation.z = 0.41
  live.add(ball)
  return { solid: g, live, update: (t) => (ball.rotation.y = t * 0.4) }
}

/** Petite plante grasse en pot. */
const succulent: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.05, 0.04, 0.06, lit(C.terracotta), 0, 0.03, 0, 12), cylinder(0.045, 0.045, 0.01, lit(C.soil), 0, 0.058, 0, 12))
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + random() * 0.3
    const leaf = mesh(new THREE.ConeGeometry(0.014, 0.06, 5), lit(i % 2 ? '#7fb08a' : '#5a9a6a'), Math.cos(a) * 0.022, 0.085, Math.sin(a) * 0.022)
    leaf.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)
    g.add(leaf)
  }
  g.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 5), lit('#86c46a'), 0, 0.09, 0))
  return { solid: g }
}

/** Cactus à bras, et sa fleur rose. */
const cactus: Builder = () => {
  const g = new THREE.Group()
  const green = lit('#4f8a4a')
  g.add(cylinder(0.055, 0.045, 0.07, lit(C.terracotta), 0, 0.035, 0, 12), cylinder(0.05, 0.05, 0.01, lit(C.soil), 0, 0.068, 0, 12))
  g.add(cylinder(0.028, 0.03, 0.16, green, 0, 0.15, 0, 10), sphere(0.028, green, 0, 0.23, 0, 10))
  g.add(cylinder(0.015, 0.015, 0.05, green, 0.035, 0.15, 0, 8), cylinder(0.015, 0.015, 0.06, green, 0.052, 0.18, 0, 8), sphere(0.015, green, 0.052, 0.21, 0, 8))
  g.add(cylinder(0.014, 0.014, 0.04, green, -0.034, 0.13, 0, 8), sphere(0.014, green, -0.045, 0.15, 0, 8))
  g.add(sphere(0.014, lit('#ff6aa0'), 0, 0.255, 0, 8))
  return { solid: g }
}

/** Bonsaï dans sa coupe. */
const bonsai: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(box(0.16, 0.04, 0.1, lit('#3a3e46'), 0, 0.02, 0, 0.01), box(0.14, 0.01, 0.08, lit(C.soil), 0, 0.042, 0))
  const trunk = cylinder(0.01, 0.018, 0.12, lit('#6b4630'), 0, 0.1, 0, 6)
  trunk.rotation.z = 0.35
  g.add(trunk)
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.035 + random() * 0.015, 0), lit(LEAVES[i % 4]), -0.04 + random() * 0.08, 0.16 + random() * 0.04, -0.02 + random() * 0.04))
  return { solid: g }
}

const FLOWERS: Record<string, string> = { rose: '#ff6aa0', yellow: '#ffd23c', blue: '#6ab0ff', white: '#f4f0ea' }

/** Vase de fleurs. Couleur : `label` (rose, yellow, blue, white). */
const flowers: Builder = ({ label, random }) => {
  const petal = lit(FLOWERS[label ?? ''] ?? FLOWERS.rose)
  const g = new THREE.Group()
  g.add(cylinder(0.035, 0.045, 0.12, lit('#9ec5d8'), 0, 0.06, 0, 12))
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2, r = random() * 0.03, h = 0.1 + random() * 0.08
    const stem = cylinder(0.003, 0.003, h, lit('#4f7a3a'), Math.cos(a) * r * 0.5, 0.12 + h / 2, Math.sin(a) * r * 0.5, 4)
    stem.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
    g.add(stem, sphere(0.018, petal, Math.cos(a) * (r + h * 0.15), 0.12 + h, Math.sin(a) * (r + h * 0.15), 6), sphere(0.007, lit('#ffd23c'), Math.cos(a) * (r + h * 0.15), 0.13 + h, Math.sin(a) * (r + h * 0.15), 5))
  }
  return { solid: g }
}

/** Pile de livres, et un dernier debout. */
const books: Builder = ({ random }) => {
  const g = new THREE.Group()
  const spines = ['#8a3b32', '#34507a', '#d9a441', '#3f8f8c', '#5a3a8a', '#e9dcc4']
  let y = 0
  for (let i = 0; i < 3; i++) {
    const h = 0.022 + random() * 0.012
    const b = box(0.13 - i * 0.012, h, 0.09 - i * 0.006, lit(spines[i]), (random() - 0.5) * 0.015, y + h / 2, 0, 0.003)
    b.rotation.y = (random() - 0.5) * 0.3
    g.add(b)
    y += h
  }
  const standing = box(0.025, 0.12, 0.085, lit(spines[3 + Math.floor(random() * 3)]), 0.085, 0.06, 0, 0.003)
  standing.rotation.z = -0.12
  g.add(standing)
  return { solid: g }
}

/** Trois bougies dont les flammes vacillent. */
const candles: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.08, 0.08, 0.01, lit(C.brass, 'metal'), 0, 0.005, 0, 18))
  const spots: [number, number, number][] = [[-0.035, 0.07, 0.01], [0.03, 0.1, -0.015], [0.01, 0.055, 0.035]]
  for (const [x, h, z] of spots) g.add(cylinder(0.018, 0.018, h, lit(C.cream), x, 0.01 + h / 2, z, 10))
  const live = new THREE.Group()
  const flames = spots.map(([x, h, z]) => {
    const f = part(new THREE.ConeGeometry(0.009, 0.03, 6), glow('#ffcf6a'), x, 0.025 + h, z)
    live.add(f)
    return { f, phase: random() * 6 }
  })
  return {
    solid: g,
    live,
    update: (t) => {
      for (const { f, phase } of flames) {
        const s = 0.85 + 0.2 * Math.sin(t * 11 + phase) + 0.1 * Math.sin(t * 27 + phase)
        f.scale.set(1, s, 1)
      }
    },
  }
}

/** Peluche de Comète, le chat du bord. */
const plush: Builder = () => {
  const g = new THREE.Group()
  const grey = lit('#8a8f99')
  const body = sphere(0.06, grey, 0, 0.055, 0.01, 12)
  body.scale.set(1, 0.85, 1.1)
  g.add(body, sphere(0.045, grey, 0, 0.12, 0.035, 12))
  for (const x of [-0.025, 0.025]) g.add(mesh(new THREE.ConeGeometry(0.014, 0.03, 4), grey, x, 0.16, 0.035), sphere(0.006, lit(C.black), x * 0.8, 0.125, 0.075, 6))
  g.add(sphere(0.006, lit('#e8457c'), 0, 0.112, 0.079, 6))
  const tail = cylinder(0.01, 0.012, 0.08, grey, 0, 0.05, -0.07, 6)
  tail.rotation.x = -0.9
  g.add(tail)
  return { solid: g }
}

/** Trophée du rang Elite : une coupe dorée sur socle. */
const trophy: Builder = () => {
  const g = new THREE.Group()
  const gold = lit('#d9a441')
  g.add(box(0.08, 0.03, 0.08, lit(C.black), 0, 0.015, 0, 0.005), box(0.05, 0.012, 0.004, gold, 0, 0.015, 0.041))
  g.add(cylinder(0.01, 0.018, 0.06, gold, 0, 0.06, 0, 8), cylinder(0.045, 0.02, 0.06, gold, 0, 0.12, 0, 14))
  for (const x of [-0.05, 0.05]) {
    const ear = mesh(new THREE.TorusGeometry(0.016, 0.004, 4, 10, Math.PI), gold, x, 0.125, 0)
    ear.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2
    g.add(ear)
  }
  g.add(sphere(0.012, glow(ED_ORANGE), 0, 0.16, 0, 8))
  return { solid: g }
}

/** Radio de bord : cadran lumineux et haut-parleur. */
const radio: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.16, 0.1, 0.07, lit('#7a3a2a'), 0, 0.05, 0, 0.012), box(0.16, 0.012, 0.072, lit(C.woodDark, 'wood'), 0, 0.1, 0))
  g.add(barZ(0.028, 0.004, lit('#3a2014'), -0.035, 0.05, 0.036, 14), box(0.06, 0.028, 0.004, glow('#ffc27a'), 0.04, 0.06, 0.036))
  g.add(barZ(0.008, 0.012, lit(C.chrome, 'metal'), 0.025, 0.03, 0.038, 8), barZ(0.008, 0.012, lit(C.chrome, 'metal'), 0.055, 0.03, 0.038, 8))
  const antenna = cylinder(0.002, 0.002, 0.12, lit(C.chrome, 'metal'), 0.06, 0.16, -0.02, 4)
  antenna.rotation.z = -0.4
  g.add(antenna)
  return { solid: g }
}

const SHIP_COLORS: Record<string, string> = { silver: '#c9cdd4', orange: '#e0701e', black: '#3a3e46', white: '#f4f6f8' }

/** Maquette de Cobra Mk III sur son socle. Coque : `label` (silver, orange, black, white). */
const shipModel: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.04, 0.05, 0.02, lit(C.woodDark, 'wood'), 0, 0.01, 0, 12), cylinder(0.005, 0.005, 0.07, lit(C.chrome, 'metal'), 0, 0.055, 0, 4))
  const cobra = mesh(cobraGeometry(), lit(SHIP_COLORS[label ?? ''] ?? SHIP_COLORS.silver), 0, 0.1, 0)
  cobra.scale.setScalar(0.1)
  cobra.rotation.set(-0.15, 0.5, 0.08)
  g.add(cobra)
  return { solid: g }
}

/** Capteur thargoïde : coque sombre et cœur vert qui palpite. On évite de le secouer. */
const thargoidSensor: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.05, 0.06, 0.02, lit(C.steelDark, 'metal'), 0, 0.01, 0, 12))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const petal = mesh(new THREE.ConeGeometry(0.028, 0.1, 5), lit('#1c2a24'), Math.cos(a) * 0.035, 0.07, Math.sin(a) * 0.035)
    petal.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4)
    g.add(petal)
  }
  const live = new THREE.Group()
  const core = part(new THREE.IcosahedronGeometry(0.03, 1), new THREE.MeshBasicMaterial({ color: '#5dffb0' }), 0, 0.07, 0)
  live.add(core)
  const halo = part(new THREE.SphereGeometry(0.05, 12, 8), holoMaterial(null, '#3dffb0', 0.18, 0, true), 0, 0.07, 0)
  live.add(halo)
  return {
    solid: g,
    live,
    update: (t) => {
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 2.2), 4)
      core.scale.setScalar(0.85 + beat * 0.35)
      halo.scale.setScalar(0.9 + beat * 0.4)
    },
  }
}

/** Relique des Gardiens : un petit obélisque parcouru de lignes bleues. */
const guardianRelic: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.1, 0.02, 0.1, lit('#2a3238'), 0, 0.01, 0, 0.005))
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.2, 4), lit('#3a4a50'), 0, 0.12, 0).rotateY(Math.PI / 4))
  for (const y of [0.07, 0.12, 0.17]) g.add(box(0.058 - y * 0.12, 0.006, 0.058 - y * 0.12, glow('#59d8ff'), 0, y, 0))
  const live = new THREE.Group()
  const orb = part(new THREE.OctahedronGeometry(0.018), glow('#bff3ff'), 0, 0.25, 0)
  live.add(orb)
  return { solid: g, live, update: (t) => ((orb.rotation.y = t * 1.2), (orb.position.y = 0.25 + Math.sin(t * 1.5) * 0.012)) }
}

/** Terrarium : un petit organisme luminescent sous cloche. */
const terrarium: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.07, 0.075, 0.025, lit(C.woodDark, 'wood'), 0, 0.0125, 0, 16), cylinder(0.065, 0.065, 0.02, lit('#3a2a1e'), 0, 0.03, 0, 16))
  g.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 5), lit(LEAVES[0]), -0.03, 0.06, 0.01), mesh(new THREE.ConeGeometry(0.01, 0.04, 5), lit(LEAVES[2]), 0.025, 0.055, -0.02))
  const live = new THREE.Group()
  live.add(part(new THREE.SphereGeometry(0.07, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), glass('#e0f4ff', 0.18), 0, 0.045, 0))
  const spore = part(new THREE.IcosahedronGeometry(0.014, 0), new THREE.MeshBasicMaterial({ color: '#7dffc0' }), 0, 0.07, 0)
  live.add(spore)
  return { solid: g, live, update: (t) => ((spore.position.y = 0.07 + Math.sin(t * 1.4) * 0.012), (spore.rotation.y = t)) }
}

/** Platine vinyle : le disque tourne. */
const recordPlayer: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.2, 0.04, 0.16, lit(C.woodDark, 'wood'), 0, 0.02, 0, 0.008), box(0.2, 0.004, 0.16, lit(C.steelDark, 'metal'), 0, 0.042, 0))
  const arm = box(0.008, 0.008, 0.09, lit(C.chrome, 'metal'), 0.07, 0.06, -0.01)
  arm.rotation.y = 0.35
  g.add(cylinder(0.01, 0.01, 0.02, lit(C.chrome, 'metal'), 0.075, 0.05, -0.05, 6), arm, box(0.02, 0.004, 0.012, glow('#ff6a3c'), -0.08, 0.044, 0.065))
  const live = new THREE.Group()
  const disc = new THREE.Group()
  disc.position.set(-0.015, 0.047, 0)
  disc.add(part(new THREE.CylinderGeometry(0.065, 0.065, 0.004, 24), lit(C.black)), part(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 12), lit(ED_ORANGE)))
  live.add(disc)
  return { solid: g, live, update: (t) => (disc.rotation.y = -t * 3.5) }
}

/** Cadre photo à poser : le CMDR devant une planète. */
const photoFrame: Builder = () => {
  const g = new THREE.Group()
  const f = new THREE.Group()
  f.position.set(0, 0.06, 0)
  f.rotation.x = -0.18
  f.add(box(0.1, 0.12, 0.012, lit(C.woodLight, 'wood'), 0, 0, 0, 0.004))
  f.add(mesh(new THREE.PlaneGeometry(0.08, 0.1), printMaterial('photo', 96, 120, (c, random) => {
    c.fillStyle = '#081018'
    c.fillRect(0, 0, 96, 120)
    stars(c, 96, 120, random, 30)
    planet(c, 60, 44, 26, '#7fc4ff', '#0d2a5a')
    // Le CMDR, en combinaison, pouce levé.
    c.fillStyle = '#e0701e'
    c.fillRect(30, 70, 22, 34)
    c.beginPath()
    c.arc(41, 62, 11, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#ffd27a'
    c.fillRect(34, 58, 14, 7)
    c.fillStyle = '#e0701e'
    c.fillRect(52, 70, 7, 16)
  }), 0, 0, 0.0065))
  g.add(f, box(0.012, 0.09, 0.012, lit(C.woodLight, 'wood'), 0, 0.045, -0.04))
  return { solid: g }
}

export const DECOR = {
  poster,
  frame,
  'wall-clock': wallClock,
  'wall-screen': wallScreen,
  'wall-shelf': wallShelf,
  sconce,
  'wall-neon': wallNeon,
  armchair,
  'side-table': sideTable,
  dresser,
  crate,
  monstera,
  'exobio-plant': exobioPlant,
  telescope,
  guitar,
  'display-case': displayCase,
  'rug-round': rugRound,
  mug,
  'lava-lamp': lavaLamp,
  globe,
  succulent,
  cactus,
  bonsai,
  flowers,
  books,
  candles,
  plush,
  trophy,
  radio,
  'ship-model': shipModel,
  'thargoid-sensor': thargoidSensor,
  'guardian-relic': guardianRelic,
  terrarium,
  'record-player': recordPlayer,
  'photo-frame': photoFrame,
} satisfies Record<string, Builder>

