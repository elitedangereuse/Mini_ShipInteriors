import { tr } from './i18n'

/**
 * Réactions : un médaillon aux images du site qui s'envole au-dessus de la tête, sans bouger le
 * personnage (on peut réagir assis ou couché). Elles passent par le même message que les emotes.
 * Les images viennent d'elitedangereuse.fr (cartes à collectionner, icônes du lore, logo),
 * recadrées en 96 px dans public/assets/reactions/.
 */
export interface Reaction {
  /** Identifiant envoyé aux autres joueurs, et commande du chat (/braben). */
  id: string
  /** Commande anglaise du chat, acceptée aussi. */
  en: string
  label: string
}

export const REACTIONS: Reaction[] = [
  { id: 'braben', en: 'braben', label: 'Braben' },
  { id: 'raxxla', en: 'raxxla', label: 'Raxxla' },
  { id: 'thargoides', en: 'thargoids', label: tr('Thargoïdes', 'Thargoids') },
  { id: 'gardiens', en: 'guardians', label: tr('Gardiens', 'Guardians') },
  { id: 'dark-wheel', en: 'dark-wheel', label: 'Dark Wheel' },
  { id: 'pilotes', en: 'pilots', label: tr('Fédération des pilotes', "Pilots' Federation") },
  { id: 'fuel-rats', en: 'fuel-rats', label: 'Fuel Rats' },
  { id: 'site', en: 'site', label: 'Élite Dangereuse' },
]

export const reactionImage = (id: string) => `${import.meta.env.BASE_URL}assets/reactions/${id}.webp`

export const findReaction = (name: string) => REACTIONS.find((r) => r.id === name || r.en === name)
