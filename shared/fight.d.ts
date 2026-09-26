import type { FighterId } from './fight-roster.js'
import type { Pad, Sfx } from '../src/arcade/game'
export type FightMode = 'solo' | 'versus' | 'demo'
type Move = 'punch' | 'kick' | 'plasma'
export interface Fighter {
  character: FighterId; walk: number; moving: boolean
  x: number; y: number; vy: number; face: number; hp: number; energy: number
  wins: number; stun: number; cooldown: number; guard: boolean; crouch: boolean
  attack: { move: Move; time: number; hit: boolean } | null
}
export const MOVES: Record<Move, { windup: number; duration: number; range: number; damage: number }>
export interface FightSnapshot {
  fighters: [Fighter, Fighter]
  phase: 'intro' | 'ready' | 'fight' | 'round' | 'over'
  phaseTime: number; remaining: number; winner: number | null; roundWinner: number | null
  level: number; over: boolean
  projectiles: { x: number; y: number; dir: number; owner: number; speed: number; damage: number }[]
  sparks: { x: number; y: number; life: number; blocked: boolean }[]
  sounds: Sfx[]
}
export class FightSimulation implements FightSnapshot {
  constructor(mode?: FightMode, seed?: number, characters?: [FighterId, FighterId])
  readonly mode: FightMode
  readonly id: 'fight'
  readonly width: 480
  readonly height: 300
  readonly sounds: Sfx[]
  best: number; score: number; level: number; over: boolean
  fighters: [Fighter, Fighter]
  phase: FightSnapshot['phase']; phaseTime: number; remaining: number
  winner: number | null; roundWinner: number | null
  projectiles: FightSnapshot['projectiles']; sparks: FightSnapshot['sparks']
  step(dt: number, pad: Pad): void
  snapshot(): FightSnapshot
}
