import * as THREE from 'three'
import { box, cylinder, drawnTexture, glass, glow, keepShared, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le Vestiaire des Légendes, au complexe d'entraînement de la cale : le mur des maillots floqués au
 * nom des recordmen du bord (basket, foot, tir, boxe), les casiers (dont le sien, qui garde ses
 * records et ses tenues de sport à gagner), les douches et la vitrine des coupes. Le jeu dit au
 * mur qui détient chaque record (cf. setLegends, src/legends.ts) : le mobilier ne parle pas au site.
 */

/** Un maillot du mur : son sport, sa couleur, et qui détient le record (s'il y en a un). */
export interface Legend { sport: string; color: string; trim: string; holder: string | null; score: number | null }

let legends: (() => Legend[]) | null = null
/** Le jeu dit au mur des maillots qui détient chaque record (cf. src/legends.ts). */
export function setLegends(f: () => Legend[]) {
  legends = f
}

const FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'

/** Un maillot vu de dos : sa coupe, ses liserés, le nom et le numéro 1 du recordman. */
function drawJersey(c: CanvasRenderingContext2D, x: number, w: number, h: number, l: Legend) {
  const cx = x + w / 2
  c.save()
  // Le cadre : fond sombre, filet doré.
  c.fillStyle = '#14181f'
  c.fillRect(x + 8, 8, w - 16, h - 16)
  c.strokeStyle = '#d8b062'
  c.lineWidth = 6
  c.strokeRect(x + 8, 8, w - 16, h - 16)
  // Le maillot.
  const top = 60, bottom = h - 150, sw = w * 0.62
  c.beginPath()
  c.moveTo(cx - sw * 0.28, top)
  c.lineTo(cx - sw * 0.5, top + 26)
  c.lineTo(cx - sw * 0.7, top + 110)
  c.lineTo(cx - sw * 0.5, top + 130)
  c.lineTo(cx - sw * 0.45, bottom)
  c.lineTo(cx + sw * 0.45, bottom)
  c.lineTo(cx + sw * 0.5, top + 130)
  c.lineTo(cx + sw * 0.7, top + 110)
  c.lineTo(cx + sw * 0.5, top + 26)
  c.lineTo(cx + sw * 0.28, top)
  c.quadraticCurveTo(cx, top + 34, cx - sw * 0.28, top)
  c.closePath()
  c.fillStyle = l.color
  c.fill()
  c.lineWidth = 8
  c.strokeStyle = l.trim
  c.stroke()
  // Le nom au dos, et le numéro 1.
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = l.trim
  const name = (l.holder ?? '—').replace(/^CMDR\s+/i, '').toUpperCase()
  c.font = `700 ${name.length > 9 ? 30 : 38}px ${FONT}`
  c.fillText(name.slice(0, 14), cx, top + 70)
  c.font = `800 150px ${FONT}`
  c.fillText(l.holder ? '1' : '?', cx, top + 190)
  // La plaque de laiton : le sport et le record.
  c.fillStyle = '#c9a24a'
  c.fillRect(x + 30, h - 128, w - 60, 96)
  c.fillStyle = '#2a1c08'
  c.font = `700 36px ${FONT}`
  c.fillText(l.sport, cx, h - 100)
  c.font = `600 28px ${FONT}`
  c.fillText(l.score !== null ? tr(`RECORD ${l.score.toLocaleString('fr-FR')}`, `RECORD ${l.score.toLocaleString('en-GB')}`) : tr('RECORD À PRENDRE', 'RECORD UP FOR GRABS'), cx, h - 60)
  c.restore()
}

/**
 * Le mur des Légendes (au mur, face à +z, 3,4 de large) : sous l'enseigne, quatre maillots encadrés,
 * floqués au nom de qui détient le record de leur sport ; un trait de lumière les éclaire d'en haut.
 */
const legendsWall: Builder = () => {
  const g = new THREE.Group()
  const W = 3.4, H = 1.05, Y = 0.95
  const wood = lit('#3a2418', 'wood'), brass = lit('#d8b062', 'metal')
  g.add(box(W + 0.1, H + 0.1, 0.04, wood, 0, Y, -0.012))
  g.add(box(W + 0.12, 0.03, 0.12, brass, 0, Y + H / 2 + 0.07, 0.04), box(W - 0.2, 0.012, 0.03, glow('#fff1cc'), 0, Y + H / 2 + 0.05, 0.08))
  const PW = 2048, PH = Math.round((PW * H) / W)
  const canvas = document.createElement('canvas')
  canvas.width = PW
  canvas.height = PH
  const c = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let key = ''
  const draw = () => {
    const list = legends?.() ?? []
    const next = JSON.stringify(list)
    if (next === key) return false
    key = next
    c.fillStyle = '#0d1016'
    c.fillRect(0, 0, PW, PH)
    const w = PW / Math.max(1, list.length)
    list.forEach((l, i) => drawJersey(c, i * w, w, PH, l))
    texture.needsUpdate = true
    return true
  }
  draw()
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(W, H), keepShared(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, Y, 0.012))
  // L'enseigne, au-dessus : « VESTIAIRE DES LÉGENDES ».
  const sign = drawnTexture(1024, 120, (s) => {
    s.textAlign = 'center'
    s.textBaseline = 'middle'
    s.font = `800 72px ${FONT}`
    s.shadowColor = '#ffb640'
    s.shadowBlur = 22
    s.fillStyle = '#ffe2a8'
    s.fillText(tr('VESTIAIRE DES LÉGENDES', 'LEGENDS\' LOCKER ROOM'), 512, 64)
  })
  live.add(part(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false, toneMapped: false }), 0, Y + H / 2 + 0.26, 0.03))
  let next = 0
  return { solid: g, live, update: (t) => { if (t > next) { next = t + 2; draw() } } }
}

/**
 * Les casiers (contre un mur, face à +z, 2,0 de large) : cinq portes de métal bleu, des fentes
 * d'aération, une plaque à chaque porte ; celle du milieu, éclairée, est celle du joueur.
 */
const legendsLockers: Builder = ({ random }) => {
  const g = new THREE.Group()
  const blue = lit('#2f5f99', 'metal'), dark = lit('#1b2a3d', 'metal'), steel = lit('#c9d2de', 'metal')
  const N = 5, W = 0.4, H = 1.55
  g.add(box(N * W + 0.04, 0.08, 0.42, dark, 0, 0.04, 0), box(N * W + 0.04, 0.04, 0.44, dark, 0, H + 0.02, 0.01))
  for (let i = 0; i < N; i++) {
    const x = (i - (N - 1) / 2) * W
    const mine = i === 2
    g.add(box(W - 0.02, H - 0.1, 0.4, mine ? lit('#d8b062', 'metal') : blue, x, 0.08 + (H - 0.1) / 2, 0))
    for (let k = 0; k < 4; k++) g.add(box(W * 0.55, 0.012, 0.005, dark, x, 1.2 + k * 0.05, 0.201))
    g.add(box(0.03, 0.12, 0.02, steel, x + W * 0.32, 0.8, 0.205), box(W * 0.5, 0.06, 0.005, mine ? glow('#fff1cc') : lit('#e8eef6'), x, 1.45, 0.203))
    if (random() < 0.4 && !mine) g.add(box(0.12, 0.012, 0.02, lit('#f0c93a'), x - 0.05, 0.62, 0.205))
  }
  return { solid: g }
}

/**
 * Une cabine de douche (contre un mur, face à +z, 0,9 de large) : carrelage bleu, pommeau chromé,
 * porte de verre dépoli ; une vapeur qui monte, de temps en temps.
 */
const showerStall: Builder = ({ random }) => {
  const g = new THREE.Group()
  const tile = lit('#4f94c8'), white = lit('#eef4f8'), chrome = lit('#c9d2de', 'metal')
  const W = 0.9, D = 0.85, H = 1.7
  g.add(box(W, 0.06, D, white, 0, 0.03, 0), box(W, H, 0.04, tile, 0, H / 2, -D / 2 + 0.02))
  for (const s of [-1, 1]) g.add(box(0.04, H, D, tile, s * (W / 2 - 0.02), H / 2, 0))
  g.add(cylinder(0.012, 0.012, 0.5, chrome, 0, H - 0.25, -D / 2 + 0.08, 6), cylinder(0.07, 0.05, 0.03, chrome, 0, H - 0.05, -D / 2 + 0.16, 12))
  g.add(box(0.12, 0.12, 0.03, chrome, 0.25, 1.0, -D / 2 + 0.05))
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(W - 0.08, H - 0.2), glass('#dff2ff', 0.35), 0, (H - 0.2) / 2 + 0.06, D / 2 - 0.02))
  const steam = Array.from({ length: 6 }, (_, i) => {
    const m = part(new THREE.SphereGeometry(0.08 + random() * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), (random() - 0.5) * 0.4, 0.4, (random() - 0.5) * 0.3)
    m.userData.phase = i / 6
    live.add(m)
    return m
  })
  return {
    solid: g,
    live,
    update: (t) => {
      // La douche coule par moments : la vapeur monte, puis se dissipe.
      const on = Math.sin(t * 0.21 + 1.3) > 0.2
      for (const m of steam) {
        const p = (t * 0.18 + m.userData.phase) % 1
        m.position.y = 0.4 + p * 1.3
        ;(m.material as THREE.MeshBasicMaterial).opacity = on ? 0.22 * Math.sin(p * Math.PI) : 0
      }
    },
  }
}

/**
 * La vitrine des coupes (au sol, 1,0 × 0,5) : un socle de noyer, une cloche de verre, et quatre
 * coupes, une par sport du mur (le ballon de basket, le ballon de foot, la cible, le gant).
 */
const trophyCase: Builder = () => {
  const g = new THREE.Group()
  const wood = lit('#3a2418', 'wood'), gold = lit('#e2b85a', 'metal'), silver = lit('#c9d2de', 'metal')
  g.add(box(1.0, 0.7, 0.5, wood, 0, 0.35, 0, 0.02), box(1.02, 0.03, 0.52, gold, 0, 0.71, 0), box(0.6, 0.06, 0.005, gold, 0, 0.45, 0.251))
  const cups: [number, THREE.Material, THREE.Material][] = [[-0.36, gold, lit('#e07b2c')], [-0.12, silver, lit('#ffffff')], [0.12, gold, lit('#d8302c')], [0.36, silver, lit('#c8302c')]]
  for (const [x, metal, top] of cups) {
    g.add(cylinder(0.05, 0.06, 0.04, metal, x, 0.75, 0, 10), cylinder(0.012, 0.012, 0.12, metal, x, 0.83, 0, 6), cylinder(0.07, 0.035, 0.12, metal, x, 0.95, 0, 12))
    g.add(sphere(0.035, top, x, 1.06, 0, 10))
    for (const s of [-1, 1]) {
      const handle = mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI), metal, x + s * 0.07, 0.96, 0)
      handle.rotation.z = (s * Math.PI) / 2
      g.add(handle)
    }
  }
  const live = new THREE.Group()
  live.add(part(new THREE.BoxGeometry(0.98, 0.42, 0.48), glass('#e8f4ff', 0.18), 0, 0.94, 0))
  return { solid: g, live }
}

export const LEGENDS = {
  'legends-wall': legendsWall,
  'legends-lockers': legendsLockers,
  'shower-stall': showerStall,
  'trophy-case': trophyCase,
} satisfies Record<string, Builder>
