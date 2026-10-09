import { EN } from '../i18n'

/*
 * Les Cartes Dangereuses du site, vues du jeu (cf. outils/mini-shipinteriors-cards.php, repo
 * elitedangereuselight) : les boosters en circulation, ceux du CMDR, la boutique du Comptoir. Le
 * site tient les comptes : le jeu demande, le site vérifie et écrit. L'ouverture d'un booster passe
 * par l'endpoint de la page Cartes du site : même tirage, mêmes événements.
 */

const CARDS_URL = '/outils/mini-shipinteriors-cards.php'
const OPEN_URL = '/phputils/cartes/get_booster.php'
/** Langue des visuels de cartes : le français, ou l'anglais pour toutes les autres. */
const LANG = EN ? 'en' : 'fr'

export type Rarity = 'c' | 'r' | 'u' | 'm'

/** Un booster en circulation : sa collection, et où le CMDR en est. */
export interface BoosterInfo {
  slug: string
  title: string
  /** Cartes par ouverture. */
  cards: number
  /** Cartes de la collection, et celles (différentes) que le CMDR possède. */
  total: number
  owned: number
  featured: boolean
}

export interface CardRef {
  key: string
  rarity: Rarity
}

/** La boutique : le prix de chaque booster de la semaine, dans l'ordre, et ceux déjà achetés. */
export interface ShopInfo {
  prices: number[]
  bought: number
  /** Date (secondes Unix) du retour du stock. */
  reset: number
}

export interface CardsInfo {
  /** Invité : pas de collection, rien à ouvrir ni à acheter. */
  guest: boolean
  /** Boosters à ouvrir. */
  boosters: number
  /** Site de développement : les boosters n'y sont pas décomptés. */
  unlimited: boolean
  registry: BoosterInfo[]
  /** Cartes rares du jour, pour les vitrines de la pièce. */
  showcase: CardRef[]
  /** null : la boutique n'est pas ouverte (ancien build du jeu côté site). */
  shop: ShopInfo | null
}

/** Couverture d'un booster : 256 px de large, ou 512 (`large`) pour le sachet présenté en grand. */
export const coverUrl = (slug: string, large = false) => `${CARDS_URL}?cover=${encodeURIComponent(slug)}${large ? '&w=512' : ''}`
/** Le dos des cartes du site (256 px de large, ou 512). */
export const backUrl = (large = false) => `${CARDS_URL}?back=1${large ? '&w=512' : ''}`

/**
 * Bruits de cartes : ceux de Galactic Clash, sur le site (une carte posée, choisie, retournée
 * avec éclat). `volume` : de 0 à 1.
 */
export type CardSound = 'card-place' | 'card-select' | 'card-capture'
const SOUNDS_URL = '/assets/audios/galactic_clash/tt/'
const sounds = new Map<CardSound, HTMLAudioElement>()
export function cardSound(name: CardSound, volume: number) {
  if (volume <= 0 || typeof Audio === 'undefined') return
  let source = sounds.get(name)
  if (!source) sounds.set(name, (source = new Audio(`${SOUNDS_URL}${name}.mp3`)))
  // Une copie par coup : deux cartes retournées coup sur coup se font entendre toutes les deux.
  const shot = source.cloneNode() as HTMLAudioElement
  shot.volume = Math.min(1, volume)
  void shot.play().catch(() => {})
}
/** Visuel d'une carte : sa vignette (352 px de large), ou le plein format. */
export const cardUrl = (key: string, full = false) => `/assets/images/cartes/${LANG}/${encodeURIComponent(key)}${full ? '' : '.thumb'}.webp`

const rarity = (r: unknown): Rarity => (r === 'r' || r === 'u' || r === 'm' ? r : 'c')
const count = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0))

function parse(data: Record<string, unknown>): CardsInfo {
  const list = <T>(v: unknown, read: (o: Record<string, unknown>) => T | null): T[] =>
    (Array.isArray(v) ? v : []).flatMap((o) => { const r = o && typeof o === 'object' ? read(o as Record<string, unknown>) : null; return r ? [r] : [] })
  const shop = data.shop as Record<string, unknown> | null | undefined
  const prices = Array.isArray(shop?.prices) ? shop.prices.map(count).filter((p) => p > 0) : []
  return {
    guest: data.boosters === null || data.boosters === undefined,
    boosters: count(data.boosters),
    unlimited: data.unlimited === true,
    registry: list(data.registry, (b) => typeof b.slug === 'string' && b.slug
      ? { slug: b.slug, title: typeof b.title === 'string' && b.title ? b.title : b.slug, cards: count(b.cards) || 4, total: count(b.total), owned: count(b.owned), featured: b.featured === true }
      : null),
    showcase: list(data.showcase, (c) => (typeof c.key === 'string' && c.key ? { key: c.key, rarity: rarity(c.rarity) } : null)),
    shop: prices.length ? { prices, bought: Math.min(count(shop?.bought), prices.length), reset: count(shop?.reset) } : null,
  }
}

async function request(url: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...init?.headers }, signal: controller.signal })
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: response.ok, data: data && typeof data === 'object' ? data : null }
  } catch {
    return { ok: false, data: null }
  } finally {
    clearTimeout(timeout)
  }
}

let last: CardsInfo | null = null
let pending: Promise<CardsInfo | null> | null = null

/**
 * L'état des cartes du CMDR, tel que le site le donne ; null s'il ne répond pas. Sans `fresh`, la
 * dernière réponse sert de nouveau (le décor de la pièce n'a besoin que des boosters en circulation).
 */
export function cardsInfo(fresh = false): Promise<CardsInfo | null> {
  if (!fresh && last) return Promise.resolve(last)
  pending ??= request(`${CARDS_URL}?lang=${LANG}`).then(({ ok, data }) => {
    if (ok && data?.status === 'success') last = parse(data)
    return ok && data?.status === 'success' ? last : null
  }).finally(() => { pending = null })
  return pending
}

export type BuyRefusal = 'funds' | 'max' | 'guest' | 'offline'

/** Achète un booster au Comptoir, contre des crédits du jeu. */
export async function buyBooster(): Promise<{ ok: true; info: CardsInfo; balance: number; price: number } | { ok: false; reason: BuyRefusal; balance?: number }> {
  const { data } = await request(`${CARDS_URL}?lang=${LANG}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'buy' }) })
  const balance = typeof data?.balance === 'number' ? data.balance : undefined
  if (data?.status !== 'success') {
    const reason = data?.error === 'funds' || data?.error === 'max' ? data.error : data?.error === 'auth' ? 'guest' : 'offline'
    return { ok: false, reason, balance }
  }
  last = parse(data)
  return { ok: true, info: last, balance: balance ?? 0, price: count(data.price) }
}

/** Ouvre un booster de la collection `slug` : les cartes tirées, et les boosters qui restent. */
export async function openBooster(slug: string): Promise<{ cards: CardRef[]; boosters: number } | null> {
  const { data } = await request(OPEN_URL, { method: 'POST', body: new URLSearchParams({ lang: EN ? 'en_US' : 'fr_FR', booster_slug: slug }) })
  if (data?.status !== 'success' || !Array.isArray(data.cards)) return null
  const cards = (data.cards as Record<string, unknown>[]).flatMap((c) => (typeof c?.key === 'string' ? [{ key: c.key, rarity: rarity(c.rarity) }] : []))
  const boosters = count(data.boosters)
  if (last) last = { ...last, boosters: last.unlimited ? last.boosters : boosters, registry: last.registry }
  return { cards, boosters }
}
