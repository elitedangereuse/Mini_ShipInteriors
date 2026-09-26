import { isGameId, records, type GameId } from './game'

/*
 * Tableaux des scores, gardés par le site (outils/mini-shipinteriors-scores.php, table
 * mini_shipinteriors_score) : le meilleur score de chaque CMDR à chaque jeu. Seul un CMDR
 * connecté inscrit le sien ; tout le monde lit les tableaux. Le meilleur score de chacun est
 * aussi gardé dans le navigateur (celui d'un invité ne vit que là).
 */

const SCORES_URL = import.meta.env.VITE_ED_SCORES_URL || '/outils/mini-shipinteriors-scores.php'

export interface ScoreRow {
  /** Nom visible du CMDR. */
  cmdr: string
  score: number
  level: number
  /** Date du score (timestamp Unix). */
  at: number
}

export interface Board {
  top: ScoreRow[]
  /** Le score du CMDR connecté et son rang, s'il en a un. */
  me: { score: number; rank: number } | null
}

const isRow = (r: unknown): r is ScoreRow => {
  const o = r as ScoreRow
  return !!o && typeof o.cmdr === 'string' && Number.isFinite(o.score) && Number.isFinite(o.level) && Number.isFinite(o.at)
}

function board(data: unknown): Board | null {
  const d = data as { top?: unknown; me?: { score?: unknown; rank?: unknown } | null }
  if (!d || !Array.isArray(d.top)) return null
  const me = d.me && Number.isFinite(d.me.score) && Number.isFinite(d.me.rank) ? { score: d.me.score as number, rank: d.me.rank as number } : null
  return { top: d.top.filter(isRow).slice(0, 10), me }
}

/** Tableau d'un jeu (null : le site ne répond pas). */
export async function fetchBoard(game: GameId): Promise<Board | null> {
  try {
    const res = await fetch(`${SCORES_URL}?game=${game}`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const b = board(await res.json())
    if (b?.top[0]) records[game] = { cmdr: b.top[0].cmdr, score: b.top[0].score }
    return b
  } catch {
    return null
  }
}

/**
 * Crédits d'un record personnel (cf. phputils/mini_shipinteriors/credits.php) : gagnés, solde
 * après, paliers de score franchis, record du vaisseau pris à un autre CMDR.
 */
export interface ArcadeCredits {
  earned: number
  balance: number
  tiers: number[]
  record: boolean
}

export type Submission =
  | { kind: 'saved'; board: Board; best: boolean; credits: ArcadeCredits | null }
  /** Invité : le score reste dans le navigateur. */
  | { kind: 'guest' }
  | { kind: 'error' }

/** Inscrit un score (le site garde le meilleur de chaque CMDR). */
export async function submitScore(game: GameId, score: number, level: number, duration: number): Promise<Submission> {
  try {
    const res = await fetch(SCORES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ game, score: Math.floor(score), level: Math.floor(level), duration: Math.round(duration) }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401) return { kind: 'guest' }
    if (!res.ok) return { kind: 'error' }
    const data = (await res.json()) as { best?: unknown; credits?: Partial<ArcadeCredits> | null }
    const b = board(data)
    if (!b) return { kind: 'error' }
    if (b.top[0]) records[game] = { cmdr: b.top[0].cmdr, score: b.top[0].score }
    const c = data.credits
    const credits =
      c && Number.isFinite(c.earned) && Number.isFinite(c.balance)
        ? { earned: c.earned!, balance: c.balance!, tiers: Array.isArray(c.tiers) ? c.tiers.filter(Number.isFinite) : [], record: c.record === true }
        : null
    return { kind: 'saved', board: b, best: data.best === true, credits }
  } catch {
    return { kind: 'error' }
  }
}

/** Le meilleur score de chaque jeu, pour les écrans des bornes du vaisseau (« HI 12340 »). */
export async function fetchRecords() {
  try {
    const res = await fetch(SCORES_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
    if (!res.ok) return
    const data = (await res.json()) as { best?: Record<string, unknown> }
    for (const [game, row] of Object.entries(data.best ?? {})) {
      const r = row as { cmdr?: unknown; score?: unknown } | null
      if (isGameId(game) && r && typeof r.cmdr === 'string' && Number.isFinite(r.score)) records[game] = { cmdr: r.cmdr, score: r.score as number }
    }
  } catch {}
}

/** Meilleur score gardé dans ce navigateur. */
export function localBest(game: GameId): number {
  try {
    return Math.max(0, Number(localStorage.getItem(`arcade-best:${game}`)) || 0)
  } catch {
    return 0
  }
}

export function saveLocalBest(game: GameId, score: number): boolean {
  if (score <= localBest(game)) return false
  try {
    localStorage.setItem(`arcade-best:${game}`, String(Math.floor(score)))
  } catch {}
  return true
}
