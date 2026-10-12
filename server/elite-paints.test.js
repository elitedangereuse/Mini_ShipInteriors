// Peintures du profil Frontier (shared/elite-paints.js) : les noms de travail de Frontier retrouvent
// nos coloris, vaisseau par vaisseau, et la table ne désigne que des coloris qui existent.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ELITE_PAINTS, elitePaint } from '../shared/elite-paints.js'

const { paints, ships } = JSON.parse(readFileSync(new URL('../public/assets/ships/paints.json', import.meta.url), 'utf8'))
const listed = Object.entries(ELITE_PAINTS).map(([key, ids]) => [key, [ids].flat()])

test('des peintures relevées dans de vrais profils et journaux de bord', () => {
  assert.equal(elitePaint('paintjob_mamba_blackfriday_01', ships.mamba), 'midnight-black')
  assert.equal(elitePaint('paintjob_krait_light_salvage_06', ships['krait-phantom']), 'salvage-black')
  assert.equal(elitePaint('paintjob_cobramkiii_salvage_04', ships['cobra-mk3']), 'salvage-blue')
  assert.equal(elitePaint('paintjob_asp_default_03', ships['asp-explorer']), 'apollo-white')
  assert.equal(elitePaint('paintjob_cobramkiii_tactical_grey', ships['cobra-mk3']), 'tactical-graphite')
  assert.equal(elitePaint('paintjob_federation_corvette_razormetal_silver', ships['federal-corvette']), 'razor-silver')
  assert.equal(elitePaint('paintjob_adder_vibrant_yellow', ships.adder), 'vibrant-yellow')
})

test('le profil écrit le nom avec des majuscules, le journal sans', () => {
  assert.equal(elitePaint('PaintJob_Krait_Light_Salvage_06', ships['krait-phantom']), 'salvage-black')
  assert.equal(elitePaint(' PaintJob_Adder_BlackFriday_01 ', ships.adder), 'midnight-black')
})

test('le vaisseau n\'est pas lu : son nom peut différer de celui du profil', () => {
  assert.equal(elitePaint('paintjob_feddropship_mkii_blackfriday_01', ships['federal-assault-ship']), 'midnight-black')
  assert.equal(elitePaint('paintjob_empiretrader_expressway_02', ships['imperial-clipper']), 'expressway-journey')
  assert.equal(elitePaint('paintjob_type9_military_blackfriday_01', ships['type-10']), 'midnight-black')
  assert.equal(elitePaint('paintjob_krait_mkii_lowlighteffect_01_02', ships['krait-mk2']), 'crypsis-pink')
})

test('un même nom de travail ne désigne pas la même peinture sur tous les vaisseaux', () => {
  assert.equal(elitePaint('paintjob_asp_stripe1_03', ships['asp-explorer']), 'pharaoh-gold')
  assert.equal(elitePaint('paintjob_cobramkiii_stripe1_03', ships['cobra-mk3']), 'rattler-blue')
  assert.equal(elitePaint('paintjob_eagle_thirds_01', ships.eagle), 'mohawk-red')
  assert.equal(elitePaint('paintjob_sidewinder_thirds_01', ships.sidewinder), 'mojave-red')
  assert.equal(elitePaint('paintjob_asp_default_04', ships['asp-explorer']), 'apollo-green')
  assert.equal(elitePaint('paintjob_sidewinder_default_04', ships.sidewinder), 'colorado-red')
  // Le nuancier du vaisseau tranche : aucun n'a deux candidats d'un même nom.
  for (const [key, ids] of listed) {
    for (const [ship, list] of Object.entries(ships)) {
      assert.ok(ids.filter((id) => list.includes(id)).length <= 1, `${key} sur ${ship}`)
    }
  }
})

test('pas de peinture, ou une peinture qu\'on n\'a pas : rien', () => {
  assert.equal(elitePaint('', ships.adder), null)
  assert.equal(elitePaint(null, ships.adder), null)
  assert.equal(elitePaint('paintjob_adder', ships.adder), null)
  assert.equal(elitePaint('salvage_06', ships.adder), null)
  // Peintures hors boutique (prix de Lave Radio, coque corrodée), ou d'un vaisseau qui ne l'a pas.
  assert.equal(elitePaint('paintjob_adder_lrpo_azure', ships.adder), null)
  assert.equal(elitePaint('paintjob_krait_mkii_corrosive_06', ships['krait-mk2']), null)
  assert.equal(elitePaint('paintjob_cobramkiv_expressway_02', ships['cobra-mk4']), null)
  // La boutique ne vend pas de Salvage Blue pour le Python : il n'est pas dans son nuancier.
  assert.equal(elitePaint('paintjob_python_salvage_04', ships.python), null)
})

test('la table ne désigne que des coloris du nuancier', () => {
  for (const [key, ids] of listed) {
    assert.match(key, /^[a-z0-9]+(_[a-z0-9]+)+$/, key)
    for (const id of ids) assert.ok(paints[id], `${key} → ${id}`)
  }
})
