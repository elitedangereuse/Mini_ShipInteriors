/** Nom de travail d'une peinture chez Frontier → nos coloris candidats (cf. public/assets/ships/paints.json). */
export declare const ELITE_PAINTS: Record<string, string | string[]>
/**
 * Le coloris d'une peinture du profil Frontier (`paintjob_krait_light_salvage_06`), parmi ceux du
 * vaisseau (`available` : son nuancier), ou null : pas de peinture, ou une peinture qu'on n'a pas.
 */
export declare function elitePaint(frontier: string | null | undefined, available: readonly string[]): string | null
