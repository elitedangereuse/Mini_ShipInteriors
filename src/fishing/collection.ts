import { FISH, fishById } from '../../shared/fishing.js'

/*
 * La collection de poissons du joueur : ce qu'il a pêché à l'étang, espèce par espèce. Le site la
 * garde pour les CMDR connectés (outils/mini-shipinteriors-fish.php, table mini_shipinteriors_fish) ;
 * celle d'un invité ne vit que dans son navigateur, comme les prises que le site n'a pas pu noter.
 */

const FISH_URL = import.meta.env.VITE_ED_FISH_URL || '/outils/mini-shipinteriors-fish.php'
const LOCAL_KEY = 'mini-shipinteriors-fish'
/** Espèces dont le joueur a déjà vu la page dans le livre des prises (dans ce navigateur). */
const SEEN_KEY = 'mini-shipinteriors-fish-seen'

/** Une espèce prise : combien de fois, la plus grande (cm), la date de la première (secondes Unix). */
export interface Caught {
  count: number
  best: number
  first: number
}

export type Collection = Record<string, Caught>

/** Ce qu'une prise change : première de son espèce, nouveau record de taille ; où elle est gardée. */
export interface CatchResult {
  first: boolean
  record: boolean
  kept: 'site' | 'guest' | 'local'
}

/** Une collection bien formée : espèces connues, nombres entiers positifs. */
function sanitize(data: unknown): Collection {
  const out: Collection = {}
  if (!data || typeof data !== 'object') return out
  for (const [id, row] of Object.entries(data as Record<string, Partial<Caught> | null>)) {
    if (!fishById(id) || !row) continue
    const count = Math.floor(Number(row.count)), best = Math.floor(Number(row.best)), first = Math.floor(Number(row.first))
    if (count >= 1 && best >= 1 && first >= 0) out[id] = { count, best, first }
  }
  return out
}

function loadLocal(): Collection {
  try {
    return sanitize(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

function loadSeen(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveLocal(c: Collection) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(c))
  } catch {
    // Stockage indisponible (navigation privée) : la collection vaut pour cette visite.
  }
}

/** Réunion de deux collections : pour chaque espèce, le plus de prises, la plus grande, la plus ancienne. */
function merge(a: Collection, b: Collection): Collection {
  const out: Collection = { ...a }
  for (const [id, row] of Object.entries(b)) {
    const had = out[id]
    out[id] = had ? { count: Math.max(had.count, row.count), best: Math.max(had.best, row.best), first: Math.min(had.first, row.first) } : row
  }
  return out
}

class FishCollection {
  /** Les prises connues : celles de ce navigateur, puis celles du site une fois lues. */
  caught: Collection = loadLocal()
  /** Prises gardées dans ce navigateur seulement (invité, ou site indisponible). */
  private local: Collection = loadLocal()
  /** Appelé quand la collection change (le livre, le choix du tableau). */
  onChange?: () => void
  private seen = loadSeen()

  /**
   * Espèces prises dont le joueur n'a pas encore vu la page : le livre des prises le signale, sur
   * son lutrin (cf. main.ts) et sur leurs cases.
   */
  get fresh(): string[] {
    return FISH.filter((f) => this.caught[f.id] && !this.seen.has(f.id)).map((f) => f.id)
  }

  /** Le livre a été lu : plus rien de nouveau à signaler. */
  markSeen() {
    for (const id of Object.keys(this.caught)) this.seen.add(id)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]))
    } catch {
      // Stockage indisponible : le signal reviendra à la prochaine visite.
    }
  }

  /** Nombre d'espèces prises, sur le nombre d'espèces de l'étang. */
  get progress(): { caught: number; total: number } {
    return { caught: FISH.filter((f) => this.caught[f.id]).length, total: FISH.length }
  }

  has(id: string): boolean {
    return !!this.caught[id]
  }

  /** Lit la collection du site (sans effet pour un invité, ou si le site ne répond pas). */
  async load() {
    try {
      const res = await fetch(FISH_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
      if (!res.ok) return
      const data = (await res.json()) as { fish?: unknown }
      if (!data.fish) return
      this.caught = merge(sanitize(data.fish), this.local)
      this.onChange?.()
    } catch {
      // Site injoignable : on garde ce que ce navigateur connaît.
    }
  }

  /** Une prise : comptée tout de suite, puis inscrite au site (ou gardée dans ce navigateur). */
  async add(id: string, size: number): Promise<CatchResult> {
    const before = this.caught[id]
    const first = !before, record = !!before && size > before.best
    const count = (row: Caught | undefined): Caught => ({ count: (row?.count ?? 0) + 1, best: Math.max(row?.best ?? 0, size), first: row?.first ?? Math.floor(Date.now() / 1000) })
    this.caught = { ...this.caught, [id]: count(before) }
    this.onChange?.()
    let kept: CatchResult['kept'] = 'local'
    try {
      const res = await fetch(FISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fish: id, size }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.status === 401) kept = 'guest'
      else if (res.ok) {
        const data = (await res.json()) as { fish?: unknown }
        if (data.fish) {
          this.caught = merge(sanitize(data.fish), this.local)
          this.onChange?.()
          return { first, record, kept: 'site' }
        }
      }
    } catch {
      // Site injoignable : la prise reste dans ce navigateur.
    }
    this.local = { ...this.local, [id]: count(this.local[id]) }
    saveLocal(this.local)
    return { first, record, kept }
  }
}

/** La collection du joueur : une seule, pour le jeu, le livre et le catalogue des quartiers. */
export const fishCollection = new FishCollection()
export type { FishCollection }
