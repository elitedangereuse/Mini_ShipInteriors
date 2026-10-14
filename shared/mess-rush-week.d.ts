export interface ResetRule { day: string; hour: number | null; tz: string | null }
export declare const DEFAULT_RESET: { day: 'thursday'; hour: 7; tz: 'UTC' }
export declare function resetRule(reset?: Partial<ResetRule> | null): { day: string; hour: number; tz: string }
export declare function weekStart(ms: number, reset?: Partial<ResetRule> | null): number
export declare function nextReset(ms: number, reset?: Partial<ResetRule> | null): number
export declare function sameWeek(a: number, b: number, reset?: Partial<ResetRule> | null): boolean
