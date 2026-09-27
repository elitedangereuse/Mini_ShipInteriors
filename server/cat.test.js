// Régressions du déplacement de Comète : simuler le vrai contrôleur sans charger les modèles.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import * as THREE from 'three'
import { createServer } from 'vite'

let server, Cat, Pathfinder, ShipMap, overlapsAny
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ Cat } = await server.ssrLoadModule('/src/cat.ts'))
  ;({ Pathfinder } = await server.ssrLoadModule('/src/pathfinding.ts'))
  ;({ ShipMap } = await server.ssrLoadModule('/src/map.ts'))
  ;({ overlapsAny } = await server.ssrLoadModule('/src/physics.ts'))
})
after(async () => { await server?.close() })

function setup(colliders = []) {
  const deck = {
    group: new THREE.Group(), colliders,
    pathfinder: new Pathfinder(new ShipMap(Array(11).fill('aaaaaaaaaaa')), new Set(), colliders),
  }
  return new Cat({ root: new THREE.Group(), clips: [] }, deck, 2, 5)
}

function travel(cat, player, dt = 1 / 60, seconds = 15) {
  let lateral = 0
  for (let i = 0; i < seconds / dt && cat.state === 'walk'; i++) {
    cat.update(dt, player, false)
    const p = cat.root.position
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), 'position finie')
    assert.ok(!overlapsAny(p, 0.12, cat.deck.colliders), 'ne traverse pas les meubles')
    if (player) assert.ok(p.distanceTo(player) >= 0.38 - 1e-6, 'ne traverse pas le joueur')
    lateral = Math.max(lateral, Math.abs(p.z - 5))
  }
  return lateral
}

for (const dt of [1 / 60, 0.05]) {
  test(`Comète contourne un joueur immobile sur son trajet (pas ${dt.toFixed(3)} s)`, () => {
    const cat = setup(), player = new THREE.Vector3(5, 0, 5)
    assert.ok(cat.goTo(8, 5, 0.9))
    const lateral = travel(cat, player, dt)
    assert.ok(lateral >= 0.3, 'un vrai contournement latéral')
    assert.ok(cat.root.position.distanceTo(new THREE.Vector3(8, 0, 5)) < 0.01, 'arrive à destination')
  })
}

test('Comète contourne par le côté libre quand un meuble ferme le premier côté', () => {
  const cat = setup([{ minX: 0, maxX: 10, minZ: 0, maxZ: 4.7 }])
  assert.ok(cat.goTo(8, 5, 0.9))
  travel(cat, new THREE.Vector3(5, 0, 5))
  assert.ok(cat.root.position.distanceTo(new THREE.Vector3(8, 0, 5)) < 0.01)
})

test('Comète adapte un trajet déjà commencé quand le joueur se place devant lui', () => {
  const cat = setup()
  assert.ok(cat.goTo(8, 5, 2.6))
  for (let i = 0; i < 30; i++) cat.update(1 / 60, null, false)
  travel(cat, new THREE.Vector3(5, 0, 5))
  assert.ok(cat.root.position.distanceTo(new THREE.Vector3(8, 0, 5)) < 0.01)
})

test('Comète abandonne un passage trop étroit au lieu de marcher indéfiniment contre le joueur', () => {
  const cat = setup([
    { minX: 0, maxX: 10, minZ: 0, maxZ: 4.8 },
    { minX: 0, maxX: 10, minZ: 5.2, maxZ: 10 },
  ])
  assert.ok(cat.goTo(8, 5, 0.9))
  // Le joueur bouche le couloir : la séparation peut rester partielle entre les murs.
  for (let i = 0; i < 600 && cat.state === 'walk'; i++) cat.update(1 / 60, new THREE.Vector3(5, 0, 5), false)
  assert.equal(cat.state, 'idle')
  assert.equal(cat.path.length, 0)
  assert.ok(cat.root.position.x < 5, 'ne traverse ni les murs ni le joueur')
})

test('une destination occupée est abandonnée, puis le chat peut repartir une fois le joueur parti', () => {
  const cat = setup(), player = new THREE.Vector3(8, 0, 5)
  assert.ok(cat.goTo(8, 5, 0.9))
  cat.update(1 / 60, player, false)
  assert.equal(cat.state, 'idle')
  assert.ok(cat.goTo(8, 5, 0.9))
  travel(cat, null)
  assert.ok(cat.root.position.distanceTo(player) < 0.01)
})

test('un joueur qui entre sur Comète est évité, même en superposition exacte', () => {
  const cat = setup(), player = new THREE.Vector3(2, 0, 5)
  cat.update(1 / 60, player, false)
  assert.ok(cat.root.position.distanceTo(player) >= 0.38 - 1e-6)
  assert.ok(Number.isFinite(cat.root.position.x) && Number.isFinite(cat.root.position.z))
})

test('le mode photo figé ne déplace pas Comète pour éviter le joueur', () => {
  const cat = setup(), before = cat.root.position.clone()
  cat.update(0, before, false)
  assert.deepEqual(cat.root.position, before)
})
