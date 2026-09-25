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

/**
 * Endpoint du site qui dit quel CMDR est connecté (outils/mini-shipinteriors-cmdr.php dans le repo
 * elitedangereuselight). Le jeu est servi sur le même domaine que le site : le cookie
 * ED_LOGGED_CMDR_ID part tout seul avec la requête. Surcharge possible au build :
 * VITE_ED_CMDR_URL=… npm run build
 */
const CMDR_URL = import.meta.env.VITE_ED_CMDR_URL || '/outils/mini-shipinteriors-cmdr.php'

/** Dev uniquement : ?cmdr=Nom simule un CMDR connecté (le relais de dev accepte ce nom tel quel). */
export function devCmdr(): string | undefined {
  if (!import.meta.env.DEV) return undefined
  return new URLSearchParams(location.search).get('cmdr')?.trim().slice(0, 40) || undefined
}

/**
 * Nom du CMDR connecté au site (sans le préfixe « CMDR »), ou null (invité, site injoignable).
 * Sert à l'affichage : c'est le relais, en faisant reconnaître le cookie par le site, qui
 * décide du nom et de la marque « vérifié ».
 */
export async function fetchCmdrAccount(timeoutMs = 3000): Promise<string | null> {
  const simulated = devCmdr()
  if (simulated) return simulated
  try {
    const res = await fetch(CMDR_URL, { credentials: 'same-origin', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const data = (await res.json()) as { cmdr?: string | null }
    return typeof data.cmdr === 'string' && data.cmdr.trim() ? data.cmdr.trim() : null
  } catch {
    return null
  }
}
