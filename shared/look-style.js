// Style du Holo-Me (coiffure, couleur des cheveux, expression, couleurs de la combinaison) : les
// identifiants admis, partagés par le jeu (src/looks.ts) et le relais (server/relay.js), qui refuse
// toute autre valeur.
//
// Le style s'écrit en dernier segment de l'apparence, cinq champs séparés par des tirets, vides
// quand on garde ceux du modèle : « human.female.b.mo-pk-sm-- », « suit.male.c.flight.--se-nv-yl ».
// Une apparence sans style (toutes celles d'avant) reste valide telle quelle.

/** Coupes : la tête d'un autre Mini Character (« fb » : femme b…), ou une coupe faite main. */
export const HAIR_STYLES = ['fb', 'fc', 'fd', 'fe', 'ff', 'ma', 'mb', 'mc', 'md', 'me', 'mf', 'sh', 'mo', 'bu', 'po']
export const HAIR_COLORS = ['bk', 'br', 'rx', 'bd', 'pl', 'gy', 'bl', 'pk']
/** Expressions portées en permanence (les emotes en jouent d'autres, le temps d'un geste). */
export const FACES = ['sm', 'se', 'su', 'ma']
export const SUIT_PAINTS = ['bk', 'gp', 'wh', 'rd', 'or', 'yl', 'gn', 'kk', 'bl', 'nv', 'vi', 'pk']
export const SUIT_TRIMS = ['or', 'rd', 'cy', 'gn', 'yl', 'wh']

const FIELDS = [
  ['hair', HAIR_STYLES],
  ['hairColor', HAIR_COLORS],
  ['face', FACES],
  ['paint', SUIT_PAINTS],
  ['trim', SUIT_TRIMS],
]

/** Style par défaut : tout comme le modèle. */
export const NO_STYLE = Object.freeze({ hair: '', hairColor: '', face: '', paint: '', trim: '' })

/** Un segment d'apparence est-il un style ? (Ni les races, ni les modèles, ni les teintes n'ont de tiret.) */
export const isStyleSegment = (s) => typeof s === 'string' && s.includes('-')

/** Lit un segment de style ; null s'il est mal formé ou contient une valeur inconnue. */
export function parseStyle(segment) {
  if (!isStyleSegment(segment)) return null
  const parts = segment.split('-')
  if (parts.length !== FIELDS.length) return null
  const style = { ...NO_STYLE }
  for (const [i, [key, ids]] of FIELDS.entries()) {
    if (parts[i] && !ids.includes(parts[i])) return null
    style[key] = parts[i]
  }
  return style
}

/** Segment d'un style, ou '' s'il n'y a rien à écrire. Les valeurs inconnues sont ignorées. */
export function styleSegment(style) {
  const parts = FIELDS.map(([key, ids]) => (ids.includes(style?.[key]) ? style[key] : ''))
  return parts.some(Boolean) ? parts.join('-') : ''
}

/** Longueur maximale d'une apparence (la plus longue fait 38 caractères). */
export const MAX_LOOK = 48
const BASE = /^[a-z]+(\.[a-z0-9]+){1,3}$/

/**
 * Apparence acceptable par le relais : une base (« race.sexe.modèle.teinte », sans tiret), puis au
 * plus un style dont chaque champ est connu. La base n'est pas vérifiée plus avant : le jeu
 * retombe sur un modèle par défaut s'il ne la connaît pas.
 */
export function validLook(s) {
  if (typeof s !== 'string' || s.length > MAX_LOOK) return false
  const parts = s.split('.')
  if (isStyleSegment(parts[parts.length - 1])) {
    const style = parts.pop()
    if (!parseStyle(style) || !styleSegment(parseStyle(style))) return false
  }
  return BASE.test(parts.join('.'))
}
