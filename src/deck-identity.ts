import { tr } from './i18n'
import type { IconName } from './icons'

/*
 * L'identité de chaque pont : un thème qu'on comprend en arrivant. Sa devise, sa couleur et son
 * pictogramme reviennent partout où le pont apparaît (totem du téléporteur, enseignes, menu du
 * téléporteur, nom du pont à l'écran, annonce du trajet), et ses lieux, rangés en parcours, font
 * l'annuaire de son totem et la recherche « Où aller ? » du téléporteur.
 */

/** Un lieu du pont, tel que le totem et la recherche le donnent : son nom, le point vers lequel le totem le montre, ses mots-clés. */
export interface DeckPlace {
  name: string
  to: { x: number; z: number }
  /** Ce qu'on peut taper pour le trouver (sans accents, en minuscules), en plus de son nom. */
  keywords: string
}

export interface DeckIdentity {
  /** Ce qu'on fait sur ce pont, en deux ou trois mots. */
  tagline: string
  /** Couleur du pont : totems, enseignes, menu du téléporteur. */
  color: string
  icon: IconName
  places: DeckPlace[]
}

const DECKS: Record<string, DeckIdentity> = {
  '2': {
    tagline: tr('Chez soi', 'Home'),
    color: '#b39bff',
    icon: 'house',
    places: [
      { name: tr('Vos quartiers', 'Your quarters'), to: { x: 11.6, z: 5 }, keywords: 'quartiers maison chez moi cabine holo-me apparence garde-robe deco decoration meubles compagnons chat chien collection trophees' },
      { name: tr('Votre profil sur le site', 'Your profile on the site'), to: { x: 11.4, z: 3.4 }, keywords: 'profil site carte cmdr progression badges' },
    ],
  },
  '1': {
    tagline: tr('Culture & détente', 'Culture & leisure'),
    color: '#5fd3a0',
    icon: 'books',
    places: [
      { name: tr('Grande bibliothèque', 'Great library'), to: { x: 22.5, z: 10.8 }, keywords: 'bibliotheque lore livres lore explorer empire federation alliance thargoides gardiens raxxla salome dark wheel' },
      { name: tr('Planétarium · serre · classe', 'Planetarium · greenhouse · classroom'), to: { x: 15, z: 7.5 }, keywords: 'planetarium bugenhagen etoiles edgis systemes serre jardin jardinage peche etang poisson capucine classe quiz kepler' },
      { name: tr('Salon d\'écoute · Radio Dangereuse', 'Listening lounge · Radio Dangereuse'), to: { x: 18, z: 8.6 }, keywords: 'salon ecoute radio dangereuse podcast studio emission galeres galactiques' },
      { name: tr('Cinéma', 'Cinema'), to: { x: 21.5, z: 8.6 }, keywords: 'cinema film seance ecran twitch foyer' },
      { name: tr('Comptoir des Cartes', 'Card counter'), to: { x: 29.6, z: 9.5 }, keywords: 'cartes dangereuses comptoir boosters galactic clash collection ludo' },
    ],
  },
  '0': {
    tagline: tr('Cœur communautaire', 'Community heart'),
    color: '#ff8a1f',
    icon: 'users-three',
    places: [
      { name: tr('Weekly · Chasse galactique', 'Weekly · Galactic Hunt'), to: { x: 4, z: 11.8 }, keywords: 'weekly chasse galactique ljpc credits recompenses bureaux boutiques' },
      { name: tr('Mezzanine · jukebox', 'Mezzanine · jukebox'), to: { x: 3.6, z: 6.5 }, keywords: 'mezzanine jukebox musique salon en direct' },
      { name: tr('Infirmerie · toilettes · mess', 'Medical bay · restrooms · mess'), to: { x: 8.6, z: 4.5 }, keywords: 'infirmerie betty soins toilettes wc mess cantine marcel manger mess rush cuisine' },
      { name: tr('Arcade · Mini-CQC · Pixel War', 'Arcade · Mini-CQC · Pixel War'), to: { x: 8.6, z: 4.5 }, keywords: 'arcade bornes jeux mini-cqc cqc pixel war flipper peluches echecs dames' },
      { name: tr('Labo du L.J.P.C.', 'L.J.P.C. lab'), to: { x: 8.6, z: 4.5 }, keywords: 'ljpc labo codex enquete' },
      { name: tr('Promenade · pilotage', 'Promenade · cockpit'), to: { x: 8.6, z: 4.5 }, keywords: 'promenade tableau d honneur classement cobra pilotage cockpit carte galactique edgis saut fsd' },
    ],
  },
  '-1': {
    tagline: tr('Entraînement & opérations', 'Training & operations'),
    color: '#f0c93a',
    icon: 'barbell',
    places: [
      { name: tr('Entraînement : sport, basket, foot', 'Training: gym, basketball, football'), to: { x: 20, z: 10.8 }, keywords: 'entrainement salle de sport gym basket foot football musculation boxe velo course tapis' },
      { name: 'CMDR Arena', to: { x: 23.5, z: 5.7 }, keywords: 'arena arene cmdr duel equipes cqc tessa' },
      { name: tr('Zone thargoïde', 'Thargoid zone'), to: { x: 23.5, z: 3.3 }, keywords: 'zone thargoide thargoid cargaison recuperation odile mission' },
      { name: tr('Hangar', 'Hangar'), to: { x: 26.4, z: 4.5 }, keywords: 'hangar krait nico mecano boulon vaisseau' },
      { name: tr('Scavengers · exploration', 'Scavengers · exploration'), to: { x: 22, z: 10.8 }, keywords: 'scavengers kael aria its dangerous out there idot exploration gaine' },
      { name: tr('Tir · atelier · arrière-cale', 'Range · workshop · back of the hold'), to: { x: 19.3, z: 5 }, keywords: 'stand de tir armes cibles atelier raffinerie soute machines jacques bar zorb boite de nuit voie' },
    ],
  },
}

/** L'identité du pont `level`, s'il en a une (les ponts hors du vaisseau n'en ont pas). */
export const identityOf = (level: number): DeckIdentity | undefined => DECKS[String(level)]

/** Le texte d'une recherche, ramené à ses lettres : sans accents, en minuscules. */
export const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Les lieux d'un pont qui répondent à une recherche (tous ses mots doivent y être). */
export function placesMatching(level: number, query: string): DeckPlace[] {
  const words = plain(query).split(/\s+/).filter((w) => w.length >= 2)
  if (!words.length) return []
  return (identityOf(level)?.places ?? []).filter((p) => {
    const hay = `${plain(p.name)} ${p.keywords}`
    return words.every((w) => hay.includes(w))
  })
}

// ---------------------------------------------------------------- le totem du téléporteur

/** Police des totems : celle du plan du vaisseau (cf. ship-plan/data.ts). */
const FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif'

/** Taille du dessin d'un totem, en pixels. */
export const TOTEM_ART = { w: 512, h: 880 }

/** Étage d'un pont, comme le téléporteur l'écrit : « +1 », « 0 », « −1 ». */
const deckNumber = (level: number) => (level > 0 ? `+${level}` : level < 0 ? `−${-level}` : '0')

/**
 * Le cap (radians, 0 = droit devant, sens horaire) d'un lieu, vu de qui lit le totem : il se tient
 * devant lui, face à son écran. `rot` : l'orientation du totem (0 = son écran regarde le sud).
 */
export function totemHeading(at: { x: number; z: number }, rot: number, to: { x: number; z: number }): number {
  const front = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot & 3]
  // Le lecteur regarde vers le totem ; sa droite est à un quart de tour de son regard.
  const fx = -front[0], fz = -front[1]
  const rx = -fz, rz = fx
  const dx = to.x - at.x, dz = to.z - at.z
  return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)
}

/** Une flèche, pointe vers le haut une fois tournée de `heading` (au huitième de tour près, plus lisible). */
function arrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, heading: number, color: string) {
  const a = Math.round(heading / (Math.PI / 4)) * (Math.PI / 4)
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, -size)
  g.lineTo(size * 0.72, -size * 0.08)
  g.lineTo(size * 0.26, -size * 0.08)
  g.lineTo(size * 0.26, size * 0.8)
  g.lineTo(-size * 0.26, size * 0.8)
  g.lineTo(-size * 0.26, -size * 0.08)
  g.lineTo(-size * 0.72, -size * 0.08)
  g.closePath()
  g.fill()
  g.restore()
}

/** Le pictogramme d'un pont, tracé au trait (le canvas ne sait pas dessiner les icônes SVG sans les charger). */
function pictogram(g: CanvasRenderingContext2D, icon: IconName, x: number, y: number, s: number, color: string) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = s * 0.09
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.beginPath()
  if (icon === 'house') {
    g.moveTo(-s * 0.45, -s * 0.02); g.lineTo(0, -s * 0.42); g.lineTo(s * 0.45, -s * 0.02)
    g.moveTo(-s * 0.32, -s * 0.12); g.lineTo(-s * 0.32, s * 0.38); g.lineTo(s * 0.32, s * 0.38); g.lineTo(s * 0.32, -s * 0.12)
    g.moveTo(-s * 0.08, s * 0.38); g.lineTo(-s * 0.08, s * 0.12); g.lineTo(s * 0.08, s * 0.12); g.lineTo(s * 0.08, s * 0.38)
  } else if (icon === 'books') {
    for (const [bx, w, h] of [[-0.38, 0.16, 0.7], [-0.18, 0.16, 0.78], [0.02, 0.16, 0.66]]) g.rect(bx * s, (0.38 - h) * s, w * s, h * s)
    g.save(); g.translate(s * 0.3, s * 0.02); g.rotate(-0.28); g.rect(-s * 0.08, -s * 0.34, s * 0.16, s * 0.7); g.restore()
    g.moveTo(-s * 0.45, s * 0.4); g.lineTo(s * 0.48, s * 0.4)
  } else if (icon === 'users-three') {
    for (const [cx, cy, r] of [[0, -0.16, 0.16], [-0.32, -0.04, 0.12], [0.32, -0.04, 0.12]]) {
      g.moveTo(cx * s + r * s, cy * s); g.arc(cx * s, cy * s, r * s, 0, Math.PI * 2)
    }
    g.moveTo(-s * 0.26, s * 0.38); g.quadraticCurveTo(0, s * 0.02, s * 0.26, s * 0.38)
    g.moveTo(-s * 0.5, s * 0.34); g.quadraticCurveTo(-s * 0.32, s * 0.1, -s * 0.18, s * 0.2)
    g.moveTo(s * 0.5, s * 0.34); g.quadraticCurveTo(s * 0.32, s * 0.1, s * 0.18, s * 0.2)
  } else {
    // Haltère.
    g.moveTo(-s * 0.3, 0); g.lineTo(s * 0.3, 0)
    for (const side of [-1, 1]) {
      g.rect(side * s * 0.3 - (side < 0 ? s * 0.1 : 0), -s * 0.26, s * 0.1, s * 0.52)
      g.rect(side * s * 0.42 - (side < 0 ? s * 0.08 : 0), -s * 0.16, s * 0.08, s * 0.32)
    }
  }
  g.stroke()
  g.restore()
}

/** Ajuste la taille d'un texte à sa place. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number) {
  let s = size
  do g.font = `${weight} ${s}px ${FONT}`
  while (g.measureText(text).width > max && --s > 10)
}

/**
 * L'écran d'un totem : le pont (étage, nom, devise, couleur, pictogramme), « Vous êtes ici », ses
 * lieux avec leur direction vue du totem, et pour finir les autres ponts, que le téléporteur dessert.
 * `label` : « pont:x:z:rot », la place du totem.
 */
export function drawTotem(g: CanvasRenderingContext2D, label: string, deckName: (level: number) => string) {
  const { w, h } = TOTEM_ART
  const [level, x, z, rot] = label.split(':').map(Number)
  const id = identityOf(level)
  g.fillStyle = '#070b14'
  g.fillRect(0, 0, w, h)
  if (!id) return
  const color = id.color
  // L'en-tête, à la couleur du pont.
  g.fillStyle = color
  g.fillRect(0, 0, w, 150)
  g.fillStyle = '#070b14'
  g.font = `700 92px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.fillText(deckNumber(level), 28, 102)
  const numberW = g.measureText(deckNumber(level)).width
  fit(g, deckName(level).toUpperCase(), 700, 50, w - numberW - 150)
  g.fillText(deckName(level).toUpperCase(), 48 + numberW, 72)
  fit(g, id.tagline, 600, 30, w - numberW - 150)
  g.fillText(id.tagline, 48 + numberW, 116)
  pictogram(g, id.icon, w - 62, 74, 78, '#070b14')
  // Vous êtes ici.
  g.fillStyle = '#cfe0ff'
  g.font = `600 22px ${FONT}`
  g.fillText(tr('VOUS ÊTES ICI · TÉLÉPORTEUR', 'YOU ARE HERE · TELEPORTER'), 28, 194)
  g.fillStyle = color
  g.fillRect(28, 208, w - 56, 3)
  // Les lieux du pont.
  const row = Math.min(84, 430 / Math.max(1, id.places.length))
  id.places.forEach((p, i) => {
    const y = 262 + i * row
    g.fillStyle = 'rgba(255, 255, 255, 0.06)'
    g.beginPath()
    g.roundRect(24, y - row / 2 + 6, w - 48, row - 12, 12)
    g.fill()
    arrow(g, 66, y, 24, totemHeading({ x, z }, rot, p.to), color)
    g.fillStyle = '#f2f6ff'
    fit(g, p.name, 600, 32, w - 140)
    g.textBaseline = 'middle'
    g.fillText(p.name, 108, y + 1)
    g.textBaseline = 'alphabetic'
  })
  // Les autres ponts : le téléporteur les dessert tous.
  const others = ['2', '1', '0', '-1'].map(Number).filter((l) => l !== level)
  const top = h - 40 - others.length * 52 - 40
  g.fillStyle = '#8fa5c6'
  g.font = `600 20px ${FONT}`
  g.fillText(tr('LE TÉLÉPORTEUR DESSERT AUSSI', 'THE TELEPORTER ALSO SERVES'), 28, top)
  others.forEach((l, i) => {
    const other = identityOf(l)
    if (!other) return
    const y = top + 40 + i * 52
    g.fillStyle = other.color
    g.beginPath()
    g.roundRect(28, y - 22, 64, 40, 8)
    g.fill()
    g.fillStyle = '#070b14'
    g.font = `700 26px ${FONT}`
    g.textAlign = 'center'
    g.fillText(deckNumber(l), 60, y + 8)
    g.textAlign = 'left'
    g.fillStyle = '#f2f6ff'
    fit(g, `${deckName(l)} · ${other.tagline}`, 600, 28, w - 130)
    g.fillText(`${deckName(l)} · ${other.tagline}`, 108, y + 8)
  })
}
