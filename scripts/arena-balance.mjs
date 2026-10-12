#!/usr/bin/env node
// L'équilibrage de CMDR Arena, en chiffres.
//
//   node scripts/arena-balance.mjs report [fichier]
//     Les statistiques des vraies parties (celles que le relais garde, cf. server/arena-stats.js ;
//     par défaut ARENA_STATS_FILE, sinon var/arena-stats.json) : pour chaque personnage, son taux de
//     sélection et de victoire, ses éliminations et chutes, ses dégâts et soins par minute, sa durée de
//     survie, sa précision, la portée de ses engagements ; puis par commande (souris, manette, doigt,
//     tir rapide), par plan et par taille d'équipe. Ce qui sort du rang est signalé.
//
//   node scripts/arena-balance.mjs simulate [parties] [--size 3] [--skill 2] [--map bay|guardian|hive|all] [--seed 1] [--out fichier]
//     Des parties entre bots seulement (cf. createArena, simulate), équipes tirées au hasard : une
//     première lecture avant d'avoir des données réelles (les bots ne jouent pas comme des joueurs :
//     elle dit surtout qui écrase ou subit, toutes choses égales).
//
// Les seuils : un taux de victoire hors de 45-55 % sur au moins 30 parties décidées ; une sélection
// plus de deux fois au-dessus ou en dessous de la moyenne ; au doigt, un tir rapide plus précis que
// la souris, ou une précision au doigt inférieure aux deux tiers de celle de la souris.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createArena } from '../server/arena.js'
import { breakdown, createArenaStats, summarize } from '../server/arena-stats.js'
import { ARENA_MAPS, CHARACTER_IDS } from '../shared/arena.js'
import { mulberry32 } from '../shared/salvage.js'

const args = process.argv.slice(2)
const mode = args[0] ?? 'report'
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const pct = (x) => (x === null || x === undefined ? '   —' : `${(x * 100).toFixed(0).padStart(3)} %`)
const num = (x, digits = 1) => (x === null || x === undefined ? '—' : x.toFixed(digits))

/** Le tableau d'un résumé (cf. summarize), et ce qui sort du rang. */
function table(rows, title) {
  const ids = CHARACTER_IDS.filter((id) => rows[id])
  if (!ids.length) return console.log(`${title} : aucune partie.\n`)
  console.log(title)
  console.log('personnage   parties  choisi  victoires  élim./p  chutes/p  dégâts/min  soins/min  survie(s)  précision  portée  série')
  for (const id of ids) {
    const r = rows[id]
    console.log(
      `${id.padEnd(12)} ${String(r.picks).padStart(7)}  ${pct(r.pickRate)}  ${pct(r.winRate).padStart(9)}  ${num(r.kills).padStart(7)}  ${num(r.deaths).padStart(8)}  ${num(r.damage, 0).padStart(10)}  ${num(r.heals, 0).padStart(9)}  ${num(r.survival, 0).padStart(9)}  ${pct(r.accuracy).padStart(9)}  ${num(r.range).padStart(6)}  ${String(r.best).padStart(5)}`,
    )
  }
  const flags = []
  const mean = 1 / ids.length
  for (const id of ids) {
    const r = rows[id]
    const decided = r.winRate === null ? 0 : r.picks
    if (decided >= 30 && r.winRate > 0.55) flags.push(`${id} gagne trop (${pct(r.winRate).trim()})`)
    if (decided >= 30 && r.winRate < 0.45) flags.push(`${id} perd trop (${pct(r.winRate).trim()})`)
    if (r.picks >= 30 && r.pickRate > mean * 2) flags.push(`${id} est choisi plus de deux fois plus que la moyenne`)
    if (r.picks >= 10 && r.pickRate < mean / 2) flags.push(`${id} n'est presque pas choisi`)
  }
  console.log(flags.length ? `À regarder : ${flags.join(' ; ')}.\n` : 'Rien ne sort du rang (ou trop peu de parties pour le dire).\n')
}

/** Par commande, plan ou taille (cf. breakdown). */
function split(parts, title) {
  const keys = Object.keys(parts).sort()
  if (!keys.length) return
  console.log(title)
  for (const key of keys) {
    const cells = CHARACTER_IDS.filter((id) => parts[key][id]).map((id) => {
      const r = parts[key][id]
      return `${id} ${r.picks}p ${pct(r.winRate).trim()} préc. ${pct(r.accuracy).trim()}`
    })
    console.log(`  ${key.padEnd(9)} ${cells.join(' · ')}`)
  }
  console.log('')
}

/** Au doigt : le tir rapide pas plus précis que la souris, le doigt pas trop loin derrière. */
function touchCheck(parts) {
  const flags = []
  for (const id of CHARACTER_IDS) {
    const mouse = parts.mouse?.[id], touch = parts.touch?.[id], assist = parts.assist?.[id]
    if (!mouse || mouse.shots < 200) continue
    if (assist?.shots >= 200 && assist.accuracy > mouse.accuracy + 0.03) flags.push(`${id} : le tir rapide (${pct(assist.accuracy).trim()}) vise mieux que la souris (${pct(mouse.accuracy).trim()})`)
    if (touch?.shots >= 200 && touch.accuracy < mouse.accuracy * 0.66) flags.push(`${id} : au doigt (${pct(touch.accuracy).trim()}), loin de la souris (${pct(mouse.accuracy).trim()})`)
  }
  console.log(flags.length ? `Au doigt, à regarder : ${flags.join(' ; ')}.\n` : 'Au doigt : rien à signaler (ou trop peu de tirs pour le dire).\n')
}

function report(data, kind) {
  const days = Math.max(0, (data.updated - data.since) / 86400000)
  console.log(`${data.games} parties, du ${new Date(data.since).toLocaleDateString('fr-FR')} au ${new Date(data.updated).toLocaleDateString('fr-FR')} (${days.toFixed(0)} j).\n`)
  table(summarize(data, kind), kind === 'human' ? 'Les joueurs, par personnage' : 'Les bots, par personnage')
  const controls = breakdown(data, 'control', kind)
  if (kind === 'human') {
    split(controls, 'Par commande (souris, manette, doigt ; « assist » : le tir rapide au doigt)')
    touchCheck(controls)
  }
  split(breakdown(data, 'map', kind), 'Par plan')
  split(breakdown(data, 'size', kind), 'Par taille d\'équipe')
}

if (mode === 'report') {
  const file = args[1] && !args[1].startsWith('--') ? args[1] : process.env.ARENA_STATS_FILE ?? 'var/arena-stats.json'
  if (!existsSync(file)) {
    console.error(`Pas de statistiques dans ${file} : le relais les y écrit si on lui donne ARENA_STATS_FILE (cf. README).`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(file, 'utf8'))
  report(data, 'human')
  if (Object.keys(data.rows).some((k) => k.startsWith('bot|'))) report(data, 'bot')
} else if (mode === 'simulate') {
  const games = Number(args[1] && !args[1].startsWith('--') ? args[1] : 60)
  const size = Number(option('size', 3))
  const skill = Number(option('skill', 2))
  const map = option('map', 'all')
  const seed = Number(option('seed', 1))
  const random = mulberry32(seed)
  // L'horloge des parties simulées part de maintenant, et file bien plus vite.
  let t = Date.now()
  const stats = createArenaStats({ now: () => t })
  const arena = createArena({ playerById: () => undefined, emit: () => {}, broadcast: () => {}, now: () => t, random, stats })
  const maps = map === 'all' ? ARENA_MAPS.map((m) => m.id) : [map]
  const started = Date.now()
  for (let g = 0; g < games; g++) {
    // Chaque équipe : des personnages distincts, tirés au hasard (un vrai mélange : chacun a ses chances).
    const team = () => {
      const pool = [...CHARACTER_IDS]
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      return pool.slice(0, size)
    }
    const game = arena.simulate({ map: maps[g % maps.length], size, skill, picks: [team(), team()] })
    while (!game.ended) {
      t += 50
      arena.tick(0.05)
    }
    if ((g + 1) % 10 === 0) process.stderr.write(`  ${g + 1}/${games} parties (${((Date.now() - started) / 1000).toFixed(0)} s)\n`)
  }
  const out = option('out', null)
  if (out) writeFileSync(out, JSON.stringify(stats.snapshot()))
  report(stats.snapshot(), 'bot')
} else {
  console.error('Usage : node scripts/arena-balance.mjs report [fichier] | simulate [parties] [--size 3] [--skill 2] [--map all] [--seed 1] [--out fichier]')
  process.exit(1)
}
