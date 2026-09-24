/**
 * Identité du joueur : CMDR de l'Élite Dangereuse s'il est connecté au site,
 * sinon un CMDR invité au nom tiré d'une figure célèbre de la science-fiction.
 */

/** Commandants, capitaines et pilotes célèbres de la SF (romans, films, séries, jeux). */
export const SF_NAMES = [
  'Jameson', // le CMDR par défaut d'Elite (1984)
  'Ripley', 'Dallas', 'Hicks', 'Vasquez', 'Bishop',
  'Kirk', 'Picard', 'Janeway', 'Sisko', 'Archer', 'Pike', 'Burnham', 'Riker', 'Spock', 'Uhura', 'Sulu', 'Worf',
  'Solo', 'Skywalker', 'Organa', 'Ackbar', 'Thrawn', 'Andor',
  'Adama', 'Starbuck', 'Apollo', 'Roslin',
  'Shepard', 'Vakarian', 'Anderson', 'Joker',
  'Holden', 'Nagata', 'Avasarala', 'Draper',
  'Reynolds', 'Washburne',
  'Sheridan', 'Ivanova', 'Sinclair',
  "O'Neill", 'Carter', 'Sheppard',
  'Wiggin', 'Atreides', 'Deckard', 'Cooper', 'Brand',
  'Albator', 'Actarus', 'Ulysse', 'Valérian', 'Laureline',
  'Leela', 'Brannigan', 'Lister', 'Rimmer', 'Beeblebrox', 'Prefect',
  'Raynor', 'Kerrigan', 'Keyes', 'Quill', 'Riddick', 'Crichton',
]

export function randomCmdrName(): string {
  return `CMDR ${SF_NAMES[Math.floor(Math.random() * SF_NAMES.length)]}`
}

/** Anciennes valeurs par défaut (avant les noms de CMDR) : à régénérer. */
export function isLegacyDefaultName(name: string): boolean {
  return /^Cadet-\d+$/.test(name)
}

export interface CmdrAccount {
  /** Nom du CMDR tel qu'affiché sur le site (sans le préfixe « CMDR »). */
  cmdr: string
  /** Billet signé par le site, vérifié par le relais multijoueur. */
  ticket: string
}

/**
 * Adresse de l'endpoint du site qui délivre le billet (integration/elitedangereuse/).
 * Surcharge possible au build : VITE_ED_TICKET_URL=… npm run build
 */
function ticketUrl(): string | null {
  const params = new URLSearchParams(location.search)
  // Dev : ?cmdr=Nom simule un CMDR connecté (billet signé par le serveur de dev).
  if (import.meta.env.DEV && params.get('cmdr')) return `/dev/ticket?name=${encodeURIComponent(params.get('cmdr')!)}`
  if (import.meta.env.VITE_ED_TICKET_URL) return import.meta.env.VITE_ED_TICKET_URL
  if (location.hostname.endsWith('.elitedangereuse.fr')) return 'https://elitedangereuse.fr/mini-interior-ticket.php'
  return null
}

/** CMDR connecté au site, ou null (invité, site injoignable, hors elitedangereuse.fr). */
export async function fetchCmdrAccount(timeoutMs = 3000): Promise<CmdrAccount | null> {
  const url = ticketUrl()
  if (!url) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // credentials: le cookie ED_LOGGED_CMDR_ID du site part avec la requête (même site).
    const res = await fetch(url, { credentials: 'include', signal: ctrl.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { cmdr?: string | null; ticket?: string }
    return data.cmdr && data.ticket ? { cmdr: data.cmdr, ticket: data.ticket } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
