// Les statistiques de CMDR Arena, par personnage : ce qui s'y passe, partie après partie, pour voir
// qui est trop faible ou trop fort (cf. scripts/arena-balance.mjs, et le README, « L'équilibrage »).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/*
 * Le relais les tient en mémoire (createArena les nourrit à chaque fin de partie) et, si on lui donne
 * un fichier (ARENA_STATS_FILE), les y garde d'un redémarrage à l'autre. Ce qu'on compte :
 * - `rows` : par sorte de combattant (`human`, les joueurs ; `bot`, les bots) et par personnage :
 *   ses parties (`picks`), victoires, défaites, nulles, éliminations, chutes, dégâts infligés, soins,
 *   projectiles tirés et ceux qui ont porté (`shots`, `hits` : la précision), le temps passé en vie
 *   et le nombre de vies (`alive`, `lives` : la durée de survie), la somme des distances de ses coups
 *   et leur nombre (`range`, `ranged` : la portée moyenne de ses engagements), sa meilleure série
 *   (`best`, la plus longue d'une partie) et le temps joué (`time`, s) ;
 * - `by` : les mêmes, en moins détaillé, par plan (`map:…`), par taille d'équipe (`size:…`), et pour
 *   les joueurs par commande (`control:mouse`, `control:gamepad`, `control:touch` ; `control:assist`,
 *   les tirs rapides au doigt, à part : ce n'est pas la même précision) ; les bots, `control:bot`.
 * Qui quitte une partie en cours y compte pour une défaite, avec ce qu'il y a fait jusque-là (sinon,
 * qui part en perdant ne perdrait jamais) ; une partie abandonnée par tous ses joueurs ne compte pas
 * (cf. arena.js, quit).
 */

export const STATS_VERSION = 1
export const CONTROLS = ['mouse', 'gamepad', 'touch', 'assist', 'bot']

const row = () => ({ picks: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, damage: 0, heals: 0, shots: 0, hits: 0, alive: 0, lives: 0, range: 0, ranged: 0, best: 0, time: 0 })
const small = () => ({ picks: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, damage: 0, heals: 0, shots: 0, hits: 0 })

/** Des statistiques vides, à partir de `at` (ms). */
export function emptyStats(at = Date.now()) {
  return { version: STATS_VERSION, since: at, updated: at, games: 0, rows: {}, by: {} }
}

/**
 * Ajoute une partie finie aux statistiques `data`.
 * @param game { map, size, winner (-1 : nulle), fighters: [{ character, team, bot, control (sa
 *   commande principale), kills, deaths, damage, heals, shots, hits, alive (s), lives, range, ranged,
 *   best, time (s), controls: { [commande]: { shots, hits } }, left (parti en cours de partie) }] }
 */
export function addGame(data, game, at = Date.now()) {
  data.games++
  data.updated = at
  for (const f of game.fighters) {
    const kind = f.bot ? 'bot' : 'human'
    const result = f.left ? 'losses' : game.winner < 0 ? 'draws' : game.winner === f.team ? 'wins' : 'losses'
    const r = (data.rows[`${kind}|${f.character}`] ??= row())
    r.picks++
    r[result]++
    for (const k of ['kills', 'deaths', 'damage', 'heals', 'shots', 'hits', 'alive', 'lives', 'range', 'ranged', 'time']) r[k] += f[k] ?? 0
    r.best = Math.max(r.best, f.best ?? 0)
    const add = (key, part, counted = true) => {
      const b = (data.by[`${key}|${f.character}`] ??= small())
      if (counted) {
        b.picks++
        b[result]++
        for (const k of ['kills', 'deaths', 'damage', 'heals']) b[k] += f[k] ?? 0
      }
      b.shots += part.shots ?? 0
      b.hits += part.hits ?? 0
    }
    add(`map:${game.map}|${kind}`, f)
    add(`size:${game.size}|${kind}`, f)
    // Par commande : la partie compte pour la commande dont il s'est le plus servi ; ses tirs, pour
    // chacune (un tir rapide au doigt n'est pas un tir visé au doigt).
    const controls = f.controls ?? {}
    for (const c of CONTROLS) {
      const part = controls[c]
      if (c === f.control) add(`control:${c}`, part ?? { shots: 0, hits: 0 })
      else if (part?.shots) add(`control:${c}`, part, false)
    }
  }
  return data
}

/** Ce qui reste à écrire quand le relais s'arrête (cf. createArenaStats). */
const pending = new Set()
let hooked = false
function flushAtExit(flush) {
  pending.add(flush)
  if (hooked) return
  hooked = true
  // Un arrêt (signal, erreur fatale : cf. server/index.js) passe par là ; l'écriture y est synchrone.
  process.on('exit', () => {
    for (const f of pending) f()
  })
}

/**
 * Les statistiques de l'arène : en mémoire, et dans `file` s'il est donné (écrit peu après chaque
 * partie, d'un bloc : un fichier à moitié écrit ne se lit pas ; et à l'arrêt du relais, ce qui
 * attendait encore).
 */
export function createArenaStats({ file = null, now = () => Date.now(), error = () => {} } = {}) {
  let data = emptyStats(now())
  if (file) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      if (saved?.version === STATS_VERSION && saved.rows && saved.by) data = saved
    } catch (e) {
      if (e?.code !== 'ENOENT') error(`[arène] statistiques illisibles (${file}) : ${e?.message ?? e}`)
    }
  }
  let timer = null
  if (file) flushAtExit(() => flush())
  const save = () => {
    timer = null
    if (!file) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(`${file}.tmp`, JSON.stringify(data))
      renameSync(`${file}.tmp`, file)
    } catch (e) {
      error(`[arène] statistiques non enregistrées (${file}) : ${e?.message ?? e}`)
    }
  }
  return {
    /** Une partie finie (cf. addGame). */
    record(game) {
      addGame(data, game, now())
      if (file && !timer) {
        timer = setTimeout(save, 2000)
        timer.unref?.()
      }
    },
    /** Ce qu'on en sait (l'objet lui-même : à ne pas modifier). */
    snapshot: () => data,
    /** Écrit tout de suite ce qui attendait (à l'arrêt du relais). */
    flush,
  }

  function flush() {
    if (!timer) return
    clearTimeout(timer)
    save()
  }
}

/**
 * Ce que disent les statistiques, personnage par personnage (cf. scripts/arena-balance.mjs, et le
 * panneau des statistiques au terminal) : taux de sélection et de victoire, éliminations et chutes
 * par partie, dégâts et soins par minute, durée de survie, précision, portée des engagements.
 * @param kind 'human' ou 'bot'
 */
export function summarize(data, kind = 'human') {
  const rows = Object.entries(data.rows).filter(([key]) => key.startsWith(`${kind}|`))
  const slots = rows.reduce((n, [, r]) => n + r.picks, 0)
  const out = {}
  for (const [key, r] of rows) {
    const id = key.split('|')[1]
    const decided = r.wins + r.losses
    const minutes = r.time / 60
    out[id] = {
      picks: r.picks,
      pickRate: slots ? r.picks / slots : 0,
      winRate: decided ? r.wins / decided : null,
      kills: r.picks ? r.kills / r.picks : 0,
      deaths: r.picks ? r.deaths / r.picks : 0,
      kd: r.deaths ? r.kills / r.deaths : r.kills,
      damage: minutes ? r.damage / minutes : 0,
      heals: minutes ? r.heals / minutes : 0,
      survival: r.lives ? r.alive / r.lives : 0,
      accuracy: r.shots ? r.hits / r.shots : null,
      range: r.ranged ? r.range / r.ranged : null,
      best: r.best,
    }
  }
  return out
}

/** Les mêmes, par plan, taille d'équipe ou commande (`dimension` : 'map', 'size', 'control'). */
export function breakdown(data, dimension, kind = 'human') {
  const out = {}
  for (const [key, b] of Object.entries(data.by)) {
    const parts = key.split('|')
    if (!parts[0].startsWith(`${dimension}:`)) continue
    // Par commande, les bots ont la leur (`control:bot`) ; ailleurs, la sorte est dans la clé.
    if (dimension !== 'control' && parts[1] !== kind) continue
    if (dimension === 'control' && (parts[0] === 'control:bot') !== (kind === 'bot')) continue
    const value = parts[0].slice(dimension.length + 1)
    const id = parts[parts.length - 1]
    const decided = b.wins + b.losses
    ;(out[value] ??= {})[id] = {
      picks: b.picks,
      winRate: decided ? b.wins / decided : null,
      kills: b.picks ? b.kills / b.picks : 0,
      deaths: b.picks ? b.deaths / b.picks : 0,
      accuracy: b.shots ? b.hits / b.shots : null,
      shots: b.shots,
    }
  }
  return out
}
