import { setProfileView, type ProfileView } from './furniture/antechamber'
import type { GameEmbed } from './game-embed'
import { EN, tr } from './i18n'
import { siteHref, siteRequest, type ProfileReply } from './site'

/*
 * La carte de profil de l'antichambre des quartiers (cf. src/furniture/antechamber.ts) : le résumé
 * Open Graph du profil du site du CMDR dont ce sont les quartiers (soi, ou l'hôte qu'on visite),
 * et sa vue compacte, avec le lien vers le profil complet. Le résumé vient, dans l'ordre :
 * 1. de `?profile=<cmdr>` sur mini-shipinteriors-site.php, quand le site le sert (cf.
 *    docs/refonte-ponts-site.md) ;
 * 2. sinon, des balises Open Graph de la page du profil elle-même (`/profil.php?cmdr=…`) ;
 * 3. sinon, de ce qu'on sait sans le site : l'image `og-card.php` et l'adresse du profil.
 */

/** Les quartiers de qui : `cmdr`, le nom du CMDR au site (sans « CMDR »), null pour un invité. */
export interface QuartersOwner { cmdr: string | null; name: string; self: boolean }

/** Le résumé d'un profil, comme ses balises Open Graph le donnent. */
export interface ProfileSummary {
  title: string
  description: string
  image: string
  url: string
  stats?: { adventures?: number; badges?: number; points?: number }
}

/** La langue des cartes du site (og:locale) : celle du jeu. */
const LOCALE = EN ? 'en_US' : 'fr_FR'
/** Le nom d'un CMDR au site, sans son « CMDR ». */
export const siteCmdr = (name: string) => name.replace(/^CMDR\s+/i, '').trim()
export const profilePath = (cmdr: string) => `${EN ? '/en' : ''}/profil.php?cmdr=${encodeURIComponent(cmdr)}`
export const ogCardPath = (cmdr: string) => `/og-card.php?cmdr=${encodeURIComponent(cmdr)}&lang=${LOCALE}`

/** Une adresse du site, ramenée à son chemin quand elle est sur le site : l'image reste ainsi de la même origine. */
function sitePath(url: string): string {
  try {
    const u = new URL(url, location.href)
    return /(^|\.)elitedangereuse\.fr$/.test(u.hostname) || u.origin === location.origin ? u.pathname + u.search : url
  } catch {
    return url
  }
}

/** Le résumé que sert le site (`?profile=`) ; null s'il ne le sert pas (encore). */
async function fromEndpoint(cmdr: string): Promise<ProfileSummary | null> {
  const reply = await siteRequest(`?profile=${encodeURIComponent(cmdr)}&lang=${LOCALE}`)
  const p: ProfileReply | undefined = reply?.status === 'success' ? reply.profile ?? undefined : undefined
  if (!p?.image || !p.url) return null
  return { title: p.title || `CMDR ${cmdr}`, description: p.description ?? '', image: sitePath(p.image), url: sitePath(p.url), stats: p.stats }
}

/** Les balises Open Graph de la page du profil. */
async function fromPage(cmdr: string): Promise<ProfileSummary | null> {
  try {
    const res = await fetch(siteHref(profilePath(cmdr)), { credentials: 'same-origin', signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
    const og = (name: string) => doc.querySelector(`meta[property="og:${name}"]`)?.getAttribute('content') ?? ''
    if (!og('image')) return null
    return { title: og('title') || `CMDR ${cmdr}`, description: og('description'), image: sitePath(og('image')), url: sitePath(og('url') || profilePath(cmdr)) }
  } catch {
    return null
  }
}

/** Ce qu'on sait sans le site : la carte et l'adresse du profil. */
const fallback = (cmdr: string): ProfileSummary => ({ title: `CMDR ${cmdr}`, description: '', image: ogCardPath(cmdr), url: profilePath(cmdr) })

/** Les résumés déjà demandés (par CMDR), pour ne pas redemander à chaque passage dans l'antichambre. */
const summaries = new Map<string, Promise<ProfileSummary>>()
function summaryOf(cmdr: string): Promise<ProfileSummary> {
  let p = summaries.get(cmdr)
  if (!p) {
    p = (async () => (await fromEndpoint(cmdr)) ?? (await fromPage(cmdr)) ?? fallback(cmdr))()
    summaries.set(cmdr, p)
  }
  return p
}

export class QuartersProfile {
  private owner: QuartersOwner = { cmdr: null, name: '', self: true }
  private key = ''
  private summary: ProfileSummary | null = null
  private image: HTMLImageElement | null = null
  private version = 0
  private loading = false

  constructor(private embed: GameEmbed, private loginUrl: () => string) {
    setProfileView(() => this.view())
  }

  /** Le propriétaire des quartiers où l'on est (appelé à chaque image : ne fait rien s'il n'a pas changé). */
  sync(owner: QuartersOwner) {
    const key = `${owner.cmdr ?? ''}|${owner.name}|${owner.self}`
    if (key === this.key) return
    this.key = key
    this.owner = owner
    this.summary = null
    this.image = null
    this.version++
    if (!owner.cmdr) return
    const cmdr = owner.cmdr
    this.loading = true
    void summaryOf(cmdr).then((summary) => {
      if (this.owner.cmdr !== cmdr) return
      this.loading = false
      this.summary = summary
      this.version++
      const img = new Image()
      // Le cadre est une texture : une image d'ailleurs, sans autorisation, la rendrait illisible.
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (this.owner.cmdr !== cmdr) return
        this.image = img
        this.version++
      }
      img.src = siteHref(summary.image)
    })
  }

  private view(): ProfileView {
    return {
      version: this.version,
      name: this.owner.name,
      guest: !this.owner.cmdr,
      self: this.owner.self,
      image: this.image,
      line: this.summary?.description ?? '',
      loading: this.loading,
    }
  }

  /** La vue compacte du profil : sa carte, son résumé, et le lien vers le profil complet. */
  open() {
    const { cmdr, name, self } = this.owner
    const body = document.createElement('div')
    body.className = 'profile-card'
    const kicker = tr('QUARTIERS · ANTICHAMBRE', 'QUARTERS · ANTECHAMBER')
    if (!cmdr) {
      const p = document.createElement('p')
      p.className = 'profile-card-guest'
      p.textContent = self
        ? tr('Vous jouez en invité. Connectez-vous au site : votre carte de profil s\'affichera ici, dans le cadre de l\'antichambre, et vos visiteurs la verront.', 'You are playing as a guest. Sign in to the site: your profile card will show here, in the antechamber frame, and your visitors will see it.')
        : tr(`${name} joue en invité : pas de profil sur le site.`, `${name} is playing as a guest: no profile on the site.`)
      body.append(p)
      if (self) {
        const login = document.createElement('a')
        login.className = 'profile-card-main'
        login.href = this.loginUrl()
        login.textContent = tr('Se connecter au site', 'Sign in to the site')
        body.append(login)
      }
      this.embed.openPanel({ kicker, title: name, hint: tr('La carte de profil du site.', 'The site profile card.'), body, skin: 'profile-skin' })
      return
    }
    const summary = this.summary ?? fallback(cmdr)
    const card = document.createElement('img')
    card.className = 'profile-card-og'
    card.alt = tr(`Carte de profil du CMDR ${cmdr}`, `CMDR ${cmdr}'s profile card`)
    card.width = 1200
    card.height = 630
    card.src = siteHref(summary.image)
    const title = document.createElement('h3')
    title.textContent = summary.title
    const text = document.createElement('p')
    text.className = 'profile-card-text'
    text.textContent = summary.description || tr('Le résumé du profil n\'est pas arrivé du site ; la carte et le profil complet, si.', 'The profile summary did not arrive from the site; the card and the full profile did.')
    const info = document.createElement('div')
    info.className = 'profile-card-info'
    info.append(title, text)
    if (summary.stats) {
      const stats = document.createElement('ul')
      stats.className = 'profile-card-stats'
      const n = (v?: number) => (v ?? 0).toLocaleString(EN ? 'en-GB' : 'fr-FR')
      for (const [value, label] of [[summary.stats.adventures, tr('aventures', 'adventures')], [summary.stats.badges, tr('badges', 'badges')], [summary.stats.points, tr('points', 'points')]] as const) {
        if (value === undefined) continue
        const li = document.createElement('li')
        const strong = document.createElement('strong')
        strong.textContent = n(value)
        li.append(strong, ` ${label}`)
        stats.append(li)
      }
      info.append(stats)
    }
    const actions = document.createElement('div')
    actions.className = 'profile-card-actions'
    const full = document.createElement('a')
    full.className = 'profile-card-main'
    full.href = siteHref(summary.url)
    full.target = '_blank'
    full.rel = 'noopener'
    full.textContent = tr('Voir le profil complet ↗', 'View the full profile ↗')
    const here = document.createElement('button')
    here.type = 'button'
    here.textContent = tr('L\'ouvrir ici', 'Open it here')
    here.onclick = () => this.embed.openUrl({
      kicker, title: summary.title, hint: summary.description, url: siteHref(summary.url),
      back: { label: tr('Carte de profil', 'Profile card'), go: () => this.open() },
    })
    actions.append(full, here)
    info.append(actions)
    body.append(card, info)
    this.embed.openPanel({
      kicker,
      title: self ? tr('Votre profil', 'Your profile') : tr(`Le profil de ${name}`, `${name}'s profile`),
      hint: tr('La carte Open Graph du site, telle qu\'elle s\'affiche quand on partage un profil.', 'The site\'s Open Graph card, as it shows when a profile is shared.'),
      body,
      skin: 'profile-skin',
    })
    full.focus()
  }
}
