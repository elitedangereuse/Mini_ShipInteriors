// Les armes du stand de tir, en chiffres (src/range-weapons.ts y ajoute les noms, les modèles, le
// recul et la dispersion au fil des tirs). Dans l'arène, chacun se bat avec l'arme de son
// personnage (cf. ARENA_CHARACTERS dans shared/arena.js).
//
// - `auto` : tire tant que la détente est tenue ;
// - `interval`, `mag`, `reload` : délai entre deux tirs, taille du chargeur, durée du rechargement (s) ;
// - `speed` : vitesse de la balle (tuiles par seconde) ; `pierce` : elle traverse ce qu'elle touche ;
// - `pellets` : balles par tir (la gerbe du fusil à pompe) ; `spread` : dispersion au repos (degrés) ;
// - `blast` : rayon de l'explosion à l'impact (0 : aucune) ;
// - `weight` : ce qu'il reste de la vitesse de marche, arme en main (1 : rien de perdu).

export const WEAPON_STATS = {
  pistol: { auto: false, interval: 0.16, mag: 10, reload: 0.9, speed: 46, pierce: false, pellets: 1, blast: 0, spread: 0.15, weight: 1 },
  smg: { auto: true, interval: 0.08, mag: 32, reload: 1.9, speed: 48, pierce: false, pellets: 1, blast: 0, spread: 1.3, weight: 0.95 },
  shotgun: { auto: false, interval: 0.95, mag: 4, reload: 2.4, speed: 42, pierce: false, pellets: 9, blast: 0, spread: 5, weight: 0.88 },
  rifle: { auto: false, interval: 1, mag: 3, reload: 2.3, speed: 100, pierce: true, pellets: 1, blast: 0, spread: 0, weight: 0.8 },
  launcher: { auto: false, interval: 1.2, mag: 2, reload: 2.8, speed: 12, pierce: false, pellets: 1, blast: 0.9, spread: 0.3, weight: 0.72 },
}

export const WEAPON_IDS = Object.keys(WEAPON_STATS)
