// L'équilibre au doigt : le tir rapide (toucher le stick de tir, sans viser ; cf. ARENA_RULES.assist)
// ne doit ni désavantager fortement les joueurs tactiles, ni leur donner une précision que n'a pas un
// bon joueur à la souris. On le mesure, arme par arme, contre une cible qui court ou se tient là, à la
// distance où l'on se bat avec elle (`reach`), et on le compare aux bots : l'élite vise comme un très
// bon joueur à la souris, la recrue comme un débutant.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ARENA_CHARACTERS as C, ARENA_RULES as R, ARENA_SKILLS, assistAim, lobTime } from '../shared/arena.js'
import { mulberry32 } from '../shared/salvage.js'

const RAD = Math.PI / 180
const TRIALS = 6000

/**
 * La part des coups qui portent, pour une façon de viser (`aim(cap, distance, court)` : le cap et la
 * distance visés, à partir de la position de la cible au moment du tir). La cible, à `reach` tuiles,
 * court de travers une fois sur deux (à la vitesse d'un joueur), sinon se tient là. Une balle file
 * droit à la vitesse de l'arme et porte si elle passe à moins de `body.r` de la cible ; un objet
 * lancé, s'il retombe assez près d'elle pour la prendre dans son éclat ou les mâchoires de sa fleur.
 */
function accuracy(w, aim, random) {
  let hits = 0
  for (let i = 0; i < TRIALS; i++) {
    const d = w.reach
    const running = random() < 0.5
    const v = running ? R.sprint * (random() < 0.5 ? 1 : -1) : 0
    const shot = aim(0, d, running)
    const spread = (random() * 2 - 1) * w.spread * RAD
    const yaw = shot.yaw + spread
    if (w.lob) {
      const t = lobTime(w, shot.dist)
      const land = { x: Math.sin(yaw) * shot.dist, z: Math.cos(yaw) * shot.dist }
      const target = { x: v * t, z: d }
      const reach = (w.flower ? w.flower.radius : w.blast) + R.body.r
      if (Math.hypot(land.x - target.x, land.z - target.z) <= reach) hits++
      continue
    }
    // La plus courte distance entre la balle (partie de 0, cap `yaw`) et la cible (partie de (0, d), x = v·t).
    let near = Infinity
    for (let s = 0; s <= w.range; s += 0.02) {
      const t = s / w.speed
      near = Math.min(near, Math.hypot(Math.sin(yaw) * s - v * t, Math.cos(yaw) * s - d))
    }
    if (near <= R.body.r) hits++
  }
  return hits / TRIALS
}

/** Un bot vise ainsi (cf. server/arena.js) : son écart, plus large sur une cible qui court. */
const bot = (skill, random) => (yaw, dist, running) => ({
  yaw: yaw + (random() + random() - 1) * skill.error * (running ? 1.5 : 1) * RAD,
  dist: dist * (1 + (random() + random() - 1) * skill.error * 0.02),
})

test('au doigt, le tir rapide vise moins bien qu\'un très bon joueur, mieux qu\'un débutant', () => {
  const random = mulberry32(17)
  const rookie = ARENA_SKILLS[0], elite = ARENA_SKILLS[ARENA_SKILLS.length - 1]
  const lines = []
  for (const [id, c] of Object.entries(C)) {
    const w = c.weapon
    const quick = accuracy(w, (yaw, dist) => assistAim(yaw, dist, random), random)
    const good = accuracy(w, bot(elite, random), random)
    const weak = accuracy(w, bot(rookie, random), random)
    lines.push(`${id} : recrue ${(weak * 100).toFixed(0)} %, tir rapide ${(quick * 100).toFixed(0)} %, élite ${(good * 100).toFixed(0)} %`)
    // Pas mieux qu'un très bon joueur (à l'erreur de mesure près)…
    assert.ok(quick <= good + 0.02, `${id} : le tir rapide (${quick.toFixed(2)}) vise mieux que l'élite (${good.toFixed(2)})`)
    // … ni très loin derrière : mieux qu'un débutant, et au moins les deux tiers d'un très bon joueur.
    assert.ok(quick >= weak - 0.02, `${id} : le tir rapide (${quick.toFixed(2)}) vise moins bien qu'une recrue (${weak.toFixed(2)})`)
    assert.ok(quick >= good * 0.66, `${id} : le tir rapide (${quick.toFixed(2)}) est loin de l'élite (${good.toFixed(2)})`)
  }
  // Pour qui veut voir les chiffres : node --test server/arena-assist.test.js
  if (process.env.ARENA_ASSIST_REPORT) console.log(lines.join('\n'))
})
