/*
 * Naviguer sans souris dans les fenêtres de l'arène (le terminal, le classement, l'écran de fin) :
 * les flèches du clavier, la croix et le stick de la manette passent au bouton le plus proche dans
 * leur direction, comme sur une console ; A (ou Entrée) l'actionne. La souris et le doigt n'en ont
 * pas besoin, et rien ne change pour eux.
 */

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Ce qu'on peut atteindre dans `root`, tel qu'il est affiché. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0 && !e.closest('[hidden]'))
}

/**
 * Passe le focus à l'élément le plus proche dans la direction (dx, dy) (une seule non nulle, ±1) :
 * celui dont le bord est le plus près dans cette direction, en préférant ceux qui sont en face
 * (qui se recouvrent sur l'autre axe). Sans focus dans `root`, le premier. Rend l'élément focalisé.
 */
export function moveFocus(root: HTMLElement, dx: number, dy: number): HTMLElement | null {
  const list = focusables(root)
  if (!list.length) return null
  const from = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) && list.includes(document.activeElement) ? document.activeElement : null
  if (!from) {
    focus(list[0])
    return list[0]
  }
  const a = from.getBoundingClientRect()
  let best: HTMLElement | null = null
  let score = Infinity
  for (const e of list) {
    if (e === from) continue
    const b = e.getBoundingClientRect()
    // Son centre doit être dans la direction voulue.
    const along = (b.left + b.width / 2 - (a.left + a.width / 2)) * dx + (b.top + b.height / 2 - (a.top + a.height / 2)) * dy
    if (along <= 2) continue
    // L'écart des bords dans cette direction, et sur l'autre axe (nul s'ils se recouvrent).
    const gap = dx > 0 ? b.left - a.right : dx < 0 ? a.left - b.right : dy > 0 ? b.top - a.bottom : a.top - b.bottom
    const side = dx ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
    const offset = dx ? Math.abs(b.top + b.height / 2 - (a.top + a.height / 2)) : Math.abs(b.left + b.width / 2 - (a.left + a.width / 2))
    const s = Math.max(0, gap) + side * 3 + offset * 0.25
    if (s < score) {
      score = s
      best = e
    }
  }
  if (best) focus(best)
  return best ?? from
}

function focus(e: HTMLElement) {
  e.focus({ preventScroll: true })
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Les flèches : leur direction, ou null pour une autre touche. */
export function arrow(key: string): [number, number] | null {
  switch (key) {
    case 'ArrowLeft': return [-1, 0]
    case 'ArrowRight': return [1, 0]
    case 'ArrowUp': return [0, -1]
    case 'ArrowDown': return [0, 1]
  }
  return null
}

/**
 * Le stick (ou la croix) en directions : une au premier appui, puis, tant qu'on le tient, une
 * répétition après un temps, de plus en plus vite.
 */
export class PadRepeat {
  private dir = ''
  private wait = 0

  step(x: number, y: number, dt: number): [number, number] | null {
    const dir = Math.max(Math.abs(x), Math.abs(y)) < 0.55 ? '' : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'r' : 'l') : y > 0 ? 'd' : 'u'
    if (dir !== this.dir) {
      this.dir = dir
      this.wait = 0.38
      return dir ? STEP[dir] : null
    }
    if (!dir || (this.wait -= dt) > 0) return null
    this.wait = 0.11
    return STEP[dir]
  }
}

const STEP: Record<string, [number, number]> = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }
