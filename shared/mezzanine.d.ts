/** Plan d'une mezzanine (cf. MEZZANINES dans ship-layouts.js). */
export interface MezzanineDef {
  /** Pièce où elle est posée (lettre du plan du pont). */
  room: string
  /** Hauteur de son plancher au-dessus du sol du pont. */
  height: number
  /** 'M' plancher ; '^', '>', 'v', '<' marche d'escalier qui monte dans ce sens ; ' ' sol du pont. */
  plan: string[]
}

/** Tuile de la mezzanine : plancher (`stair` -1) ou marche d'une volée (`stair` : sens de montée). */
export interface MezzanineTile {
  x: number
  z: number
  stair: number
  /** Rang de la marche dans sa volée (0 en bas), et nombre de marches de la volée. */
  step: number
  run: number
}

export interface Mezzanine {
  height: number
  tiles: Map<string, MezzanineTile>
}

export declare function parseMezzanine(def: Pick<MezzanineDef, 'height' | 'plan'>): Mezzanine
export declare function mezzanineTile(mezz: Mezzanine, x: number, z: number): MezzanineTile | undefined
/** Hauteur du sol en (x, z) : le plancher, les escaliers qui y montent ; 0 ailleurs. */
export declare function mezzanineHeight(mezz: Mezzanine, x: number, z: number): number
/** Garde-corps : arêtes (tuile, direction) qu'on ne franchit pas entre le sol, les escaliers et le plancher. */
export declare function mezzanineRails(mezz: Mezzanine, inRoom: (x: number, z: number) => boolean): { x: number; z: number; dir: number }[]
