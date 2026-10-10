import * as THREE from 'three'
import { glowBand, halo } from './arcade-decor'
import { box, cylinder, drawnTexture, glow, holoMaterial, lit, mesh, part, type Builder } from './kit'
import { tr } from '../i18n'
import { bodyColor, drawCard, ljpc, ljpcSelf, type LjpcMember } from '../ljpc-site'

/*
 * Habillage du labo du L.J.P.C. (pont principal), autour du mobilier de ljpc.ts, et ce qui le
 * relie au site (cf. src/ljpc-site.ts) : le registre des membres, un grand écran mural où défilent
 * les vraies cartes de membre, celle du CMDR en tête ; le pupitre du Codex Galactique, où tournent
 * en hologramme les corps célestes qu'il a observés pour la Chasse galactique ; le sol dessiné
 * (les pistes de données qui relient les écrans à la table holographique, la marelle de Julia à
 * la craie, les pattes de Moustache), les dessins de Julia sur leur fil et le mobile des planètes.
 * Seul le pupitre arrête le pas.
 *
 * Un objet accroché est construit dos au mur (origine sur la face du mur, au niveau du sol,
 * contenu vers +z).
 */

const C = {
  teal: '#57e6c1',
  tealDark: '#2f9c86',
  deep: '#0a1f24',
  panel: '#0f2e33',
  ink: '#cfeee6',
  white: '#eef3f4',
  bench: '#dfe8ea',
  steelDark: '#2d3439',
  tile: '#e3ecea',
  joint: '#cbd9d6',
  chalk: ['#ff8fc7', '#ffd95a', '#8fd3ff'],
  purple: '#6a3fb0',
}

/** Les anneaux du sceau du labo, en petit. */
function seal(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.strokeStyle = color
  g.lineWidth = Math.max(1, r * 0.12)
  for (const k of [1, 0.62, 0.28]) {
    g.beginPath()
    g.arc(x, y, r * k, 0, Math.PI * 2)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(x - r, y)
  g.lineTo(x, y - r)
  g.lineTo(x + r, y)
  g.lineTo(x, y + r)
  g.closePath()
  g.stroke()
}

// ---------------------------------------------------------------- registre des membres

/** Secondes passées sur une page du registre. */
const PAGE_TIME = 6
const number = (n: number) => `N° ${String(n).padStart(3, '0')}`

/**
 * Registre des membres, accroché au mur : un grand écran où le site affiche les membres du
 * L.J.P.C. À gauche, la carte du CMDR, son numéro et son ancienneté ; à droite, les cartes des
 * autres membres, quatre par quatre, des plus récents aux plus anciens. Largeur : 1,7.
 */
const ljpcMembers: Builder = () => {
  const W = 1020, H = 480
  const Wd = 1.7, Hd = 0.8, Y = 0.6
  const caption = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, max?: number) => {
    g.fillStyle = color
    g.font = `${size >= 20 ? 800 : 600} ${size}px system-ui, sans-serif`
    g.fillText(text, x, y, max)
  }
  const draw = (g: CanvasRenderingContext2D, page: number) => {
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    g.fillStyle = C.deep
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(87, 230, 193, 0.05)'
    for (let x = 0; x < W; x += 30) g.fillRect(x, 0, 1, H)
    for (let y = 0; y < H; y += 30) g.fillRect(0, y, W, 1)
    g.fillStyle = C.panel
    g.fillRect(0, 0, W, 58)
    g.fillStyle = C.teal
    g.fillRect(0, 58, W, 2)
    seal(g, 34, 29, 17, C.teal)
    caption(g, tr('REGISTRE DU L.J.P.C.', 'L.J.P.C. REGISTRY'), 66, 39, 27, C.teal)
    const data = ljpc.data
    if (!data) {
      g.textAlign = 'center'
      caption(g, ljpc.error ? tr('REGISTRE HORS LIGNE', 'REGISTRY OFFLINE') : tr('CONNEXION AU SITE…', 'CONNECTING TO THE SITE…'), W / 2, H / 2 + 20, 30, C.ink)
      g.textAlign = 'left'
      return
    }
    g.textAlign = 'right'
    caption(g, `${data.members.length} ${tr('MEMBRES', 'MEMBERS')}`, W - 24, 39, 27, C.white)
    g.textAlign = 'left'
    // À gauche : la carte du CMDR.
    const self = ljpcSelf(data)
    if (self) {
      caption(g, tr('VOTRE CARTE', 'YOUR CARD'), 28, 86, 15, C.teal)
      g.fillStyle = C.teal
      g.fillRect(24, 94, 456, 264)
      drawCard(g, self.member, 28, 98, 448, 256)
      caption(g, `${number(self.number)} · ${tr('membre depuis le', 'member since')} ${self.member.since}`, 28, 390, 19, C.white, 448)
      const n = self.member.observations
      caption(g, tr(`${n} observation${n > 1 ? 's' : ''} au Codex Galactique`, `${n} observation${n === 1 ? '' : 's'} in the Galactic Codex`), 28, 418, 17, C.ink, 448)
    }
    // À droite : les autres, des plus récents aux plus anciens.
    const others = data.members.map((member, i): [LjpcMember, number] => [member, i + 1]).filter(([m]) => m.id !== data.you).reverse()
    const pages = Math.max(1, Math.ceil(others.length / 4))
    const shown = others.slice((page % pages) * 4, (page % pages) * 4 + 4)
    caption(g, tr('LES MEMBRES', 'THE MEMBERS'), 508, 86, 15, C.teal)
    shown.forEach(([member, n], i) => {
      const x = 508 + (i % 2) * 252, y = 98 + Math.floor(i / 2) * 178
      g.fillStyle = 'rgba(87, 230, 193, 0.35)'
      g.fillRect(x - 2, y - 2, 242, 140)
      drawCard(g, member, x, y, 238, 136)
      caption(g, `${number(n)} · ${member.name}`, x, y + 158, 15, C.ink, 238)
    })
    // En bas : où l'on en est du défilement.
    g.fillStyle = 'rgba(87, 230, 193, 0.2)'
    g.fillRect(508, 462, 488, 4)
    g.fillStyle = C.teal
    g.fillRect(508 + (488 * (page % pages)) / pages, 462, 488 / pages, 4)
  }
  const map = drawnTexture(W, H, (g) => draw(g, 0))
  map.anisotropy = 8
  const g = new THREE.Group()
  g.add(box(Wd + 0.07, Hd + 0.07, 0.035, lit(C.steelDark, 'metal'), 0, Y, 0.0175, 0.012))
  g.add(box(Wd - 0.1, 0.012, 0.012, glow(C.teal), 0, Y - Hd / 2 - 0.05, 0.03))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial({ map }), 0, Y, 0.037))
  live.add(part(glowBand(Wd + 0.4, 0.4, 0.9), halo(C.teal, 0.2), 0, 0.2, 0.004))
  let drawn = ''
  return {
    solid: g,
    live,
    update(t) {
      const page = Math.floor(t / PAGE_TIME)
      const key = `${page}:${ljpc.revision}`
      if (key === drawn) return
      drawn = key
      draw((map.image as HTMLCanvasElement).getContext('2d')!, page)
      map.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- pupitre du Codex

/** Corps montrés en hologramme tant que le Codex est vide (ou que le site n'a pas répondu). */
const SAMPLE = ['#57e6c1', '#8fd3ff', '#ffd66b']

/**
 * Pupitre du Codex Galactique : un pupitre blanc et sarcelle, son écran incliné (le compte des
 * observations du CMDR et les dernières), et au-dessus, en hologramme, un petit système où tourne
 * un corps par observation, de la couleur de son type. 0,66 × 0,36.
 */
const ljpcCodex: Builder = () => {
  const W = 512, H = 240
  const draw = (g: CanvasRenderingContext2D) => {
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    g.fillStyle = C.deep
    g.fillRect(0, 0, W, H)
    g.fillStyle = C.panel
    g.fillRect(0, 0, W, 46)
    g.fillStyle = C.teal
    g.fillRect(0, 46, W, 2)
    g.font = '800 24px system-ui, sans-serif'
    g.fillText(tr('CODEX GALACTIQUE', 'GALACTIC CODEX'), 16, 32)
    const codex = ljpc.data?.codex
    g.fillStyle = C.ink
    g.font = '600 18px system-ui, sans-serif'
    if (!codex) {
      g.fillText(ljpc.data || ljpc.error ? tr('Codex hors ligne.', 'Codex offline.') : tr('Connexion au site…', 'Connecting to the site…'), 16, 96)
      return
    }
    g.fillStyle = C.white
    g.font = '800 76px system-ui, sans-serif'
    g.fillText(String(codex.length), 16, 136)
    const wide = g.measureText(String(codex.length)).width
    g.fillStyle = C.ink
    g.font = '600 18px system-ui, sans-serif'
    g.fillText(tr(`observation${codex.length > 1 ? 's' : ''}`, `observation${codex.length === 1 ? '' : 's'}`), 28 + wide, 112)
    g.fillText(tr(`validée${codex.length > 1 ? 's' : ''}`, 'validated'), 28 + wide, 136)
    if (!codex.length) g.fillText(tr('La Chasse galactique vous attend.', 'The Galactic Hunt awaits.'), 16, 180, W - 32)
    codex.slice(0, 3).forEach((o, i) => {
      const y = 166 + i * 24
      g.fillStyle = bodyColor(o.type)
      g.beginPath()
      g.arc(24, y - 6, 7, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = C.ink
      g.font = '600 16px system-ui, sans-serif'
      g.fillText(`${o.body} · ${o.type}`, 40, y, W - 56)
    })
  }
  const map = drawnTexture(W, H, draw)
  const g = new THREE.Group()
  const white = lit(C.bench)
  g.add(box(0.66, 0.05, 0.36, lit(C.steelDark, 'metal'), 0, 0.025, 0), box(0.6, 0.36, 0.3, white, 0, 0.23, -0.01, 0.012))
  g.add(box(0.6, 0.012, 0.012, glow(C.teal), 0, 0.1, 0.142), box(0.64, 0.03, 0.34, lit(C.white), 0, 0.425, 0, 0.01))
  // Le chevalet de l'écran, et l'émetteur de l'hologramme derrière lui.
  const stand = box(0.6, 0.02, 0.2, lit(C.steelDark, 'metal'), 0, 0.5, 0.06)
  stand.rotation.x = 0.75
  g.add(stand, cylinder(0.1, 0.11, 0.02, lit(C.steelDark, 'metal'), 0, 0.45, -0.08, 18), cylinder(0.085, 0.085, 0.006, glow(C.teal), 0, 0.462, -0.08, 18))
  const live = new THREE.Group()
  const screen = part(new THREE.PlaneGeometry(0.56, 0.26), new THREE.MeshBasicMaterial({ map }), 0, 0.51, 0.071)
  screen.rotation.x = 0.75 - Math.PI / 2
  live.add(screen)
  // Le système en hologramme : une étoile, deux orbites, et les corps du Codex.
  const system = new THREE.Group()
  system.position.set(0, 0.84, -0.08)
  system.rotation.z = 0.2
  const tealHolo = holoMaterial(null, C.tealDark, 0.9)
  system.add(part(new THREE.SphereGeometry(0.045, 12, 8), holoMaterial(null, '#ffd66b', 0.9)))
  const radii = [0.12, 0.19]
  for (const r of radii) {
    const orbit = part(new THREE.TorusGeometry(r, 0.003, 4, 40), tealHolo)
    orbit.rotation.x = Math.PI / 2
    system.add(orbit)
  }
  const bodies = new THREE.Group()
  system.add(bodies)
  live.add(system, part(new THREE.CylinderGeometry(0.2, 0.085, 0.36, 20, 1, true), holoMaterial(null, C.tealDark, 0.16, 1), 0, 0.65, -0.08))
  const orbs: { mesh: THREE.Mesh; r: number; speed: number; phase: number }[] = []
  const populate = () => {
    for (const o of orbs) (o.mesh.material as THREE.Material).dispose()
    orbs.length = 0
    bodies.clear()
    const colors = ljpc.data?.codex?.length ? ljpc.data.codex.slice(0, 8).map((o) => bodyColor(o.type)) : SAMPLE
    colors.forEach((color, i) => {
      const r = radii[i % 2]
      const orb = part(new THREE.SphereGeometry(0.02 + (i % 3) * 0.005, 10, 8), holoMaterial(null, color, 0.95))
      bodies.add(orb)
      orbs.push({ mesh: orb, r, speed: (i % 2 ? 0.5 : 0.8) * (1 + i * 0.07), phase: (i / colors.length) * Math.PI * 2 })
    })
  }
  populate()
  let drawn = 0
  return {
    solid: g,
    live,
    update(t) {
      if (drawn !== ljpc.revision) {
        drawn = ljpc.revision
        draw((map.image as HTMLCanvasElement).getContext('2d')!)
        map.needsUpdate = true
        populate()
      }
      for (const o of orbs) o.mesh.position.set(Math.cos(t * o.speed + o.phase) * o.r, 0, Math.sin(t * o.speed + o.phase) * o.r)
      system.rotation.y = t * 0.1
    },
  }
}

// ---------------------------------------------------------------- sol

/** Pixels par mètre du sol. */
const PX = 128
/** Ce que le sol relie ou contourne, en coordonnées du pont (cf. levels.ts). */
const PLAN = { holo: [23.15, 1.5], pod: [21.1, 0.1], door: 23, registry: [20.65, 1.35], codex: [25.1, 0.95], board: [23, -0.35], bed: [25, 2.9], bench: [24.6, 0.45], hopscotch: [21.85, 3.3] }

/**
 * Sol du labo (`label` : « largeur x profondeur | x du centre | z du centre », pour dessiner en
 * coordonnées du pont) : dalles claires, l'anneau de la table holographique et les pistes de
 * données qui en partent vers le registre, le pupitre du Codex et le tableau d'enquête, le cercle
 * jaune et noir de l'échantillon ; et par-dessus, à la craie, la marelle de Julia (de la Terre à
 * l'espace), une planète et ses étoiles, et les traces de pattes de Moustache.
 */
const ljpcFloor: Builder = ({ label = '5x4|23|1.5' }) => {
  const [size, cx, cz] = label.split('|')
  const [w, d] = size.split('x').map(Number)
  const x0 = Number(cx) - w / 2, z0 = Number(cz) - d / 2
  const map = drawnTexture(w * PX, d * PX, (g) => {
    g.scale(PX, PX)
    g.translate(-x0, -z0)
    g.fillStyle = C.tile
    g.fillRect(x0, z0, w, d)
    g.fillStyle = C.joint
    for (let x = Math.ceil(x0 * 2) / 2; x < x0 + w; x += 0.5) g.fillRect(x - 0.006, z0, 0.012, d)
    for (let z = Math.ceil(z0 * 2) / 2; z < z0 + d; z += 0.5) g.fillRect(x0, z - 0.006, w, 0.012)
    g.lineCap = g.lineJoin = 'round'
    // Les pistes de données : de la table holographique à chaque écran, à angles droits, un plot au bout.
    const [hx, hz] = PLAN.holo
    const trace = (points: number[][]) => {
      for (const [color, width] of [['rgba(47, 156, 134, 0.35)', 0.09], [C.tealDark, 0.03]] as const) {
        g.strokeStyle = color
        g.lineWidth = width
        g.beginPath()
        points.forEach(([x, z]) => g.lineTo(x, z))
        g.stroke()
      }
      const [ex, ez] = points[points.length - 1]
      g.fillStyle = C.tealDark
      g.beginPath()
      g.arc(ex, ez, 0.06, 0, Math.PI * 2)
      g.fill()
    }
    trace([[hx - 0.55, hz], [21.4, hz], [21.4, PLAN.registry[1]], [PLAN.registry[0] + 0.25, PLAN.registry[1]]])
    trace([[hx + 0.39, hz - 0.39], [23.9, 0.75], [24.3, 0.75], [24.3, PLAN.codex[1]], [PLAN.codex[0] - 0.42, PLAN.codex[1]]])
    trace([[hx, hz - 0.55], [hx, 0.35], [PLAN.board[0], 0.35], [PLAN.board[0], PLAN.board[1] + 0.3]])
    trace([[PLAN.door, z0 + d], [PLAN.door, 2.4], [hx, 2.4], [hx, hz + 0.55]])
    // L'anneau de la table holographique : un disque à peine teinté, deux cercles, des graduations.
    g.fillStyle = 'rgba(87, 230, 193, 0.22)'
    g.beginPath()
    g.arc(hx, hz, 0.55, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = C.tealDark
    g.lineWidth = 0.035
    g.stroke()
    g.lineWidth = 0.015
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r0 = i % 6 ? 0.47 : 0.42
      g.beginPath()
      g.moveTo(hx + Math.cos(a) * r0, hz + Math.sin(a) * r0)
      g.lineTo(hx + Math.cos(a) * 0.52, hz + Math.sin(a) * 0.52)
      g.stroke()
    }
    // Le cercle de l'échantillon, jaune et noir.
    g.lineCap = 'butt'
    for (let i = 0; i < 20; i++) {
      g.strokeStyle = i % 2 ? '#17181b' : '#ffd23c'
      g.lineWidth = 0.06
      g.beginPath()
      g.arc(PLAN.pod[0], PLAN.pod[1], 0.38, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2 + 0.01)
      g.stroke()
    }
    g.lineCap = 'round'
    // --- À la craie. La marelle : de la Terre (en bas, près de la porte) à l'espace.
    const chalk = (color: string, width = 0.024) => {
      g.strokeStyle = g.fillStyle = color
      g.lineWidth = width
      g.globalAlpha = 0.85
    }
    const [mx, mz] = PLAN.hopscotch
    const cell = 0.28
    const rows: number[][] = [[0], [0], [-0.5, 0.5], [0], [-0.5, 0.5]]
    let n = 1
    g.font = '700 0.15px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    rows.forEach((row, j) => {
      for (const dx of row) {
        const x = mx + dx * cell, z = mz - (j + 0.5) * cell
        chalk(C.chalk[(n - 1) % 3])
        g.strokeRect(x - cell / 2, z - cell / 2, cell, cell)
        g.fillText(String(n++), x, z + 0.01)
      }
    })
    const top = mz - rows.length * cell
    chalk(C.chalk[2])
    g.beginPath()
    g.arc(mx, top, cell, Math.PI, 0)
    g.stroke()
    g.font = '700 0.09px system-ui, sans-serif'
    g.fillText(tr('ESPACE', 'SPACE'), mx, top - 0.11)
    g.font = '700 0.08px system-ui, sans-serif'
    chalk(C.chalk[0])
    g.fillText(tr('TERRE', 'EARTH'), mx + 0.42, mz - 0.1)
    // Une planète à anneau et trois étoiles, près du tapis de Julia.
    chalk(C.chalk[1])
    g.beginPath()
    g.arc(24.25, 3.05, 0.13, 0, Math.PI * 2)
    g.stroke()
    chalk(C.chalk[0])
    g.beginPath()
    g.ellipse(24.25, 3.05, 0.24, 0.06, -0.35, 0, Math.PI * 2)
    g.stroke()
    chalk(C.chalk[2], 0.018)
    for (const [sx, sz] of [[23.85, 2.95], [24.62, 3.2], [23.95, 3.25]]) {
      g.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI
        g.moveTo(sx - Math.cos(a) * 0.05, sz - Math.sin(a) * 0.05)
        g.lineTo(sx + Math.cos(a) * 0.05, sz + Math.sin(a) * 0.05)
      }
      g.stroke()
    }
    // Les pattes de Moustache, de son panier à la paillasse (elle n'a pas le droit d'y monter).
    g.globalAlpha = 0.4
    g.fillStyle = '#2a2530'
    const [bx, bz] = PLAN.bed, [tx, tz] = PLAN.bench
    for (let i = 1; i < 9; i++) {
      const k = i / 9, side = i % 2 ? 0.05 : -0.05
      const x = bx + (tx - bx) * k + side, z = bz + (tz - bz) * k
      g.beginPath()
      g.arc(x, z, 0.028, 0, Math.PI * 2)
      for (const [dx, dz] of [[-0.03, -0.035], [0, -0.048], [0.03, -0.035]]) {
        g.moveTo(x + dx + 0.012, z + dz)
        g.arc(x + dx, z + dz, 0.012, 0, Math.PI * 2)
      }
      g.fill()
    }
    g.globalAlpha = 1
  })
  map.anisotropy = 8
  const floor = part(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.006, 0)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  const g = new THREE.Group()
  g.add(floor)
  return { solid: g }
}

// ---------------------------------------------------------------- dessins de Julia

/** Les dessins de Julia, dessinés dans une feuille de 120 × 150 dont le coin est en (x, y). */
const DRAWINGS: ((g: CanvasRenderingContext2D, x: number, y: number) => void)[] = [
  // Un Thargoïde : une fleur verte à huit pétales, sur fond noir. « MÉCHANT ».
  (g, x, y) => {
    g.fillStyle = '#15171c'
    g.fillRect(x + 8, y + 8, 104, 100)
    g.strokeStyle = '#6aff9a'
    g.lineWidth = 4
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.ellipse(x + 60 + Math.cos(a) * 22, y + 58 + Math.sin(a) * 22, 16, 7, a, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = '#d8323c'
    g.font = '800 17px system-ui, sans-serif'
    g.fillText(tr('MÉCHANT', 'MEAN'), x + 60, y + 132)
  },
  // Moustache : une chatte noire, ses moustaches, un cœur.
  (g, x, y) => {
    g.fillStyle = '#23202a'
    g.beginPath()
    g.arc(x + 60, y + 66, 30, 0, Math.PI * 2)
    g.moveTo(x + 34, y + 52)
    g.lineTo(x + 38, y + 22)
    g.lineTo(x + 56, y + 40)
    g.moveTo(x + 86, y + 52)
    g.lineTo(x + 82, y + 22)
    g.lineTo(x + 64, y + 40)
    g.fill()
    g.fillStyle = '#ffe14f'
    g.fillRect(x + 46, y + 58, 8, 8)
    g.fillRect(x + 66, y + 58, 8, 8)
    g.strokeStyle = '#f4f0ea'
    g.lineWidth = 2
    g.beginPath()
    for (const s of [-1, 1]) for (const dy of [-4, 4]) {
      g.moveTo(x + 60 + s * 8, y + 76)
      g.lineTo(x + 60 + s * 40, y + 76 + dy)
    }
    g.stroke()
    g.fillStyle = C.purple
    g.font = '800 15px system-ui, sans-serif'
    g.fillText('MOUSTACHE ♥', x + 60, y + 132)
  },
  // Un Cobra et sa flamme, parmi les étoiles.
  (g, x, y) => {
    g.fillStyle = '#ffd95a'
    for (const [sx, sy] of [[20, 24], [98, 36], [30, 96], [92, 100]]) g.fillRect(x + sx, y + sy, 5, 5)
    g.fillStyle = '#ff7a2a'
    g.beginPath()
    g.moveTo(x + 44, y + 78)
    g.lineTo(x + 14, y + 104)
    g.lineTo(x + 52, y + 90)
    g.fill()
    g.fillStyle = '#3690ea'
    g.beginPath()
    g.moveTo(x + 96, y + 32)
    g.lineTo(x + 84, y + 78)
    g.lineTo(x + 40, y + 88)
    g.lineTo(x + 54, y + 60)
    g.fill()
    g.fillStyle = '#1d2b3a'
    g.font = '800 15px system-ui, sans-serif'
    g.fillText(tr('POUR LA SCIENCE', 'FOR SCIENCE'), x + 60, y + 132, 108)
  },
  // Le labo au complet : James, Julia, leur père, et Moustache.
  (g, x, y) => {
    g.strokeStyle = '#1d2b3a'
    g.lineWidth = 3
    for (const [px, h, color] of [[26, 40, '#3690ea'], [50, 30, '#ff8fc7'], [80, 56, '#2f9c86']] as const) {
      const foot = y + 104
      g.strokeStyle = color
      g.beginPath()
      g.arc(x + px, foot - h - 9, 9, 0, Math.PI * 2)
      g.moveTo(x + px, foot - h)
      g.lineTo(x + px, foot - h * 0.4)
      g.lineTo(x + px - 8, foot)
      g.moveTo(x + px, foot - h * 0.4)
      g.lineTo(x + px + 8, foot)
      g.moveTo(x + px - 11, foot - h * 0.7)
      g.lineTo(x + px + 11, foot - h * 0.7)
      g.stroke()
    }
    g.fillStyle = '#23202a'
    g.fillRect(x + 98, y + 92, 14, 12)
    g.fillRect(x + 98, y + 86, 4, 8)
    g.fillRect(x + 108, y + 86, 4, 8)
    g.fillStyle = C.tealDark
    g.font = '800 17px system-ui, sans-serif'
    g.fillText('L.J.P.C.', x + 60, y + 132)
  },
]

/** Les dessins de Julia, pendus à un fil par des pinces à linge, contre le mur. Largeur : 1,1. */
const ljpcDrawings: Builder = ({ random }) => {
  const n = DRAWINGS.length, pw = 120, ph = 150, gap = 16
  const W = n * pw + (n + 1) * gap, H = ph + 40
  const sheet = drawnTexture(W, H, (g) => {
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    DRAWINGS.forEach((drawing, i) => {
      const x = gap + i * (pw + gap), y = 30
      g.save()
      g.translate(x + pw / 2, y)
      g.rotate((random() - 0.5) * 0.14)
      g.translate(-x - pw / 2, -y)
      g.fillStyle = '#fbf7ea'
      g.fillRect(x, y, pw, ph)
      drawing(g, x, y)
      // La pince à linge.
      g.fillStyle = C.chalk[i % 3]
      g.fillRect(x + pw / 2 - 6, y - 14, 12, 26)
      g.restore()
    })
    g.strokeStyle = '#8a949c'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, 14)
    g.quadraticCurveTo(W / 2, 26, W, 14)
    g.stroke()
  })
  const w = 1.1, h = (w * H) / W
  const g = new THREE.Group()
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: sheet, transparent: true, alphaTest: 0.5 }), 0, 0.72, 0.012))
  for (const x of [-w / 2, w / 2]) g.add(box(0.016, 0.016, 0.03, lit(C.steelDark, 'metal'), x, 0.72 + h / 2 - 0.03, 0.015))
  return { solid: g }
}

// ---------------------------------------------------------------- mobile

/** Les planètes du mobile : rayon, couleur, bras (distance à l'axe), longueur du fil. */
const PLANETS: [number, string, number, number][] = [
  [0.05, '#ffd66b', 0, 0.12],
  [0.022, '#c9a58a', 0.14, 0.2],
  [0.03, '#5fb8ff', 0.2, 0.14],
  [0.026, '#ff7a5a', 0.17, 0.24],
  [0.04, '#d9b26a', 0.24, 0.18],
]

/** Mobile des planètes, pendu au plafond : un soleil, quatre planètes (la dernière a son anneau), qui tournent lentement. */
const ljpcMobile: Builder = () => {
  const live = new THREE.Group()
  const top = 1.62
  const wire = lit('#8a949c', 'metal')
  live.add(part(new THREE.CylinderGeometry(0.003, 0.003, 0.6, 4), wire, 0, top + 0.3, 0))
  const spin = new THREE.Group()
  spin.position.y = top
  live.add(spin)
  PLANETS.forEach(([r, color, arm, drop], i) => {
    const a = (i / (PLANETS.length - 1)) * Math.PI * 2
    const x = Math.cos(a) * arm, z = Math.sin(a) * arm
    if (arm) {
      const bar = part(new THREE.CylinderGeometry(0.003, 0.003, arm, 4), wire, x / 2, 0, z / 2)
      bar.rotation.set(0, -a, Math.PI / 2)
      spin.add(bar)
    }
    spin.add(part(new THREE.CylinderGeometry(0.002, 0.002, drop, 4), wire, x, -drop / 2, z), part(new THREE.SphereGeometry(r, 12, 8), lit(color), x, -drop - r, z))
    if (i === PLANETS.length - 1) {
      const ring = part(new THREE.TorusGeometry(r * 1.7, 0.005, 4, 24), lit('#f1dcae'), x, -drop - r, z)
      ring.rotation.x = Math.PI / 2 - 0.4
      spin.add(ring)
    }
  })
  return {
    live,
    update(t) {
      spin.rotation.y = t * 0.22
      spin.rotation.z = Math.sin(t * 0.6) * 0.03
    },
  }
}

export const LJPC_DECOR = {
  'ljpc-members': ljpcMembers,
  'ljpc-codex': ljpcCodex,
  'ljpc-floor': ljpcFloor,
  'ljpc-drawings': ljpcDrawings,
  'ljpc-mobile': ljpcMobile,
} satisfies Record<string, Builder>
