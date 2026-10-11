import assert from 'node:assert/strict'
import test from 'node:test'
import { SHIP_WALL_THICKNESS } from '../shared/ship-geometry.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { DIRS, ShipMap } from '../shared/ship-map.js'
import {
  SHIP_MAP_PLACEMENTS,
  SHIP_MAP_WALL_CLEARANCE,
  resolveShipMapPlacement,
} from '../shared/ship-map-placements.js'

// Largeur hors tout du cadre construit dans src/furniture/wayfinding.ts.
const FRAME_WIDTH = 0.98

for (const id of Object.keys(SHIP_MAP_PLACEMENTS)) {
  test(`le plan ${id} est entièrement adossé à une cloison`, () => {
    const anchor = SHIP_MAP_PLACEMENTS[id]
    const layout = SHIP_LAYOUTS[String(anchor.level)]
    assert.ok(layout, `pont ${anchor.level} inconnu`)
    const map = new ShipMap(layout, shipMapOptions(anchor.level))
    assert.ok(map.isFloor(anchor.x, anchor.z), 'la tuile intérieure doit avoir un sol')

    const d = DIRS[anchor.dir]
    const tx = -d.dz, tz = d.dx
    const along = anchor.along ?? 0
    // On échantillonne toute la largeur du cadre. Cela couvre aussi les affiches à cheval sur la
    // jonction de deux panneaux, qui doivent avoir une cloison continue derrière chacune de leurs moitiés.
    for (let i = 0; i <= 20; i++) {
      const lateral = along - FRAME_WIDTH / 2 + FRAME_WIDTH * i / 20
      const tileX = Math.round(anchor.x + tx * lateral)
      const tileZ = Math.round(anchor.z + tz * lateral)
      assert.equal(map.edge(tileX, tileZ, anchor.dir), 'wall', `mur absent derrière le point ${i}/20`)
    }

    const placed = resolveShipMapPlacement(id)
    const wallX = anchor.x + d.dx * 0.5 + tx * along
    const wallZ = anchor.z + d.dz * 0.5 + tz * along
    const distance = Math.hypot(placed.worldX - wallX, placed.worldZ - wallZ)
    const wallHalfThickness = SHIP_WALL_THICKNESS / 2
    assert.ok(distance > wallHalfThickness, 'le cadre doit sortir du volume de la cloison')
    assert.ok(Math.abs(distance - (wallHalfThickness + SHIP_MAP_WALL_CLEARANCE)) < 1e-9)
  })
}
