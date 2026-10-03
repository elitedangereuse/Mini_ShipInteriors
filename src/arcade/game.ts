/*
 * Socle des jeux des bornes d'arcade (Cargaison, Viper, Astéroïdes, Thargoid Invaders) : la manette, ce qu'un jeu
 * expose à la borne, et une police pixel de 5 × 7 dessinée à la main, pour écrire sur leurs
 * écrans comme en 1984. Chaque jeu est une petite machine à états, sans DOM ni son : la borne
 * (cabinet.ts) l'affiche, les écrans du vaisseau le font jouer tout seul (cf. autopilot).
 */

/** Jeux jouables ; les autres bornes (Elite, Invaders…) ne font que leur démonstration. */
export const GAME_IDS = ['cargo', 'viper', 'asteroids', 'invaders', 'fight'] as const
export type GameId = (typeof GAME_IDS)[number]

export const isGameId = (id: string | undefined): id is GameId => GAME_IDS.includes(id as GameId)

/**
 * Meilleur score de chaque jeu (cf. scores.ts) : les écrans des bornes du vaisseau l'affichent
 * pendant leur démonstration.
 */
export const records: Partial<Record<GameId, { cmdr: string; score: number }>> = {}

/** Appareils de la salle de sport : leurs séances s'inscrivent comme les scores des bornes (cf. gym.ts). */
export const SPORT_IDS = ['gym-run', 'gym-bike', 'gym-punch'] as const
export type SportId = (typeof SPORT_IDS)[number]
/** Record de chaque appareil : le tableau de la salle de sport l'affiche. */
export const sportRecords: Partial<Record<SportId, { cmdr: string; score: number }>> = {}

export type Button = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'c'

/** Terrains de la zone sportive (basket, tirs au but) : leurs parties s'inscrivent de même (cf. court.ts). */
export const COURT_IDS = ['gym-basket', 'gym-foot'] as const
export type CourtId = (typeof COURT_IDS)[number]
/** Les meilleurs de chaque terrain : l'écran de sa salle les affiche. */
export const courtBoards: Partial<Record<CourtId, { cmdr: string; score: number }[]>> = {}

/** Manette : boutons tenus, et ceux appuyés depuis l'image précédente. */
export interface Pad {
  held: Set<Button>
  pressed: Set<Button>
  /** Deuxième manette, pour les duels locaux. */
  second?: Pad
}

export const emptyPad = (): Pad => ({ held: new Set(), pressed: new Set() })

/** Bruitages qu'un jeu demande à la borne (cf. sfx.ts). */
export type Sfx =
  | 'move' | 'rotate' | 'drop' | 'lock' | 'hold' | 'line' | 'tetra' | 'level' | 'over'
  | 'eat' | 'bonus' | 'turn'
  | 'shoot' | 'bang' | 'bang-small' | 'thrust' | 'saucer' | 'life' | 'warp' | 'beat-hi' | 'beat-lo'
  | 'zap' | 'march-1' | 'march-2' | 'march-3' | 'march-4'

export interface ArcadeGame {
  readonly id: GameId
  /** Définition de l'écran (pixels logiques) ; `smooth` : tracé vectoriel, sans agrandissement en gros pixels. */
  readonly width: number
  readonly height: number
  readonly smooth?: boolean
  readonly score: number
  /** Niveau, ou vague, atteint. */
  readonly level: number
  readonly over: boolean
  /** Record à battre, affiché par le jeu (celui du vaisseau, ou le sien). */
  best: number
  step(dt: number, pad: Pad): void
  draw(g: CanvasRenderingContext2D, t: number): void
  /** Bruitages de l'image écoulée (la borne les joue, puis vide la liste). */
  readonly sounds: Sfx[]
}

/** Aléatoire déterministe (mulberry32) : même graine, même partie de démonstration. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- police pixel

/** Glyphes de 5 × 7 : une ligne par chiffre binaire de 5 bits, du haut vers le bas. */
const GLYPHS: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0], '’': [4, 4, 8, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '/': [1, 2, 2, 4, 8, 8, 16], '%': [24, 25, 2, 4, 8, 19, 3],
  '×': [0, 17, 10, 4, 10, 17, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '#': [10, 10, 31, 10, 31, 10, 10],
  '·': [0, 0, 0, 4, 0, 0, 0], '«': [0, 5, 10, 20, 10, 5, 0], '»': [0, 20, 10, 5, 10, 20, 0], '“': [10, 10, 20, 0, 0, 0, 0],
  '”': [5, 5, 10, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
  '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 21, 14, 31, 14, 21, 0], '_': [0, 0, 0, 0, 0, 0, 31], '…': [0, 0, 0, 0, 0, 0, 21],
}

/** Lettres accentuées : la lettre de base et son accent, dessiné au-dessus (ou dessous, la cédille). */
const MARKS: Record<string, [string, number[]]> = {
  É: ['E', [2, 4]], È: ['E', [8, 4]], Ê: ['E', [4, 10]], Ë: ['E', [0, 10]], À: ['A', [8, 4]], Â: ['A', [4, 10]], Ä: ['A', [0, 10]],
  Î: ['I', [4, 10]], Ï: ['I', [0, 10]], Ô: ['O', [4, 10]], Ö: ['O', [0, 10]], Û: ['U', [4, 10]], Ù: ['U', [8, 4]], Ü: ['U', [0, 10]],
  Ç: ['C', [4, 12]],
}

/** Largeur d'un texte, en pixels (5 par lettre, 1 d'espace entre elles), à l'échelle `scale`. */
export function textWidth(text: string, scale = 1): number {
  return text.length ? (text.length * 6 - 1) * scale : 0
}

/**
 * Écrit un texte en capitales pixel. `x` : gauche, centre ou droite selon `align` ; `y` : haut
 * des lettres (les accents débordent de deux pixels au-dessus).
 */
export function pixelText(g: CanvasRenderingContext2D, text: string, x: number, y: number, scale = 1, align: 'left' | 'center' | 'right' = 'left') {
  const s = text.toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
  let cx = align === 'left' ? x : align === 'center' ? x - textWidth(s, scale) / 2 : x - textWidth(s, scale)
  cx = Math.round(cx)
  y = Math.round(y)
  for (const ch of s) {
    const mark = MARKS[ch]
    const rows = GLYPHS[mark ? mark[0] : ch] ?? GLYPHS['?']
    for (let r = 0; r < 7; r++) {
      const bits = rows[r]
      if (!bits) continue
      for (let c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(cx + c * scale, y + r * scale, scale, scale)
    }
    if (mark) {
      const below = ch === 'Ç'
      mark[1].forEach((bits, r) => {
        for (let c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(cx + c * scale, y + (below ? 7 + r : r - 2) * scale, scale, scale)
      })
    }
    cx += 6 * scale
  }
}

/** Score sur `digits` chiffres, complété de zéros (« 004210 »). */
export const padScore = (n: number, digits = 6) => String(Math.max(0, Math.floor(n))).padStart(digits, '0')
