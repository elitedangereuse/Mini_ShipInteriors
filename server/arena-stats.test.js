// Les statistiques de CMDR Arena (server/arena-stats.js) : ce qu'elles comptent, comment elles se
// résument, qu'elles se gardent dans un fichier, et qu'une vraie partie les nourrit.
//   npm test
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createArena } from './arena.js'
import { addGame, breakdown, createArenaStats, emptyStats, summarize } from './arena-stats.js'
import { ARENA_CHARACTERS as C, ARENA_LEVEL, ARENA_RULES as R } from '../shared/arena.js'
import { mulberry32 } from '../shared/salvage.js'

const fighter = (over) => ({
  character: 'rourke', team: 0, bot: false, control: 'mouse', kills: 0, deaths: 0, damage: 0, heals: 0, shots: 0, hits: 0,
  alive: 0, lives: 1, range: 0, ranged: 0, best: 0, time: 300, controls: {}, ...over,
})

test('statistiques : une partie se compte par personnage, par plan, par taille et par commande', () => {
  const data = emptyStats(0)
  addGame(data, {
    map: 'bay', size: 2, winner: 0,
    fighters: [
      fighter({ character: 'nico', kills: 4, deaths: 1, damage: 300, shots: 10, hits: 6, alive: 200, lives: 2, range: 36, ranged: 6, best: 3, controls: { mouse: { shots: 10, hits: 6 } } }),
      fighter({ character: 'betty', control: 'touch', heals: 120, damage: 60, shots: 20, hits: 12, alive: 280, lives: 1, controls: { touch: { shots: 12, hits: 6 }, assist: { shots: 8, hits: 6 } } }),
      fighter({ character: 'marcel', team: 1, bot: true, control: 'bot', kills: 1, deaths: 4, damage: 150, shots: 9, hits: 5, controls: { bot: { shots: 9, hits: 5 } } }),
      fighter({ character: 'rourke', team: 1, bot: true, control: 'bot', deaths: 2, damage: 80, shots: 60, hits: 20, controls: { bot: { shots: 60, hits: 20 } } }),
    ],
  }, 1000)
  assert.equal(data.games, 1)
  assert.equal(data.rows['human|nico'].wins, 1)
  assert.equal(data.rows['bot|marcel'].losses, 1)
  const humans = summarize(data, 'human')
  assert.deepEqual(Object.keys(humans).sort(), ['betty', 'nico'])
  assert.equal(humans.nico.pickRate, 0.5)
  assert.equal(humans.nico.winRate, 1)
  assert.equal(humans.nico.kd, 4)
  assert.equal(humans.nico.accuracy, 0.6)
  assert.equal(humans.nico.range, 6, 'la portée moyenne de ses engagements')
  assert.equal(humans.nico.survival, 100, 'deux vies, 200 s en vie')
  assert.equal(humans.nico.damage, 60, 'des dégâts par minute')
  assert.equal(humans.betty.heals, 24, 'des soins par minute')
  // Par commande : la partie de Betty compte pour le doigt ; ses tirs rapides, à part.
  const controls = breakdown(data, 'control')
  assert.equal(controls.touch.betty.picks, 1)
  assert.equal(controls.touch.betty.accuracy, 0.5)
  assert.equal(controls.assist.betty.picks, 0)
  assert.equal(controls.assist.betty.accuracy, 0.75)
  assert.equal(controls.mouse.nico.winRate, 1)
  assert.equal(breakdown(data, 'control', 'bot').bot.rourke.accuracy, 1 / 3)
  assert.equal(breakdown(data, 'map').bay.nico.picks, 1)
  assert.equal(breakdown(data, 'size', 'bot')['2'].marcel.picks, 1)
})

test('statistiques : gardées dans un fichier, relues au redémarrage du relais', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-stats-'))
  try {
    const file = join(dir, 'sous', 'arena-stats.json')
    const a = createArenaStats({ file })
    a.record({ map: 'hive', size: 1, winner: -1, fighters: [fighter({ character: 'jacques' }), fighter({ character: 'capucine', team: 1 })] })
    a.flush()
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).games, 1)
    const b = createArenaStats({ file })
    assert.equal(b.snapshot().rows['human|jacques'].draws, 1)
    // Un fichier abîmé ne fait pas tomber le relais : on repart de zéro, et on le dit.
    const errors = []
    const broken = join(dir, 'abime.json')
    writeFileSync(broken, '{ "version": 1, "rows": ')
    const c = createArenaStats({ file: broken, error: (m) => errors.push(m) })
    assert.equal(c.snapshot().games, 0)
    assert.equal(errors.length, 1)
    // Pas encore de fichier : rien à dire.
    createArenaStats({ file: join(dir, 'neuf.json'), error: (m) => errors.push(m) })
    assert.equal(errors.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('statistiques : une vraie partie les nourrit (tirs, touches, commande, tir rapide, vies)', () => {
  let t = 1_000_000
  const players = new Map()
  const arena = createArena({
    playerById: (id) => players.get(id), emit: () => {}, broadcast: () => {}, now: () => t, random: mulberry32(5), debug: true,
  })
  const advance = (s) => { for (let i = 0; i < Math.round(s * 20); i++) { t += 50; arena.tick(0.05) } }
  const a = { id: 1, name: 'CMDR A', level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
  const b = { id: 2, name: 'CMDR B', level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
  players.set(1, a)
  players.set(2, b)
  arena.handle(a, 'arena:join', { room: 1, team: 0, character: 'nico' })
  arena.handle(a, 'arena:settings', { size: 1, bots: false, goal: 5 })
  arena.handle(b, 'arena:join', { room: 1, team: 1, character: 'rourke' })
  arena.handle(a, 'arena:ready', { ready: true })
  arena.handle(b, 'arena:ready', { ready: true })
  advance(R.countdown + 0.1)
  const game = arena.gameOf(a)
  const fa = game.fighters.get(1), fb = game.fighters.get(2)
  for (const p of [a, b]) {
    const f = game.fighters.get(p.id)
    Object.assign(p, { level: ARENA_LEVEL, x: f.x, z: f.z })
    arena.moved(p)
  }
  advance(R.warmup + 0.2)
  // Face à face dans la cour centrale, à découvert : B, au doigt, d'un tir rapide ; A, à la souris, le laser de Nico.
  const put = (p, f, x, z) => { Object.assign(p, { x, z }); Object.assign(f, { x, z, at: t }) }
  put(a, fa, 5, 5)
  put(b, fb, 9, 5)
  fa.shieldUntil = fb.shieldUntil = 0
  arena.handle(b, 'arena:fire', { o: [9, R.aim, 5], d: [[-1, 0, 0]], c: 't', a: 1 })
  advance(0.3)
  arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], c: 'm' })
  advance(0.9)
  arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[0, 0, 1]], c: 'm' })
  advance(1)
  assert.equal(fa.shots, 2)
  assert.equal(fa.hits, 1, 'le laser vers B a porté, l\'autre non')
  assert.equal(fb.controls.assist.hits, 1, 'le tir rapide de B a porté')
  assert.equal(fa.range, 4, 'à quatre tuiles')
  // A gagne : cinq éliminations (B est remis en jeu à chaque fois).
  for (let i = 0; i < 5 && !game.ended; i++) {
    fb.shieldUntil = 0
    put(b, fb, 9, 5)
    arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], c: 'm' })
    advance(0.3)
    if (fb.alive) {
      advance(1)
      arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], c: 'm' })
      advance(0.3)
    }
    advance(R.respawn + 0.2)
  }
  // Deux manches gagnantes : la seconde se joue de même.
  for (let i = 0; i < 12 && !game.ended; i++) {
    advance(R.intermission + 0.5)
    fb.shieldUntil = 0
    put(a, fa, 5, 5)
    put(b, fb, 9, 5)
    for (let k = 0; k < 2 && fb.alive; k++) {
      arena.handle(a, 'arena:fire', { o: [5, R.aim, 5], d: [[1, 0, 0]], c: 'm' })
      advance(1.1)
    }
    advance(R.respawn + 0.2)
  }
  assert.ok(game.ended, 'A a gagné')
  const data = arena.stats()
  assert.equal(data.games, 1)
  const nico = data.rows['human|nico'], rourke = data.rows['human|rourke']
  assert.equal(nico.wins, 1)
  assert.equal(rourke.losses, 1)
  assert.ok(nico.kills >= 10 && rourke.deaths >= 10)
  assert.ok(nico.best >= 5, 'sa meilleure série')
  assert.ok(rourke.lives >= rourke.deaths, 'une vie par retour en jeu')
  assert.ok(nico.alive > 0 && nico.alive <= nico.time)
  assert.equal(data.by['control:mouse|nico'].picks, 1)
  assert.equal(data.by['control:touch|rourke'].picks, 1, 'ses tirs rapides comptent pour le doigt')
  assert.equal(data.by['control:assist|rourke'].shots, 1)
})

test('statistiques : une partie entre bots seulement se joue jusqu\'au bout, et compte sous « bot »', () => {
  let t = 1_000_000
  const arena = createArena({ playerById: () => undefined, emit: () => {}, broadcast: () => {}, now: () => t, random: mulberry32(9) })
  const game = arena.simulate({ map: 'bay', size: 1, goal: 5, picks: [['nico'], ['marcel']] })
  assert.deepEqual([...game.fighters.values()].map((f) => f.character).sort(), ['marcel', 'nico'])
  for (let i = 0; i < 20 * 60 * 20 && !game.ended; i++) {
    t += 50
    arena.tick(0.05)
  }
  assert.ok(game.ended, 'elle se finit')
  const rows = arena.stats().rows
  assert.equal(rows['bot|nico'].picks + rows['bot|marcel'].picks, 2)
  assert.ok(rows['bot|nico'].shots > 0 && rows['bot|marcel'].shots > 0)
  assert.equal(rows['human|nico'], undefined)
  assert.ok(C.nico)
})

test('statistiques : qui quitte une partie en cours y compte pour une défaite, avec ce qu\'il y a fait', () => {
  let t = 1_000_000
  const players = new Map()
  const arena = createArena({ playerById: (id) => players.get(id), emit: () => {}, broadcast: () => {}, now: () => t, random: mulberry32(3), debug: true })
  const advance = (s) => { for (let i = 0; i < Math.round(s * 20); i++) { t += 50; arena.tick(0.05) } }
  const a = { id: 1, name: 'CMDR A', level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
  const b = { id: 2, name: 'CMDR B', level: -1, x: 24, z: 8, yaw: 0, anim: 'idle' }
  players.set(1, a)
  players.set(2, b)
  arena.handle(a, 'arena:join', { room: 1, team: 0, character: 'nico' })
  arena.handle(a, 'arena:settings', { size: 1, bots: false })
  arena.handle(b, 'arena:join', { room: 1, team: 1, character: 'marcel' })
  arena.handle(a, 'arena:ready', { ready: true })
  arena.handle(b, 'arena:ready', { ready: true })
  advance(R.countdown + 0.1)
  const game = arena.gameOf(a)
  advance(R.warmup + 1)
  // B tire une fois (dans le vide), puis s'en va : son équipe est vide, A gagne par forfait.
  game.fighters.get(2).shieldUntil = 0
  arena.handle(b, 'arena:fire', { o: [game.fighters.get(2).x, R.aim, game.fighters.get(2).z], d: [[0, 0, 1]], c: 'g' })
  advance(0.5)
  arena.handle(b, 'arena:quit')
  assert.ok(game.ended)
  const rows = arena.stats().rows
  assert.equal(rows['human|nico'].wins, 1)
  assert.equal(rows['human|marcel'].losses, 1, 'la défaite de qui est parti')
  assert.equal(rows['human|marcel'].shots, 1, 'et ce qu\'il a fait avant')
  assert.equal(arena.stats().by['control:gamepad|marcel'].picks, 1)
})

test('statistiques : à l\'arrêt du relais, ce qui attendait est écrit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-stats-exit-'))
  try {
    const file = join(dir, 'arena-stats.json')
    // Un relais qui note une partie et s'arrête aussitôt (avant l'écriture différée).
    const script = `
      import('${new URL('./arena-stats.js', import.meta.url).href}').then(({ createArenaStats }) => {
        const s = createArenaStats({ file: ${JSON.stringify(file)} })
        s.record({ map: 'bay', size: 1, winner: 0, fighters: [{ character: 'betty', team: 0, bot: false, control: 'touch', controls: {} }] })
        process.exit(0)
      })`
    execFileSync(process.execPath, ['--input-type=module', '-e', script])
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).rows['human|betty'].wins, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
