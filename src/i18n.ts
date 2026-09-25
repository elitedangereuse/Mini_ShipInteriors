/*
 * Langue du jeu : celle du site. Le jeu parle français si le site est en français, anglais dans
 * toutes ses autres langues (il n'est traduit qu'en anglais). Le script de tête d'index.html la
 * choisit avant le premier rendu (cf. son commentaire) et la pose sur <html lang> : l'écran de
 * démarrage et le HUD, écrits dans la page en deux langues, n'en montrent qu'une (cf. style.css).
 * Ailleurs (galerie de debug), la page reste en français.
 */

export const EN = document.documentElement.lang === 'en'

/** Texte dans la langue du joueur : le français, ou sa traduction anglaise. */
export const tr = (fr: string, en: string): string => (EN ? en : fr)

/**
 * Attributs des éléments de la page traduits en anglais : `data-en-title`, `data-en-aria-label`,
 * `data-en-placeholder` remplacent `title`, `aria-label` et `placeholder` (le texte des éléments,
 * lui, est doublé dans la page, cf. index.html).
 */
export function localizeAttributes(root: ParentNode = document) {
  if (!EN) return
  for (const attr of ['title', 'aria-label', 'placeholder']) {
    for (const el of root.querySelectorAll(`[data-en-${attr}]`)) el.setAttribute(attr, el.getAttribute(`data-en-${attr}`)!)
  }
}
