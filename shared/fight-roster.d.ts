export type FighterId = 'nova' | 'vesper' | 'atlas' | 'nyx' | 'helix' | 'rook'
export interface FighterProfile {
  id: FighterId; name: string; role: [string, string]; strength: [string, string]; weakness: [string, string]
  color: string; dark: string; light: string; accent: string
  style: 'pilot' | 'acrobat' | 'heavy' | 'ninja' | 'alien' | 'sentinel'
  speed: number; power: number; armor: number; tempo: number; reach: number; jump: number
  regen: number; plasmaCost: number; plasmaSpeed: number; plasmaPower: number
  stats: [number, number, number]
}
export const FIGHT_ROSTER: readonly FighterProfile[]
export function fighterProfile(id: unknown): FighterProfile
export function isFighterId(id: unknown): id is FighterId
