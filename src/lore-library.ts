import type { GameEmbed } from './game-embed'
import { tr } from './i18n'

/*
 * La grande bibliothèque du pont supérieur et les cartes stellaires du planétarium : leurs livres
 * ouvrent les pages du Lore Explorer de la communauté (https://elitedangereuse.github.io/LoreExplorer/),
 * leurs cartes, les systèmes d'EDGIS. Six alcôves, une par grand thème du lore : un rayonnage
 * (cf. src/furniture/library.ts) dont chaque livre est une page, un pupitre qui ouvre tout le thème.
 * Les pages s'ouvrent dans la fenêtre du jeu (cf. GameEmbed.openUrl), avec un lien vers un onglet.
 */

export const LORE_EXPLORER = 'https://elitedangereuse.github.io/LoreExplorer/'
/** Une page du Lore Explorer (son identifiant, celui de sa note). */
export const loreNodeUrl = (node: string) => `${LORE_EXPLORER}#node=${node}`
/** Tout un thème du Lore Explorer (une étiquette de ses notes : Empire, Federation…). */
export const loreTagUrl = (tag: string) => `${LORE_EXPLORER}#tag=${encodeURIComponent(tag)}`
/** La carte d'un système dans EDGIS. */
export const edgisSystemUrl = (system: string) => `https://edgis.elitedangereuse.fr/static/sysmap.html?system=${encodeURIComponent(system)}`

export type LoreTheme = 'empire' | 'federation' | 'alliance' | 'thargoid' | 'guardian' | 'mysteries'
export const LORE_THEMES: LoreTheme[] = ['empire', 'federation', 'alliance', 'thargoid', 'guardian', 'mysteries']

export interface LoreBook { title: string; node: string; blurb: string }
export interface LoreShelf {
  name: string
  /** Ce que dit le rayonnage de lui-même, sous son nom. */
  motto: string
  /** L'étiquette du thème au Lore Explorer ; à défaut, le pupitre ouvre la page `entry`. */
  tag?: string
  entry: string
  books: LoreBook[]
}

const book = (fr: string, en: string, node: string, blurbFr: string, blurbEn: string): LoreBook => ({ title: tr(fr, en), node, blurb: tr(blurbFr, blurbEn) })

export const LORE_SHELVES: Record<LoreTheme, LoreShelf> = {
  empire: {
    name: tr('L\'Empire', 'The Empire'),
    motto: tr('Marbre blanc, or et velours pourpre : la maison Duval, son Sénat et ses intrigues.', 'White marble, gold and purple velvet: House Duval, its Senate and its intrigues.'),
    tag: 'Empire',
    entry: '77cf2f14-105e-4041-af04-1213f3e7383c',
    books: [
      book('L\'Empire', 'The Empire', '77cf2f14-105e-4041-af04-1213f3e7383c', 'L\'une des trois superpuissances : un empereur, un Sénat, et l\'honneur avant tout.', 'One of the three superpowers: an emperor, a Senate, and honour above all.'),
      book('Achenar', 'Achenar', 'bed8c27f-3cbe-49ad-b86f-7d87eacf804a', 'Le cœur de l\'Empire : l\'empereur réside sur Capitol. Système sous permis.', 'The heart of the Empire: the emperor resides on Capitol. Permit-locked system.'),
      book('Le Sénat impérial', 'The Imperial Senate', '6b539fa1-7ebe-44d3-874b-41a3bd400af9', 'Les grandes familles, leurs votes et leurs complots.', 'The great families, their votes and their plots.'),
      book('Hengist Duval', 'Hengist Duval', '3cb0755e-4deb-442b-898b-3f0c6651636e', 'Quinzième empereur, assassiné le jour de ses noces, en 3301.', 'Fifteenth emperor, assassinated on his wedding day, in 3301.'),
      book('Arissa Lavigny-Duval', 'Arissa Lavigny-Duval', '34f3cfdd-0536-40a9-8732-13bf3a5e4a70', 'La fille cachée de Hengist, montée sur le trône.', 'Hengist\'s hidden daughter, who took the throne.'),
      book('Aisling Duval', 'Aisling Duval', 'b402bbe3-5119-4d94-87ee-0ba279658383', 'La princesse qui voulait réformer l\'Empire, et les foules qui l\'adorent.', 'The princess who wanted to reform the Empire, and the crowds who adore her.'),
      book('Denton Patreus', 'Denton Patreus', '75daea85-5e9f-4f6f-a102-1a5edea0283c', 'Sénateur, amiral, et homme de goût, à l\'en croire.', 'Senator, admiral, and a man of taste, or so he says.'),
      book('Zemina Torval', 'Zemina Torval', 'd8e3667c-3ba1-43aa-bc90-dac719c6d5e7', 'Sénatrice, magnate, et défenseuse de l\'esclavage impérial.', 'Senator, magnate, and champion of Imperial slavery.'),
    ],
  },
  federation: {
    name: tr('La Fédération', 'The Federation'),
    motto: tr('Acier bleu marine et chrome : la démocratie de Sol, ses présidents et sa flotte.', 'Navy steel and chrome: the democracy of Sol, its presidents and its fleet.'),
    tag: 'Federation',
    entry: 'd56d0a6d-142a-4110-9c9a-235df02a99e0',
    books: [
      book('La Fédération', 'The Federation', 'd56d0a6d-142a-4110-9c9a-235df02a99e0', 'La superpuissance démocratique, née sur Terre.', 'The democratic superpower, born on Earth.'),
      book('Sol', 'Sol', '6ace5ab9-af2a-4ad7-bb52-6059c0d3ab4a', 'Le berceau de l\'humanité et la capitale fédérale. Système sous permis.', 'The cradle of humanity and the Federal capital. Permit-locked system.'),
      book('Mars', 'Mars', '8a55a32e-316d-469b-a19f-bdc7c4d4b018', 'Terraformée en 2286, résidence du président fédéral.', 'Terraformed in 2286, home of the Federal president.'),
      book('Le Congrès fédéral', 'Federal Congress', '614fd344-ec09-483c-a28e-0289590946c4', 'Cinq cents élus, à Olympus Village, sur Mars.', 'Five hundred members, at Olympus Village, on Mars.'),
      book('Zachary Hudson', 'Zachary Hudson', '02322be1-fc02-4d8b-acf6-9a9681e3fb15', 'Le président qui ne recule pas devant l\'adversité.', 'The president who never backs down from adversity.'),
      book('Felicia Winters', 'Felicia Winters', 'b9fe58a3-dfb7-480c-afd6-92c3be841be7', 'La diplomatie plutôt que la guerre : l\'éternelle rivale de Hudson.', 'Diplomacy over war: Hudson\'s perennial rival.'),
      book('Jasmina Halsey', 'Jasmina Halsey', 'a9ccf59f-436e-44df-b041-5020285925f8', 'La présidente disparue avec le Starship One, en 3301.', 'The president who vanished with Starship One, in 3301.'),
      book('La Marine fédérale', 'Federal Navy', '3d268496-1d95-49bc-aca6-49d16a4337c8', 'Les flottes de la Fédération, des croiseurs Farragut aux Corvettes.', 'The Federation\'s fleets, from Farragut battlecruisers to Corvettes.'),
    ],
  },
  alliance: {
    name: tr('L\'Alliance', 'The Alliance'),
    motto: tr('Bois clair et vert tendre : l\'union des systèmes qui ne voulaient dépendre de personne.', 'Pale wood and soft green: the union of systems that wanted to depend on no one.'),
    tag: 'Alliance',
    entry: '1d726aa0-3e07-43b4-9b72-074046d25c3c',
    books: [
      book('L\'Alliance', 'The Alliance', '1d726aa0-3e07-43b4-9b72-074046d25c3c', 'La plus jeune des superpuissances, née pour ne dépendre de personne.', 'The youngest superpower, born to depend on no one.'),
      book('Alioth', 'Alioth', '5c4e0227-24c0-4696-b2e1-5ba9fe0308f5', 'La capitale de l\'Alliance, longtemps convoitée pour ses richesses. Système sous permis.', 'The Alliance capital, long coveted for its wealth. Permit-locked system.'),
      book('L\'Assemblée de l\'Alliance', 'Alliance Assembly', '48ac5ad9-dd0e-4d43-a109-f4cf6d3efdea', 'Un parlement qui coordonne plus qu\'il ne gouverne.', 'A parliament that coordinates more than it governs.'),
      book('Edmund Mahon', 'Edmund Mahon', 'da80c263-3c2d-43dd-ab3f-1fbf40490f74', 'Le Premier ministre de l\'Alliance, pragmatique jusqu\'au bout.', 'The Alliance\'s Prime Minister, pragmatic to the core.'),
      book('La Force de défense', 'Alliance Defence Force', '17d9294e-7759-4cf4-9a67-5f12b5704f51', 'La flotte qui veille sur les systèmes de l\'Alliance.', 'The fleet that watches over the Alliance\'s systems.'),
      book('Lakon Spaceways', 'Lakon Spaceways', '906c77b7-7fe4-48c1-ace5-1265023c2ebf', 'Le chantier des Type-9, des Asp… et des vaisseaux de l\'Alliance.', 'The shipyard of the Type-9, the Asp… and the Alliance ships.'),
    ],
  },
  thargoid: {
    name: tr('Les Thargoïdes', 'The Thargoids'),
    motto: tr('Alvéoles sombres et lueur verte : deux guerres, les Pléiades, les Titans.', 'Dark hexagons and green glow: two wars, the Pleiades, the Titans.'),
    tag: 'Thargoid',
    entry: '09343513-2893-458e-a689-5865fdc32e0a',
    books: [
      book('Les Thargoïdes', 'Thargoids', '09343513-2893-458e-a689-5865fdc32e0a', 'Une espèce non humaine, rencontrée en 2849, et rarement en paix.', 'A nonhuman species, first met in 2849, and seldom at peace.'),
      book('La Première Guerre thargoïde', 'First Thargoid War', 'c6674165-eb13-47d3-ad54-796aab951892', 'L\'INRA, le projet Mycoid, et ce qui mena à la seconde.', 'INRA, Project Mycoid, and what led to the second.'),
      book('La Seconde Guerre thargoïde', 'Second Thargoid War', '9a246121-0c2e-4f21-9877-ee333d6b0d6c', 'Le retour des Thargoïdes, des Pléiades jusqu\'aux Titans.', 'The Thargoids return, from the Pleiades to the Titans.'),
      book('L\'INRA', 'INRA', '39a31dd8-3750-4507-90b7-b649d0eeecef', 'L\'Intergalactic Naval Reserve Arm, et ses secrets les mieux gardés.', 'The Intergalactic Naval Reserve Arm, and its best-kept secrets.'),
      book('Mérope', 'Merope', '70fa34ea-bc98-40ff-97f0-e4f4538387a6', 'Là où le mystère a recommencé, en 3301 ; les premières « barnacles », en 3302.', 'Where the mystery began again, in 3301; the first “barnacles”, in 3302.'),
      book('Le Capteur thargoïde', 'Thargoid Sensor', '8ddf8e00-4541-4857-a609-5f6c5849dded', 'Un objet qui se répare en dévorant les machines autour de lui.', 'An object that repairs itself by devouring the machines around it.'),
      book('Les Titans', 'Titan', 'ba5ecc8d-cf87-4cf8-9d33-beb5d214e323', 'Les vaisseaux-mères thargoïdes, qu\'on surnomme « Stargoïdes ».', 'The Thargoid motherships, nicknamed “Stargoids”.'),
      book('Le Dieu lointain', 'Far God', '04ae001b-eb07-4812-a42e-4bb72825609b', 'La religion qui vénère les Thargoïdes, et ses mégavaisseaux.', 'The religion that worships the Thargoids, and its megaships.'),
    ],
  },
  guardian: {
    name: tr('Les Gardiens', 'The Guardians'),
    motto: tr('Pierre bleutée et glyphes cyan : une civilisation éteinte depuis des millions d\'années.', 'Bluish stone and cyan glyphs: a civilisation extinct for millions of years.'),
    tag: 'Guardian',
    entry: 'f57cff55-3348-45ea-b76f-d0eaa3c68165',
    books: [
      book('Les Gardiens', 'Guardians', 'f57cff55-3348-45ea-b76f-d0eaa3c68165', 'Une civilisation disparue il y a des millions d\'années, plus avancée que la nôtre.', 'A civilisation gone for millions of years, more advanced than ours.'),
      book('Ram Tah', 'Ram Tah', '4551539e-a6b2-4c45-8923-40fb603202b7', 'Le voyageur qui a déchiffré leurs ruines.', 'The traveller who deciphered their ruins.'),
      book('Les Ruines anciennes', 'Ancient Ruins', 'ee5ce79a-39d7-404a-a5a9-2f4e1549197f', 'Une balise touristique, devant les vestiges des Gardiens.', 'A tourist beacon, before the Guardians\' remains.'),
      book('Aegis', 'Aegis', '85d9e888-3f5b-40ed-b8af-2eb87e42b0d0', 'Les trois superpuissances unies contre les Thargoïdes, depuis 3303.', 'The three superpowers united against the Thargoids, since 3303.'),
      book('Un champ de bataille', 'Guardian-Thargoid Battlefield', 'c9c61b2e-1cea-4c33-ba80-c4cbb2fa048f', 'GalNet, 3307 : Gardiens et Thargoïdes se seraient affrontés.', 'GalNet, 3307: Guardians and Thargoids may once have fought.'),
    ],
  },
  mysteries: {
    name: tr('Les Mystères', 'The Mysteries'),
    motto: tr('Laque noire, cramoisi et chandelles : Raxxla, la Roue sombre, Salomé, le Club.', 'Black lacquer, crimson and candles: Raxxla, the Dark Wheel, Salomé, the Club.'),
    entry: 'a2bd8247-2daf-4bd9-b6da-667ff707b0a2',
    books: [
      book('Raxxla', 'Raxxla', 'a2bd8247-2daf-4bd9-b6da-667ff707b0a2', 'Le joyau qui brûle au front de la mère des galaxies. Une légende, ou une porte ?', 'The jewel that burns on the brow of the mother of galaxies. A legend, or a door?'),
      book('La Roue sombre', 'The Dark Wheel', '7ec2457b-3e53-4928-a17f-e885b681b267', 'La société secrète qui cherche Raxxla depuis des siècles.', 'The secret society that has sought Raxxla for centuries.'),
      book('Salomé', 'Salomé', '2f09bc24-0885-4d00-9d1f-506b32464dbe', 'Kahina Tijani Loren : voleuse de méta-alliages, mise à prix en 3303.', 'Kahina Tijani Loren: meta-alloy thief, with a bounty on her head in 3303.'),
      book('Le Club', 'The Club', '8a1ae8ba-e27a-4141-a43a-67bef02cb235', 'Ceux qui tireraient les ficelles des trois superpuissances.', 'Those said to pull the strings of all three superpowers.'),
      book('Le Rift de Formidine', 'Formidine Rift', '34f7ac72-4ef4-494f-9982-87fbeadd8086', 'Une région où, au début du XXXIVe siècle, des vaisseaux disparaissaient.', 'A region where, early in the 34th century, ships kept vanishing.'),
      book('Les Enfants de Raxxla', 'Children of Raxxla', '7b48eea2-ee5f-47f9-9e14-8f5e827766b4', 'Une faction qui porte le nom de la légende.', 'A faction that bears the legend\'s name.'),
      book('John Jameson', 'John Jameson', '0be96028-d995-4b52-8bb0-34f21e080bce', 'Le héros de la Première Guerre thargoïde, parti sans retour en 3151.', 'The hero of the First Thargoid War, who left and never returned, in 3151.'),
    ],
  },
}

/** Une carte stellaire du planétarium : un système, sa couleur d'étoile, et sa page au Lore Explorer. */
export interface StarCard { system: string; star: string; blurb: string; lore?: string }

/** Les systèmes clés du planétarium, du berceau de l'humanité au bout de la galaxie ; la dernière carte est vierge. */
export const STAR_CARDS: StarCard[] = [
  { system: 'Sol', star: '#fff1c9', blurb: tr('Le berceau de l\'humanité, capitale de la Fédération.', 'The cradle of humanity, capital of the Federation.'), lore: '6ace5ab9-af2a-4ad7-bb52-6059c0d3ab4a' },
  { system: 'Achenar', star: '#b9d2ff', blurb: tr('Le cœur de l\'Empire.', 'The heart of the Empire.'), lore: 'bed8c27f-3cbe-49ad-b86f-7d87eacf804a' },
  { system: 'Alioth', star: '#e6efff', blurb: tr('La capitale de l\'Alliance.', 'The capital of the Alliance.'), lore: '5c4e0227-24c0-4696-b2e1-5ba9fe0308f5' },
  { system: 'Shinrarta Dezhra', star: '#ffd9a8', blurb: tr('La Pilots\' Federation, sur invitation seulement.', 'The Pilots\' Federation, by invitation only.'), lore: 'c6b67ab9-66c5-4636-a978-2ca3a9ab012c' },
  { system: 'Lave', star: '#ffe6ad', blurb: tr('Le monde de départ d\'Elite, en 1984.', 'Elite\'s starting world, in 1984.'), lore: 'ff595332-6a13-4f69-ae2f-cc0a0df8e741' },
  { system: 'Alpha Centauri', star: '#fff0c8', blurb: tr('Le voisin de Sol, et Hutton Orbital au bout du voyage.', 'Sol\'s neighbour, with Hutton Orbital at the end of the trip.'), lore: '2de7ac5c-9ae0-4ebf-af7d-6505f05d2fd1' },
  { system: 'Merope', star: '#c6dbff', blurb: tr('Les Pléiades, où les Thargoïdes ont refait surface.', 'The Pleiades, where the Thargoids resurfaced.'), lore: '70fa34ea-bc98-40ff-97f0-e4f4538387a6' },
  { system: 'Maia', star: '#cfe0ff', blurb: tr('Les Pléiades, Obsidian Orbital et ses artefacts étranges.', 'The Pleiades, Obsidian Orbital and its strange artefacts.'), lore: '0ee60994-364c-41b9-98ca-993d041cea72' },
  { system: 'Colonia', star: '#ffdcb0', blurb: tr('La colonie, à 22 000 années-lumière des systèmes du centre.', 'The colony, 22,000 light years from the core systems.'), lore: 'ba6c6359-137b-4f86-ad93-f8ae56b0ad34' },
  { system: 'Sagittarius A*', star: '#ffc46b', blurb: tr('Le trou noir supermassif, au centre de la galaxie.', 'The supermassive black hole at the centre of the galaxy.'), lore: '79eced12-4b6a-4f24-8673-fa0d509a452e' },
  { system: 'Beagle Point', star: '#ffad6b', blurb: tr('Le bout de la galaxie, où finit Distant Worlds.', 'The far edge of the galaxy, where Distant Worlds ends.'), lore: 'da49a702-3bb4-4dd7-9adf-29188adb2801' },
  { system: 'Raxxla', star: '', blurb: tr('Aucune donnée. La carte reste vierge… pour l\'instant.', 'No data. The card stays blank… for now.') },
]

// ---------------------------------------------------------------- les fenêtres

const LIBRARY_KICKER = tr('PONT SUPÉRIEUR · BIBLIOTHÈQUE', 'UPPER DECK · LIBRARY')
const PLANETARIUM_KICKER = tr('PONT SUPÉRIEUR · PLANÉTARIUM', 'UPPER DECK · PLANETARIUM')

/** Hauteur et largeur d'un dos de livre (px), tirées de son titre : chaque rayonnage garde sa silhouette. */
function spineSize(title: string) {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { height: 168 + (h % 48), width: 44 + ((h >> 6) % 16) }
}

/** Le rayonnage d'un thème : ses livres, dos à dos ; chacun ouvre sa page du Lore Explorer. */
export function openShelf(embed: GameEmbed, theme: LoreTheme) {
  const shelf = LORE_SHELVES[theme]
  const body = document.createElement('div')
  body.className = 'lore-panel'
  body.dataset.theme = theme
  const motto = document.createElement('p')
  motto.className = 'lore-motto'
  motto.textContent = shelf.motto
  const row = document.createElement('div')
  row.className = 'lore-books'
  const blurb = document.createElement('p')
  blurb.className = 'lore-blurb'
  blurb.setAttribute('aria-live', 'polite')
  const show = (b: LoreBook | null) => {
    blurb.replaceChildren()
    if (!b) { blurb.textContent = tr('Choisissez un livre : il s\'ouvre sur sa page du Lore Explorer.', 'Pick a book: it opens on its Lore Explorer page.'); return }
    const strong = document.createElement('strong')
    strong.textContent = b.title
    blurb.append(strong, ` · ${b.blurb}`)
  }
  shelf.books.forEach((b, i) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lore-book'
    const size = spineSize(b.title)
    button.style.setProperty('--h', `${size.height}px`)
    button.style.setProperty('--w', `${size.width}px`)
    button.dataset.tone = String(i % 4)
    const title = document.createElement('span')
    title.textContent = b.title
    button.append(title)
    button.setAttribute('aria-label', `${b.title} · ${b.blurb}`)
    button.onmouseenter = button.onfocus = () => show(b)
    button.onclick = () => openLorePage(embed, theme, b)
    row.append(button)
  })
  show(null)
  const all = document.createElement('button')
  all.type = 'button'
  all.className = 'lore-all'
  all.textContent = shelf.tag
    ? tr(`Tout le thème « ${shelf.name} » au Lore Explorer`, `The whole “${shelf.name}” theme in the Lore Explorer`)
    : tr('Ouvrir le Lore Explorer sur Raxxla', 'Open the Lore Explorer on Raxxla')
  all.onclick = () => openLecternPage(embed, theme)
  const plinth = document.createElement('div')
  plinth.className = 'lore-plinth'
  body.append(motto, row, plinth, blurb, all)
  embed.openPanel({
    kicker: LIBRARY_KICKER,
    title: tr(`Rayonnage · ${shelf.name}`, `Bookcase · ${shelf.name}`),
    hint: tr('Un livre, une page du Lore Explorer de la communauté.', 'One book, one page of the community\'s Lore Explorer.'),
    body,
    skin: 'lore-skin',
  })
  row.querySelector<HTMLButtonElement>('button')?.focus()
}

/** Un livre ouvert : sa page du Lore Explorer, et le retour au rayonnage. */
function openLorePage(embed: GameEmbed, theme: LoreTheme, b: LoreBook) {
  const shelf = LORE_SHELVES[theme]
  embed.openUrl({
    kicker: `${LIBRARY_KICKER} · ${shelf.name.toUpperCase()}`,
    title: b.title,
    hint: b.blurb,
    url: loreNodeUrl(b.node),
    back: { label: tr('Rayonnage', 'Bookcase'), go: () => openShelf(embed, theme) },
  })
}

/** Le pupitre d'une alcôve : tout son thème au Lore Explorer (ou Raxxla, pour les mystères, qui n'ont pas d'étiquette). */
export function openLecternPage(embed: GameEmbed, theme: LoreTheme) {
  const shelf = LORE_SHELVES[theme]
  embed.openUrl({
    kicker: LIBRARY_KICKER,
    title: shelf.name,
    hint: shelf.motto,
    url: shelf.tag ? loreTagUrl(shelf.tag) : loreNodeUrl(shelf.entry),
    back: { label: tr('Rayonnage', 'Bookcase'), go: () => openShelf(embed, theme) },
  })
}

/** L'hologramme du centre de la bibliothèque : le Lore Explorer entier, sur sa page d'accueil. */
export function openLoreExplorer(embed: GameEmbed) {
  embed.openUrl({
    kicker: LIBRARY_KICKER,
    title: 'Lore Explorer',
    hint: tr('Le lore d\'Elite Dangerous en graphe : chaque note, ses liens, ses sources.', 'The lore of Elite Dangerous as a graph: every note, its links, its sources.'),
    url: LORE_EXPLORER,
  })
}

/** Les cartes stellaires du planétarium : une carte, un système ouvert dans EDGIS. */
export function openStarCards(embed: GameEmbed) {
  const body = document.createElement('div')
  body.className = 'star-cards'
  const intro = document.createElement('p')
  intro.className = 'star-cards-intro'
  intro.textContent = tr('« Choisis une étoile, et le ciel te dira tout ce qu\'il sait d\'elle. Hou hou ! » — Bugenhagen', '“Pick a star, and the sky will tell you all it knows of it. Ho ho!” — Bugenhagen')
  const grid = document.createElement('div')
  grid.className = 'star-cards-grid'
  for (const card of STAR_CARDS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'star-card'
    if (!card.star) button.classList.add('star-card-blank')
    else button.style.setProperty('--star', card.star)
    const orb = document.createElement('span')
    orb.className = 'star-card-orb'
    const name = document.createElement('strong')
    name.textContent = card.star ? card.system : '???'
    const text = document.createElement('span')
    text.className = 'star-card-text'
    text.textContent = card.star ? card.blurb : tr('Une carte vierge, glissée entre les autres.', 'A blank card, slipped in among the others.')
    button.append(orb, name, text)
    button.onclick = () => {
      if (!card.star) {
        // Raxxla : la carte reste vierge, et elle le dit.
        name.textContent = 'Raxxla'
        text.textContent = card.blurb
        button.classList.add('star-card-flipped')
        return
      }
      embed.openUrl({
        kicker: `${PLANETARIUM_KICKER} · EDGIS`,
        title: card.system,
        hint: card.blurb,
        url: edgisSystemUrl(card.system),
        back: { label: tr('Cartes stellaires', 'Star cards'), go: () => openStarCards(embed) },
        extra: card.lore ? { label: tr('Au Lore Explorer ↗', 'In the Lore Explorer ↗'), href: loreNodeUrl(card.lore) } : undefined,
      })
    }
    grid.append(button)
  }
  body.append(intro, grid)
  embed.openPanel({
    kicker: PLANETARIUM_KICKER,
    title: tr('Cartes stellaires', 'Star cards'),
    hint: tr('Chaque carte ouvre son système dans EDGIS, la carte galactique de la communauté.', 'Each card opens its system in EDGIS, the community\'s galaxy map.'),
    body,
    skin: 'star-skin',
  })
  grid.querySelector<HTMLButtonElement>('button')?.focus()
}
