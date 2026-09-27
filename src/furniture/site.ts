import * as THREE from 'three'
import { box, mesh, lit, glow, cylinder, drawnTexture, keepShared, type Builder } from './kit'
import { wallScreenHousing } from './decor'
import { tr } from '../i18n'
import { counterStaff } from './counter-staff'

const prints = new Map<string, THREE.MeshBasicMaterial>()
const printLoads = new Map<string, Promise<void>>()
/** Shared placeholder map survives merging; update it after the site image arrives. */
function artwork(id: string, squarePreview = false) {
  const key = squarePreview ? `${id}:square-preview` : id
  let material = prints.get(key)
  if (material) return material
  const badge = id.startsWith('badge:')
  const width = id.startsWith('card:') ? 371 : 512
  const map = keepShared(drawnTexture(width, 512, (g) => {
    if (!badge) { g.fillStyle = '#e8edf0'; g.fillRect(0, 0, width, 512) }
    g.fillStyle = '#ffae48'; g.font = '40px sans-serif'; g.textAlign = 'center'; g.fillText('…', width / 2, 270)
  }))
  material = keepShared(new THREE.MeshBasicMaterial({ map, transparent: badge, alphaTest: badge ? 0.05 : 0 }))
  prints.set(key, material)
  if (typeof Image !== 'undefined' && /^(card|badge|adv):[a-f0-9]{16}$/.test(id)) {
    const img = new Image()
    let loaded!: () => void
    printLoads.set(key, new Promise<void>((resolve) => { loaded = resolve }))
    img.onerror = () => loaded()
    img.onload = () => {
      const canvas = map.image as HTMLCanvasElement
      const g = canvas.getContext('2d')!
      g.clearRect(0, 0, width, 512)
      if (!badge) { g.fillStyle = '#e8edf0'; g.fillRect(0, 0, width, 512) }
      const scale = Math.min(width / img.width, 512 / img.height)
      const w = img.width * scale, h = img.height * scale
      g.drawImage(img, (width - w) / 2, (512 - h) / 2, w, h)
      map.needsUpdate = true
      loaded()
    }
    img.src = `/outils/mini-shipinteriors-site.php?image=${encodeURIComponent(id)}${squarePreview ? '&thumbnail=1' : ''}`
  }
  return material
}
/** Catalogue captures the furnished frame only once its artwork has arrived. */
export async function prepareArtwork(id: string, squarePreview = false): Promise<THREE.MeshBasicMaterial> {
  const material = artwork(id, squarePreview)
  const pending = printLoads.get(squarePreview ? `${id}:square-preview` : id)
  if (!pending) return material
  await new Promise<void>((resolve) => {
    // An unavailable image must not block the rest of the furniture catalogue.
    const timer = setTimeout(resolve, 4000)
    void pending.then(() => { clearTimeout(timer); resolve() })
  })
  return material
}

const artFrame: Builder = ({ label }) => {
  const g = new THREE.Group()
  if (label?.startsWith('badge:')) {
    // Outline of the site's SVG socle (viewBox 674 × 675). Its metallic border
    // is the frame itself; only a thin matching hexagonal backing adds depth.
    const shape = new THREE.Shape()
    const outline = [[195.48, 90.461], [480.74, 90.5305], [621.91, 338.2205],
      [481.69, 586.5205], [193.28, 586.4992], [52.73, 336.9092]]
    outline.forEach(([x, y], i) => {
      const px = (x / 674 - 0.5) * 0.58, py = (0.5 - y / 675) * 0.58
      if (i === 0) shape.moveTo(px, py)
      else shape.lineTo(px, py)
    })
    shape.closePath()
    const front = new THREE.ShapeGeometry(shape)
    const positions = front.getAttribute('position'), uv = front.getAttribute('uv')
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, positions.getX(i) / 0.58 + 0.5, positions.getY(i) / 0.58 + 0.5)
    }
    g.add(mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }), lit('#614a3b'), 0, 0.65, 0),
      mesh(front, artwork(label), 0, 0.65, 0.026))
    return { solid: g }
  }
  const card = label?.startsWith('card:')
  const w = card ? 0.42 : 0.58, h = card ? 0.58 : 0.58
  g.add(box(w + 0.05, h + 0.05, 0.025, lit('#d6ad65'), 0, 0.65, 0.0125))
  g.add(mesh(new THREE.PlaneGeometry(w, h), artwork(label ?? ''), 0, 0.65, 0.026))
  return { solid: g }
}
const counter: Builder = ({ label, random }) => {
  const hunt = label === 'hunt'
  const color = hunt ? '#57e6c1' : '#ffc270'
  const g = new THREE.Group()
  // Wall-backed service bay: the plinth reserves the staff area in collisions.
  g.add(box(1.42, 0.04, 1.14, lit('#243340'), 0, 0.02, -0.12, 0.012),
    box(1.42, 0.94, 0.05, lit('#344956'), 0, 0.49, -0.665, 0.018),
    box(1.30, 0.79, 0.018, lit('#21333f'), 0, 0.51, -0.632, 0.01),
    box(1.26, 0.35, 0.49, lit(hunt ? '#749693' : '#87929b'), 0, 0.225, 0.14, 0.025),
    box(1.12, 0.25, 0.022, lit('#263746'), 0, 0.235, 0.393, 0.014),
    box(1.38, 0.05, 0.61, lit('#d1dce1'), 0, 0.43, 0.14, 0.025),
    box(1.12, 0.012, 0.012, glow(color), 0, 0.402, 0.405))
  for (const x of [-0.59, 0.59]) g.add(box(0.024, 0.27, 0.025, lit('#cbd8df'), x, 0.23, 0.398, 0.005))
  for (let i = 0; i < 4; i++) g.add(box(0.25, 0.011, 0.008, lit('#91a5b0'), 0.36, 0.16 + i * 0.032, 0.407))
  const heading = drawnTexture(768, 100, (c) => {
    c.fillStyle = '#132735'; c.fillRect(0, 0, 768, 100)
    c.fillStyle = color; c.fillRect(0, 0, 6, 100)
    c.font = 'bold 32px sans-serif'; c.textAlign = 'center'
    c.fillText(hunt ? 'LJPC · CHASSE GALACTIQUE' : 'WEEKLY · BUREAU DES MISSIONS', 384, 43)
    c.fillStyle = '#c5d9e7'; c.font = '18px sans-serif'
    c.fillText(tr('VALIDATIONS & RÉCOMPENSES', 'COMPLETIONS & REWARDS'), 384, 77)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.27, 0.165), new THREE.MeshBasicMaterial({ map: heading }), 0, 0.857, -0.62))
  const plaque = drawnTexture(384, 96, (c) => {
    c.fillStyle = '#263746'; c.fillRect(0, 0, 384, 96)
    c.fillStyle = color; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'
    c.fillText(hunt ? 'LJPC' : 'WEEKLY', 192, 42)
    c.fillStyle = '#b8cedc'; c.font = '16px sans-serif'
    c.fillText(hunt ? tr('RECHERCHE GALACTIQUE', 'GALACTIC RESEARCH') : tr('OFFICIER DE LIAISON', 'LIAISON OFFICER'), 192, 73)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.60, 0.15), new THREE.MeshBasicMaterial({ map: plaque }), -0.17, 0.25, 0.407))
  g.add(box(0.06, 0.07, 0.07, lit('#344958'), -0.43, 0.487, 0.20, 0.006))
  const terminal = new THREE.Group(); terminal.position.set(-0.43, 0.56, 0.19); terminal.rotation.x = -0.32
  terminal.add(box(0.39, 0.16, 0.028, lit('#182530'), 0, 0, 0, 0.009),
    box(0.09, 0.005, 0.005, glow(color), 0, -0.073, 0.016))
  const map = drawnTexture(640, 240, (c) => {
    const grad = c.createLinearGradient(0, 0, 640, 240)
    grad.addColorStop(0, '#173b4c'); grad.addColorStop(1, '#091a2c')
    c.fillStyle = grad; c.fillRect(0, 0, 640, 240)
    c.fillStyle = color; c.fillRect(0, 0, 5, 240)
    c.font = '600 18px sans-serif'; c.fillText(tr('BUREAU DES MISSIONS', 'MISSION DESK'), 28, 35)
    c.fillStyle = '#f0f8ff'; c.font = 'bold 32px sans-serif'
    c.fillText(hunt ? tr('CHASSE GALACTIQUE', 'GALACTIC HUNT') : 'WEEKLY', 28, 88)
    c.fillStyle = color; c.font = 'bold 38px sans-serif'; c.fillText('10 000 CR', 28, 151)
    c.fillStyle = '#b7d6e2'; c.font = '18px sans-serif'
    c.fillText(tr('RÉCOMPENSES · VALIDATIONS', 'REWARDS · COMPLETIONS'), 28, 204)
    c.strokeStyle = color; c.lineWidth = 2
    if (hunt) {
      for (const r of [22, 40, 58]) { c.beginPath(); c.arc(556, 142, r, 0, Math.PI * 2); c.stroke() }
      c.beginPath(); c.moveTo(556, 80); c.lineTo(556, 204); c.moveTo(494, 142); c.lineTo(618, 142); c.stroke()
      c.fillStyle = '#e6fff7'; c.beginPath(); c.arc(575, 124, 5, 0, Math.PI * 2); c.fill()
    } else {
      for (let i = 0; i < 3; i++) {
        const y = 105 + i * 35
        c.strokeRect(497, y, 16, 16); c.fillStyle = color; c.fillRect(526, y + 6, 70 - i * 12, 4)
        c.beginPath(); c.moveTo(499, y + 7); c.lineTo(504, y + 13); c.lineTo(517, y - 1); c.stroke()
      }
    }
  })
  terminal.add(mesh(new THREE.PlaneGeometry(0.365, 0.137), new THREE.MeshBasicMaterial({ map }), 0, 0, 0.015))
  g.add(terminal)
  if (hunt) {
    // Samples stay on the desktop; the scientist holds a personal data tablet.
    g.add(box(0.22, 0.023, 0.12, lit('#334c59'), 0.43, 0.466, 0.16, 0.006))
    for (let i = 0; i < 3; i++) {
      const x = 0.36 + i * 0.07
      g.add(cylinder(0.021, 0.021, 0.10, lit('#acdce1'), x, 0.523, 0.16, 10),
        cylinder(0.024, 0.024, 0.018, lit(color), x, 0.579, 0.16, 10))
    }
  } else {
    g.add(box(0.19, 0.025, 0.15, lit('#344958'), 0.43, 0.467, 0.16, 0.008),
      box(0.16, 0.008, 0.12, lit('#e1e7e8'), 0.43, 0.484, 0.16),
      box(0.1, 0.008, 0.025, lit(color), 0.43, 0.491, 0.12))
  }
  const staff = counterStaff(hunt, random() * 12)
  return { solid: g, live: staff.root, update: staff.update }
}

const employeeBoard: Builder = () => {
  const g = wallScreenHousing(1.42, 0.82, 0.90)
  g.add(box(1.35, 0.75, 0.012, lit('#97abb7'), 0, 0.90, 0.034, 0.01),
    box(0.26, 0.007, 0.008, glow('#ffd58b'), 0, 0.503, 0.034))
  const map = drawnTexture(960, 520, (c) => {
    const grad = c.createLinearGradient(0, 0, 960, 520)
    grad.addColorStop(0, '#173a52'); grad.addColorStop(1, '#0b182c')
    c.fillStyle = grad; c.fillRect(0, 0, 960, 520)
    c.fillStyle = '#ffd58b'; c.fillRect(38, 38, 5, 72)
    c.font = '600 20px sans-serif'; c.fillText(tr('ÉQUIPAGE / TABLEAU D’HONNEUR', 'CREW / HALL OF HONOUR'), 65, 58)
    c.fillStyle = '#edf6ff'; c.font = 'bold 42px sans-serif'
    c.fillText(tr('EMPLOYÉS DU MOIS', 'EMPLOYEES OF THE MONTH'), 65, 106)
    c.fillStyle = '#74c8e8'; c.font = '18px sans-serif'; c.textAlign = 'right'; c.fillText('TOP 10', 916, 58)
    // Three luminous podium cards, with the winning silhouette in the middle.
    for (const [x, y, rank, accent] of [[260, 232, '02', '#b9d7ec'], [480, 192, '01', '#ffd58b'], [700, 252, '03', '#dca382']] as const) {
      c.fillStyle = '#ffffff0c'; c.fillRect(x - 88, y - 38, 176, 170)
      c.fillStyle = accent; c.fillRect(x - 88, y + 130, 176, 3)
      c.beginPath(); c.arc(x, y + 10, 22, 0, Math.PI * 2); c.fill()
      c.beginPath(); c.arc(x, y + 73, 40, Math.PI, 0); c.fill()
      c.font = 'bold 27px sans-serif'; c.textAlign = 'center'; c.fillText(rank, x, y + 115)
    }
    c.fillStyle = '#77b5d1'; c.fillRect(38, 428, 884, 1)
    c.fillStyle = '#cbe0ee'; c.font = '19px sans-serif'; c.textAlign = 'center'
    c.fillText(tr('POINTS   /   COLLECTIONS   /   AVENTURES', 'POINTS   /   COLLECTIONS   /   ADVENTURES'), 480, 463)
    c.fillStyle = '#ffd58b'; c.font = '17px sans-serif'
    c.fillText(tr('CONSULTER LES CLASSEMENTS  ›', 'VIEW RANKINGS  ›'), 480, 500)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.30, 0.704), new THREE.MeshBasicMaterial({ map }), 0, 0.90, 0.041))
  // Keep the whole casing below the wall top, while preserving screen proportions.
  g.scale.setScalar(0.8)
  g.position.y = -0.08
  return { solid: g }
}
export const SITE = { 'site-art': artFrame, 'reward-counter': counter, 'employee-board': employeeBoard }
