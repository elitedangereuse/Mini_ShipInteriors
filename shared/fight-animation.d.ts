import type { Fighter } from './fight.js'
export type FightClip = 'idle' | 'run' | 'jump' | 'fall' | 'light' | 'heavy' | 'special' | 'hit' | 'death' | 'guard' | 'crouch'
export function fightAnimation(fighter: Fighter, counts: Partial<Record<FightClip, number>> & Record<'idle' | 'run' | 'jump' | 'fall' | 'light' | 'heavy' | 'hit' | 'death', number>, time: number, koTime?: number, contacts?: Partial<Record<FightClip, number>>): { clip: FightClip; frame: number }
