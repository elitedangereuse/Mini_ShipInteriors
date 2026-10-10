// Les armes du jeu de tir, en chiffres : ce que le client (src/range-weapons.ts, qui y ajoute les
// noms, les modèles, le recul et la dispersion au fil des tirs) et le relais (server/arena.js, qui
// arbitre les duels de l'arène) doivent lire de la même façon.
//
// - `auto` : tire tant que la détente est tenue ;
// - `interval`, `mag`, `reload` : délai entre deux tirs, taille du chargeur, durée du rechargement (s) ;
// - `speed` : vitesse de la balle (tuiles par seconde) ; `pierce` : elle traverse ce qu'elle touche ;
// - `pellets` : balles par tir (la gerbe du fusil à pompe) ; `spread` : dispersion au repos (degrés) ;
// - `blast` : rayon de l'explosion à l'impact (0 : aucune) ;
// - `weight` : ce qu'il reste de la vitesse de marche, arme en main (1 : rien de perdu) ;
// - `damage` : points de vie retirés par balle dans l'arène (100 au départ ; au centre de
//   l'explosion pour le lance-plasma), et `reach` : la distance d'où un bot s'en sert (tuiles).

export const WEAPON_STATS = {
  pistol: { auto: false, interval: 0.16, mag: 10, reload: 0.9, speed: 46, pierce: false, pellets: 1, blast: 0, spread: 0.15, weight: 1, damage: 24, reach: 7 },
  smg: { auto: true, interval: 0.08, mag: 32, reload: 1.9, speed: 48, pierce: false, pellets: 1, blast: 0, spread: 1.3, weight: 0.95, damage: 11, reach: 5.5 },
  shotgun: { auto: false, interval: 0.95, mag: 4, reload: 2.4, speed: 42, pierce: false, pellets: 9, blast: 0, spread: 5, weight: 0.88, damage: 13, reach: 3 },
  rifle: { auto: false, interval: 1, mag: 3, reload: 2.3, speed: 100, pierce: true, pellets: 1, blast: 0, spread: 0, weight: 0.8, damage: 85, reach: 10 },
  launcher: { auto: false, interval: 1.2, mag: 2, reload: 2.8, speed: 12, pierce: false, pellets: 1, blast: 0.9, spread: 0.3, weight: 0.72, damage: 90, reach: 7 },
}

export const WEAPON_IDS = Object.keys(WEAPON_STATS)
