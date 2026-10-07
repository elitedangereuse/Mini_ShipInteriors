import { COOKIE, cookieValue } from './cmdr.js'
import { knownQuests } from '../shared/quests.js'

const MODELS = { 'site-card': 'card', 'site-badge': 'badge', 'adventure-poster': 'adv' }

/** Objets d'un aménagement : ceux des quartiers, et ceux de la parcelle (housing v2). */
const itemsOf = (layout) => [...layout.items, ...(layout.home?.items ?? [])]

export const hasSiteArtwork = (layout) => itemsOf(layout).some((i) => Object.hasOwn(MODELS, i.m))

/** The site confirms ownership before the relay shows earned artwork to guests. */
export async function siteArtworkAllowed(layout, cookie, cmdrUrl) {
  const items = itemsOf(layout).filter((i) => Object.hasOwn(MODELS, i.m))
  if (!items.length) return true
  const value = cookieValue(cookie)
  if (!cmdrUrl || !value) return false
  try {
    const url = new URL('/outils/mini-shipinteriors-site.php?ownership=1', cmdrUrl)
    const response = await fetch(url, {
      headers: { Cookie: `${COOKIE}=${value}`, Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error',
    })
    if (!response.ok) return false
    const data = await response.json()
    if (data.status !== 'success' || !Array.isArray(data.art)) return false
    const owned = new Map(data.art.map((a) => [a.id, a.kind]))
    return items.every((i) => owned.get(i.v) === MODELS[i.m])
  } catch { return false }
}

/**
 * Résultat d'une mission de récupération (zone thargoïde) gagnée, pour un membre CMDR : le site
 * reconnaît le CMDR par son cookie, et le relais par la clé partagée (MSI_RELAY_SECRET des deux
 * côtés) ; il paie une fois par partie et par CMDR, et compte la victoire au classement.
 * Au-delà des missions payées du jour, le site répond `max` : on le rend (`capped`) pour que
 * l'équipe le sache. La victoire rapporte aussi, sur le site, les boosters de cartes de la semaine
 * (`boosters`, à la première victoire de la semaine) et le badge de la zone (`badge`, à la toute
 * première) : payée ou non, on les rend avec.
 * @returns {Promise<{ earned: number, balance?: number, capped?: boolean, boosters: number, badge: boolean } | null>} null : pas de gain (invité, site injoignable, déjà payé)
 */
export async function postSalvageResult(cookie, result, { cmdrUrl, secret, error = console.error, fetcher = fetch, timeoutMs = 8000 }) {
  const value = cookieValue(cookie)
  if (!cmdrUrl || !value) return null
  if (!secret) {
    error('[salvage] MSI_RELAY_SECRET absent : les gains des missions ne peuvent pas être enregistrés.')
    return null
  }
  try {
    const url = new URL('/outils/mini-shipinteriors-salvage.php', cmdrUrl)
    const response = await fetcher(url, {
      method: 'POST',
      headers: { Cookie: `${COOKIE}=${value}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Relay-Key': secret },
      body: JSON.stringify(result),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await response.json().catch(() => null)
    const site = { boosters: Math.max(0, Math.floor(Number(data?.boosters) || 0)), badge: typeof data?.badge === 'string' && data.badge !== '' }
    if (data?.error === 'max') return { earned: 0, capped: true, ...site }
    if (!response.ok || data?.status !== 'success') {
      if (data?.error !== 'already') error(`[salvage] gain de la mission ${result.game} refusé par le site (${response.status} ${data?.error ?? ''})`)
      return null
    }
    return { earned: Number(data.earned) || 0, balance: Number(data.balance) || 0, ...site }
  } catch (err) {
    error(`[salvage] site injoignable pour la mission ${result.game} (${err?.message ?? err})`)
    return null
  }
}

/**
 * Un CMDR est entré Chez Jacques par les conduits de ventilation : le site lui décerne le badge du
 * bar, qui en fait un habitué pour de bon (cf. mini-shipinteriors-bar.php). Le site reconnaît le
 * CMDR par son cookie, et le relais par la clé partagée (MSI_RELAY_SECRET).
 * @returns {Promise<'new' | 'had' | null>} 'new' : badge décerné ; 'had' : il l'avait déjà ; null : rien d'enregistré
 */
export async function postBarRegular(cookie, { cmdrUrl, secret, error = console.error, fetcher = fetch, timeoutMs = 8000 }) {
  const value = cookieValue(cookie)
  if (!cmdrUrl || !value) return null
  if (!secret) {
    error('[bar] MSI_RELAY_SECRET absent : le badge de Chez Jacques ne peut pas être décerné.')
    return null
  }
  try {
    const response = await fetcher(new URL('/outils/mini-shipinteriors-bar.php', cmdrUrl), {
      method: 'POST',
      headers: { Cookie: `${COOKIE}=${value}`, Accept: 'application/json', 'X-Relay-Key': secret },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.status !== 'success') {
      error(`[bar] badge de Chez Jacques refusé par le site (${response.status} ${data?.error ?? ''})`)
      return null
    }
    // Badges du jeu coupés côté site (avant sa sortie) : rien n'est noté, l'accès vaut pour la session.
    if (data.off === true) return null
    return data.granted === true ? 'new' : 'had'
  } catch (err) {
    error(`[bar] site injoignable pour le badge de Chez Jacques (${err?.message ?? err})`)
    return null
  }
}

/**
 * Quartiers ouverts d'un CMDR absent (nom sous sa forme stockée, donnée par l'annuaire du site) :
 * son nom à afficher et son aménagement tel que le site le garde, ou null s'ils sont fermés (ou
 * si le site ne répond pas). Sans cookie : des quartiers ouverts le sont pour tout le monde.
 * @returns {Promise<{ name: string, layout: unknown } | null>}
 */
export async function fetchQuarters(stored, { cmdrUrl, fetcher = fetch, timeoutMs = 5000 }) {
  if (!cmdrUrl) return null
  try {
    const url = new URL('/outils/mini-shipinteriors-crew.php', cmdrUrl)
    url.searchParams.set('quarters', stored)
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
    if (!response.ok) return null
    const data = await response.json()
    return data?.status === 'success' && typeof data.name === 'string' && data.name ? { name: data.name, layout: data.cabin } : null
  } catch { return null }
}

/**
 * Quêtes terminées d'un CMDR (cf. shared/quests.js), telles que le site les garde
 * (outils/mini-shipinteriors-quests.php) : elles ouvrent des pièces du vaisseau. Le relais le
 * redemande quand un joueur dit en avoir terminé une : c'est le site qui fait foi, pas le client.
 * @returns {Promise<string[] | null>} null : le site ne sait pas le dire (invité, site injoignable, table absente)
 */
export async function fetchQuestsDone(cookie, { cmdrUrl, fetcher = fetch, timeoutMs = 5000 }) {
  const value = cookieValue(cookie)
  if (!cmdrUrl || !value) return null
  try {
    const response = await fetcher(new URL('/outils/mini-shipinteriors-quests.php', cmdrUrl), {
      headers: { Cookie: `${COOKIE}=${value}`, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    })
    if (!response.ok) return null
    const data = await response.json()
    if (data?.status !== 'success' || !data.quests || typeof data.quests !== 'object') return null
    return knownQuests(Object.keys(data.quests).filter((id) => data.quests[id]?.done === true))
  } catch { return null }
}
