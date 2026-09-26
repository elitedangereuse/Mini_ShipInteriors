import * as THREE from 'three'
import { box, cylinder, glow, lit, sphere, type Builder, type Furniture } from './kit'

const COLORS = {
  base: '#202533',
  edge: '#5f6b83',
  cyan: '#65eaff',
  violet: '#be7cff',
  gold: '#ffc55c',
  red: '#ff526d',
  blue: '#4d9dff',
  yellow: '#ffe45c',
  white: '#fff1c7',
  black: '#5b70a1',
}

type BoardKind = 'draughts' | 'guardian-connect' | 'imperial-chess'

function squareGrid(group: THREE.Group, cells: number, size: number, light: string, dark: string) {
  const cell = size / cells
  const inset = 0.004
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    group.add(box(cell - inset, 0.018, cell - inset, lit((x + y) % 2 ? dark : light), (x - cells / 2 + 0.5) * cell, 0.015, (y - cells / 2 + 0.5) * cell, 0.008))
  }
}

function draughtPieces(group: THREE.Group) {
  for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) {
    const p = cylinder(0.028, 0.032, 0.018, glow(COLORS.blue), (x - 3.5) * 0.075, 0.04, (y - 3.5) * 0.075, 8)
    group.add(p)
  }
  for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) {
    const p = cylinder(0.028, 0.032, 0.018, glow(COLORS.red), (x - 3.5) * 0.075, 0.04, (y - 3.5) * 0.075, 8)
    group.add(p)
  }
}

function connectGrid(group: THREE.Group) {
  const cell = 0.09
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 5, 12), glow('#8b78ff'))
    ring.rotation.x = Math.PI / 2
    ring.position.set((x - 3) * cell, 0.03, (y - 2.5) * cell)
    group.add(ring)
  }
}

function chessPieces(group: THREE.Group) {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let y of [0, 1, 6, 7]) for (let x = 0; x < 8; x++) {
    const type = y === 1 || y === 6 ? 'p' : back[x]
    const color = y < 2 ? COLORS.black : COLORS.white
    const mat = glow(color)
    const p = y === 1 || y === 6
      ? cylinder(0.022, 0.03, 0.07, mat, (x - 3.5) * 0.075, 0.075, (y - 3.5) * 0.075, 7)
      : sphere(type === 'k' ? 0.035 : 0.027, mat, (x - 3.5) * 0.075, 0.09, (y - 3.5) * 0.075, 7)
    group.add(p)
  }
}

function holographicTable(kind: BoardKind): Furniture {
  const solid = new THREE.Group()
  solid.add(
    box(0.8, 0.08, 0.64, lit(COLORS.base), 0, 0.56, 0, 0.04),
    box(0.62, 0.08, 0.48, lit(COLORS.edge), 0, 0.62, 0, 0.03),
    cylinder(0.18, 0.24, 0.5, lit(COLORS.base), 0, 0.28, 0, 10),
    cylinder(0.28, 0.3, 0.05, lit(COLORS.edge), 0, 0.04, 0, 12),
  )
  for (const x of [-0.34, 0.34]) solid.add(box(0.035, 0.2, 0.035, lit(COLORS.edge), x, 0.4, 0, 0.01))

  const live = new THREE.Group()
  const panel = new THREE.Group()
  panel.position.y = 0.68
  const accent = kind === 'draughts' ? COLORS.cyan : kind === 'guardian-connect' ? COLORS.violet : COLORS.gold
  const dark = kind === 'draughts' ? '#10233d' : kind === 'guardian-connect' ? '#21133b' : '#3c2810'
  const light = kind === 'draughts' ? '#1d5363' : kind === 'guardian-connect' ? '#55337f' : '#72521d'
  const cells = kind === 'guardian-connect' ? 7 : 8
  const depth = kind === 'guardian-connect' ? 6 : 8
  const cell = kind === 'guardian-connect' ? 0.09 : 0.075
  const boardWidth = cells * cell
  const boardDepth = depth * cell
  panel.add(box(boardWidth + 0.07, 0.018, boardDepth + 0.07, glow(accent), 0, 0, 0, 0.015))
  if (kind === 'guardian-connect') {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) panel.add(box(cell - 0.012, 0.012, cell - 0.012, glow(dark), (x - 3) * cell, 0.014, (y - 2.5) * cell, 0.012))
    connectGrid(panel)
  } else {
    squareGrid(panel, 8, boardWidth, light, dark)
    if (kind === 'draughts') draughtPieces(panel)
    else chessPieces(panel)
  }
  live.add(panel)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(Math.max(boardWidth, boardDepth) * 0.63, 0.012, 5, 32), glow(accent))
  halo.rotation.x = Math.PI / 2
  halo.position.y = 0.73
  live.add(halo)
  return {
    solid,
    live,
    emitter: 'hum',
    update: (t) => {
      panel.position.y = 0.68 + Math.sin(t * 1.5) * 0.008
      halo.material = glow(accent)
      halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.025)
    },
  }
}

export const BOARD = {
  'holo-draughts': () => holographicTable('draughts'),
  'guardian-connect': () => holographicTable('guardian-connect'),
  'imperial-chess': () => holographicTable('imperial-chess'),
} satisfies Record<string, Builder>
