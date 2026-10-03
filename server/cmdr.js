// Identité des joueurs connectés à elitedangereuse.fr.
//
// Le jeu est servi sur le même domaine que le site : la poignée de main socket.io emporte le
// cookie ED_LOGGED_CMDR_ID du site. Ce cookie est un jeton opaque (cmdr.cmdr_id en base) : le
// relais ne sait pas le lire, il le transmet à un endpoint du site
// (outils/mini-shipinteriors-cmdr.php dans le repo elitedangereuselight), qui répond par le nom
// visible du CMDR. Le serveur du jeu n'a donc jamais accès à la base, et le nom ne vient jamais
// de ce que le client prétend.
//
// L'adresse de l'endpoint est fixée par la configuration (variable ED_CMDR_URL), jamais déduite
// de la requête : un en-tête Host choisi par le client ferait désigner un faux site, qui pourrait
// répondre le nom de n'importe quel CMDR.

export const COOKIE = 'ED_LOGGED_CMDR_ID'
const MAX_NAME = 40

/** Valeur du cookie du site dans un en-tête Cookie, ou null. */
export function cookieValue(header, name = COOKIE) {
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim()
      return value && value.length <= 256 ? value : null
    }
  }
  return null
}

/** Nom de CMDR présentable (sans caractères de contrôle, longueur bornée), ou null. */
export function cleanCmdrName(name) {
  if (typeof name !== 'string') return null
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME)
  return clean || null
}

/**
 * Demande au site quel CMDR porte ce cookie.
 * @returns {Promise<{name: string, ljpc: boolean, voie: boolean, bar: boolean} | null>} identité vérifiée, ou null (invité, site injoignable)
 */
export async function cmdrIdentityFromCookie(cookieHeader, { url, timeoutMs = 3000, error = console.error } = {}) {
  const value = cookieValue(cookieHeader)
  // Sans cookie, inutile d'interroger le site : c'est un invité. (En local, le site connecte
  // d'office tout visiteur : il répondrait un CMDR même pour une requête sans cookie.)
  if (!value || !url) return null
  try {
    const res = await fetch(url, {
      // Seul le cookie du site part : pas les autres cookies du navigateur.
      headers: { Cookie: `${COOKIE}=${value}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      error(`[relais] identité : le site a répondu ${res.status}, joueur traité en invité`)
      return null
    }
    const data = await res.json()
    const name = cleanCmdrName(data?.cmdr)
    return name ? { name, ljpc: data?.ljpc === true, voie: data?.voie === true, bar: data?.bar === true } : null
  } catch (err) {
    error(`[relais] identité : site injoignable (${err?.message ?? err}), joueur traité en invité`)
    return null
  }
}

/** Ancien appelant : seul le nom visible lui est utile. */
export async function cmdrFromCookie(cookieHeader, options) {
  return (await cmdrIdentityFromCookie(cookieHeader, options))?.name ?? null
}
