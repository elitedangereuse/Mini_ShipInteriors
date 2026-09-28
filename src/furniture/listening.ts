import * as THREE from 'three'
import { fabric } from './cozy'
import { animatedScreen, barX, barZ, box, cylinder, drawnTexture, ED_ORANGE, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'
import { BASE } from '../assets'

/*
 * Le salon d'écoute du pont supérieur : on s'y installe au chaud, casque sur les oreilles, pour
 * Radio Dangereuse (le podcast Elite Dangerous) et les Galères Galactiques (mini-fiction audio
 * humoristique). Casques, affiches des deux émissions (les Galères en ont deux : l'ancien logo et
 * le nouveau), poste d'écoute, coussins de sol.
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

/** Le SVG animé est figé sur sa première image par drawImage : le vaisseau y est invisible. */
let galeresLayers: Promise<[HTMLImageElement, HTMLImageElement]> | undefined
function galeresPosterLayers(): Promise<[HTMLImageElement, HTMLImageElement]> {
  return galeresLayers ??= fetch(BASE + 'shows/galeres-galactiques.svg')
    .then((response) => {
      if (!response.ok) throw new Error(`Galères Galactiques: ${response.status}`)
      return response.text()
    })
    .then(async (svg) => {
      const image = (css: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([svg.replace('</svg>', `<style>${css}</style></svg>`)], { type: 'image/svg+xml' }))
        const img = new Image()
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Galères Galactiques: image illisible')) }
        img.src = url
      })
      const still = '.slide-in-elliptic-bottom-fwd,.shipanim{animation:none!important;-webkit-animation:none!important;transform:none!important;opacity:1!important}'
      return Promise.all([
        image(`${still}svg > g.slide-in-elliptic-bottom-fwd{display:none}`),
        image(`${still}svg > g:not(.slide-in-elliptic-bottom-fwd){display:none}`),
      ])
    })
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

/**
 * Affiche encadrée d'une émission, accrochée au mur, éclairée par une petite rampe de laiton.
 * Émission : `label` (radio, galeres, ou gg pour le nouveau logo des Galères Galactiques ;
 * l'ancienne affiche reste accrochée en souvenir).
 */
const podcastPoster: Builder = ({ label }) => {
  const show = label === 'galeres' || label === 'gg' ? label : 'radio'
  const g = new THREE.Group()
  g.add(box(0.54, 0.74, 0.03, lit(C.woodDark), 0, 0.56, 0.015, 0.01))
  const paint = (c: CanvasRenderingContext2D, logo?: HTMLImageElement, ship?: HTMLImageElement, t = 0) => {
    c.clearRect(0, 0, 320, 440)
    const gradient = c.createLinearGradient(0, 0, 320, 440)
    gradient.addColorStop(0, show === 'radio' ? '#332316' : show === 'gg' ? '#1a1410' : '#15204c')
    gradient.addColorStop(1, show === 'gg' ? '#05070d' : '#0d121d')
    c.fillStyle = gradient
    c.fillRect(0, 0, 320, 440)
    c.strokeStyle = show === 'radio' ? '#ffc43e' : show === 'gg' ? '#ff8a3d' : '#f3c11b'
    c.lineWidth = 4
    c.strokeRect(13, 13, 294, 414)
    c.textAlign = 'center'
    if (show === 'gg') {
      // Le logo n'a pas de texte : le titre de l'émission, sous le disque.
      c.fillStyle = '#ffb066'
      c.font = '800 25px system-ui, sans-serif'
      c.fillText('GALÈRES GALACTIQUES', 160, 330, 272)
    }
    c.fillStyle = '#efd9b8'
    c.font = '700 17px system-ui, sans-serif'
    c.fillText(show === 'radio' ? tr('LE PODCAST À BORD', 'THE PODCAST ON BOARD') : tr('MINI SÉRIE AUDIO', 'AUDIO MINI-SERIES'), 160, 388)
    if (logo) {
      const maxW = show === 'gg' ? 250 : 272, maxH = show === 'radio' ? 160 : show === 'gg' ? 250 : 292
      const scale = Math.min(maxW / logo.width, maxH / logo.height)
      const w = logo.width * scale, h = logo.height * scale
      const x = (320 - w) / 2, y = show === 'gg' ? 38 : (350 - h) / 2
      c.drawImage(logo, x, y, w, h)
      if (ship) {
        // Même frémissement que dans le SVG, mais sur la seule couche du vaisseau.
        const dx = Math.sin(t * 18) * 0.8, dy = Math.cos(t * 23) * 0.8
        c.drawImage(ship, x + dx, y + dy, w, h)
      }
    }
  }
  const art = drawnTexture(320, 440, paint)
  const canvas = art.image as HTMLCanvasElement
  const context = canvas.getContext('2d')!
  let logo: HTMLImageElement | undefined, ship: HTMLImageElement | undefined
  if (show !== 'galeres') {
    const image = new Image()
    image.onload = () => { logo = image; paint(context, logo); art.needsUpdate = true }
    image.src = BASE + (show === 'radio' ? 'shows/radio-dangereuse.png' : 'shows/galeres-galactiques-logo.svg')
  } else {
    void galeresPosterLayers().then(([background, vessel]) => {
      logo = background
      ship = vessel
      paint(context, logo, ship)
      art.needsUpdate = true
    }).catch(() => { /* Le cadre reste lisible si l'image ne charge pas. */ })
  }
  g.add(part(new THREE.PlaneGeometry(0.48, 0.66), new THREE.MeshBasicMaterial({ map: art }), 0, 0.56, 0.032))
  // Rampe : un bras, une réglette lumineuse au-dessus du cadre.
  g.add(barZ(0.006, 0.08, lit(C.brass), 0, 0.95, 0.04, 6), box(0.26, 0.022, 0.03, lit(C.brass), 0, 0.95, 0.08, 0.006))
  g.add(box(0.22, 0.004, 0.02, glow('#fff0cf'), 0, 0.938, 0.08))
  let frame = -1
  return {
    solid: g,
    ...(show === 'galeres' ? { update(t: number) {
      if (!logo || !ship || Math.floor(t * 12) === frame) return
      frame = Math.floor(t * 12)
      paint(context, logo, ship, t)
      art.needsUpdate = true
    } } : {}),
  }
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
