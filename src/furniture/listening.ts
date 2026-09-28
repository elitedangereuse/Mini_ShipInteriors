import * as THREE from 'three'
import { fabric } from './cozy'
import { animatedScreen, barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le salon d'écoute du pont supérieur : on s'y installe au chaud, casque sur les oreilles, pour
 * Radio Dangereuse (le podcast Elite Dangerous) et les Galères Galactiques (mini-fiction audio
 * humoristique). Casques, affiches des deux émissions, poste d'écoute, coussins de sol.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  wood: '#8a5a3a',
  woodDark: '#5a3a26',
  black: '#17181b',
  panel: '#24262c',
  chrome: '#c9cdd4',
  brass: '#c9a24a',
  cushion: '#2a2d33',
  rd: '#f07d1a',
  gg: '#0b1030',
  ggGold: '#ffd23c',
}

/** Casques : arceau et coques, puis coussinets. */
const HEADPHONES: Record<string, [string, string]> = {
  orange: [ED_ORANGE, C.black],
  navy: ['#26345e', C.ggGold],
  teal: ['#3f8f8c', '#e9dcc4'],
  cream: ['#e9dcc4', '#6b4630'],
}

/**
 * Casque d'écoute : arceau en demi-cercle au-dessus de l'origine (plan x-y), coques de part et
 * d'autre, coussinets tournés vers l'intérieur.
 */
function headphones(color: string | undefined): THREE.Group {
  const [shell, pad] = HEADPHONES[color ?? ''] ?? HEADPHONES.orange
  const g = new THREE.Group()
  g.add(mesh(new THREE.TorusGeometry(0.066, 0.008, 6, 18, Math.PI), lit(shell)))
  g.add(mesh(new THREE.TorusGeometry(0.058, 0.006, 6, 14, Math.PI * 0.7), lit(C.black), 0, 0, 0))
  for (const s of [-1, 1]) {
    g.add(barX(0.036, 0.03, lit(shell), s * 0.074, -0.012, 0, 14), barX(0.03, 0.014, lit(pad), s * 0.054, -0.012, 0, 12))
    g.add(barX(0.02, 0.004, lit(C.chrome), s * 0.09, -0.012, 0, 10))
  }
  return g
}

/** Casque sur son pied : socle de bois, tige, crochet. Coloris : `label` (orange, navy, teal, cream). */
const headphoneStand: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.055, 0.06, 0.018, lit(C.woodDark), 0, 0.009, 0, 16), cylinder(0.007, 0.007, 0.2, lit(C.chrome), 0, 0.11, 0, 8))
  g.add(barX(0.009, 0.05, lit(C.woodDark), 0, 0.21, 0, 8))
  const h = headphones(label)
  h.position.y = 0.146
  g.add(h)
  return { solid: g }
}

/** Casque posé à plat sur un meuble, son câble enroulé. Coloris : `label`. */
const headphonesFlat: Builder = ({ label }) => {
  const g = new THREE.Group()
  const h = headphones(label)
  h.rotation.set(Math.PI / 2, 0, 0.3)
  h.position.y = 0.036
  g.add(h)
  const coil = mesh(new THREE.TorusGeometry(0.03, 0.003, 4, 20), lit(C.black), 0.06, 0.004, 0.09)
  coil.rotation.x = Math.PI / 2
  g.add(coil)
  return { solid: g }
}

/**
 * Râtelier mural à casques : une planche de bois, trois crochets, un casque par émission et un
 * de rechange, plaque de laiton « ÉCOUTE ».
 */
const headphoneRack: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.86, 0.08, 0.03, lit(C.wood), 0, 0.76, 0.015, 0.01))
  g.add(box(0.2, 0.035, 0.004, lit(C.brass), 0, 0.78, 0.032))
  const plate = drawnTexture(128, 24, (c) => {
    c.fillStyle = C.brass
    c.fillRect(0, 0, 128, 24)
    c.fillStyle = '#3a2a10'
    c.font = '700 16px Georgia, serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('ÉCOUTE', 'LISTEN'), 64, 13)
  })
  g.add(part(new THREE.PlaneGeometry(0.19, 0.032), new THREE.MeshBasicMaterial({ map: plate }), 0, 0.78, 0.035))
  for (const [x, color] of [[-0.28, 'orange'], [0, 'teal'], [0.28, 'navy']] as const) {
    g.add(barZ(0.008, 0.08, lit(C.chrome), x, 0.73, 0.06, 8), cylinder(0.008, 0.008, 0.03, lit(C.chrome), x, 0.742, 0.1, 8))
    const h = headphones(color)
    h.rotation.y = Math.PI / 2
    h.position.set(x, 0.66, 0.09)
    g.add(h)
  }
  return { solid: g }
}

/** Étoile à quatre branches, dorée (celle des Galères Galactiques). */
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const d = i % 2 ? r * 0.28 : r
    c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
  }
  c.closePath()
  c.fill()
}

/** Visuels des deux émissions, dessinés d'après leurs logos. */
const SHOWS: Record<string, (c: CanvasRenderingContext2D, w: number, h: number) => void> = {
  // Radio Dangereuse : fond anthracite, orbites grises, emblème ailé orange, bandes bleu et rouge.
  radio: (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#22252c')
    bg.addColorStop(1, '#0e0f13')
    c.fillStyle = bg
    c.fillRect(0, 0, w, h)
    const cx = w / 2, cy = 170
    c.strokeStyle = '#4d4f55'
    c.lineWidth = 11
    for (const a of [-0.5, 0.5]) {
      c.beginPath()
      c.ellipse(cx, cy, 128, 46, a, 0, Math.PI * 2)
      c.stroke()
    }
    // Emblème : trois chevrons emboîtés qui descendent en pointe, une lame au centre.
    c.strokeStyle = C.rd
    c.lineJoin = 'miter'
    c.lineWidth = 15
    for (let k = 0; k < 3; k++) {
      c.beginPath()
      c.moveTo(cx - 112 + k * 26, 68 + k * 26)
      c.lineTo(cx, 250 - k * 14)
      c.lineTo(cx + 112 - k * 26, 68 + k * 26)
      c.stroke()
    }
    c.fillStyle = C.rd
    c.beginPath()
    c.moveTo(cx, 96)
    c.lineTo(cx + 13, 150)
    c.lineTo(cx, 176)
    c.lineTo(cx - 13, 150)
    c.closePath()
    c.fill()
    c.textAlign = 'center'
    c.fillStyle = '#ffffff'
    c.font = '800 38px system-ui, sans-serif'
    c.fillText('RADIO', cx, 312)
    c.fillStyle = C.rd
    c.fillText('DANGEREUSE', cx, 350, w - 30)
    c.fillStyle = '#d8dbe0'
    c.font = '500 17px system-ui, sans-serif'
    c.fillText(tr('Le podcast Elite Dangerous', 'The Elite Dangerous podcast'), cx, 382, w - 30)
    c.fillStyle = '#1b4fa0'
    c.fillRect(cx - 86, 408, 64, 14)
    c.fillStyle = '#e2463c'
    c.fillRect(cx + 22, 408, 64, 14)
  },
  // Galères Galactiques : grand disque bleu nuit, étoiles dorées, un petit vaisseau en panne qui fume.
  galeres: (c, w, h) => {
    c.fillStyle = '#141a3e'
    c.fillRect(0, 0, w, h)
    const cx = w / 2, cy = 190, r = 142
    c.fillStyle = C.gg
    c.beginPath()
    c.arc(cx, cy, r, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = '#2a3470'
    c.lineWidth = 4
    c.stroke()
    c.fillStyle = C.ggGold
    for (const [x, y, s] of [[-92, -30, 14], [-60, -60, 7], [70, -72, 12], [104, -2, 15], [-104, 50, 7], [92, 70, 6], [-30, -86, 5]]) sparkle(c, cx + x, cy + y, s)
    c.fillStyle = 'rgba(255,255,255,0.8)'
    for (let i = 0; i < 30; i++) {
      const a = i * 2.4, d = 40 + ((i * 37) % 90)
      c.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2)
    }
    // Le vaisseau en panne, penché, qui crache sa fumée.
    c.fillStyle = 'rgba(200, 205, 215, 0.55)'
    for (const [x, y, s] of [[-40, -8, 14], [-58, -20, 11], [-72, -34, 8]]) {
      c.beginPath()
      c.arc(cx + x, cy + y, s, 0, Math.PI * 2)
      c.fill()
    }
    c.save()
    c.translate(cx + 6, cy + 6)
    c.rotate(0.35)
    c.fillStyle = '#c9cdd4'
    c.beginPath()
    c.moveTo(46, 0)
    c.lineTo(-30, -18)
    c.lineTo(-36, 0)
    c.lineTo(-30, 18)
    c.closePath()
    c.fill()
    c.fillStyle = '#59d8ff'
    c.fillRect(8, -5, 14, 7)
    c.restore()
    c.fillStyle = ED_ORANGE
    sparkle(c, cx - 30, cy + 22, 9)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.font = '600 40px Georgia, serif'
    c.fillText('Galères', cx, cy - 86)
    c.font = '600 32px Georgia, serif'
    c.fillText('Galactiques', cx, cy + 112)
    c.fillStyle = C.ggGold
    c.font = 'italic 18px Georgia, serif'
    c.fillText(tr('Mini-fiction audio humoristique', 'A comedy audio mini-series'), cx, 378, w - 30)
    c.fillStyle = 'rgba(255,255,255,0.75)'
    c.font = '500 14px system-ui, sans-serif'
    c.fillText('galeresgalactiques.fr', cx, 412)
  },
}

/**
 * Affiche encadrée d'une émission, accrochée au mur, éclairée par une petite rampe de laiton.
 * Émission : `label` (radio, galeres).
 */
const podcastPoster: Builder = ({ label }) => {
  const show = label === 'galeres' ? 'galeres' : 'radio'
  const g = new THREE.Group()
  g.add(box(0.54, 0.74, 0.03, lit(C.woodDark), 0, 0.56, 0.015, 0.01))
  const art = drawnTexture(320, 440, (c) => SHOWS[show](c, 320, 440))
  g.add(part(new THREE.PlaneGeometry(0.48, 0.66), new THREE.MeshBasicMaterial({ map: art }), 0, 0.56, 0.032))
  // Rampe : un bras, une réglette lumineuse au-dessus du cadre.
  g.add(barZ(0.006, 0.08, lit(C.brass), 0, 0.95, 0.04, 6), box(0.26, 0.022, 0.03, lit(C.brass), 0, 0.95, 0.08, 0.006))
  g.add(box(0.22, 0.004, 0.02, glow('#fff0cf'), 0, 0.938, 0.08))
  return { solid: g }
}

/** Enseigne « ON AIR » de studio de radio, rouge, accrochée au mur. */
const onAirSign: Builder = () => {
  const g = new THREE.Group()
  const face = drawnTexture(256, 96, (c) => {
    c.fillStyle = '#e02a2a'
    c.fillRect(0, 0, 256, 96)
    c.strokeStyle = '#ffd6d0'
    c.lineWidth = 5
    c.strokeRect(8, 8, 240, 80)
    c.fillStyle = '#fff4f0'
    c.font = '800 50px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('ON AIR', 128, 51)
  })
  g.add(box(0.36, 0.15, 0.05, lit(C.black), 0, 0.86, 0.025, 0.01))
  g.add(part(new THREE.PlaneGeometry(0.32, 0.12), new THREE.MeshBasicMaterial({ map: face }), 0, 0.86, 0.051))
  return { solid: g }
}

/**
 * Poste d'écoute : un buffet bas de bois, l'ampli à deux vumètres dont les aiguilles dansent,
 * l'écran « En écoute » qui alterne les deux émissions sur une forme d'onde, deux enceintes
 * de bibliothèque, un casque branché. Face à +z.
 */
const podcastConsole: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood), dark = lit(C.woodDark), panel = lit(C.panel), chrome = lit(C.chrome)
  // Buffet : caisse, façade à lattes, pieds fuselés.
  g.add(box(0.92, 0.34, 0.36, wood, 0, 0.27, 0, 0.015), box(0.94, 0.025, 0.38, dark, 0, 0.45, 0))
  for (let i = 0; i < 14; i++) g.add(box(0.035, 0.28, 0.01, dark, -0.4 + i * 0.0615, 0.27, 0.184))
  for (const x of [-0.4, 0.4]) for (const z of [-0.14, 0.14]) g.add(cylinder(0.018, 0.012, 0.1, dark, x, 0.05, z, 6))
  // Ampli : façade brossée, deux vumètres, boutons, voyant « ON AIR ».
  g.add(box(0.46, 0.11, 0.26, panel, 0, 0.518, -0.02, 0.012), box(0.46, 0.012, 0.012, chrome, 0, 0.47, 0.11))
  for (const x of [-0.16, 0.16]) g.add(box(0.1, 0.06, 0.006, glow('#ffc46a'), x, 0.525, 0.112))
  for (const x of [-0.05, 0.05]) g.add(barZ(0.016, 0.02, chrome, x, 0.51, 0.118, 12))
  g.add(box(0.07, 0.022, 0.008, glow('#ff3b2f'), 0, 0.55, 0.112))
  // Enceintes : caisson de bois, membrane et tweeter.
  for (const s of [-1, 1]) {
    g.add(box(0.14, 0.22, 0.16, dark, s * 0.36, 0.575, -0.02, 0.012))
    g.add(barZ(0.04, 0.01, lit(C.black), s * 0.36, 0.55, 0.062, 14), barZ(0.018, 0.01, lit(C.black), s * 0.36, 0.635, 0.062, 10))
  }
  // Casque branché, posé devant l'ampli, son câble jusqu'à la prise.
  const h = headphones('navy')
  h.rotation.set(Math.PI / 2, 0, -0.4)
  h.position.set(0.12, 0.5, 0.12)
  g.add(h, barX(0.003, 0.2, lit(C.black), 0.09, 0.47, 0.17, 4))

  // Écran incliné : l'émission en cours, qui alterne, et sa forme d'onde.
  const screen = animatedScreen(256, 112, 10, (c, t) => {
    const radio = Math.floor(t / 12) % 2 === 0
    c.fillStyle = '#0c1016'
    c.fillRect(0, 0, 256, 112)
    c.fillStyle = radio ? C.rd : C.ggGold
    c.font = '600 13px system-ui, sans-serif'
    c.fillText(tr('▶ EN ÉCOUTE', '▶ NOW PLAYING'), 10, 20)
    c.font = radio ? '800 22px system-ui, sans-serif' : '600 22px Georgia, serif'
    c.fillText(radio ? 'Radio Dangereuse' : 'Galères Galactiques', 10, 46, 236)
    for (let i = 0; i < 40; i++) {
      const v = Math.abs(Math.sin(t * 5 + i * 0.7) * Math.sin(t * 1.7 + i * 0.23)) * 34 + 3
      c.fillRect(10 + i * 6, 88 - v / 2, 4, v)
    }
    c.fillStyle = 'rgba(255,255,255,0.35)'
    c.fillRect(10, 106, 236, 2)
    c.fillStyle = 'rgba(255,255,255,0.9)'
    c.fillRect(10, 106, ((t % 12) / 12) * 236, 2)
  })
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  g.add(box(0.26, 0.14, 0.02, lit(C.black), 0, 0.65, -0.06, 0.008))
  const face = part(new THREE.PlaneGeometry(0.235, 0.103), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.65, -0.049)
  live.add(face)
  // Aiguilles des vumètres.
  const needles = [-0.16, 0.16].map((x) => {
    const n = box(0.003, 0.05, 0.003, lit(C.black), 0, 0.025, 0)
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.498, 0.117)
    pivot.add(n)
    live.add(pivot)
    return pivot
  })
  return {
    solid: g,
    live,
    update(t) {
      screen.tick(t)
      needles.forEach((n, i) => (n.rotation.z = -0.5 + Math.abs(Math.sin(t * 3.1 + i) * Math.sin(t * 7.3 + i * 2)) * 1))
    },
  }
}

/** Gros coussin de sol capitonné. Tissu : `label`. */
const floorCushion: Builder = ({ label }) => {
  const g = new THREE.Group()
  g.add(box(0.46, 0.13, 0.46, fabric(label, 'plum'), 0, 0.065, 0, 0.05))
  g.add(sphere(0.014, lit(C.cushion), 0, 0.131, 0, 6))
  return { solid: g }
}

export const LISTENING = {
  'headphone-stand': headphoneStand,
  'headphones-flat': headphonesFlat,
  'headphone-rack': headphoneRack,
  'podcast-poster': podcastPoster,
  'on-air-sign': onAirSign,
  'podcast-console': podcastConsole,
  'floor-cushion': floorCushion,
} satisfies Record<string, Builder>
