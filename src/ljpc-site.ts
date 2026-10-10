import { EN } from './i18n'

/*
 * Ce que le site dit du labo du L.J.P.C. (cf. outils/mini-shipinteriors-ljpc.php, repo
 * elitedangereuselight), réservé à ses membres comme la pièce : la liste des membres, leur carte
 * de membre, et le Codex Galactique du CMDR (ses observations validées de la Chasse galactique).
 * Les écrans du labo (cf. src/furniture/ljpc-decor.ts) et son registre (cf. src/ljpc-panel.ts)
 * lisent tous deux ce module.
 */

export const LJPC_URL = '/outils/mini-shipinteriors-ljpc.php'

export interface LjpcMember {
  /** Identifiant du membre pour le jeu (le site garde son nom stocké). */
  id: string
  name: string
  /** Son profil sur le site. */
  url: string
  avatar: string
  /** Date de son adhésion, au calendrier d'Elite (jj/mm/aaaa). */
  since: string
  /** Sa carte de membre existe sur le site ; sinon, on écrit son nom sur la carte vierge. */
  card: boolean
  /** Ses observations validées de la Chasse galactique. */
  observations: number
}

export interface LjpcObservation {
  mission: string
  system: string
  body: string
  type: string
  /** Température de surface, en kelvins. */
  temperature: number | null
  /** Capture d'écran validée (chemin sur le site), si elle est à sa place. */
  image: string | null
  /** aaaa-mm-jj. */
  date: string
  /** La carte du système, sur EDGIS. */
  map: string
}

export interface LjpcData {
  /** Identifiant du CMDR connecté parmi les membres. */
  you: string
  /** Du plus ancien au plus récent : le rang dans la liste fait le numéro de membre. */
  members: LjpcMember[]
  /** null tant que la chasse n'est pas installée sur le site. */
  codex: LjpcObservation[] | null
  links: { codex: string; hunt: string; adventure: string }
}

/** `auth` : personne n'est connecté au site ; `member` : le CMDR n'est pas membre ; `unavailable` : le site ne répond pas. */
export type LjpcError = 'auth' | 'member' | 'unavailable'

/**
 * Ce que le labo sait du site. `revision` avance à chaque nouveauté (les données, une carte qui
 * finit de charger) : les écrans du labo se redessinent quand elle change.
 */
export const ljpc: { data: LjpcData | null; error: LjpcError | null; revision: number } = { data: null, error: null, revision: 0 }

let loadedAt = 0
let pending: Promise<LjpcData | LjpcError> | null = null

function valid(reply: unknown): reply is LjpcData & { status: string } {
  const r = reply as Partial<LjpcData> & { status?: string }
  return r?.status === 'success' && typeof r.you === 'string' && Array.isArray(r.members) && !!r.links
}

/** Le registre du labo ; une réponse sert deux minutes (`maxAge`, en millisecondes). */
export function loadLjpc(maxAge = 120000): Promise<LjpcData | LjpcError> {
  if (ljpc.data && Date.now() - loadedAt < maxAge) return Promise.resolve(ljpc.data)
  return (pending ??= fetch(LJPC_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    .then((res) => res.json())
    .then((reply: unknown): LjpcData | LjpcError => {
      if (valid(reply)) {
        ljpc.data = reply
        ljpc.error = null
        loadedAt = Date.now()
        ljpc.revision++
        return reply
      }
      const error = (reply as { error?: string })?.error
      return (ljpc.error = error === 'auth' || error === 'member' ? error : 'unavailable')
    })
    .catch((): LjpcError => (ljpc.error = 'unavailable'))
    .finally(() => {
      pending = null
      if (ljpc.error) ljpc.revision++
    }))
}

/** Le CMDR connecté, parmi les membres, et son numéro (son rang d'ancienneté). */
export function ljpcSelf(data: LjpcData): { member: LjpcMember; number: number } | null {
  const i = data.members.findIndex((m) => m.id === data.you)
  return i < 0 ? null : { member: data.members[i], number: i + 1 }
}

// ---------------------------------------------------------------- cartes de membre

/** La carte vierge, dans la langue du jeu. */
const BLANK = 'blank'
export const cardUrl = (id: string) => (id === BLANK ? `${LJPC_URL}?card=blank&lang=${EN ? 'en' : 'fr'}` : `${LJPC_URL}?card=${encodeURIComponent(id)}`)

/** Proportions d'une carte (700 × 400). */
export const CARD_RATIO = 7 / 4

const cards = new Map<string, Promise<HTMLImageElement | null>>()
const ready = new Map<string, HTMLImageElement>()

/** Image d'une carte (celle d'un membre, par son identifiant, ou la vierge), chargée une fois ; null si le site ne l'a pas. */
function cardImage(key: string): Promise<HTMLImageElement | null> {
  let load = cards.get(key)
  if (!load) {
    load = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => {
        ready.set(key, img)
        ljpc.revision++
        resolve(img)
      }
      img.onerror = () => resolve(null)
      img.src = cardUrl(key)
    })
    cards.set(key, load)
  }
  return load
}

/** L'image qui porte la carte de ce membre : la sienne, ou la vierge. */
const cardKey = (member: LjpcMember) => (member.card ? member.id : BLANK)

/** La carte de ce membre sera prête à dessiner (cf. drawCard) quand cette promesse se résout. */
export const cardReady = (member: LjpcMember) => cardImage(cardKey(member)).then(() => {})

/**
 * Dessine la carte de membre dans le rectangle (x, y, w, h) : celle que le site a générée, ou la
 * carte vierge avec le nom du CMDR à sa place. Tant que l'image charge, un carton gris ; elle
 * arrivera à un prochain dessin (`ljpc.revision` aura avancé).
 */
export function drawCard(g: CanvasRenderingContext2D, member: LjpcMember, x: number, y: number, w: number, h: number) {
  const key = cardKey(member)
  const img = ready.get(key)
  if (!img) {
    void cardImage(key)
    g.fillStyle = '#c9d2d6'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#1d2b3a'
    g.font = `700 ${Math.round(h * 0.11)}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`CMDR ${member.name}`, x + w / 2, y + h / 2, w * 0.9)
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    return
  }
  g.drawImage(img, x, y, w, h)
  if (member.card) return
  // Le nom, là où le site l'écrit sur la carte (300, 340 sur 700 × 400, cf. ljpc_member_card.php).
  g.fillStyle = '#000000'
  g.font = `700 ${Math.round(h * 0.062)}px system-ui, sans-serif`
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillText(member.name, x + w * (300 / 700), y + h * (340 / 400), w * 0.52)
}

// ---------------------------------------------------------------- corps célestes

/** Couleur d'un corps du Codex d'après son type (libellé du site, en anglais) : pour ses pastilles et ses hologrammes. */
export function bodyColor(type: string): string {
  if (/black hole/i.test(type)) return '#b98cff'
  if (/neutron|white dwarf/i.test(type)) return '#cfe6ff'
  if (/star|dwarf|tauri/i.test(type)) return '#ffd66b'
  if (/earth|water/i.test(type)) return '#5fb8ff'
  if (/ammonia/i.test(type)) return '#d9b26a'
  if (/gas|giant/i.test(type)) return '#ff9a6b'
  if (/ic[ey]/i.test(type)) return '#cfefff'
  if (/metal|rock/i.test(type)) return '#c9a58a'
  return '#57e6c1'
}
