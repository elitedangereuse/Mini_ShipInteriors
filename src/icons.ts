/**
 * Icônes du jeu : Phosphor Icons (https://phosphoricons.com, licence MIT).
 * Seuls les SVG importés ici finissent dans le build. Deux graisses :
 * « duotone » pour le contenu du jeu (emotes, espèces), « bold » pour les commandes.
 */

import alien from '@phosphor-icons/core/duotone/alien-duotone.svg?raw'
import armchair from '@phosphor-icons/core/duotone/armchair-duotone.svg?raw'
import confetti from '@phosphor-icons/core/duotone/confetti-duotone.svg?raw'
import discoBall from '@phosphor-icons/core/duotone/disco-ball-duotone.svg?raw'
import ghost from '@phosphor-icons/core/duotone/ghost-duotone.svg?raw'
import handWaving from '@phosphor-icons/core/duotone/hand-waving-duotone.svg?raw'
import heart from '@phosphor-icons/core/duotone/heart-duotone.svg?raw'
import moonStars from '@phosphor-icons/core/duotone/moon-stars-duotone.svg?raw'
import robot from '@phosphor-icons/core/duotone/robot-duotone.svg?raw'
import rocketLaunch from '@phosphor-icons/core/duotone/rocket-launch-duotone.svg?raw'
import thumbsDown from '@phosphor-icons/core/duotone/thumbs-down-duotone.svg?raw'
import thumbsUp from '@phosphor-icons/core/duotone/thumbs-up-duotone.svg?raw'
import user from '@phosphor-icons/core/duotone/user-duotone.svg?raw'

import arrowClockwise from '@phosphor-icons/core/bold/arrow-clockwise-bold.svg?raw'
import arrowCounterClockwise from '@phosphor-icons/core/bold/arrow-counter-clockwise-bold.svg?raw'
import arrowDown from '@phosphor-icons/core/bold/arrow-down-bold.svg?raw'
import arrowLeft from '@phosphor-icons/core/bold/arrow-left-bold.svg?raw'
import arrowRight from '@phosphor-icons/core/bold/arrow-right-bold.svg?raw'
import arrowUp from '@phosphor-icons/core/bold/arrow-up-bold.svg?raw'
import caretLeft from '@phosphor-icons/core/bold/caret-left-bold.svg?raw'
import caretRight from '@phosphor-icons/core/bold/caret-right-bold.svg?raw'
import genderFemale from '@phosphor-icons/core/bold/gender-female-bold.svg?raw'
import genderMale from '@phosphor-icons/core/bold/gender-male-bold.svg?raw'
import magnifyingGlassMinus from '@phosphor-icons/core/bold/magnifying-glass-minus-bold.svg?raw'
import magnifyingGlassPlus from '@phosphor-icons/core/bold/magnifying-glass-plus-bold.svg?raw'
import question from '@phosphor-icons/core/bold/question-bold.svg?raw'
import sealCheck from '@phosphor-icons/core/bold/seal-check-bold.svg?raw'
import speakerHigh from '@phosphor-icons/core/bold/speaker-high-bold.svg?raw'
import speakerLow from '@phosphor-icons/core/bold/speaker-low-bold.svg?raw'
import speakerSlash from '@phosphor-icons/core/bold/speaker-slash-bold.svg?raw'
import userSolo from '@phosphor-icons/core/bold/user-bold.svg?raw'
import usersThree from '@phosphor-icons/core/bold/users-three-bold.svg?raw'

const SVG = {
  // emotes
  'hand-waving': handWaving,
  'thumbs-up': thumbsUp,
  'thumbs-down': thumbsDown,
  confetti,
  'disco-ball': discoBall,
  armchair,
  'moon-stars': moonStars,
  heart,
  // espèces
  user,
  'rocket-launch': rocketLaunch,
  alien,
  robot,
  ghost,
  // commandes
  'arrow-clockwise': arrowClockwise,
  'arrow-counter-clockwise': arrowCounterClockwise,
  'arrow-up': arrowUp,
  'arrow-down': arrowDown,
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'caret-left': caretLeft,
  'caret-right': caretRight,
  'gender-female': genderFemale,
  'gender-male': genderMale,
  'magnifying-glass-plus': magnifyingGlassPlus,
  'magnifying-glass-minus': magnifyingGlassMinus,
  question,
  'seal-check': sealCheck,
  'speaker-high': speakerHigh,
  'speaker-low': speakerLow,
  'speaker-slash': speakerSlash,
  'user-solo': userSolo,
  'users-three': usersThree,
} as const

export type IconName = keyof typeof SVG

const template = document.createElement('template')

/** Élément <svg> prêt à insérer ; sa couleur suit `color` (currentColor) et sa taille `font-size`. */
export function icon(name: IconName, className = ''): SVGSVGElement {
  template.innerHTML = SVG[name]
  const svg = template.content.firstElementChild as SVGSVGElement
  svg.classList.add('icon')
  if (className) svg.classList.add(...className.split(' '))
  svg.setAttribute('aria-hidden', 'true')
  return svg
}

/** Remplace les `<i data-icon="nom">` du HTML statique par les icônes correspondantes. */
export function hydrateIcons(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('i[data-icon]')) {
    el.replaceWith(icon(el.dataset.icon as IconName, el.className))
  }
}
