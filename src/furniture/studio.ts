import * as THREE from 'three'
import { BASE } from '../assets'
import { headphones } from './listening'
import { barX, barZ, box, compact, cylinder, drawnTexture, ED_ORANGE, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Le studio de Radio Dangereuse, au nord du salon d'écoute, derrière sa vitre : la table ronde
 * des trois animateurs et ses micros sur bras, leurs fauteuils, la mousse acoustique aux murs, et
 * au-dessus de la vitre, côté salon, le néon de l'émission, tracé d'après le logo du site.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  walnut: '#4a3222',
  top: '#26282e',
  black: '#17181b',
  panel: '#24262c',
  chrome: '#c9cdd4',
  grille: '#8d939c',
  cushion: '#1f2127',
  foam: '#2e3036',
}

/**
 * Le rouge « ON AIR » s'allume quand quelqu'un est installé au micro (cf. main.ts, qui tient ce
 * drapeau à jour à chaque image).
 */
export const studio = { onAir: false }

/** Haut du linteau d'une vitre (cf. canopyFrame dans deck.ts), où le néon est posé. */
const LINTEL = 1.01

// ---------------------------------------------------------------- néon

interface RadioLogo {
  planet: Path2D
  crater: { x: number; y: number; r: number }
  text: Path2D
  /** Cadres (viewBox) des deux SVG. */
  planetBox: [number, number]
  textBox: [number, number]
}

let radioLogo: Promise<RadioLogo> | undefined

/** Tracés du logo de Radio Dangereuse (la planète, le texte), lus dans les SVG repris du site. */
function radioLogoPaths(): Promise<RadioLogo> {
  const load = (name: string) => fetch(`${BASE}shows/radio-dangereuse-${name}.svg`).then((response) => {
    if (!response.ok) throw new Error(`Radio Dangereuse: ${response.status}`)
    return response.text()
  }).then((svg) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement)
  const viewBox = (svg: Element): [number, number] => {
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
    return [w, h]
  }
  return radioLogo ??= Promise.all([load('logo'), load('text')]).then(([logo, text]) => {
    const crater = logo.querySelector('circle')
    return {
      planet: new Path2D(logo.querySelector('path')?.getAttribute('d') ?? ''),
      crater: { x: Number(crater?.getAttribute('cx')), y: Number(crater?.getAttribute('cy')), r: Number(crater?.getAttribute('r')) },
      text: new Path2D(text.querySelector('path')?.getAttribute('d') ?? ''),
      planetBox: viewBox(logo),
      textBox: viewBox(text),
    }
  })
}

/**
 * Trace un tube de néon en trois passes : le halo, le verre coloré, le cœur presque blanc.
 * `path` trace dans le repère courant ; les épaisseurs sont en pixels du canvas.
 */
function neonTube(g: CanvasRenderingContext2D, path: (g: CanvasRenderingContext2D) => void, tube: string, core: string, width = 1) {
  for (const pass of [0, 1, 2]) {
    g.save()
    g.shadowColor = tube
    g.shadowBlur = [28, 10, 0][pass]
    g.strokeStyle = pass < 2 ? tube : core
    g.lineWidth = [10, 6, 2.4][pass] * width
    g.globalAlpha = pass ? 1 : 0.8
    g.lineCap = g.lineJoin = 'round'
    path(g)
    g.restore()
  }
}

const NEON_W = 832, NEON_H = 320

/** La planète en jaune, le nom en orange Elite : les contours des tracés, en tubes. */
function paintRadioNeon(g: CanvasRenderingContext2D, logo: RadioLogo) {
  g.clearRect(0, 0, NEON_W, NEON_H)
  const ps = 2.3, ts = 2.1
  neonTube(g, (c) => {
    c.translate(14, 34)
    c.scale(ps, ps)
    c.lineWidth /= ps
    c.stroke(logo.planet)
    c.beginPath()
    c.arc(logo.crater.x, logo.crater.y, logo.crater.r, 0, Math.PI * 2)
    c.stroke()
  }, '#ffbd14', '#fff4cf')
  neonTube(g, (c) => {
    c.translate(NEON_W - 14 - logo.textBox[0] * ts, (NEON_H - logo.textBox[1] * ts) / 2)
    c.scale(ts, ts)
    c.lineWidth /= ts
    c.stroke(logo.text)
  }, ED_ORANGE, '#fff0dc', 0.9)
}

/** « ON AIR » : un cadre de tube rouge, et les deux mots. */
function paintOnAir(g: CanvasRenderingContext2D) {
  const w = 256, h = 160
  neonTube(g, (c) => {
    c.beginPath()
    c.roundRect(18, 16, w - 36, h - 32, 16)
    c.stroke()
  }, '#ff2a2a', '#ffe0dc')
  g.font = '800 50px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const [blur, color] of [[26, '#ff2a2a'], [8, '#ff2a2a'], [0, '#ffe0dc']] as const) {
    g.shadowColor = '#ff2a2a'
    g.shadowBlur = blur
    g.fillStyle = color
    g.fillText('ON', w / 2, h / 2 - 22)
    g.fillText('AIR', w / 2, h / 2 + 26)
  }
}

/**
 * Néon de Radio Dangereuse, posé sur le linteau de la vitre du studio (origine sur l'axe du mur,
 * au sol ; les tubes regardent +z, côté salon) : le logo à gauche, « ON AIR » à droite. Pas de
 * plaque (on voit le studio au travers) : un rail sur le mur, des entretoises.
 */
const radioNeon: Builder = () => {
  const g = new THREE.Group()
  const top = LINTEL
  const neonW = 1.45, neonH = (neonW * NEON_H) / NEON_W
  const airW = 0.46, airH = airW * (160 / 256)
  const neonX = -0.2, airX = neonX + neonW / 2 + 0.06 + airW / 2
  const y = top + 0.05 + neonH / 2
  // Rail d'acier sur le linteau, et deux entretoises par pièce.
  g.add(box(neonW + airW + 0.16, 0.025, 0.05, lit(C.panel), (neonX - neonW / 2 + airX + airW / 2) / 2, top + 0.0125, 0))
  for (const x of [neonX - neonW * 0.35, neonX + neonW * 0.35, airX]) g.add(cylinder(0.006, 0.006, 0.07, lit(C.chrome), x, top + 0.06, 0.012, 6))

  const art = drawnTexture(NEON_W, NEON_H, () => {})
  const canvas = art.image as HTMLCanvasElement
  void radioLogoPaths().then((logo) => {
    paintRadioNeon(canvas.getContext('2d')!, logo)
    art.needsUpdate = true
  }).catch(() => { /* Sans le logo, il reste le « ON AIR ». */ })
  const neon = new THREE.MeshBasicMaterial({ map: art, transparent: true, depthWrite: false, toneMapped: false })
  const air = new THREE.MeshBasicMaterial({ map: drawnTexture(256, 160, paintOnAir), transparent: true, depthWrite: false, toneMapped: false })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(neonW, neonH), neon, neonX, y, 0.02), part(new THREE.PlaneGeometry(airW, airH), air, airX, top + 0.05 + airH / 2 + 0.02, 0.02))

  // Le tube rouge s'amorce en clignotant quand on prend l'antenne, s'éteint quand on la rend.
  let onAir = false, since = -10
  return {
    solid: g,
    live,
    update(t) {
      const crisis = Math.sin(t * 0.5) + Math.sin(t * 2.3) * 0.5 > 1.35
      neon.opacity = crisis && Math.sin(t * 70) > 0 ? 0.4 : 1
      if (studio.onAir !== onAir) {
        onAir = studio.onAir
        since = t
      }
      const strike = onAir && t - since < 0.6 && Math.sin((t - since) * 60) > 0
      air.opacity = onAir ? (strike ? 0.3 : 1) : 0.16
    },
  }
}

// ---------------------------------------------------------------- table et fauteuils

/**
 * Bras articulé et micro de radio, tourné vers +z (l'animateur) : pince au bord de la table,
 * colonne, bras, gros micro à grille dans sa suspension, voyant rouge, filtre anti-pop devant.
 */
function micArm(): THREE.Group {
  const g = new THREE.Group()
  const black = lit(C.black), chrome = lit(C.chrome)
  g.add(box(0.06, 0.06, 0.06, black, 0.15, 0.44, 0.36, 0.01), cylinder(0.012, 0.012, 0.26, black, 0.15, 0.58, 0.36, 8))
  g.add(barX(0.011, 0.16, black, 0.075, 0.71, 0.36, 8), barZ(0.011, 0.2, black, 0, 0.71, 0.46, 8))
  g.add(cylinder(0.008, 0.008, 0.05, black, 0, 0.685, 0.56, 6))
  // Micro : corps, bague orange, grille ; voyant rouge sur le corps.
  g.add(cylinder(0.036, 0.032, 0.11, lit(C.panel), 0, 0.575, 0.56, 16), cylinder(0.037, 0.037, 0.014, lit(ED_ORANGE), 0, 0.605, 0.56, 16))
  g.add(cylinder(0.038, 0.038, 0.06, lit(C.grille), 0, 0.64, 0.56, 16), sphere(0.038, lit(C.grille), 0, 0.67, 0.56, 14))
  g.add(box(0.012, 0.012, 0.006, glow('#ff3b2f'), 0, 0.555, 0.595))
  const mount = mesh(new THREE.TorusGeometry(0.055, 0.005, 6, 24), chrome, 0, 0.6, 0.56)
  mount.rotation.x = Math.PI / 2
  g.add(mount)
  // Filtre anti-pop : cerceau noir, toile sombre, col de cygne jusqu'au bras.
  g.add(mesh(new THREE.TorusGeometry(0.055, 0.005, 6, 24), black, 0, 0.64, 0.655), mesh(new THREE.CircleGeometry(0.052, 20), lit('#3a3d44'), 0, 0.64, 0.654))
  g.add(barZ(0.004, 0.09, black, 0.05, 0.69, 0.61, 4))
  return g
}

/**
 * Table ronde du studio, ouverte au sud (+z, vers la vitre et le salon) : un animateur à l'ouest,
 * un au nord, un à l'est (-x, -z, +x), chacun son micro sur bras et son casque ; la console de
 * mixage au milieu, vumètres allumés. Les micros dépassent au-dessus des têtes : ils restent à
 * part (`live`), pour que la table ne s'estompe pas devant l'animateur du nord.
 */
const studioTable: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.46, 0.46, 0.03, lit(C.top), 0, 0.4, 0, 40), cylinder(0.465, 0.465, 0.012, lit(ED_ORANGE), 0, 0.386, 0, 40))
  g.add(cylinder(0.05, 0.06, 0.37, lit(C.black), 0, 0.2, 0, 12), cylinder(0.24, 0.26, 0.025, lit(C.walnut), 0, 0.0125, 0, 24))
  // Console de mixage, tournée vers l'animateur du nord.
  const desk = new THREE.Group()
  desk.add(box(0.3, 0.03, 0.17, lit(C.panel), 0, 0.43, 0, 0.006))
  for (let i = 0; i < 6; i++) {
    const x = -0.11 + i * 0.044
    desk.add(box(0.006, 0.004, 0.07, lit(C.black), x, 0.447, 0.02), box(0.016, 0.008, 0.012, lit(C.chrome), x, 0.45, 0.02 + ((i * 37) % 5) * 0.01 - 0.02))
    desk.add(cylinder(0.007, 0.007, 0.01, lit(i % 3 ? C.grille : ED_ORANGE), x, 0.45, -0.05, 8))
  }
  for (const x of [-0.05, 0.05]) desk.add(box(0.07, 0.003, 0.018, glow(x < 0 ? '#7dffa8' : '#ffc46a'), x, 0.447, -0.072))
  desk.rotation.y = Math.PI
  g.add(desk)
  // Les trois places : micro sur bras, casque à plat devant.
  const mics = new THREE.Group()
  for (const yaw of [-Math.PI / 2, Math.PI, Math.PI / 2]) {
    const mic = micArm()
    mic.rotation.y = yaw
    mics.add(mic)
    const h = headphones(yaw === Math.PI ? 'orange' : yaw < 0 ? 'teal' : 'navy')
    h.rotation.set(Math.PI / 2, 0, 0.5)
    h.position.set(-0.2, 0.43, 0.28)
    const place = new THREE.Group()
    place.rotation.y = yaw
    place.add(h)
    g.add(place)
  }
  return { solid: g, live: compact(mics) }
}

/**
 * Fauteuil de studio à roulettes, à la taille des petits personnages : piétement en étoile, vérin,
 * assise et dossier noirs à passepoil orange, accoudoirs. Assise à 0,3.
 */
const studioChair: Builder = () => {
  const g = new THREE.Group()
  const black = lit(C.black), cushion = lit(C.cushion), orange = lit(ED_ORANGE)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = box(0.16, 0.02, 0.028, black, Math.cos(a) * 0.08, 0.035, Math.sin(a) * 0.08)
    leg.rotation.y = -a
    g.add(leg, sphere(0.016, black, Math.cos(a) * 0.16, 0.016, Math.sin(a) * 0.16, 6))
  }
  g.add(cylinder(0.016, 0.02, 0.21, lit(C.chrome), 0, 0.15, 0, 10))
  g.add(box(0.36, 0.045, 0.34, cushion, 0, 0.278, 0.01, 0.018), box(0.37, 0.01, 0.35, orange, 0, 0.256, 0.01))
  const back = new THREE.Group()
  back.add(box(0.32, 0.22, 0.05, cushion, 0, 0.11, 0, 0.02), box(0.24, 0.01, 0.052, orange, 0, 0.19, 0))
  back.position.set(0, 0.3, -0.16)
  back.rotation.x = -0.12
  g.add(back)
  for (const x of [-0.18, 0.18]) g.add(box(0.025, 0.08, 0.025, black, x, 0.33, -0.02), box(0.04, 0.018, 0.18, black, x, 0.375, 0.01, 0.005))
  return { solid: g }
}

/** Mousse acoustique : panneau de pyramides, encadré. Coloris : `label` (charcoal, orange, slate). */
const acousticPanel: Builder = ({ label }) => {
  const color = { orange: '#b85c1c', slate: '#3b4454' }[label ?? ''] ?? C.foam
  const g = new THREE.Group()
  g.add(box(0.7, 0.5, 0.02, lit(C.black), 0, 0.56, 0.01))
  const foam = lit(color)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const cone = mesh(new THREE.ConeGeometry(0.105, 0.05, 4), foam, -0.24 + i * 0.16, 0.4 + j * 0.16, 0.045)
      cone.rotation.set(Math.PI / 2, (i + j) % 2 ? Math.PI / 4 : 0, 0)
      g.add(cone)
    }
  }
  return { solid: g }
}

export const STUDIO = {
  'radio-neon': radioNeon,
  'studio-table': studioTable,
  'studio-chair': studioChair,
  'acoustic-panel': acousticPanel,
} satisfies Record<string, Builder>

