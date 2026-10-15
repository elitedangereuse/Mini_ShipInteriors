import * as THREE from 'three'
import { box, decal, glow, keepShared, lit, part, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * L'antichambre des quartiers (pont +2), où arrive le téléporteur : le cadre du profil, au mur
 * ouest, qui montre la carte Open Graph du site du CMDR dont ce sont les quartiers (soi, ou l'hôte
 * qu'on visite), et le paillasson à son nom, devant la porte. Le jeu leur dit qui habite là, et leur
 * passe l'image quand elle est arrivée (cf. setProfileView, src/profile-card.ts) : le mobilier ne
 * parle pas au site.
 */

/** Ce que montrent le cadre et le paillasson : les quartiers de qui, et sa carte du site. */
export interface ProfileView {
  /** Change à chaque nouveauté (autre propriétaire, image arrivée, résumé reçu) : le cadre se redessine. */
  version: number
  /** « CMDR Aussi », ou le nom d'un invité. */
  name: string
  /** Pas de profil au site : un invité (ou un hôte invité). */
  guest: boolean
  /** Ses propres quartiers. */
  self: boolean
  /** La carte Open Graph du profil (1200 × 630), une fois chargée. */
  image: CanvasImageSource | null
  /** Une ligne : la bio du CMDR, ou ses compteurs. */
  line: string
  loading: boolean
}

let view: (() => ProfileView) | null = null
/** Le jeu dit au cadre et au paillasson qui habite ici (cf. src/profile-card.ts). */
export function setProfileView(f: () => ProfileView) {
  view = f
}

const FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'

/** Un texte sur une ou deux lignes, tronqué, centré en (x, y). */
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, lines = 2) {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (c.measureText(next).width > width && line) {
      out.push(line)
      line = w
      if (out.length === lines) break
    } else line = next
  }
  if (out.length < lines && line) out.push(line)
  else if (out.length === lines) out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'
  out.forEach((l, i) => c.fillText(l, x, y + (i - (out.length - 1) / 2) * lineHeight))
}

/** Un écran qui ne se redessine qu'à chaque nouvelle version de ce qu'il montre. */
function versionedScreen(w: number, h: number, draw: (c: CanvasRenderingContext2D, v: ProfileView | null) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext('2d')!
  draw(c, view?.() ?? null)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let version = -1
  return {
    texture,
    update() {
      const v = view?.() ?? null
      if (!v || v.version === version) return
      version = v.version
      draw(c, v)
      texture.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------- le cadre du profil

/**
 * Le cadre du profil (face à +z, 2,0 × 1,36, accroché) : dans un cadre de noyer liseré de laiton,
 * la carte Open Graph du profil, et sous elle un bandeau, le nom et « voir le profil ». Sans
 * carte (invité, site muet), une carte dessinée à la place.
 */
const profileFrame: Builder = () => {
  const g = new THREE.Group()
  const W = 1.9, H = 1.2, Y = 1.02
  const walnut = lit('#3a2418', 'wood'), brass = lit('#d8b062', 'metal')
  g.add(box(W + 0.12, H + 0.12, 0.05, walnut, 0, Y, -0.012))
  for (const y of [Y + H / 2 + 0.045, Y - H / 2 - 0.045]) g.add(box(W + 0.14, 0.022, 0.06, brass, 0, y, 0.004))
  for (const x of [-(W / 2 + 0.045), W / 2 + 0.045]) g.add(box(0.022, H + 0.11, 0.06, brass, x, Y, 0.004))
  // Deux petites lampes de tableau, au-dessus.
  for (const x of [-0.55, 0.55]) g.add(box(0.03, 0.03, 0.12, brass, x, Y + H / 2 + 0.08, 0.05), box(0.2, 0.03, 0.05, brass, x, Y + H / 2 + 0.08, 0.12), box(0.18, 0.006, 0.03, glow('#ffe7b8'), x, Y + H / 2 + 0.064, 0.12))
  const PW = 1200, PH = 760, CARD = 630
  const screen = versionedScreen(PW, PH, (c, v) => {
    const name = v?.name ?? 'CMDR'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    if (v?.image) {
      c.drawImage(v.image, 0, 0, PW, CARD)
    } else {
      // La carte dessinée : un fond étoilé, le nom, une ligne.
      const bg = c.createLinearGradient(0, 0, PW, CARD)
      bg.addColorStop(0, '#1b2a3d'); bg.addColorStop(1, '#0b1018')
      c.fillStyle = bg
      c.fillRect(0, 0, PW, CARD)
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(220,230,255,${0.15 + ((i * 29) % 50) / 100})`
        c.fillRect((i * 263) % PW, (i * 151) % CARD, 2, 2)
      }
      c.strokeStyle = '#ff8a1c'
      c.lineWidth = 6
      c.strokeRect(24, 24, PW - 48, CARD - 48)
      c.fillStyle = '#ffffff'
      c.font = `700 84px ${FONT}`
      c.fillText(name.toUpperCase(), PW / 2, CARD / 2 - 70)
      c.fillStyle = '#c9d6e6'
      c.font = `500 38px ${FONT}`
      const line = !v ? '' : v.guest
        ? (v.self ? tr('Invité · connectez-vous au site pour afficher votre profil ici.', 'Guest · sign in to the site to show your profile here.') : tr('Un invité : pas de profil sur le site.', 'A guest: no profile on the site.'))
        : v.loading ? tr('Le profil arrive du site…', 'The profile is on its way from the site…') : v.line || tr('Le site ne répond pas : le profil reviendra.', 'The site is not answering: the profile will be back.')
      wrap(c, line, PW / 2, CARD / 2 + 60, PW - 160, 50, 3)
    }
    // Le bandeau, sous la carte : le nom, et l'invitation à ouvrir le profil.
    const band = c.createLinearGradient(0, CARD, 0, PH)
    band.addColorStop(0, '#20160f'); band.addColorStop(1, '#120c08')
    c.fillStyle = band
    c.fillRect(0, CARD, PW, PH - CARD)
    c.fillStyle = '#d8b062'
    c.fillRect(0, CARD, PW, 5)
    c.textAlign = 'left'
    c.fillStyle = '#f6eedd'
    c.font = `700 52px ${FONT}`
    c.fillText(name, 40, CARD + (PH - CARD) / 2 + 2)
    c.textAlign = 'right'
    c.fillStyle = '#ffb366'
    c.font = `600 32px ${FONT}`
    c.fillText(v?.guest ? 'elitedangereuse.fr' : tr('PROFIL DU SITE  ↗', 'SITE PROFILE  ↗'), PW - 40, CARD + (PH - CARD) / 2 + 2)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(W, H), keepShared(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })), 0, Y, 0.016))
  return { solid: g, live, update: () => screen.update() }
}

// ---------------------------------------------------------------- le paillasson

/** Le paillasson devant la porte des quartiers (1,1 × 0,7, au sol) : « Bienvenue chez CMDR … ». */
const quartersDoormat: Builder = () => {
  const W = 1.1, D = 0.7
  const screen = versionedScreen(660, 420, (c, v) => {
    c.fillStyle = '#c19a5e'
    c.fillRect(0, 0, 660, 420)
    // La trame de la fibre de coco.
    c.fillStyle = 'rgba(70,40,10,0.16)'
    for (let x = 0; x < 660; x += 8) c.fillRect(x, 0, 3, 420)
    c.strokeStyle = '#4a2e14'
    c.lineWidth = 14
    c.strokeRect(18, 18, 624, 384)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#3a2210'
    c.font = `700 92px ${FONT}`
    c.fillText(tr('BIENVENUE', 'WELCOME'), 330, 150)
    c.font = `700 52px ${FONT}`
    wrap(c, v ? tr(`chez ${v.name}`, `to ${v.name}'s`) : '', 330, 285, 580, 56, 2)
  })
  const g = new THREE.Group()
  g.add(box(W, 0.016, D, lit('#3a2616', 'cloth'), 0, 0.008, 0))
  const live = new THREE.Group()
  const top = decal(screen.texture, W - 0.02, D - 0.02, 0.018)
  ;(top.material as THREE.MeshLambertMaterial).transparent = false
  live.add(top)
  return { solid: g, live, update: () => screen.update() }
}

export const ANTECHAMBER = {
  'profile-frame': profileFrame,
  'quarters-doormat': quartersDoormat,
} satisfies Record<string, Builder>
