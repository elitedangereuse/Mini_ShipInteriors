import { tr } from '../i18n'
import { $ } from '../ui'

/*
 * Le voyage en Krait entre le hangar du vaisseau et l'avant-poste Bradbury : l'écran de
 * chargement, qui couvre le changement de pont (et, au premier voyage, le chargement de la base).
 * La trajectoire est la jauge : un arc du vaisseau au sol, que le Krait parcourt ; la planète rouge
 * monte et remplit l'écran à la descente (lueur de rentrée atmosphérique à mi-course), s'enfonce à
 * la remontée ; l'altitude défile. Le Krait attend en fin d'approche tant que la base n'est pas
 * prête.
 */

const NS = 'http://www.w3.org/2000/svg'
/** Durée du vol, hors attente du chargement (s). */
const FLIGHT = 5.2
/** Fondus d'entrée et de sortie (s). */
const FADE = 0.45
/** Où le Krait attend que la base soit prête (fraction du trajet). */
const HOLD = 0.9
/** Altitude de départ affichée (m) : l'orbite basse où croise le vaisseau. */
const ORBIT = 18400

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  parent?.appendChild(e)
  return e
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const smooth = (t: number) => t * t * (3 - 2 * t)

export interface FlightPlan {
  /** Descente vers la base (true), ou remontée vers le vaisseau. */
  down: boolean
  /** Destination : son nom, et d'où elle est. */
  title: string
  where: string
  /** Prête (base chargée) : le Krait peut finir son approche. */
  ready: Promise<unknown>
  /** Tout est noir : on change de pont. */
  swap: () => void
  /** Avancement du vol, à chaque image (0…1), pour le son. */
  progress?: (t: number) => void
}

export class FlightScreen {
  private readonly root = $('flight')
  private readonly planet: SVGGElement
  private readonly path: SVGPathElement
  private readonly trail: SVGPathElement
  private readonly krait: SVGGElement
  private readonly heat: SVGEllipseElement
  private readonly dust: SVGGElement
  private readonly stars: SVGGElement
  private readonly dir: HTMLElement
  private readonly title: HTMLElement
  private readonly where: HTMLElement
  private readonly altitude: HTMLElement
  private length = 0
  busy = false

  constructor() {
    const svg = el('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'xMidYMid slice', class: 'flight-sky', 'aria-hidden': 'true' })
    const defs = el('defs', {}, svg)
    const rock = el('radialGradient', { id: 'flight-rock', cx: '0.42', cy: '0.18', r: '0.9' }, defs)
    el('stop', { offset: '0', 'stop-color': '#e98a5c' }, rock)
    el('stop', { offset: '0.35', 'stop-color': '#c8562f' }, rock)
    el('stop', { offset: '1', 'stop-color': '#4a1d14' }, rock)
    const air = el('radialGradient', { id: 'flight-air', cx: '0.5', cy: '0.5', r: '0.5' }, defs)
    el('stop', { offset: '0.9', 'stop-color': '#ffb37a', 'stop-opacity': '0' }, air)
    el('stop', { offset: '0.955', 'stop-color': '#ffb37a', 'stop-opacity': '0.55' }, air)
    el('stop', { offset: '1', 'stop-color': '#ffb37a', 'stop-opacity': '0' }, air)
    const glow = el('radialGradient', { id: 'flight-heat' }, defs)
    el('stop', { offset: '0', 'stop-color': '#fff4d8', 'stop-opacity': '0.95' }, glow)
    el('stop', { offset: '0.4', 'stop-color': '#ff8a1c', 'stop-opacity': '0.6' }, glow)
    el('stop', { offset: '1', 'stop-color': '#ff3b1c', 'stop-opacity': '0' }, glow)

    // Étoiles fixes, tirées une fois.
    this.stars = el('g', { class: 'flight-stars' }, svg)
    for (let i = 0; i < 90; i++) {
      el('circle', { cx: (Math.random() * 1600).toFixed(0), cy: (Math.random() * 900).toFixed(0), r: (0.6 + Math.random() * 1.4).toFixed(1), opacity: (0.25 + Math.random() * 0.6).toFixed(2) }, this.stars)
    }
    // La planète : un disque immense dont on voit le bord, et la lueur de son atmosphère.
    this.planet = el('g', {}, svg)
    el('circle', { cx: 800, cy: 2300, r: 1650, fill: 'url(#flight-air)', transform: 'scale(1.06)', 'transform-origin': '800 2300' }, this.planet)
    el('circle', { cx: 800, cy: 2300, r: 1560, fill: 'url(#flight-rock)' }, this.planet)
    // Quelques plateaux et cratères sur le disque, pour sentir la surface approcher.
    for (const [x, y, rx, ry] of [[520, 900, 90, 22], [980, 820, 60, 14], [1240, 960, 120, 26], [300, 1020, 70, 18], [760, 1040, 150, 30]]) {
      el('ellipse', { cx: x, cy: y, rx, ry, fill: '#8f3a22', opacity: 0.55 }, this.planet)
    }
    // La trajectoire, du vaisseau (en haut à droite) à la base (en bas à gauche), et la part parcourue.
    const d = 'M 1420 120 C 1180 180, 760 260, 560 700'
    this.path = el('path', { d, class: 'flight-path' }, svg)
    this.trail = el('path', { d, class: 'flight-trail' }, svg)
    el('circle', { cx: 1420, cy: 120, r: 7, class: 'flight-end' }, svg)
    el('circle', { cx: 560, cy: 700, r: 7, class: 'flight-end' }, svg)
    // Le Krait : un delta blanc, ses deux blocs moteurs, sa verrière (nez vers +x).
    this.heat = el('ellipse', { cx: 0, cy: 0, rx: 70, ry: 42, fill: 'url(#flight-heat)', opacity: 0 }, svg)
    this.krait = el('g', { class: 'flight-krait' }, svg)
    el('polygon', { points: '30,0 -18,-26 -22,-24 -16,0 -22,24 -18,26', fill: '#eef1f5' }, this.krait)
    el('polygon', { points: '10,0 -18,-9 -18,9', fill: '#3a3f4a' }, this.krait)
    el('rect', { x: -24, y: -12, width: 8, height: 7, fill: '#2b2f38' }, this.krait)
    el('rect', { x: -24, y: 5, width: 8, height: 7, fill: '#2b2f38' }, this.krait)
    el('ellipse', { cx: 12, cy: 0, rx: 6, ry: 3, fill: '#9fd8ff' }, this.krait)
    // Poussière soulevée au posé.
    this.dust = el('g', { class: 'flight-dust', opacity: 0 }, svg)
    for (const [x, r] of [[-60, 34], [-20, 46], [30, 40], [70, 30]]) el('circle', { cx: 560 + x, cy: 712, r, fill: '#d98a62' }, this.dust)
    this.root.prepend(svg)

    this.dir = this.root.querySelector('.flight-dir')!
    this.title = this.root.querySelector('.flight-title')!
    this.where = this.root.querySelector('.flight-where')!
    this.altitude = this.root.querySelector('.flight-altitude b')!
    this.root.querySelector('.flight-altitude span')!.textContent = tr('Altitude', 'Altitude')
    this.length = this.path.getTotalLength()
    this.trail.style.strokeDasharray = `${this.length} ${this.length}`
  }

  /** Fait le voyage : fondu au noir, vol (le pont change à la fin, écran couvert), fondu de retour. */
  async run(plan: FlightPlan): Promise<void> {
    if (this.busy) return
    this.busy = true
    let ready = false
    void plan.ready.then(() => (ready = true), () => (ready = true))
    this.root.classList.toggle('up', !plan.down)
    this.dir.textContent = plan.down ? tr('Descente vers', 'Descending to') : tr('Retour vers', 'Returning to')
    this.title.textContent = plan.title
    this.where.textContent = plan.where
    this.draw(0, plan.down)
    this.root.hidden = false
    // Laisse le navigateur poser l'état de départ avant le fondu.
    await wait(20)
    this.root.classList.add('on')
    await wait(FADE * 1000)

    const quick = reducedMotion.matches
    const start = performance.now()
    let t = 0
    await new Promise<void>((resolve) => {
      const frame = () => {
        const raw = (performance.now() - start) / 1000 / (quick ? FLIGHT / 3 : FLIGHT)
        t = Math.min(raw, ready ? 1 : HOLD)
        this.draw(t, plan.down)
        plan.progress?.(t)
        if (t >= 1) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    plan.swap()
    await wait(quick ? 150 : 650)
    this.root.classList.remove('on')
    await wait(FADE * 1000)
    this.root.hidden = true
    this.busy = false
  }

  /** L'image du vol à l'instant `t` (0…1). */
  private draw(t: number, down: boolean) {
    const k = smooth(t)
    // Le long de l'arc : du vaisseau vers la base à la descente, l'inverse à la remontée.
    const along = down ? k : 1 - k
    const p = this.path.getPointAtLength(this.length * along)
    const q = this.path.getPointAtLength(Math.min(this.length, Math.max(0, this.length * along + (down ? 2 : -2))))
    const heading = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI
    // Plus près du sol, plus gros : on le voit de plus près.
    const scale = 0.7 + along * 0.9
    this.krait.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${heading.toFixed(1)}) scale(${scale.toFixed(3)})`)
    // La part parcourue : du vaisseau au Krait à la descente, du sol au Krait à la remontée.
    this.trail.style.strokeDashoffset = `${down ? (1 - along) * this.length : -along * this.length}`
    // La planète monte et grossit à mesure qu'on descend (elle s'éloigne à la remontée).
    const zoom = 1 + along * 0.55
    this.planet.setAttribute('transform', `translate(800 ${(-along * 330).toFixed(1)}) scale(${zoom.toFixed(3)}) translate(-800 0)`)
    this.stars.setAttribute('opacity', (1 - along * 0.85).toFixed(2))
    // Rentrée atmosphérique : le Krait s'embrase au milieu de la descente (ou en quittant le sol).
    const entry = Math.max(0, 1 - Math.abs(along - 0.55) / 0.22)
    this.heat.setAttribute('opacity', (entry * 0.95).toFixed(2))
    this.heat.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${heading.toFixed(1)}) translate(-24 0)`)
    // Au ras du sol, la poussière.
    this.dust.setAttribute('opacity', (Math.max(0, (along - 0.86) / 0.14) * 0.7).toFixed(2))
    this.altitude.textContent = `${Math.round((1 - along) * ORBIT).toLocaleString()} m`
  }
}
