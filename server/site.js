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
