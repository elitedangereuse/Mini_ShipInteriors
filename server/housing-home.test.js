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
  const many = Array.from({ length: 700 }, (_, i) => ({ x: O.x + (i % 30), z: O.z + Math.floor(i / 30), e: 'h' }))
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
  assert.equal(cellIndex(O.x + 29, O.z + 29), CELLS - 1)
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
  assert.deepEqual(unpackHome(home), plan)

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
