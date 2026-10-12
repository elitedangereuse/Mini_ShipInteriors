/*
 * Les peintures d'Elite Dangerous telles que Frontier les nomme dans le profil du CMDR (le module
 * `PaintJob` de son vaisseau : `paintjob_krait_light_salvage_06`), et nos coloris (les identifiants
 * de public/assets/ships/paints.json, tirés des noms de la boutique : `salvage-black`).
 *
 * Le nom de Frontier : `paintjob_`, le vaisseau, puis la peinture. Le vaisseau n'y est pas toujours
 * écrit comme dans `ship.name` (`feddropship`, `empiretrader`, `cobra`) : on ne le lit pas, on essaie
 * chaque fin du nom, de la plus longue à la plus courte. La peinture, elle, porte un nom de travail
 * qui n'est presque jamais celui de la boutique (`blackfriday_01` : Midnight Black), et qui change
 * de sens d'un vaisseau à l'autre (`stripe1_03` : Pharaoh Gold sur l'Asp, Rattler Blue sur le
 * Cobra) : chaque nom donne ses candidats, et c'est le nuancier du vaisseau qui tranche.
 *
 * D'où vient la table : des noms d'images de la boutique de Frontier, qui gardent souvent le nom de
 * travail à côté du nom de vente (`salvage_06_webstore_1080.png` pour « Salvage Black »), recoupés
 * avec des profils et des journaux de bord réels. Elle ne couvre pas tout le nuancier : une peinture
 * qu'elle ne connaît pas laisse le vaisseau comme il est. En ajouter une, c'est ajouter sa ligne.
 */

/** Nom de travail de la peinture → nos coloris candidats (un seul, ou plusieurs selon le vaisseau). */
export const ELITE_PAINTS = {
  blackfriday_01: 'midnight-black',
  salvage_01: 'salvage-red', salvage_02: 'salvage-green', salvage_03: 'salvage-white',
  salvage_04: 'salvage-blue', salvage_05: 'salvage-orange', salvage_06: 'salvage-black',
  tactical_white: 'tactical-ice', tactical_grey: 'tactical-graphite', tactical_green: 'tactical-olive',
  // Déduits, pas relevés : les seuls rouge et bleu de la famille.
  tactical_red: 'tactical-crimson', tactical_blue: 'tactical-cobalt',
  pulse_03: 'pulse-purple', pulse_04: 'pulse-red', pulse_05: 'pulse-orange', pulse_06: 'pulse-white',
  expressway_01: 'expressway-voyage', expressway_02: 'expressway-journey', expressway_03: 'expressway-passage',
  expressway_04: 'expressway-wayfare', expressway_05: 'expressway-wander', expressway_06: 'expressway-venture',
  hotrod_01: 'ignition-red', hotrod_03: 'ignition-orange',
  camo_01: 'camo-jungle', camo_02: 'camo-polar', camo_03: 'camo-urban', camo1_02: 'camo-urban', camo2_03: 'camo-polar',
  thirds_01: ['mohawk-red', 'mojave-red'], thirds_06: 'mojave-blue', thirds_07: 'mojave-orange',
  default_02: 'apollo-black', default_03: 'apollo-white', default_04: ['apollo-green', 'colorado-red'],
  doublestripe_05: 'sonoran-red', doublestripe_08: 'sonoran-blue',
  stripe1_02: 'rattler-orange', stripe1_03: ['pharaoh-gold', 'rattler-blue'], stripe1_04: 'pharaoh-white',
  stripe2_02: 'serpent-yellow', stripe2_03: 'serpent-red',
  faction1_01: ['pirate-faction-red', 'pirate-faction'], faction1_02: 'pirate-faction-orange',
  metallicdesign_02: 'polarity-red', metallicdesign_06: 'polarity-black',
  egypt_01: 'osiris-black-and-gold', egypt_02: 'osiris-gold-and-blue', egypt_03: 'osiris-white-and-blue',
  outrun_04: 'overdrive-blue', outrun_06: 'overdrive-pink',
  snakewrap_03: 'snake-wrap-pink', snakewrap_05: 'snake-wrap-black',
  turbulence_02: 'turbulence-white-red', turbulence_06: 'turbulence-yellow-black',
  racing_04: 'speedway-black',
  metalcamo_05: 'crossfire-black',
  lowlighteffect_01_01: 'crypsis-blue', lowlighteffect_01_02: 'crypsis-pink',
  clown_01: 'aquatic-orange',
  onionhead1_01: 'onionhead',
  heraldry2_01: 'marquess-black-and-gold', heraldry2_02: 'marquess-black-and-green', heraldry2_03: 'marquess-green-and-gold',
  heraldry2_04: 'marquess-white-and-green', heraldry2_05: 'marquess-white-and-gold', heraldry2_06: 'marquess-white-and-black',
}

/**
 * Les familles dont seul le nom diffère, la variante gardant le sien (`razormetal_silver` : Razor
 * Silver, `naval_04` : Sheer Line 04). Les autres familles qui portent leur nom de vente (Vibrant,
 * Predator, Operator, Synth, Squadron…) n'ont besoin de rien : `vibrant_blue` se lit tel quel.
 */
const FAMILIES = { razormetal: 'razor', naval: 'sheer-line' }

/** Les coloris qu'un nom de travail peut désigner : ceux de la table, puis sa lecture telle quelle. */
function candidates(key) {
  const listed = ELITE_PAINTS[key] ?? []
  const [family, ...variant] = key.split('_')
  const plain = [FAMILIES[family] ?? family, ...variant].join('-')
  return [...(Array.isArray(listed) ? listed : [listed]), plain]
}

/**
 * Le coloris d'une peinture du profil Frontier, parmi ceux du vaisseau (`available` : son nuancier),
 * ou null : pas de peinture, ou une peinture qu'on n'a pas (ou pas encore dans la table).
 */
export function elitePaint(frontier, available) {
  const parts = String(frontier ?? '').trim().toLowerCase().split('_')
  if (parts[0] !== 'paintjob') return null
  // Au moins un mot pour le vaisseau ; la fin la plus longue d'abord (`lowlighteffect_01_02` avant `01_02`).
  for (let i = 2; i < parts.length; i++) {
    const found = candidates(parts.slice(i).join('_')).find((id) => available.includes(id))
    if (found) return found
  }
  return null
}
