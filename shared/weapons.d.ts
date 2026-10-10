export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'launcher'

export interface WeaponStats {
  /** Tire tant que la détente est tenue. */
  auto: boolean
  /** Délai entre deux tirs, taille du chargeur, durée du rechargement (secondes). */
  interval: number
  mag: number
  reload: number
  /** Vitesse de la balle (tuiles par seconde). */
  speed: number
  /** La balle traverse ce qu'elle touche. */
  pierce: boolean
  /** Balles par tir (la gerbe du fusil à pompe) : chacune part dans le cône de dispersion de l'arme. */
  pellets: number
  /** Rayon de l'explosion à l'impact (0 : aucune). */
  blast: number
  /** Dispersion de l'arme au repos (degrés). */
  spread: number
  /** Poids : ce qu'il reste de la vitesse de marche, arme en main (1 : rien de perdu). */
  weight: number
  /** Arène : points de vie retirés par balle (au centre de l'explosion pour le lance-plasma). */
  damage: number
  /** Arène : distance d'où un bot s'en sert (tuiles). */
  reach: number
}

export declare const WEAPON_STATS: Record<WeaponId, WeaponStats>
export declare const WEAPON_IDS: WeaponId[]
