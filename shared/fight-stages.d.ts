export type FightStageId = 'street' | 'rooftop' | 'harbor' | 'temple'
export interface FightStage { id: FightStageId; name: [string, string]; music: FightStageId }
export const FIGHT_STAGES: FightStage[]
export function fightStage(id: string): FightStage
export function chooseFightStage(roll: number): FightStageId
