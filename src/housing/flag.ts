/*
 * Housing v2 (cf. docs/housing-v2.md) : tant que la refonte des quartiers n'est pas prête, le pont
 * des quartiers ne s'ouvre qu'avec `?housing-v2` dans l'adresse du jeu.
 */
export const HOUSING_V2 = typeof location !== 'undefined' && new URLSearchParams(location.search).has('housing-v2')
