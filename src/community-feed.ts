import { setCommunityFeed, type HonourBoardData } from './furniture/community'
import { setPatrons } from './furniture/patron'
import { tr } from './i18n'
import { crewBoards, liveFeed, patronRoll, siteHref, type LiveItem } from './site'

/*
 * Les données du cœur communautaire du pont principal (cf. src/furniture/community.ts) : le fil
 * « En direct » du site et les nouvelles du bord pour le bandeau de la salle commune, les
 * classements de l'équipage et les portraits des premiers pour le Tableau d'honneur, les noms des
 * mécènes pour leur plaque (cf. furniture/patron.ts).
 */

/** Nouvelles du bord gardées pour le bandeau (les plus récentes). */
const KEEP_SHIP = 8
/** Nouvelles du site gardées pour le bandeau. */
const KEEP_SITE = 10
/** On redemande au site toutes les deux minutes. */
const REFRESH = 120

/** Ce que le bord rappelle entre deux nouvelles : trois à la fois, à tour de rôle. */
const STANDING = [
  tr('Weekly : vos crédits vous attendent au bureau du Weekly, dans le hall.', 'Weekly: your credits are waiting at the Weekly office, in the hall.'),
  tr('Chasse galactique : la scientifique du L.J.P.C. paie les cibles validées, dans le hall.', 'Galactic Hunt: the L.J.P.C. scientist pays for validated targets, in the hall.'),
  tr('Pont supérieur : la grande bibliothèque ouvre les pages du Lore Explorer.', 'Upper deck: the great library opens the pages of the Lore Explorer.'),
  tr('Cale : sport, basket et foot au complexe d\'entraînement.', 'Hold: gym, basketball and football at the training complex.'),
  tr('Pixel War : un pixel toutes les trente secondes, au fond de l\'arcade.', 'Pixel War: one pixel every thirty seconds, at the back of the arcade.'),
  tr('Promenade : le Tableau d\'honneur de l\'équipage, devant la maquette du Cobra.', 'Promenade: the crew\'s Hall of honour, by the Cobra model.'),
  tr('Mess : Marcel cherche des commis pour MESS RUSH.', 'Mess: Marcel is looking for kitchen hands for MESS RUSH.'),
  tr('Arcade : la borne du Mini-CQC vous attend, à côté d\'Astéroïdes.', 'Arcade: the Mini-CQC cabinet is waiting for you, next to Asteroids.'),
]

export class CommunityFeed {
  private boards: HonourBoardData[] = []
  /** Le fil du site ; null tant qu'il ne le sert pas (ou ne répond pas). */
  private site: LiveItem[] | null = null
  private ship: { text: string; at: number }[] = []
  private avatars = new Map<string, HTMLImageElement | null>()
  /** Le site a déjà donné les noms des mécènes. */
  private patronsKnown = false

  constructor() {
    setCommunityFeed({ ticker: () => this.ticker(), boards: () => this.boards, avatar: (url) => this.avatar(url) })
    void this.refresh()
    setInterval(() => void this.refresh(), REFRESH * 1000)
  }

  /** Une nouvelle du bord (un CMDR embarque, un saut FSD, une quête terminée…), en tête du bandeau. */
  push(text: string) {
    this.ship.unshift({ text, at: Date.now() })
    this.ship.length = Math.min(this.ship.length, KEEP_SHIP)
  }

  /** Ce que le panneau « En direct » affiche quand on lit le bandeau (cf. SitePanel.live). */
  entries() {
    return { site: this.site?.slice(0, KEEP_SITE) ?? null, ship: [...this.ship] }
  }

  /** Le texte du bandeau : les nouvelles du site, celles du bord, puis trois rappels, à tour de rôle. */
  private ticker(): string[] {
    const turn = Math.floor(Date.now() / 60000)
    const standing = [0, 1, 2].map((k) => STANDING[(turn * 3 + k) % STANDING.length])
    return [
      ...(this.site ?? []).slice(0, KEEP_SITE).map((item) => item.text),
      ...this.ship.map((item) => `${tr('À bord', 'Aboard')} · ${item.text}`),
      ...standing,
    ]
  }

  private async refresh() {
    const [boards, live, patrons] = await Promise.all([crewBoards(), liveFeed(), patronRoll()])
    // La plaque garde les derniers noms reçus quand le site ne répond plus.
    if (patrons) setPatrons(patrons)
    else if (!this.patronsKnown) setPatrons(null)
    this.patronsKnown ||= !!patrons
    if (boards) this.boards = boards.filter((b) => b.rows.length).map((b) => ({ label: b.label, unit: b.unit, rows: b.rows.map((r) => ({ rank: r.rank, name: r.name, score: r.score, avatar: r.avatar })) }))
    if (live) this.site = live
  }

  /** Le portrait d'un CMDR : chargé une fois, et dessiné dès qu'il est arrivé. */
  private avatar(url: string): HTMLImageElement | null {
    if (!this.avatars.has(url)) {
      this.avatars.set(url, null)
      const img = new Image()
      // Le tableau est une texture : une image d'ailleurs, sans autorisation, la rendrait illisible.
      img.crossOrigin = 'anonymous'
      img.onload = () => this.avatars.set(url, img)
      img.src = siteHref(url)
    }
    return this.avatars.get(url) ?? null
  }
}
