import { COOKIE, cookieValue } from './cmdr.js'

const MODELS = { 'site-card': 'card', 'site-badge': 'badge', 'adventure-poster': 'adv' }

export const hasSiteArtwork = (layout) => layout.items.some((i) => Object.hasOwn(MODELS, i.m))

/** The site confirms ownership before the relay shows earned artwork to guests. */
export async function siteArtworkAllowed(layout, cookie, cmdrUrl) {
  const items = layout.items.filter((i) => Object.hasOwn(MODELS, i.m))
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
 * l'équipe le sache.
 * @returns {Promise<{ earned: number, balance?: number, capped?: boolean } | null>} null : pas de gain (invité, site injoignable, déjà payé)
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
    if (data?.error === 'max') return { earned: 0, capped: true }
    if (!response.ok || data?.status !== 'success') {
      if (data?.error !== 'already') error(`[salvage] gain de la mission ${result.game} refusé par le site (${response.status} ${data?.error ?? ''})`)
      return null
    }
    return { earned: Number(data.earned) || 0, balance: Number(data.balance) || 0 }
  } catch (err) {
    error(`[salvage] site injoignable pour la mission ${result.game} (${err?.message ?? err})`)
    return null
  }
}
