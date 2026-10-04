// Le jardinage dans les quartiers (shared/gardening.js) : la pousse d'une culture, ce que coûte la
// négligence, la récolte ; et les chiffres de src/economy/economy.json (section `gardening`).
// Les cas de pousse sont rejoués à l'identique par le site (phputils/tests/mini-shipinteriors/
// GardeningTest.php, dépôt du site) : les mêmes dates, les mêmes résultats.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  advancePlot, emptyGarden, GARDEN_TOOLS, growGoal, growRate, harvestOf, hasWeeds, neglect, PLOT_KEY, plotKey, plotStatus, stockKey, stockRoom, stockTotal, TOOL_TIERS,
  unitPrice, weedy,
} from '../shared/gardening.js'

const E = JSON.parse(readFileSync(new URL('../src/economy/economy.json', import.meta.url), 'utf8'))
const R = E.gardening
const T = 1_790_000_000
const BASE = emptyGarden().tools

/** Tuile semée à l'instant T. */
const sown = (crop, soil = 'plain', more = {}) => ({ s: soil, c: crop, p: T, g: 0, t: T, w: 0, d: 0, x: 0, ...more })

test('une tomate : elle pousse arrosée, s\'arrête aux mauvaises herbes, puis à sec, et mûrit', () => {
  const plot = sown('tomato', 'plain', { x: 8000, w: T + R.tools.can.wet[0] })
  assert.equal(growGoal(R.crops.tomato), 21600)
  assert.equal(growRate(R, plot), 2)

  advancePlot(R, plot, T + 3000)
  assert.deepEqual([plot.g, plot.d, plot.t], [6000, 0, T + 3000])
  assert.equal(weedy(plot), false)

  // Les mauvaises herbes lèvent à 8 000 points (à T + 4 000) : la pousse s'arrête là.
  advancePlot(R, plot, T + 5000)
  assert.deepEqual([plot.g, plot.d], [8000, 1000])
  assert.equal(weedy(plot), true)
  assert.equal(plotStatus(R, plot, T + 5000).need, 'weed')

  // Désherbée : elle repart, jusqu'à la fin de l'arrosage (T + 7 200).
  plot.k = 1
  advancePlot(R, plot, T + 9000)
  assert.deepEqual([plot.g, plot.d], [12400, 2800])
  assert.equal(plotStatus(R, plot, T + 9000).need, 'water')

  // Arrosée de nouveau : mûre 4 600 s plus tard, et plus rien ne compte ensuite.
  plot.w = T + 9000 + R.tools.can.wet[0]
  assert.equal(plotStatus(R, plot, T + 9000).next, T + 13600)
  advancePlot(R, plot, T + 20000)
  assert.deepEqual([plot.g, plot.d], [21600, 2800])
  assert.deepEqual(plotStatus(R, plot, T + 99999), { stage: 3, progress: 1, need: 'harvest', wet: false, next: 0 })
  assert.equal(neglect(R, R.crops.tomato, plot), 0)
  assert.deepEqual(harvestOf(R, plot, BASE), { grade: 0, count: 4 })
})

test('un radis sous compost : une fois et demie plus vite, sans mauvaises herbes', () => {
  assert.equal(hasWeeds(R, R.crops.radish), false)
  assert.equal(hasWeeds(R, R.crops.tomato), true)
  const plot = sown('radish', 'plain', { f: 'compost', w: T + 7200 })
  assert.equal(growRate(R, plot), 3)
  assert.deepEqual(plotStatus(R, plot, T + 500), { stage: 1, progress: 0.625, need: null, wet: true, next: T + 800 })
  // L'état ne modifie pas la tuile.
  assert.equal(plot.g, 0)
  advancePlot(R, plot, T + 799)
  assert.equal(plot.g, 2397)
  advancePlot(R, plot, T + 800)
  assert.equal(plot.g, 2400)
})

test('une salade oubliée : elle attend, et sa récolte y perd', () => {
  const plot = sown('lettuce', 'rich')
  assert.equal(plotStatus(R, plot, T + 10).need, 'water')
  advancePlot(R, plot, T + 3600)
  assert.equal(neglect(R, R.crops.lettuce, plot), 0)
  advancePlot(R, plot, T + 4000)
  assert.deepEqual([plot.g, plot.d], [0, 4000])
  assert.equal(neglect(R, R.crops.lettuce, plot), 1)
  advancePlot(R, plot, T + 20000)
  assert.equal(neglect(R, R.crops.lettuce, plot), 2)
  plot.w = T + 20000 + 7200
  advancePlot(R, plot, T + 22700)
  assert.equal(plot.g, growGoal(R.crops.lettuce))
  assert.deepEqual(harvestOf(R, plot, BASE), { grade: 0, count: 1 })
  assert.deepEqual(harvestOf(R, plot, { ...BASE, shears: 2 }), { grade: 0, count: 3 })
  // Bien tenue, dans le même terreau : qualité 1, rendement plein.
  assert.deepEqual(harvestOf(R, { ...plot, d: 0 }, BASE), { grade: 1, count: 3 })
})

test('prix, réserve et clés', () => {
  assert.equal(unitPrice(R, 'tomato', 0), 150)
  assert.equal(unitPrice(R, 'tomato', 2), 338)
  assert.equal(unitPrice(R, 'onionhead', 1), 2850)
  assert.equal(stockKey('tomato', 2), 'tomato:2')
  assert.equal(stockTotal({ 'tomato:0': 3, 'radish:1': 4 }), 7)
  assert.equal(stockRoom(R, false), R.stock.base)
  assert.equal(stockRoom(R, true), R.stock.crate)
  assert.equal(plotKey(14.5, 6), '14.5,6')
  for (const key of ['14.5,6', '-1,29', '12.125,0.05']) assert.ok(PLOT_KEY.test(key), key)
  for (const key of ['', '14.5', '1,2,3', '1e3,2', '1234,5', '1.2345,6']) assert.ok(!PLOT_KEY.test(key), key)
})

test('économie : outils, terreaux, engrais et cultures cohérents', () => {
  assert.deepEqual(Object.keys(R.tools), GARDEN_TOOLS)
  for (const [id, tool] of Object.entries(R.tools)) {
    assert.equal(tool.prices.length, TOOL_TIERS - 1, id)
    assert.equal(tool.time.length, TOOL_TIERS, id)
    // Un meilleur outil coûte plus cher et va plus vite.
    assert.ok(tool.prices[0] > 0 && tool.prices[1] > tool.prices[0], id)
    assert.ok(tool.time[0] > tool.time[1] && tool.time[1] > tool.time[2], id)
  }
  assert.ok(R.tools.can.wet[0] < R.tools.can.wet[1] && R.tools.can.wet[1] < R.tools.can.wet[2])
  assert.deepEqual(R.tools.shears.bonus, [0, 1, 2])
  assert.equal(R.soils.plain.price, 0)
  assert.deepEqual(Object.values(R.soils).map((s) => s.grade), [0, 1, 2])
  assert.equal(R.grades.length, 3)
  for (const f of Object.values(R.fertilizers)) assert.ok(f.price > 0 && f.speed > 1 && Number.isInteger(f.speed * 2))

  const crops = Object.entries(R.crops)
  assert.ok(crops.length >= 12)
  // Chaque niveau de plantoir a ses cultures.
  for (let tier = 0; tier < TOOL_TIERS; tier++) assert.ok(crops.some(([, c]) => c.tier === tier), `niveau ${tier}`)
  for (const [id, c] of crops) {
    // Une récolte ordinaire, aux outils de base, rembourse sa graine ; et plus c'est long, plus ça rapporte.
    assert.ok(c.yield * c.price > c.seed, id)
    assert.ok(c.grow >= 600 && c.grow <= 86400, id)
  }
  const byTime = crops.map(([, c]) => c).sort((a, b) => a.grow - b.grow)
  for (let i = 1; i < byTime.length; i++) assert.ok(byTime[i].yield * byTime[i].price - byTime[i].seed > byTime[i - 1].yield * byTime[i - 1].price - byTime[i - 1].seed)
  // L'arrosoir de base tient au moins le temps de la culture la plus rapide.
  assert.ok(R.tools.can.wet[0] >= byTime[0].grow)
})

test('économie : le jardin est un revenu d\'appoint, borné par ce que Marcel paie', () => {
  // Marcel paie moins par jour que le revenu passif d'une journée de jeu.
  assert.ok(R.saleDaily <= E.passive.perMinute * E.passive.daily * 1.5)
  // Un potager de tomates ordinaires, récolté une fois, ne remplit pas la journée de Marcel…
  const tomatoes = R.maxPlots * R.crops.tomato.yield * R.crops.tomato.price
  assert.ok(tomatoes < R.saleDaily, `${tomatoes} CR`)
  // … et la réserve agrandie tient la récolte de toutes les tuiles, au meilleur sécateur.
  const most = Math.max(...Object.values(R.crops).map((c) => c.yield)) + R.tools.shears.bonus[2]
  assert.ok(R.stock.crate >= R.maxPlots * most)
  assert.ok(R.stock.base < R.stock.crate)
  // Le cabanon et la tuile sont au catalogue des quartiers.
  for (const item of ['soil-tile', 'garden-shed', 'harvest-crate']) assert.ok(E.items[item] > 0, item)
})
