/*
 * Annuaire des joueurs, tenu par le site (outils/mini-shipinteriors-crew.php, repo
 * elitedangereuselight) : ceux qui ont déjà lancé le jeu, leurs quartiers ouverts ou non, et nos
 * conversations. Entre CMDR, les chuchotements sont gardés par le site : le destinataire les lit
 * aussitôt s'il est à bord (le relais le prévient), sinon à son retour. Le jeu est servi sur le
 * domaine du site : le cookie du CMDR accompagne la requête. Sans le site (serveur de dev sans
 * Docker, panne), l'annuaire se réduit à ceux qui sont à bord.
 * Surcharge possible au build : VITE_ED_CREW_URL=… npm run build
 */

const CREW_URL = import.meta.env.VITE_ED_CREW_URL || '/outils/mini-shipinteriors-crew.php'

/** Un joueur de l'annuaire : `id` le désigne auprès du site et du relais, `name` s'affiche. */
export interface CrewMember {
  id: string
  name: string
  open: boolean
  /** Dernière fois qu'on l'a vu en jeu (timestamp Unix). */
  seen: number
}

/**
 * Un chuchotement gardé par le site, reçu ou envoyé (`mine`) ; `key` et `name` : l'autre CMDR
 * (son identifiant dans l'annuaire, son nom) ; `read` : son destinataire l'a lu.
 */
export interface Letter {
  id: number
  key: string
  name: string
  mine: boolean
  text: string
  at: number
  read: boolean
}

export interface CrewDirectory {
  players: CrewMember[]
  /** null : invité, ou messages indisponibles. */
  messages: Letter[] | null
}

/** Pourquoi un message n'est pas parti (cf. msi_message_send), ou `unavailable` si le site ne répond pas. */
export type LetterRefusal = 'auth' | 'self' | 'unknown' | 'pending' | 'full' | 'busy' | 'format' | 'unavailable'

async function post(body: object): Promise<{ status?: string; error?: string } | null> {
  try {
    const res = await fetch(CREW_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    return (await res.json()) as { status?: string; error?: string }
  } catch {
    return null
  }
}

/** L'annuaire et nos conversations, ou null si le site ne répond pas. */
export async function fetchCrew(): Promise<CrewDirectory | null> {
  try {
    const res = await fetch(CREW_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: string; players?: CrewMember[]; messages?: Letter[] | null }
    if (data.status !== 'success' || !Array.isArray(data.players)) return null
    return { players: data.players, messages: Array.isArray(data.messages) ? data.messages : null }
  } catch {
    return null
  }
}

/** Chuchote à un CMDR, à bord ou non : null si c'est parti, sinon pourquoi pas. */
export async function sendLetter(to: string, text: string): Promise<LetterRefusal | null> {
  const reply = await post({ to, text })
  if (reply?.status === 'success') return null
  return (reply?.error as LetterRefusal | undefined) ?? 'unavailable'
}

/** La conversation avec ce CMDR est à l'écran : ce qu'il nous a écrit est lu. */
export const markLettersRead = (key: string) => void post({ read: key })

/** Efface un message de nos conversations : true si le site l'a fait. */
export const deleteLetter = async (id: number) => (await post({ delete: [id] }))?.status === 'success'
