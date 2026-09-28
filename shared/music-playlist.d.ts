export function musicOrder(count: number, selected: number, shuffle?: boolean, seed?: number): number[]
export function musicCue(durations: number[], order: number[], elapsed: number, loop?: boolean): { index: number; orderIndex: number; position: number; cycle: number } | null
