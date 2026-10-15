import * as THREE from 'three'
import { beamMaterial, box, cylinder, decal, drawnTexture, glow, instanced, keepShared, lit, mesh, part, setInstance, sphere, type Builder } from './kit'

/*
 * La grande bibliothèque du pont supérieur (cf. src/lore-library.ts) : six alcôves, une par thème
 * du lore, chacune avec son rayonnage, son pupitre et sa marqueterie au sol, dessinés à son image ;
 * au centre, l'hologramme du Lore Explorer, un graphe de notes qui tourne sur son estrade. Et, au
 * planétarium, le mur des cartes stellaires qui ouvrent EDGIS.
 * - L'Empire : marbre blanc, colonnes, or et velours pourpre, fronton en arc et l'aigle impérial ;
 * - la Fédération : acier bleu marine, chrome, étagères éclairées par-dessous, comme un bureau de Mars ;
 * - l'Alliance : bois clair, vert tendre et plantes en pot, l'union des systèmes libres ;
 * - les Thargoïdes : alvéoles hexagonales sombres, lueur verte, éclats de capteurs entre les livres ;
 * - les Gardiens : obélisques de pierre bleutée, glyphes cyan, tablettes et orbe de relique ;
 * - les Mystères : laque noire, velours cramoisi, chandelles, et la Roue sombre au sommet.
 */

type Theme = 'empire' | 'federation' | 'alliance' | 'thargoid' | 'guardian' | 'mysteries'
const themeOf = (label?: string): Theme => (['empire', 'federation', 'alliance', 'thargoid', 'guardian', 'mysteries'].includes(label ?? '') ? label as Theme : 'empire')

/** Couleurs de chaque thème : dos des livres, bandeaux, accent, et la lueur de l'alcôve. */
const LOOK: Record<Theme, { spines: string[]; band: string; accent: string; light: string; floor: [string, string] }> = {
  empire: { spines: ['#5a2a6e', '#7a1f2e', '#ece2c8', '#3e1d4f', '#b48a3c', '#f2ece0'], band: '#d8b062', accent: '#d8b062', light: '#ffd9a0', floor: ['#efe8da', '#5a2a6e'] },
  federation: { spines: ['#1f3f7a', '#e8eef6', '#a8262e', '#5a6a80', '#2f5fa8', '#c9d2de'], band: '#c9d2de', accent: '#7cc4ff', light: '#cfe6ff', floor: ['#1b2a46', '#7cc4ff'] },
  alliance: { spines: ['#2f6b3f', '#d8c9a0', '#7a4a2a', '#4f8f5a', '#e8dcc0', '#a87a4a'], band: '#e8dcc0', accent: '#5fc27a', light: '#eaffd8', floor: ['#c9a070', '#3f9a5a'] },
  thargoid: { spines: ['#0f1a14', '#1f3a2e', '#2a4f3f', '#0a0f0c', '#355c4a'], band: '#3cffb0', accent: '#3cffb0', light: '#7dffcf', floor: ['#121916', '#3cffb0'] },
  guardian: { spines: ['#4a525e', '#6a7280', '#3a414c', '#8a929e', '#2f4a5a'], band: '#6fe3ff', accent: '#6fe3ff', light: '#9feeff', floor: ['#5d6672', '#6fe3ff'] },
  mysteries: { spines: ['#1a1418', '#4a0f18', '#2a1a3a', '#0f0f12', '#6a1a2a', '#3a2a2a'], band: '#a8a8b4', accent: '#c8283a', light: '#ff8a6a', floor: ['#161114', '#8a1c24'] },
}

// ---------------------------------------------------------------- les emblèmes

/** L'emblème d'un thème, dessiné une fois (fond transparent) : aigle, cocarde, chevrons, fleur thargoïde, glyphe, Roue sombre. */
const emblems = new Map<Theme, THREE.CanvasTexture>()
function emblem(theme: Theme): THREE.CanvasTexture {
  let t = emblems.get(theme)
  if (t) return t
  const S = 256, C = S / 2
  t = keepShared(drawnTexture(S, S, (g) => {
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const ring = (r: number, w: number, color: string) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke() }
    const disc = (r: number, color: string) => { g.fillStyle = color; g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.fill() }
    if (theme === 'empire') {
      // L'aigle impérial, ailes déployées, dans un anneau d'or.
      ring(118, 8, '#d8b062')
      g.fillStyle = '#e4bd62'
      g.strokeStyle = '#7a5a1a'
      g.lineWidth = 3
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
        g.save()
        g.translate(C + s * 18, C - 6)
        g.rotate(s * (0.35 + k * 0.2))
        g.beginPath()
        g.ellipse(s * 52, 0, 50 - k * 4, 11, 0, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.restore()
      }
      g.beginPath()
      g.moveTo(C, C - 54); g.lineTo(C + 22, C - 6); g.lineTo(C + 14, C + 50); g.lineTo(C, C + 70); g.lineTo(C - 14, C + 50); g.lineTo(C - 22, C - 6); g.closePath()
      g.fill(); g.stroke()
      g.beginPath(); g.arc(C, C - 60, 15, 0, Math.PI * 2); g.fill(); g.stroke()
      g.beginPath(); g.moveTo(C + 12, C - 62); g.lineTo(C + 30, C - 56); g.lineTo(C + 12, C - 52); g.fill()
    } else if (theme === 'federation') {
      // La cocarde : un disque bleu, des ailes blanches et l'étoile.
      disc(118, '#2a5fb0')
      ring(108, 6, '#e8eef6')
      g.strokeStyle = '#e8eef6'
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
        g.lineWidth = 9 - k
        g.beginPath()
        g.arc(C + s * 6, C + 18 + k * 16, 70 - k * 10, s > 0 ? -Math.PI * 0.42 : Math.PI * 1.08, s > 0 ? -Math.PI * 0.08 : Math.PI * 1.42)
        g.stroke()
      }
      g.fillStyle = '#ffffff'
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 14 : 34
        g.lineTo(C + Math.cos(a) * r, C - 18 + Math.sin(a) * r)
      }
      g.fill()
    } else if (theme === 'alliance') {
      // Trois chevrons qui se rejoignent : l'union des systèmes.
      disc(118, '#2f8f55')
      ring(108, 6, '#e8f6ea')
      g.strokeStyle = '#ffffff'
      g.lineWidth = 16
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3
        g.save()
        g.translate(C + Math.cos(a) * 52, C + Math.sin(a) * 52)
        g.rotate(a + Math.PI / 2)
        g.beginPath(); g.moveTo(-28, -12); g.lineTo(0, 14); g.lineTo(28, -12); g.stroke()
        g.restore()
      }
      disc(14, '#ffffff')
    } else if (theme === 'thargoid') {
      // La fleur thargoïde : huit pétales sombres, liserés de vert, autour d'un cœur lumineux.
      for (let k = 0; k < 8; k++) {
        g.save()
        g.translate(C, C)
        g.rotate((k * Math.PI) / 4)
        g.fillStyle = '#1b2a23'
        g.strokeStyle = '#4dffc0'
        g.lineWidth = 4
        g.beginPath(); g.moveTo(0, -30); g.lineTo(26, -78); g.lineTo(0, -118); g.lineTo(-26, -78); g.closePath()
        g.fill(); g.stroke()
        g.restore()
      }
      const core = g.createRadialGradient(C, C, 4, C, C, 34)
      core.addColorStop(0, '#d8fff0'); core.addColorStop(0.5, '#3cffb0'); core.addColorStop(1, 'rgba(60,255,176,0)')
      g.fillStyle = core
      g.beginPath(); g.arc(C, C, 34, 0, Math.PI * 2); g.fill()
    } else if (theme === 'guardian') {
      // Un glyphe des Gardiens : arcs concentriques, rayons et points, en cyan.
      g.strokeStyle = '#6fe3ff'
      g.shadowColor = '#6fe3ff'
      g.shadowBlur = 12
      g.lineWidth = 7
      for (const [r, a0, a1] of [[108, 0.2, 2.6], [108, 3.4, 5.6], [76, 1.2, 4.4], [44, 4.6, 7.4]]) { g.beginPath(); g.arc(C, C, r, a0, a1); g.stroke() }
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + 0.4
        g.beginPath(); g.moveTo(C + Math.cos(a) * 52, C + Math.sin(a) * 52); g.lineTo(C + Math.cos(a) * 92, C + Math.sin(a) * 92); g.stroke()
      }
      g.fillStyle = '#c8f6ff'
      g.beginPath(); g.arc(C, C, 14, 0, Math.PI * 2); g.fill()
    } else {
      // La Roue sombre : un anneau d'argent, huit rayons, sur un halo cramoisi.
      const halo = g.createRadialGradient(C, C, 60, C, C, 126)
      halo.addColorStop(0, 'rgba(200,40,58,0)'); halo.addColorStop(0.7, 'rgba(200,40,58,0.55)'); halo.addColorStop(1, 'rgba(200,40,58,0)')
      g.fillStyle = halo
      g.fillRect(0, 0, S, S)
      ring(96, 16, '#c8c8d0')
      g.strokeStyle = '#a8a8b4'
      g.lineWidth = 8
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        g.beginPath(); g.moveTo(C + Math.cos(a) * 20, C + Math.sin(a) * 20); g.lineTo(C + Math.cos(a) * 90, C + Math.sin(a) * 90); g.stroke()
      }
      disc(22, '#c8c8d0')
      disc(10, '#c8283a')
    }
  }))
  emblems.set(theme, t)
  return t
}

const emblemMaterials = new Map<Theme, THREE.MeshBasicMaterial>()
/** Plaque de l'emblème (w × w, face à +z). */
function emblemPlate(theme: Theme, w: number, x: number, y: number, z: number) {
  let m = emblemMaterials.get(theme)
  if (!m) emblemMaterials.set(theme, (m = keepShared(new THREE.MeshBasicMaterial({ map: emblem(theme), transparent: true, alphaTest: 0.08, toneMapped: false }))))
  return part(new THREE.PlaneGeometry(w, w), m, x, y, z)
}

// ---------------------------------------------------------------- les rayonnages

const W = 2.3, D = 0.36, H = 1.52
/** Hauteur des tablettes (le dessus de chacune). */
const SHELVES = [0.14, 0.49, 0.84, 1.19]

/** Une rangée de livres sur une tablette, de x0 à x1 : hauteurs et épaisseurs au hasard, quelques bandeaux. */
function books(g: THREE.Group, x0: number, x1: number, y: number, theme: Theme, random: () => number, maxH = 0.28, z = 0.01) {
  const look = LOOK[theme]
  let x = x0
  while (x < x1 - 0.05) {
    const w = 0.028 + random() * 0.034, h = Math.min(maxH, 0.18 + random() * 0.11)
    if (random() < 0.07) { x += 0.06 + random() * 0.08; continue }
    const lean = random() < 0.06 && x < x1 - 0.12 ? 0.22 : 0
    const b = box(w, h, 0.2 + random() * 0.05, lit(look.spines[Math.floor(random() * look.spines.length)]), x + w / 2, y + h / 2, z)
    b.rotation.z = lean
    g.add(b)
    if (random() < 0.35) g.add(box(w + 0.003, 0.012, 0.19, theme === 'thargoid' || theme === 'guardian' ? glow(look.band) : lit(look.band, 'metal'), x + w / 2, y + h * 0.78, z + 0.004))
    x += w + 0.004 + (lean ? 0.07 : 0)
  }
}

/** Un livre ouvert à plat, sur un pupitre ou une tablette. */
function openBook(g: THREE.Group, x: number, y: number, z: number, cover: string, tilt = 0) {
  const b = new THREE.Group()
  b.add(box(0.3, 0.012, 0.21, lit(cover), 0, 0, 0))
  for (const s of [-1, 1]) {
    const page = box(0.135, 0.016, 0.19, lit('#f1e8d2'), s * 0.071, 0.012, 0)
    page.rotation.z = -s * 0.07
    b.add(page)
  }
  b.position.set(x, y, z)
  b.rotation.x = tilt
  g.add(b)
}

const bookcaseEmpire = (g: THREE.Group, random: () => number) => {
  const marble = lit('#eee8dc'), gold = lit('#d8b062', 'metal'), velvet = lit('#4b2a63', 'cloth')
  g.add(box(W + 0.1, 0.1, D + 0.08, marble, 0, 0.05, 0))
  g.add(box(W - 0.2, H, 0.03, velvet, 0, H / 2, -D / 2 + 0.02))
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 - 0.08)
    g.add(cylinder(0.07, 0.078, H - 0.12, marble, cx, 0.1 + (H - 0.12) / 2, 0.03, 12))
    g.add(box(0.19, 0.05, 0.19, gold, cx, 0.125, 0.03), box(0.2, 0.06, 0.2, gold, cx, H - 0.01, 0.03))
    for (let k = 0; k < 4; k++) g.add(box(0.008, H - 0.3, 0.008, lit('#d9d1c2'), cx + (k - 1.5) * 0.03, 0.1 + (H - 0.12) / 2, 0.1))
  }
  for (const y of SHELVES) g.add(box(W - 0.32, 0.04, D - 0.04, marble, 0, y - 0.02, 0), box(W - 0.32, 0.018, 0.012, gold, 0, y - 0.02, D / 2 - 0.02))
  g.add(box(W + 0.08, 0.08, D + 0.06, marble, 0, H + 0.07, 0), box(W + 0.08, 0.018, 0.012, gold, 0, H + 0.04, D / 2 + 0.035))
  // Le fronton en arc, son liseré d'or, l'aigle.
  const arch = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 20, 1, false, -Math.PI / 2, Math.PI), marble, 0, H + 0.11, 0)
  arch.rotation.x = -Math.PI / 2
  g.add(arch)
  const rim = mesh(new THREE.TorusGeometry(0.44, 0.016, 4, 20, Math.PI), gold, 0, H + 0.11, 0.045)
  g.add(rim)
  g.add(emblemPlate('empire', 0.52, 0, H + 0.33, 0.05))
  for (let s = 0; s < SHELVES.length; s++) books(g, -W / 2 + 0.2, W / 2 - 0.2, SHELVES[s], 'empire', random)
  // Une lueur dorée sous le fronton.
  g.add(box(W - 0.36, 0.008, 0.02, glow('#ffd28a'), 0, H - 0.04, D / 2 - 0.05))
}

const bookcaseFederation = (g: THREE.Group, random: () => number) => {
  const navy = lit('#1d2b4a', 'metal'), chrome = lit('#c9d2de', 'metal'), back = lit('#122038', 'metal'), light = glow('#7cc4ff')
  g.add(box(W, 0.08, D, navy, 0, 0.04, 0))
  g.add(box(W - 0.1, H, 0.03, back, 0, H / 2, -D / 2 + 0.015))
  for (const x of [-W / 3, W / 3]) g.add(box(0.012, H - 0.2, 0.006, glow('#2f6fd0'), x, H / 2, -D / 2 + 0.035))
  for (const s of [-1, 1]) g.add(box(0.07, H, D, navy, s * (W / 2 - 0.035), H / 2, 0), box(0.014, H, 0.014, chrome, s * (W / 2 - 0.004), H / 2, D / 2 - 0.004))
  g.add(box(0.04, H - 0.1, D - 0.03, navy, 0, H / 2, 0), box(0.012, H - 0.1, 0.012, chrome, 0, H / 2, D / 2 - 0.02))
  for (const y of SHELVES) {
    g.add(box(W - 0.14, 0.03, D - 0.02, navy, 0, y - 0.015, 0), box(W - 0.14, 0.012, 0.012, chrome, 0, y - 0.01, D / 2 - 0.012))
    g.add(box(W - 0.2, 0.006, 0.02, light, 0, y - 0.034, D / 2 - 0.05))
  }
  // Le bandeau du haut, chromé, et la cocarde.
  g.add(box(W + 0.04, 0.2, D, navy, 0, H + 0.1, 0), box(W + 0.04, 0.014, 0.014, chrome, 0, H + 0.005, D / 2), box(W + 0.04, 0.014, 0.014, chrome, 0, H + 0.195, D / 2))
  for (const s of [-1, 1]) g.add(box(0.7, 0.012, 0.01, light, s * 0.62, H + 0.1, D / 2 + 0.006))
  g.add(cylinder(0.2, 0.2, 0.03, chrome, 0, H + 0.12, D / 2 + 0.01, 24))
  g.children.at(-1)!.rotation.x = Math.PI / 2
  g.add(emblemPlate('federation', 0.38, 0, H + 0.12, D / 2 + 0.03))
  for (const y of SHELVES) for (const [x0, x1] of [[-W / 2 + 0.08, -0.04], [0.04, W / 2 - 0.08]]) books(g, x0, x1, y, 'federation', random)
}

const bookcaseAlliance = (g: THREE.Group, random: () => number) => {
  const wood = lit('#9a6a3e', 'wood'), pale = lit('#cfa676', 'wood'), green = lit('#3f9a5a')
  g.add(box(W, 0.1, D, wood, 0, 0.05, 0))
  g.add(box(W - 0.08, H, 0.03, pale, 0, H / 2, -D / 2 + 0.015))
  for (const s of [-1, 1]) g.add(box(0.08, H + 0.04, D, wood, s * (W / 2 - 0.04), (H + 0.04) / 2, 0, 0.03))
  for (const x of [-W / 6, W / 6]) g.add(box(0.035, H - 0.08, D - 0.04, wood, x, H / 2, 0))
  for (const y of SHELVES) g.add(box(W - 0.12, 0.035, D - 0.02, pale, 0, y - 0.018, 0), box(W - 0.12, 0.016, 0.012, green, 0, y - 0.012, D / 2 - 0.012))
  g.add(box(W + 0.02, 0.06, D + 0.02, wood, 0, H + 0.03, 0, 0.02), box(W - 0.4, 0.16, 0.02, green, 0, H + 0.14, D / 2 - 0.08))
  g.add(emblemPlate('alliance', 0.3, 0, H + 0.15, D / 2 - 0.065))
  // Des plantes en pot sur le dessus : l'Alliance pousse.
  for (const x of [-0.82, 0.82]) {
    g.add(cylinder(0.09, 0.07, 0.14, lit('#e9e2d6'), x, H + 0.13, 0, 10))
    for (let k = 0; k < 5; k++) {
      const a = random() * Math.PI * 2
      g.add(mesh(new THREE.IcosahedronGeometry(0.06 + random() * 0.04, 0), lit(['#3f8f4a', '#5fae5a', '#2f6b3f'][k % 3]), x + Math.cos(a) * 0.05, H + 0.25 + random() * 0.1, Math.sin(a) * 0.05))
    }
  }
  for (const y of SHELVES) for (const [x0, x1] of [[-W / 2 + 0.09, -W / 6 - 0.03], [-W / 6 + 0.03, W / 6 - 0.03], [W / 6 + 0.03, W / 2 - 0.09]]) books(g, x0, x1, y, 'alliance', random)
  // Un petit pot de fougère au milieu d'une tablette.
  g.add(cylinder(0.05, 0.04, 0.08, lit('#b8653f'), 0, SHELVES[2] + 0.04, 0.05, 8), mesh(new THREE.IcosahedronGeometry(0.07, 0), lit('#4f9a4a'), 0, SHELVES[2] + 0.13, 0.05))
}

const bookcaseThargoid = (g: THREE.Group, random: () => number) => {
  const shell = lit('#141a17', 'metal'), flesh = lit('#22302a'), green = glow('#3cffb0'), dim = glow('#17694f')
  g.add(box(W, 0.1, D, shell, 0, 0.05, 0))
  g.add(box(W - 0.06, H, 0.04, flesh, 0, H / 2, -D / 2 + 0.02))
  // Les alvéoles : des hexagones à plat, en quinconce, chacun liseré de vert.
  const R = 0.19, ring = new THREE.TorusGeometry(R, 0.024, 4, 6), edge = new THREE.TorusGeometry(R - 0.03, 0.006, 3, 6)
  for (let c = 0; c < 7; c++) {
    const x = (c - 3) * R * 1.5
    for (let r = 0; r < 4; r++) {
      const y = 0.32 + r * R * Math.sqrt(3) + (c % 2 ? (R * Math.sqrt(3)) / 2 : 0)
      if (y > H - 0.08) continue
      g.add(mesh(ring, shell, x, y, D / 2 - 0.05), part(edge, dim, x, y, D / 2 - 0.03))
      const bottom = y - R * 0.84, roll = random()
      if (roll < 0.5) {
        let bx = x - 0.1
        for (let k = 0; k < 3 + Math.floor(random() * 2); k++) {
          const w = 0.03 + random() * 0.02, h = 0.12 + random() * 0.08
          g.add(box(w, h, 0.16, lit(LOOK.thargoid.spines[Math.floor(random() * 5)]), bx + w / 2, bottom + h / 2, 0))
          bx += w + 0.006
        }
      } else if (roll < 0.78) {
        // Un éclat de capteur, sur son socle.
        g.add(box(0.08, 0.03, 0.08, shell, x, bottom + 0.015, 0), mesh(new THREE.OctahedronGeometry(0.07, 0), green, x, bottom + 0.11, 0))
      } else g.add(part(new THREE.CircleGeometry(R - 0.05, 6), dim, x, y, -D / 2 + 0.045))
    }
  }
  for (const s of [-1, 1]) {
    const rib = box(0.07, H + 0.1, 0.1, shell, s * (W / 2 - 0.02), (H + 0.1) / 2, D / 2 - 0.08)
    rib.rotation.z = -s * 0.05
    g.add(rib)
  }
  // La couronne : la fleur thargoïde au-dessus d'un disque sombre.
  g.add(cylinder(0.32, 0.32, 0.04, shell, 0, H + 0.3, 0, 8))
  g.children.at(-1)!.rotation.x = Math.PI / 2
  g.add(box(0.1, 0.12, 0.1, shell, 0, H + 0.03, 0))
  g.add(emblemPlate('thargoid', 0.62, 0, H + 0.3, 0.03))
}

const bookcaseGuardian = (g: THREE.Group, random: () => number) => {
  const stone = lit('#69727f'), dark = lit('#4b535e'), cyan = glow('#6fe3ff')
  g.add(box(W + 0.06, 0.1, D + 0.04, dark, 0, 0.05, 0))
  g.add(box(W - 0.2, H, 0.04, dark, 0, H / 2, -D / 2 + 0.02))
  for (const s of [-1, 1]) {
    const obelisk = mesh(new THREE.CylinderGeometry(0.07, 0.13, H + 0.34, 4), stone, s * (W / 2 - 0.09), (H + 0.34) / 2, 0)
    obelisk.rotation.y = Math.PI / 4
    g.add(obelisk)
    g.add(box(0.016, H * 0.8, 0.01, cyan, s * (W / 2 - 0.09), H * 0.5, 0.1))
    g.add(sphere(0.035, cyan, s * (W / 2 - 0.09), H + 0.36, 0, 8))
  }
  for (const y of SHELVES) g.add(box(W - 0.34, 0.06, D - 0.02, stone, 0, y - 0.03, 0), box(W - 0.4, 0.008, 0.01, glow('#2a8fb0'), 0, y - 0.03, D / 2 - 0.005))
  g.add(box(W - 0.1, 0.18, D + 0.02, stone, 0, H + 0.09, 0))
  g.add(emblemPlate('guardian', 0.42, 0, H + 0.12, D / 2 + 0.02))
  for (let s = 0; s < SHELVES.length; s++) {
    const y = SHELVES[s]
    // Des tablettes de pierre gravée, quelques livres, et, sur la deuxième, l'orbe d'une relique.
    let x = -W / 2 + 0.26
    while (x < W / 2 - 0.3) {
      if (s === 1 && Math.abs(x) < 0.15) {
        g.add(cylinder(0.07, 0.09, 0.05, dark, 0, y + 0.025, 0, 8), sphere(0.07, cyan, 0, y + 0.12, 0, 12))
        x += 0.26
        continue
      }
      if (random() < 0.35) {
        const t = box(0.2, 0.25, 0.035, stone, x + 0.1, y + 0.125, -0.06)
        t.rotation.x = -0.14
        g.add(t)
        for (let k = 0; k < 3; k++) {
          const line = box(0.12 - k * 0.02, 0.008, 0.004, cyan, x + 0.1, y + 0.07 + k * 0.06, -0.035 + k * 0.009)
          line.rotation.x = -0.14
          g.add(line)
        }
        x += 0.24
      } else {
        const end = Math.min(W / 2 - 0.3, x + 0.2 + random() * 0.15)
        books(g, x, end, y, 'guardian', random, 0.24)
        x = end + 0.03
      }
    }
  }
}

const bookcaseMysteries = (g: THREE.Group, random: () => number) => {
  const lacquer = lit('#151117'), crimson = lit('#6a1420', 'cloth'), silver = lit('#9a9aa6', 'metal'), flame = glow('#ffcf7a'), ember = glow('#c8283a')
  g.add(box(W, 0.1, D, lacquer, 0, 0.05, 0))
  g.add(box(W - 0.08, H, 0.03, crimson, 0, H / 2, -D / 2 + 0.015))
  for (const s of [-1, 1]) g.add(box(0.08, H + 0.06, D, lacquer, s * (W / 2 - 0.04), (H + 0.06) / 2, 0), box(0.012, H + 0.06, 0.012, silver, s * (W / 2 - 0.04), (H + 0.06) / 2, D / 2 + 0.002))
  for (const y of SHELVES) g.add(box(W - 0.14, 0.035, D - 0.02, lacquer, 0, y - 0.018, 0), box(W - 0.14, 0.012, 0.012, silver, 0, y - 0.012, D / 2 - 0.012))
  g.add(box(W + 0.04, 0.08, D + 0.04, lacquer, 0, H + 0.04, 0))
  // La Roue sombre, debout sur son socle, devant son halo cramoisi.
  g.add(box(0.16, 0.08, 0.12, lacquer, 0, H + 0.12, 0))
  const wheel = new THREE.Group()
  wheel.add(mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 28), silver), part(new THREE.TorusGeometry(0.36, 0.012, 4, 28), ember, 0, 0, -0.03))
  for (let k = 0; k < 8; k++) {
    const spoke = box(0.022, 0.56, 0.02, silver)
    spoke.rotation.z = (k * Math.PI) / 8
    wheel.add(spoke)
  }
  wheel.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).rotateX(Math.PI / 2), silver), part(new THREE.CircleGeometry(0.03, 12), ember, 0, 0, 0.027))
  wheel.position.set(0, H + 0.48, 0)
  g.add(wheel)
  for (let s = 0; s < SHELVES.length; s++) {
    const y = SHELVES[s]
    if (s === 0) {
      // Un coffret cerclé d'argent, cadenassé.
      g.add(box(0.42, 0.2, 0.24, lit('#3a2418', 'wood'), 0.62, y + 0.1, 0), box(0.43, 0.02, 0.25, silver, 0.62, y + 0.14, 0), box(0.05, 0.06, 0.02, silver, 0.62, y + 0.08, 0.13))
      books(g, -W / 2 + 0.1, 0.36, y, 'mysteries', random)
    } else if (s === 2) {
      books(g, -W / 2 + 0.1, -0.2, y, 'mysteries', random)
      // Deux chandelles, et un livre ouvert entre elles.
      for (const x of [-0.08, 0.5]) g.add(cylinder(0.025, 0.025, 0.12 + random() * 0.06, lit('#efe6d0'), x, y + 0.08, 0.06, 8), sphere(0.02, flame, x, y + 0.2, 0.06, 6))
      openBook(g, 0.21, y + 0.01, 0.02, '#4a0f18', 0)
      books(g, 0.62, W / 2 - 0.1, y, 'mysteries', random)
    } else books(g, -W / 2 + 0.1, W / 2 - 0.1, y, 'mysteries', random)
  }
}

const BOOKCASES: Record<Theme, (g: THREE.Group, random: () => number) => void> = {
  empire: bookcaseEmpire, federation: bookcaseFederation, alliance: bookcaseAlliance, thargoid: bookcaseThargoid, guardian: bookcaseGuardian, mysteries: bookcaseMysteries,
}

/** Le rayonnage d'une alcôve (2,3 de large, face à +z) ; `label` : son thème. */
const loreBookcase: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  BOOKCASES[themeOf(label)](g, random)
  return { solid: g }
}

// ---------------------------------------------------------------- pupitres et marqueteries

/** Le pupitre d'une alcôve (face à +z) : un livre ouvert sur un plan incliné, l'emblème du thème en façade. */
const loreLectern: Builder = ({ label }) => {
  const theme = themeOf(label), look = LOOK[theme]
  const g = new THREE.Group()
  const body = theme === 'empire' ? lit('#eee8dc') : theme === 'federation' ? lit('#1d2b4a', 'metal') : theme === 'alliance' ? lit('#9a6a3e', 'wood')
    : theme === 'thargoid' ? lit('#141a17', 'metal') : theme === 'guardian' ? lit('#69727f') : lit('#151117')
  const trim = theme === 'thargoid' || theme === 'guardian' ? glow(look.accent) : lit(look.band, 'metal')
  g.add(box(0.42, 0.05, 0.36, body, 0, 0.025, 0), box(0.14, 0.82, 0.14, body, 0, 0.45, 0))
  g.add(box(0.15, 0.02, 0.15, trim, 0, 0.12, 0), box(0.15, 0.02, 0.15, trim, 0, 0.78, 0))
  const top = new THREE.Group()
  top.add(box(0.5, 0.04, 0.36, body, 0, 0, 0), box(0.5, 0.012, 0.012, trim, 0, 0.012, 0.18))
  openBook(top, 0, 0.03, 0, look.spines[0], 0)
  top.position.set(0, 0.88, 0)
  top.rotation.x = 0.32
  g.add(top)
  g.add(emblemPlate(theme, 0.13, 0, 0.55, 0.072))
  // Le marque-page lumineux : le thème entier est à un clic.
  g.add(box(0.02, 0.12, 0.004, glow(look.accent), 0.06, 0.82, 0.19))
  return { solid: g }
}

/** La marqueterie au sol d'une alcôve (`label` : thème[:LxP]) : une bordure, des filets, l'emblème au milieu. */
const loreInlay: Builder = ({ label = 'empire' }) => {
  const [name, size] = label.split(':')
  const theme = themeOf(name)
  const [w, d] = (size ?? '2.2x1.3').split('x').map(Number)
  const [field, line] = LOOK[theme].floor
  const px = 256
  const tex = drawnTexture(Math.round(px * w), Math.round(px * d), (g) => {
    const cw = g.canvas.width, ch = g.canvas.height
    g.fillStyle = field
    g.globalAlpha = 0.92
    g.fillRect(0, 0, cw, ch)
    g.globalAlpha = 1
    g.strokeStyle = line
    g.lineWidth = 10
    g.strokeRect(14, 14, cw - 28, ch - 28)
    g.lineWidth = 3
    g.strokeRect(36, 36, cw - 72, ch - 72)
    // Des filets en diagonale, aux quatre coins.
    for (const [x, y, sx, sy] of [[36, 36, 1, 1], [cw - 36, 36, -1, 1], [36, ch - 36, 1, -1], [cw - 36, ch - 36, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * 70, y + sy * 70); g.stroke()
    }
    const e = Math.min(ch - 90, 220)
    g.drawImage(emblem(theme).image as HTMLCanvasElement, cw / 2 - e / 2, ch / 2 - e / 2, e, e)
  })
  // Le décor vit à part (sa texture) : dans un groupe, que le pont tourne et place sans toucher au décalque.
  const live = new THREE.Group()
  live.add(decal(tex, w, d, 0.009))
  return { live }
}

// ---------------------------------------------------------------- l'hologramme du Lore Explorer

/** Couleur de chaque thème dans le graphe, comme leurs alcôves. */
const GRAPH = (['empire', 'federation', 'alliance', 'thargoid', 'guardian', 'mysteries'] as Theme[]).map((t) => LOOK[t].accent === '#d8b062' ? '#ffd27a' : LOOK[t].accent)

/**
 * L'estrade du centre et l'hologramme du Lore Explorer : six grappes de notes, une par thème, aux
 * couleurs des alcôves, reliées entre elles et à leur cœur, qui tournent lentement au-dessus du projecteur.
 */
const loreGraph: Builder = ({ random }) => {
  const g = new THREE.Group()
  const stone = lit('#23262e', 'metal'), brass = lit('#c8a050', 'metal')
  g.add(cylinder(0.7, 0.76, 0.12, stone, 0, 0.06, 0, 32))
  const rim = mesh(new THREE.TorusGeometry(0.7, 0.018, 4, 40), brass, 0, 0.12, 0)
  rim.rotation.x = Math.PI / 2
  g.add(rim)
  g.add(cylinder(0.22, 0.28, 0.2, lit('#14161b', 'metal'), 0, 0.22, 0, 16), cylinder(0.15, 0.15, 0.02, glow('#bfe8ff'), 0, 0.33, 0, 16))
  // Les six thèmes, en arc autour de l'estrade.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    g.add(box(0.14, 0.012, 0.05, glow(GRAPH[k]), Math.cos(a) * 0.6, 0.128, Math.sin(a) * 0.6))
    g.children.at(-1)!.rotation.y = -a + Math.PI / 2
  }
  const live = new THREE.Group()
  const beam = part(new THREE.CylinderGeometry(0.62, 0.15, 0.78, 24, 1, true), beamMaterial(), 0, 0.72, 0)
  live.add(beam)
  const graph = new THREE.Group()
  graph.scale.setScalar(1.55)
  graph.position.y = 1.3
  const centers: THREE.Vector3[] = []
  const nodes: { p: THREE.Vector3; c: number; hub: boolean }[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, y = k % 2 ? 0.12 : -0.12
    const c = new THREE.Vector3(Math.cos(a) * 0.36, y, Math.sin(a) * 0.36)
    centers.push(c)
    nodes.push({ p: c, c: k, hub: true })
    for (let i = 0; i < 9; i++) {
      const u = random() * Math.PI * 2, v = Math.acos(2 * random() - 1), r = 0.08 + random() * 0.1
      nodes.push({ p: c.clone().add(new THREE.Vector3(Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r * 0.8, Math.sin(v) * Math.sin(u) * r)), c: k, hub: false })
    }
  }
  const dots = instanced(new THREE.IcosahedronGeometry(1, 1), nodes.map((n) => GRAPH[n.c]), keepShared(new THREE.MeshBasicMaterial({ toneMapped: false })))
  nodes.forEach((n, i) => setInstance(dots, i, n.p.x, n.p.y, n.p.z, n.hub ? 0.04 : 0.018 + random() * 0.01))
  dots.instanceMatrix.needsUpdate = true
  graph.add(dots)
  // Les liens : chaque note à son cœur, les cœurs entre eux, et quelques ponts d'un thème à l'autre.
  const pos: number[] = [], col: number[] = []
  const color = new THREE.Color()
  const link = (a: { p: THREE.Vector3; c: number }, b: { p: THREE.Vector3; c: number }) => {
    pos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z)
    color.set(GRAPH[a.c]); col.push(color.r, color.g, color.b)
    color.set(GRAPH[b.c]); col.push(color.r, color.g, color.b)
  }
  const hubs = nodes.filter((n) => n.hub)
  for (const n of nodes) if (!n.hub) link(n, hubs[n.c])
  for (let k = 0; k < 6; k++) link(hubs[k], hubs[(k + 1) % 6])
  for (let i = 0; i < 10; i++) {
    const a = nodes[Math.floor(random() * nodes.length)], b = nodes[Math.floor(random() * nodes.length)]
    if (a.c !== b.c) link(a, b)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  graph.add(new THREE.LineSegments(geo, keepShared(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }))))
  live.add(graph)
  return {
    solid: g,
    live,
    update: (t) => {
      graph.rotation.y = t * 0.18
      graph.position.y = 1.3 + Math.sin(t * 0.9) * 0.03
    },
  }
}

// ---------------------------------------------------------------- les cartes stellaires du planétarium

/** Les systèmes du mur, dans l'ordre des cartes (cf. STAR_CARDS, src/lore-library.ts) ; la dernière est vierge. */
const STARS: [string, string][] = [
  ['SOL', '#fff1c9'], ['ACHENAR', '#b9d2ff'], ['ALIOTH', '#e6efff'], ['SHINRARTA DEZHRA', '#ffd9a8'],
  ['LAVE', '#ffe6ad'], ['ALPHA CENTAURI', '#fff0c8'], ['MEROPE', '#c6dbff'], ['MAIA', '#cfe0ff'],
  ['COLONIA', '#ffdcb0'], ['SAGITTARIUS A*', '#ffc46b'], ['BEAGLE POINT', '#ffad6b'], ['', ''],
]

/**
 * Le mur des cartes stellaires (face à +z, 1,6 × 1,0, accroché) : dans un cadre de laiton, douze
 * cartes numériques, une étoile et son nom chacune, sous le titre « CARTES STELLAIRES · EDGIS ».
 * La douzième est vierge.
 */
const starCardWall: Builder = () => {
  const g = new THREE.Group()
  const PW = 1.6, PH = 1.0, Y = 0.82
  const brass = lit('#c8a050', 'metal'), frame = lit('#2a2420', 'wood')
  g.add(box(PW + 0.08, PH + 0.08, 0.05, frame, 0, Y, -0.01), box(PW + 0.1, 0.03, 0.06, brass, 0, Y + PH / 2 + 0.04, 0), box(PW + 0.1, 0.03, 0.06, brass, 0, Y - PH / 2 - 0.04, 0))
  const tex = drawnTexture(1280, 800, (c) => {
    c.fillStyle = '#060b16'
    c.fillRect(0, 0, 1280, 800)
    // Un fond d'étoiles.
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(200,220,255,${0.2 + ((i * 37) % 60) / 100})`
      c.fillRect((i * 271) % 1280, (i * 157) % 800, 2, 2)
    }
    c.fillStyle = '#ffd28a'
    c.font = '700 44px "DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText('CARTES STELLAIRES · EDGIS', 640, 70)
    const cw = 270, ch = 210
    STARS.forEach(([name, star], i) => {
      const x = 60 + (i % 4) * (cw + 23), y = 110 + Math.floor(i / 4) * (ch + 20)
      c.fillStyle = star ? '#0f1d33' : '#1a1d24'
      c.strokeStyle = star ? '#5fb6ff' : '#4a4f5a'
      c.lineWidth = 4
      c.beginPath()
      c.roundRect(x, y, cw, ch, 16)
      c.fill()
      c.stroke()
      if (!star) {
        c.fillStyle = '#5a5f6a'
        c.font = '700 72px Georgia, serif'
        c.fillText('?', x + cw / 2, y + ch / 2 + 26)
        return
      }
      const halo = c.createRadialGradient(x + cw / 2, y + 80, 4, x + cw / 2, y + 80, 64)
      halo.addColorStop(0, '#ffffff'); halo.addColorStop(0.25, star); halo.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = halo
      c.beginPath(); c.arc(x + cw / 2, y + 80, 64, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#e8f2ff'
      c.font = `700 ${name.length > 12 ? 26 : 32}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif`
      c.fillText(name, x + cw / 2, y + ch - 30)
    })
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, Y, 0.017))
  return { solid: g, live }
}

export const LIBRARY = {
  'lore-bookcase': loreBookcase,
  'lore-lectern': loreLectern,
  'lore-inlay': loreInlay,
  'lore-graph': loreGraph,
  'star-card-wall': starCardWall,
} satisfies Record<string, Builder>
