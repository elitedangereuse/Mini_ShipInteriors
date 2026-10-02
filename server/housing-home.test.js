// Murs de la parcelle des quartiers (housing v2) : format, règles de pose, plan, ligne de vue.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWalls, clearWalls, HOME_WALL_KINDS, MAX_HOME_WALLS, sanitizeHome, sanitizeWalls, wallRefusal } from '../shared/housing-home.js'
import { applyPlot, HOUSING_LEVEL, PLOT_DOOR, PLOT_ORIGIN, plotRect } from '../shared/housing-plot.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'
import { lineOfSight } from '../shared/sight.js'

const O = PLOT_ORIGIN
const quarters = (stage = 0) => {
  const map = new ShipMap(SHIP_LAYOUTS[String(HOUSING_LEVEL)], shipMapOptions(HOUSING_LEVEL))
  applyPlot(map, stage)
  return map
}
/** Une ligne de murs verticale entre les colonnes x et x + 1, sur toute la hauteur de la parcelle. */
const column = (x, k, stage = 0) => {
  const r = plotRect(stage)
  return Array.from({ length: r.maxZ - r.minZ + 1 }, (_, i) => ({ x, z: r.minZ + i, e: 'v', ...(k ? { k } : {}) }))
}

test('format 2 : forme vérifiée, arêtes bornées, types courts, une arête une fois', () => {
  assert.equal(sanitizeHome(null), null)
  assert.equal(sanitizeHome({ v: 1, walls: [] }), null)
  assert.deepEqual(sanitizeHome({ v: 2 }), { v: 2 })
  const walls = sanitizeWalls([
    { x: O.x + 1, z: O.z + 1, e: 'v' },
    { x: O.x + 1, z: O.z + 1, e: 'v', k: 'half' }, // même arête : la dernière l'emporte
    { x: O.x + 2, z: O.z - 1, e: 'h', k: 'wall' }, // pourtour nord ; « wall » s'écrit sans k
    { x: O.x + 2, z: O.z, e: 'd' },
    { x: 1.5, z: 2, e: 'v' },
    { x: 500, z: 2, e: 'v' },
    { x: O.x, z: O.z, e: 'h', k: 'Porte!' },
    'mur',
  ])
  assert.deepEqual(walls, [{ x: O.x + 1, z: O.z + 1, e: 'v', k: 'half' }, { x: O.x + 2, z: O.z - 1, e: 'h' }, { x: O.x, z: O.z, e: 'h' }])
  const many = Array.from({ length: 800 }, (_, i) => ({ x: O.x + (i % 20), z: O.z + Math.floor(i / 40), e: i % 40 < 20 ? 'h' : 'v' }))
  assert.equal(sanitizeWalls(many).length, MAX_HOME_WALLS)
})

test('règles : dans la parcelle et sur son pourtour, pas sur le palier, pas de porte sur le vide', () => {
  const map = quarters()
  const r = plotRect(0)
  assert.equal(wallRefusal(map, 0, { x: O.x + 3, z: O.z + 3, e: 'v' }), null)
  assert.equal(wallRefusal(map, 0, { x: O.x + 3, z: O.z + 3, e: 'h', k: 'wood' }), null)
  // Pourtour : est, sud, nord ; et l'ouest, hors du palier.
  assert.equal(wallRefusal(map, 0, { x: r.maxX, z: O.z + 3, e: 'v' }), null)
  assert.equal(wallRefusal(map, 0, { x: O.x + 3, z: r.maxZ, e: 'h', k: 'window' }), null)
  assert.equal(wallRefusal(map, 0, { x: O.x + 3, z: O.z - 1, e: 'h', k: 'half' }), null)
  assert.equal(wallRefusal(map, 0, { x: O.x - 1, z: O.z, e: 'v' }), null)
  assert.equal(wallRefusal(map, 0, { x: r.maxX, z: O.z + 3, e: 'v', k: 'arch' }), 'void')
  assert.equal(wallRefusal(map, 0, { x: r.maxX, z: O.z + 3, e: 'v', k: 'sliding' }), 'void')
  // Le mur du palier, et sa porte.
  assert.equal(wallRefusal(map, 0, { x: PLOT_DOOR.x, z: PLOT_DOOR.z, e: 'v' }), 'landing')
  assert.equal(wallRefusal(map, 0, { x: PLOT_DOOR.x, z: PLOT_DOOR.z + 1, e: 'v' }), 'landing')
  // Hors de la parcelle de départ, mais dans un agrandissement.
  const far = { x: r.maxX + 3, z: O.z + 3, e: 'v' }
  assert.equal(wallRefusal(map, 0, far), 'outside')
  assert.equal(wallRefusal(quarters(1), 1, far), null)
})

test('sur le plan : un mur coupe, une porte relie, et on retire tout proprement', () => {
  const map = quarters()
  const a = { x: O.x + 3, z: O.z + 4 }
  assert.equal(map.edge(a.x, a.z, 1), 'open')
  const placed = applyWalls(map, [{ x: a.x, z: a.z, e: 'v' }, { x: a.x, z: a.z + 1, e: 'v', k: 'wood' }, { x: PLOT_DOOR.x, z: PLOT_DOOR.z, e: 'v' }], 0)
  assert.equal(placed.length, 2, 'le mur du palier est ignoré')
  assert.equal(map.edge(a.x, a.z, 1), 'wall')
  assert.equal(map.edge(a.x, a.z + 1, 1), 'door')
  assert.equal(map.edge(PLOT_DOOR.x, PLOT_DOOR.z, PLOT_DOOR.dir), 'door')
  clearWalls(map, placed)
  assert.equal(map.edge(a.x, a.z, 1), 'open')
  assert.equal(map.edge(a.x, a.z + 1, 1), 'open')
  assert.equal(map.doors.filter((d) => d.x === a.x).length, 0)
})

test('ligne de vue : par-dessus un demi-mur, pas à travers un mur, par une arche', () => {
  const x = O.x + 4
  const from = { x: O.x + 1, z: O.z + 5 }, to = { x: O.x + 8, z: O.z + 5 }
  for (const [k, sees] of [[undefined, false], ['window', false], ['half', true], ['arch', true]]) {
    const map = quarters()
    applyWalls(map, column(x, k), 0)
    assert.equal(lineOfSight(map, from, to), sees, String(k))
  }
})

test('tous les types se posent à l\'intérieur ; le demi-mur arrête les pas', () => {
  for (const k of HOME_WALL_KINDS) {
    const map = quarters()
    const w = { x: O.x + 2, z: O.z + 2, e: 'h', ...(k === 'wall' ? {} : { k }) }
    assert.equal(applyWalls(map, [w], 0).length, 1, k)
    const expected = ['wall', 'half', 'window'].includes(k) ? 'wall' : 'door'
    assert.equal(map.edge(w.x, w.z, 2), expected, k)
  }
})

test('le relais garde la parcelle avec l\'aménagement, au format 2 seulement', async () => {
  const { sanitizeLayout } = await import('./cabin.js')
  const home = { v: 2, walls: [{ x: O.x + 1, z: O.z, e: 'v', k: 'half' }, { x: 'a', z: 0, e: 'v' }] }
  assert.deepEqual(sanitizeLayout({ items: [], home }).home, { v: 2, walls: [{ x: O.x + 1, z: O.z, e: 'v', k: 'half' }] })
  assert.equal(sanitizeLayout({ items: [], home: { v: 1, walls: [] } }).home, undefined)
  assert.equal(sanitizeLayout({ items: [] }).home, undefined)
})

test('revêtements : cases encodées par plages, palettes compactées, mal formés oubliés', async () => {
  const { CELLS, cellAt, cellIndex, decodeCells, encodeCells, finishCounts, packHome, sanitizeHome: clean, unpackHome } = await import('../shared/housing-home.js')
  assert.equal(cellIndex(O.x, O.z), 0)
  assert.equal(cellIndex(O.x + 19, O.z + 19), CELLS - 1)
  assert.equal(cellIndex(O.x - 1, O.z), -1)
  assert.deepEqual(cellAt(cellIndex(O.x + 3, O.z + 7)), { x: O.x + 3, z: O.z + 7 })
  const letters = 'aab' + '.'.repeat(CELLS - 4) + 'c'
  assert.equal(encodeCells(letters), `a2b1.${CELLS - 4}c1`)
  assert.equal(decodeCells(encodeCells(letters)), letters)
  assert.equal(decodeCells('n'), '.'.repeat(CELLS), 'illisible : dalles nues')
  assert.equal(decodeCells(`a${CELLS + 50}`), 'a'.repeat(CELLS), 'trop long : coupé')

  const parquet = { style: 'parquet', color: '#aa7744' }, tiles = { style: 'tiles', color: '#ffffff' }, paint = { style: 'paint', color: '#336699' }
  const floor = Array(CELLS).fill(null)
  floor[cellIndex(O.x, O.z)] = parquet
  floor[cellIndex(O.x + 1, O.z)] = { ...parquet }
  floor[cellIndex(O.x + 9, O.z + 9)] = tiles
  const plan = { walls: [{ x: O.x + 2, z: O.z + 2, e: 'v', k: 'half', a: paint }, { x: O.x + 2, z: O.z + 3, e: 'v', b: { ...paint } }], floor }
  assert.deepEqual(finishCounts(plan), { floor: 2, paper: 1 })
  const home = packHome(plan)
  assert.deepEqual(home.papers, [paint])
  assert.deepEqual(home.walls, [{ x: O.x + 2, z: O.z + 2, e: 'v', k: 'half', a: 0 }, { x: O.x + 2, z: O.z + 3, e: 'v', b: 0 }])
  assert.deepEqual(home.floor.palette, [parquet, tiles])
  assert.deepEqual(clean(home), home, 'déjà propre')
  assert.deepEqual(unpackHome(home), { ...plan, items: [] })

  // Revêtement mal formé : ses faces et ses cases redeviennent nues ; ce qui ne sert pas disparaît.
  const messy = clean({
    v: 2,
    walls: [{ x: O.x + 2, z: O.z + 2, e: 'v', a: 1, b: 7 }],
    papers: [{ style: 'paint', color: 'bleu' }, paint, tiles],
    floor: { palette: [{ style: 'PARQUET', color: '#aa7744' }, tiles], cells: `a1b1.${CELLS - 2}` },
  })
  assert.deepEqual(messy.walls, [{ x: O.x + 2, z: O.z + 2, e: 'v', a: 0 }])
  assert.deepEqual(messy.papers, [paint])
  assert.deepEqual(messy.floor, { palette: [tiles], cells: `.1a1.${CELLS - 2}` })
})

test('quartiers ouverts : gardés avec la parcelle, seulement s\'ils le sont vraiment', async () => {
  const { packHome, unpackHome, sanitizeHome: clean } = await import('../shared/housing-home.js')
  assert.deepEqual(clean({ v: 2, open: true }), { v: 2, open: true })
  assert.deepEqual(clean({ v: 2, open: 'oui' }), { v: 2 })
  assert.equal(unpackHome({ v: 2, open: true }).open, true)
  assert.equal(unpackHome({ v: 2 }).open, undefined)
  assert.deepEqual(packHome({ ...unpackHome({ v: 2 }), open: false }), { v: 2 })
})

test('mobilier et palier : gardés avec la parcelle, bornés', async () => {
  const { MAX_HOME_ITEMS, sanitizeHome: clean, unpackHome } = await import('../shared/housing-home.js')
  const home = clean({
    v: 2,
    stage: 1,
    items: [
      { m: 'holo-me', x: O.x + 2, z: O.z + 3, r: 0 },
      { m: 'sofa', x: O.x + 4.25, z: O.z + 1.5, r: 2, v: 'teal', s: 42 },
      { m: 'lamp', x: O.x + 4.25, z: O.z + 1.5, r: 5, y: 0.6 }, // orientation inconnue : 0
      { m: 'Canapé', x: O.x, z: O.z, r: 0 },
      { m: 'sofa', x: 2, z: O.z, r: 0 }, // hors de la parcelle
    ],
  })
  assert.equal(home.stage, 1)
  assert.deepEqual(home.items.map((i) => i.m), ['holo-me', 'sofa', 'lamp'])
  assert.deepEqual(home.items[2], { m: 'lamp', x: O.x + 4.25, z: O.z + 1.5, r: 0, y: 0.6 })
  assert.equal(unpackHome(home).stage, 1)
  assert.equal(clean({ v: 2, stage: 7 }).stage, undefined)
  const many = Array.from({ length: MAX_HOME_ITEMS + 20 }, (_, i) => ({ m: 'plant', x: O.x + (i % 20), z: O.z + Math.floor(i / 20), r: 0 }))
  assert.equal(clean({ v: 2, items: many }).items.length, MAX_HOME_ITEMS)
})

test('déplacer un bloc : murs, sol et objets d\'un seul tenant, ce qui reste ne bouge pas', async () => {
  const { blockOf, blockRefusal, CELLS, cellIndex, moveBlock, shiftBlock } = await import('../shared/housing-home.js')
  const { HOME_TEMPLATES, placeTemplate } = await import('../shared/housing-templates.js')
  const red = { style: 'damask', color: '#7a1f2b' }, oak = { style: 'planks', color: '#b07a45' }, blue = { style: 'tiles', color: '#3366aa' }
  // Un studio (5 × 4) au coin nord-ouest, papier peint dedans, parquet ; un mur seul plus loin.
  const studio = placeTemplate(HOME_TEMPLATES.find((t) => t.id === 'studio'), { x: O.x + 1, z: O.z + 1 }).map((w) => ({ ...w, a: red }))
  const lone = { x: O.x + 9, z: O.z + 9, e: 'v', b: red }
  const floor = Array(CELLS).fill(null)
  for (let z = 1; z <= 4; z++) for (let x = 1; x <= 5; x++) floor[cellIndex(O.x + x, O.z + z)] = oak
  floor[cellIndex(O.x + 8, O.z + 3)] = blue
  const items = [{ m: 'sofa', x: O.x + 2.5, z: O.z + 2, r: 0 }, { m: 'plant', x: O.x + 10, z: O.z + 10, r: 0 }]
  const plan = { walls: [...studio, lone], floor, items }
  const rect = []
  for (let z = 1; z <= 4; z++) for (let x = 1; x <= 5; x++) rect.push({ x: O.x + x, z: O.z + z })
  const block = blockOf(plan, rect)
  assert.equal(block.walls.size, studio.length, 'le pourtour du studio, pas le mur seul')
  assert.equal(block.cells.size, 20)
  block.items.add(0)

  const map = quarters(1)
  assert.equal(blockRefusal(map, 1, plan, block, 2, 3), null)
  assert.equal(blockRefusal(map, 1, plan, block, 8, 0), 'outside', 'le studio dépasserait à l\'est')
  assert.equal(blockRefusal(map, 1, plan, block, -1, 0), 'landing', 'son mur ouest tomberait sur le palier')
  assert.equal(blockRefusal(quarters(0), 0, plan, block, 0, 3), 'void', 'sa porte arriverait sur le pourtour sud')

  const next = moveBlock(plan, block, 2, 3)
  const key = (w) => `${w.x},${w.z},${w.e}`
  assert.deepEqual(new Set(next.walls.map(key)), new Set([...studio.map((w) => ({ ...w, x: w.x + 2, z: w.z + 3 })), lone].map(key)))
  assert.ok(next.walls.filter((w) => w.k === 'sliding').length === 1 && next.walls.every((w) => w.a || w.b))
  // Le parquet suit ; la case bleue, recouverte, prend le parquet ; les cases quittées redeviennent nues.
  assert.deepEqual(next.floor[cellIndex(O.x + 3, O.z + 4)], oak)
  assert.deepEqual(next.floor[cellIndex(O.x + 7, O.z + 7)], oak)
  assert.equal(next.floor[cellIndex(O.x + 1, O.z + 1)], null)
  assert.equal(next.floor.filter(Boolean).length, 21, 'le parquet n\'atteint pas la case bleue (8, 3)')
  assert.deepEqual(next.items, [{ m: 'sofa', x: O.x + 4.5, z: O.z + 5, r: 0 }, items[1]])
  assert.deepEqual(shiftBlock(block, 2, 3).walls, new Set(studio.map((w) => key({ ...w, x: w.x + 2, z: w.z + 3 }))))

  // Arrivé sur un mur qui reste : le mur du bloc le remplace, la face qu'il n'habille pas garde son papier.
  const wall = { ...studio.find((w) => w.e === 'v' && w.x === O.x + 5), a: red }
  const neighbour = { x: wall.x + 3, z: wall.z, e: 'v', a: oak, b: blue }
  const merged = moveBlock({ walls: [wall, neighbour], floor, items: [] }, { walls: new Set([key(wall)]), cells: new Set(), items: new Set() }, 3, 0)
  assert.deepEqual(merged.walls, [{ x: wall.x + 3, z: wall.z, e: 'v', a: red, b: blue }])
})
