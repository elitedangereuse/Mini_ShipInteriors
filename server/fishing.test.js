// La pêche à l'étang du jardin exotique (shared/fishing.js) : l'étang et les lancers, les espèces
// et leur rareté, le déroulé d'une touche ; et la liste des espèces que le site accepte.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  bitePlan, castPoint, FEINT_TIME, FISH, FISH_RARITIES, FISH_RARITY, FISHING_DOCK, FISHING_FEED, FISHING_LEVEL, FISHING_POND, fishById, fishSize, inPond, pickFish, QUEST_FISH,
} from '../shared/fishing.js'
import { questById } from '../shared/quests.js'
import { GARDEN_ROOM, GARDEN_SOUTH } from '../shared/gardener.js'
import { SHIP_LAYOUTS, shipMapOptions } from '../shared/ship-layouts.js'
import { ShipMap } from '../shared/ship-map.js'

/** Modèles d'un pack de poissons (public/assets/fish/) et les parties de chacun : les nœuds du fichier, leurs matériaux. */
function packModels(file) {
  const glb = readFileSync(new URL(`../public/assets/fish/${file}`, import.meta.url))
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
  return new Map(json.nodes.map((n) => [n.name, json.meshes[n.mesh].primitives.map((p) => json.materials[p.material].name)]))
}

/** Aléatoire déterministe (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('l\'étang est dans le jardin exotique ; le ponton et le poste des carpes sont sur sa rive, hors de l\'eau', () => {
  const map = new ShipMap(SHIP_LAYOUTS[FISHING_LEVEL], shipMapOptions(FISHING_LEVEL))
  const p = FISHING_POND
  for (const [x, z] of [[p.x - p.w / 2, p.z - p.d / 2], [p.x + p.w / 2, p.z + p.d / 2]]) assert.equal(map.room(Math.round(x), Math.round(z)), GARDEN_ROOM)
  assert.ok(p.z - p.d / 2 > GARDEN_SOUTH)
  for (const spot of [FISHING_DOCK, FISHING_FEED]) {
    assert.equal(map.room(Math.round(spot.x), Math.round(spot.z)), GARDEN_ROOM)
    assert.ok(!inPond(spot.x, spot.z))
    // À portée de canne : à moins d'une tuile de la margelle.
    assert.ok(Math.abs(spot.x - p.x) < p.w / 2 + 1 && Math.abs(spot.z - p.z) < p.d / 2 + 1)
  }
})

test('on lance dans l\'eau : le centre y est, les coins arrondis et la margelle non ; un lancer raté retombe dans l\'eau', () => {
  const p = FISHING_POND
  assert.ok(inPond(p.x, p.z))
  assert.ok(!inPond(p.x + p.w / 2 - 0.05, p.z))
  assert.ok(!inPond(p.x + p.w / 2 - p.rim - 0.1, p.z + p.d / 2 - p.rim - 0.1), 'coin arrondi')
  assert.ok(inPond(p.x + p.w / 2 - p.rim - 0.1, p.z))
  const random = rng(7)
  for (let i = 0; i < 500; i++) {
    const x = p.x + (random() - 0.5) * 12, z = p.z + (random() - 0.5) * 12
    const c = castPoint(x, z)
    assert.ok(inPond(c.x, c.z, 0.2), `lancer en (${x.toFixed(2)}, ${z.toFixed(2)})`)
    if (inPond(x, z, 0.3)) assert.deepEqual(c, { x, z })
  }
})

test('les espèces : les modèles des deux packs tous utilisés, quatre raretés, cinq légendaires, des identifiants uniques', () => {
  assert.deepEqual(FISH_RARITIES, ['common', 'rare', 'epic', 'legendary'])
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length)
  const models = new Map([...packModels('quaternius-fish.glb'), ...packModels('quaternius-cute-fish.glb')])
  assert.deepEqual([...new Set(FISH.map((f) => f.model))].sort(), [...models.keys()].sort())
  assert.equal(FISH.filter((f) => f.rarity === 'legendary' && !f.quest).length, 5)
  // La sixième ne sort pas du tirage : c'est une quête qui la fait mordre.
  assert.deepEqual(FISH.filter((f) => f.quest).map((f) => [f.id, f.quest]), [[QUEST_FISH.id, QUEST_FISH.quest]])
  assert.ok(questById(QUEST_FISH.quest), 'la quête de la koï du sillage existe')
  for (const rarity of FISH_RARITIES) assert.ok(FISH.some((f) => f.rarity === rarity), rarity)
  for (const f of FISH) {
    assert.ok(FISH_RARITIES.includes(f.rarity))
    assert.ok(f.size[0] >= 1 && f.size[0] < f.size[1])
    // Le trophée des quartiers s'enregistre « espèce:fond » : 24 caractères au plus côté site
    // (cf. msi_cabin_item), le plus long des fonds en compte 5.
    assert.match(f.id, /^[a-z0-9-]{1,18}$/)
    assert.equal(fishById(f.id), f)
    for (const color of Object.values(f.colors)) assert.match(color, /^#[0-9a-f]{6}$/)
    for (const part of Object.keys(f.colors)) assert.ok(models.get(f.model).includes(part), `${f.id} : ${part}`)
    for (const part of Object.keys(f.glow ?? {})) assert.ok(f.colors[part], `${f.id} : ${part}`)
  }
})

test('plus un poisson est rare, moins il mord, plus il feinte et moins il laisse de temps', () => {
  for (let i = 1; i < FISH_RARITIES.length; i++) {
    const a = FISH_RARITY[FISH_RARITIES[i - 1]], b = FISH_RARITY[FISH_RARITIES[i]]
    assert.ok(b.weight < a.weight && b.window < a.window && b.feints[1] >= a.feints[1])
  }
  const random = rng(42), seen = new Map()
  for (let i = 0; i < 20000; i++) {
    const f = pickFish(random)
    seen.set(f.id, (seen.get(f.id) ?? 0) + 1)
  }
  // Toutes les espèces sortent, les légendaires rarement (3 % des touches à elles trois).
  for (const f of FISH) assert.equal(seen.get(f.id) > 0, !f.quest, f.id)
  const share = (rarity) => FISH.filter((f) => f.rarity === rarity).reduce((sum, f) => sum + (seen.get(f.id) ?? 0), 0) / 20000
  assert.ok(share('legendary') > 0.02 && share('legendary') < 0.04)
  assert.ok(share('common') > 0.58 && share('common') < 0.66)
  // Les bornes de l'aléatoire ne font jamais sortir de la liste.
  assert.ok(pickFish(() => 0) && pickFish(() => 0.999999))
})

test('une touche : des feintes qui ne se chevauchent pas, puis le bouchon plonge ; la taille reste celle de l\'espèce', () => {
  const random = rng(3)
  for (const fish of FISH) {
    const rule = FISH_RARITY[fish.rarity]
    for (let i = 0; i < 200; i++) {
      const plan = bitePlan(fish, random)
      assert.ok(plan.feints.length >= rule.feints[0] && plan.feints.length <= rule.feints[1])
      assert.equal(plan.window, rule.window)
      let last = 2
      for (const f of plan.feints) {
        assert.ok(f >= last, 'feinte trop tôt')
        last = f + FEINT_TIME + 0.5
      }
      assert.ok(plan.bite >= last && plan.bite < 30)
      const size = fishSize(fish, random)
      assert.ok(Number.isInteger(size) && size >= fish.size[0] && size <= fish.size[1])
    }
  }
})

test('le site accepte les mêmes espèces, aux mêmes tailles (phputils/mini_shipinteriors/fish.php)', (t) => {
  const php = new URL('../../../phputils/mini_shipinteriors/fish.php', import.meta.url)
  // Le jeu seul, sans le dépôt du site autour : rien à comparer.
  if (!existsSync(php)) return t.skip('dépôt du site absent')
  const source = readFileSync(php, 'utf8')
  const list = source.slice(source.indexOf('const MSI_FISH = ['), source.indexOf('];', source.indexOf('const MSI_FISH = [')))
  const site = [...list.matchAll(/'([a-z0-9-]+)' => \[(\d+), (\d+)\]/g)].map(([, id, min, max]) => ({ id, size: [Number(min), Number(max)] }))
  assert.deepEqual(site, FISH.map((f) => ({ id: f.id, size: f.size })))
})
