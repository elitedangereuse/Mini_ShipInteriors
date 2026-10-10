import { tr } from './i18n'
import { bodyColor, cardReady, drawCard, ljpcSelf, type LjpcData, type LjpcMember } from './ljpc-site'
import { siteHref } from './site'

/*
 * Le registre du labo du L.J.P.C., dans le panneau du site (cf. SitePanel.ljpc dans site.ts) : deux
 * onglets. « Membres » : la liste des membres dans l'ordre de leur adhésion (leur rang fait leur
 * numéro), avec la carte de celui qu'on choisit et le lien de son profil. « Mon Codex » : les
 * observations validées du CMDR pour la Chasse galactique, comme sur la page Codex Galactique du
 * site, et les liens pour y aller.
 */

export type LjpcTab = 'members' | 'codex'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

/** Lien vers une page du site (ou d'EDGIS), dans un nouvel onglet. */
function link(text: string, href: string, className = ''): HTMLAnchorElement {
  const a = el('a', className, text)
  a.href = /^https?:/.test(href) ? href : siteHref(href)
  a.target = '_blank'
  a.rel = 'noopener'
  return a
}

/** Carte de membre, dessinée dès que son image est là. */
function cardCanvas(member: LjpcMember): HTMLCanvasElement {
  const canvas = el('canvas', 'ljpc-card')
  canvas.width = 700
  canvas.height = 400
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', tr(`Carte de membre L.J.P.C. de ${member.name}`, `${member.name}'s L.J.P.C. membership card`))
  const paint = () => drawCard(canvas.getContext('2d')!, member, 0, 0, 700, 400)
  paint()
  void cardReady(member).then(paint)
  return canvas
}

const number = (n: number) => `N° ${String(n).padStart(3, '0')}`
const observations = (n: number) => tr(`${n} observation${n > 1 ? 's' : ''} au Codex`, `${n} observation${n === 1 ? '' : 's'} in the Codex`)

function membersView(data: LjpcData): HTMLElement {
  const view = el('div', 'ljpc-view')
  const hero = el('div', 'ljpc-hero')
  const roster = el('ol', 'ljpc-roster')
  const rows: HTMLButtonElement[] = []
  const show = (member: LjpcMember, n: number) => {
    const info = el('div', 'ljpc-info')
    const you = member.id === data.you
    info.append(
      el('span', 'ljpc-number', you ? `${number(n)} · ${tr('VOUS', 'YOU')}` : number(n)),
      el('h3', '', `CMDR ${member.name}`),
      el('p', '', tr(`Membre depuis le ${member.since}`, `Member since ${member.since}`)),
      el('p', '', observations(member.observations)),
      link(tr('Voir son profil sur le site', 'View profile on the site'), member.url, 'ljpc-link'),
    )
    hero.replaceChildren(cardCanvas(member), info)
    rows.forEach((row, i) => row.setAttribute('aria-pressed', String(i === n - 1)))
  }
  data.members.forEach((member, i) => {
    const row = el('button', 'ljpc-row')
    const avatar = el('img', 'site-avatar')
    avatar.alt = ''
    avatar.loading = 'lazy'
    avatar.onerror = () => {
      avatar.onerror = null
      avatar.src = siteHref('/assets/images/common/CMDR_inconnu.png')
    }
    avatar.src = siteHref(member.avatar)
    row.append(el('span', 'ljpc-number', number(i + 1)), avatar, el('strong', '', member.name), el('span', 'ljpc-since', member.since))
    if (member.id === data.you) row.dataset.you = ''
    row.onclick = () => show(member, i + 1)
    rows.push(row)
    const li = el('li')
    li.append(row)
    roster.append(li)
  })
  const self = ljpcSelf(data)
  if (self) show(self.member, self.number)
  else if (data.members[0]) show(data.members[0], 1)
  view.append(hero, el('p', 'site-caption', tr(`${data.members.length} membres, dans l'ordre de leur adhésion. Choisissez-en un pour voir sa carte.`, `${data.members.length} members, in order of joining. Pick one to see their card.`)), roster)
  return view
}

function codexView(data: LjpcData): HTMLElement {
  const view = el('div', 'ljpc-view')
  const self = ljpcSelf(data)
  const codex = data.codex
  const hero = el('div', 'ljpc-hero')
  const info = el('div', 'ljpc-info')
  info.append(el('span', 'ljpc-number', tr('CODEX GALACTIQUE', 'GALACTIC CODEX')))
  if (codex) {
    info.append(el('h3', '', tr(`${codex.length} observation${codex.length > 1 ? 's' : ''} validée${codex.length > 1 ? 's' : ''}`, `${codex.length} validated observation${codex.length === 1 ? '' : 's'}`)))
    // Les médailles : une pastille par type de corps, et combien on en a observé.
    const types = new Map<string, number>()
    for (const o of codex) types.set(o.type, (types.get(o.type) ?? 0) + 1)
    const medals = el('ul', 'ljpc-medals')
    for (const [type, count] of types) {
      const li = el('li', '', count > 1 ? `${type} × ${count}` : type)
      li.style.setProperty('--body', bodyColor(type))
      medals.append(li)
    }
    if (types.size) info.append(medals)
  } else {
    info.append(el('h3', '', tr('Codex indisponible', 'Codex unavailable')), el('p', '', tr('Le site n’a pas encore ouvert la Chasse galactique.', 'The site has not opened the Galactic Hunt yet.')))
  }
  info.append(link(tr('Ouvrir mon Codex sur le site', 'Open my Codex on the site'), data.links.codex, 'ljpc-link'), link(tr('La Chasse galactique de la semaine', 'This week’s Galactic Hunt'), data.links.hunt, 'ljpc-link'))
  if (self) hero.append(cardCanvas(self.member))
  hero.append(info)
  view.append(hero)
  if (codex && !codex.length) {
    view.append(el('p', 'ljpc-empty', tr('Aucune observation validée pour le moment. Les cibles de la semaine vous attendent sur le site : James compte sur vous.', 'No validated observation yet. This week’s targets await on the site: James is counting on you.')))
  }
  const grid = el('div', 'ljpc-codex')
  for (const o of codex ?? []) {
    const card = el('article')
    card.style.setProperty('--body', bodyColor(o.type))
    if (o.image) {
      const shot = el('img')
      shot.alt = o.body
      shot.loading = 'lazy'
      // Capture absente (base de test, fichier nettoyé) : la fiche se passe d'image.
      shot.onerror = () => shot.remove()
      shot.src = siteHref(o.image)
      card.append(shot)
    }
    const body = el('div', 'ljpc-body')
    const details = el('dl')
    const detail = (label: string, value: Node | string) => {
      const dd = el('dd')
      dd.append(value)
      details.append(el('dt', '', label), dd)
    }
    detail('Type', o.type)
    detail(tr('Température', 'Temperature'), o.temperature === null ? tr('Inconnue', 'Unknown') : `${o.temperature.toLocaleString()} K`)
    detail(tr('Système', 'System'), link(o.system, o.map))
    detail(tr('Validée le', 'Validated'), o.date)
    body.append(el('span', 'ljpc-number', o.mission), el('h4', '', o.body), details)
    card.append(body)
    grid.append(card)
  }
  view.append(grid)
  return view
}

/**
 * Remplit le panneau du site avec le registre du labo, ouvert sur l'onglet `first`. Rend les
 * boutons des onglets (pour la manette et les flèches, cf. SitePanel.move).
 */
export function renderLjpc(content: HTMLElement, data: LjpcData, first: LjpcTab): HTMLButtonElement[] {
  const tabs = el('nav')
  tabs.setAttribute('aria-label', tr('Registre du labo', 'Lab registry'))
  const holder = el('div')
  const views: Record<LjpcTab, () => HTMLElement> = { members: () => membersView(data), codex: () => codexView(data) }
  const labels: Record<LjpcTab, string> = { members: tr('Membres', 'Members'), codex: tr('Mon Codex', 'My Codex') }
  const buttons = (Object.keys(views) as LjpcTab[]).map((tab) => {
    const b = el('button', '', labels[tab])
    b.dataset.tab = tab
    b.onclick = () => {
      holder.replaceChildren(views[tab]())
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b))
    }
    tabs.append(b)
    return b
  })
  content.replaceChildren(tabs, holder)
  buttons.find((b) => b.dataset.tab === first)?.click()
  return buttons
}
