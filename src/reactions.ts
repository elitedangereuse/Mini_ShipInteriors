import { tr } from './i18n'

/**
 * Réactions : un médaillon aux images du site qui s'envole au-dessus de la tête, sans bouger le
 * personnage (on peut réagir assis ou couché). Elles passent par le même message que les emotes.
 * Les images viennent d'elitedangereuse.fr (logo, cartes à collectionner, emblèmes des factions,
 * bannière Fuel Rats), recadrées en 96 px dans public/assets/reactions/.
 */
export interface Reaction {
  /** Identifiant envoyé aux autres joueurs, et commande du chat (/braben). */
  id: string
  /** Commande anglaise du chat, acceptée aussi. */
  en: string
  label: string
}

export const REACTIONS: Reaction[] = [
  { id: 'site', en: 'site', label: 'Élite Dangereuse' },
  { id: 'braben', en: 'braben', label: 'Braben' },
  { id: 'raxxla', en: 'raxxla', label: 'Raxxla' },
  { id: 'federation', en: 'federation', label: tr('Fédération', 'Federation') },
  { id: 'empire', en: 'empire', label: tr('Empire', 'Empire') },
  { id: 'alliance', en: 'alliance', label: 'Alliance' },
  { id: 'aegis', en: 'aegis', label: 'Aegis' },
  { id: 'fuel-rats', en: 'fuel-rats', label: 'Fuel Rats' },
]

export const reactionImage = (id: string) => `${import.meta.env.BASE_URL}assets/reactions/${id}.webp`

export const findReaction = (name: string) => REACTIONS.find((r) => r.id === name || r.en === name)
