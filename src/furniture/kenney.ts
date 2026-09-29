import * as THREE from 'three'
import { packModel } from '../assets'
import { FABRIC } from './cozy'
import { compact, cylinder, glass, glow, lit, part, type Builder } from './kit'

/*
 * Le Furniture Kit de Kenney (CC0) : salle de bain, cuisine, salon, chambre. Ses modèles sont
 * rangés dans un seul fichier (cf. scripts/import-kenney-furniture.mjs), colorés par matériau
 * (bois, métal, tissu, verre…), sans texture. Chaque constructeur en clone un, le remet à
 * l'échelle du vaisseau (le kit n'est pas homogène : ses toilettes sont bien plus grandes que
 * ses chaises), le tourne face à +z, le pose au sol (ou au mur, dos contre lui), et le repeint
 * selon sa variante (cf. paint()) ; son bois prend par défaut celui du bord. Le verre reste à part,
 * translucide ; les abat-jour s'allument.
 */

/**
 * Comment repeindre un modèle selon sa variante (le `label` du meuble) : tissu, essence de bois,
 * couleur d'électroménager, émail des sanitaires, finition du métal, pelage.
 */
type Paint = 'fabric' | 'wood' | 'appliance' | 'porcelain' | 'metal' | 'fur'

interface KitDef {
  /** Nom du modèle dans le kit. */
  file: string
  /** Échelle vers le vaisseau (une chaise du kit fait 0,47 de haut, celles du vaisseau 0,55). */
  s: number
  /** Quarts de tour qui le mettent face à +z. */
  r?: number
  /** Accroché au mur : hauteur de son bas (dos contre le mur, en z = 0). */
  wall?: number
  /** Suspendu : hauteur de son bas (sous une tige qui monte au plafond). */
  hang?: number
  /** Variantes : ce qu'elles repeignent. */
  paint?: Paint
  /** Teintes : ce qu'elles repeignent (le cadre d'un canapé, la nappe d'une table). */
  tint?: Paint
  /** Électroménager : le matériau du kit qui fait sa carrosserie (« metalLight » par défaut). */
  body?: string
  /** Garde les couleurs du kit (le carton : son « bois » n'en est pas). */
  raw?: boolean
}

/**
 * Essences et laques du bois (matériaux « wood » et « woodDark » du kit). `oak`, par défaut, est
 * le bois du bord (celui du mobilier fait main des quartiers, cf. cozy.ts) : tout meuble du kit
 * sans choix d'essence le prend aussi, pour ses pieds, ses cadres ou son pot. `light-oak` : le
 * chêne clair d'origine du kit.
 */
export const WOODS: Record<string, [string, string] | null> = {
  oak: ['#9a6a45', '#6b4630'],
  honey: ['#c98f4e', '#a8733c'],
  walnut: ['#7a4e32', '#5a3822'],
  'light-oak': null,
  terracotta: ['#b8653f', '#8a4a32'],
  cream: ['#e9dcc4', '#c9b79a'],
  white: ['#eeeae2', '#cfc9bd'],
  sage: ['#9ab39a', '#7d977e'],
  teal: ['#3f7f7c', '#2f625f'],
  navy: ['#34507a', '#263c5c'],
  graphite: ['#4a4f58', '#353a42'],
}

/** Couleurs de l'électroménager (sa carrosserie, cf. KitDef.body) ; `steel` : celle d'origine. */
export const APPLIANCES: Record<string, string | null> = {
  steel: null,
  white: '#f2f1ec',
  cream: '#f1e3c2',
  mint: '#a8e0cc',
  sky: '#8fb3c9',
  orange: '#e0782f',
  red: '#d8453b',
  graphite: '#4a4f58',
  black: '#2b2d31',
}

/** Émail des sanitaires (matériaux « carpetWhite » et « _defaultMat » du kit) ; `white` : celui d'origine. */
export const PORCELAINS: Record<string, string | null> = {
  white: null,
  cream: '#efe3cf',
  sage: '#9fb59a',
  rose: '#d9a0a0',
  sky: '#8fb3c9',
  teal: '#3f7f7c',
  black: '#2f3136',
}

/** Finitions du métal (matériau « metal » du kit : pieds de lampe, poubelle, tables en verre) ; `chrome` : celle d'origine. */
export const METALS: Record<string, string | null> = {
  chrome: null,
  brass: '#c9a24a',
  copper: '#b8703f',
  gunmetal: '#5a616b',
  black: '#2b2d31',
  white: '#eeeae2',
  orange: '#e0782f',
}

/** Pelages du nounours (matériau « fur » du kit) ; `beige` : celui d'origine. */
export const FURS: Record<string, string | null> = {
  honey: '#b98a55',
  beige: null,
  brown: '#6e4a32',
  white: '#efe8dc',
  grey: '#8a8f98',
  pink: '#e3a3b4',
  blue: '#7fa6cf',
}

const darker = (hex: string, k = 0.72) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()

/** Couleur de `label` dans `table`, sinon celle par défaut (la première) ; `null` : la couleur du kit. */
const pick = <T>(table: Record<string, T>, label: string | undefined): T => (label !== undefined && label in table ? table[label] : Object.values(table)[0])

/**
 * Matériau d'une pièce du modèle, selon son nom dans le kit et le `label` du meuble : sa variante
 * repeint ce que dit `paint`, sa teinte (après « : », cf. `tints` au catalogue) ce que dit `tint`.
 */
function paint(source: THREE.Material, def: KitDef, label: string | undefined): THREE.Material {
  const name = source.name
  if (name === 'lamp') return glow('#fff0c8')
  if (def.raw) return source
  const [variant, tint] = (label ?? '').split(':')
  const has = (p: Paint) => def.paint === p || def.tint === p
  const choice = (p: Paint) => (def.paint === p ? variant : def.tint === p ? tint : undefined)
  let color: string | null | undefined
  if (has('appliance') && name === (def.body ?? 'metalLight')) {
    color = pick(APPLIANCES, choice('appliance'))
  } else if (name === 'wood' || name === 'woodDark') {
    if (has('fur')) {
      // Le « bois » du nounours est son pelage clair : un ton au-dessus du pelage choisi.
      const fur = pick(FURS, choice('fur'))
      color = fur && darker(fur, 1.16)
    } else {
      // Le bois : l'essence choisie, sinon celle du bord.
      const wood = pick(WOODS, choice('wood'))
      color = wood?.[name === 'wood' ? 0 : 1]
    }
  } else if (has('fabric') && (name === 'carpet' || name === 'carpetBlue' || name === 'carpetDarker')) {
    const fabric = FABRIC[choice('fabric') ?? '']
    color = fabric && (name === 'carpetDarker' ? darker(fabric) : fabric)
  } else if (has('porcelain') && (name === 'carpetWhite' || name === '_defaultMat')) {
    color = pick(PORCELAINS, choice('porcelain'))
  } else if (has('metal') && name === 'metal') {
    color = pick(METALS, choice('metal'))
  } else if (has('fur') && name === 'fur') {
    color = pick(FURS, choice('fur'))
  }
  return color ? lit(color) : source
}

/** Verre des cabines de douche, des vitrines de four, des tables basses. */
const GLASS = '#cfeee8'

function kit(def: KitDef): Builder {
  return ({ label }) => {
    const turn = new THREE.Group()
    turn.add(packModel(def.file).clone(true))
    turn.rotation.y = ((def.r ?? 0) * Math.PI) / 2
    turn.scale.setScalar(def.s)
    const root = new THREE.Group().add(turn)
    root.updateMatrixWorld(true)
    // Recentré : au sol (ou au mur, dos en z = 0), centré sur l'origine.
    const box = new THREE.Box3().setFromObject(root)
    const lift = def.wall ?? def.hang ?? 0
    turn.position.set(-(box.min.x + box.max.x) / 2, lift - box.min.y, def.wall !== undefined ? -box.min.z : -(box.min.z + box.max.z) / 2)
    root.updateMatrixWorld(true)
    const live = new THREE.Group()
    const glassy: THREE.Mesh[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const source = m.material as THREE.Material
      if (source.name === 'glass') glassy.push(m)
      else m.material = paint(source, def, label)
    })
    // Le verre, translucide, reste à part (cf. glass()).
    for (const m of glassy) {
      live.add(part(m.geometry.clone().applyMatrix4(m.matrixWorld), glass(GLASS, 0.35)))
      m.removeFromParent()
    }
    if (def.hang !== undefined) {
      // La tige, du plafond (au-dessus des murs) au modèle.
      const top = new THREE.Box3().setFromObject(root).max.y
      root.add(cylinder(0.012, 0.012, 1.02 - top, lit('#3a3e46'), 0, (1.02 + top) / 2, 0, 6))
    }
    return live.children.length ? { solid: root, live } : { solid: root }
  }
}

/**
 * Ventilateur de plafond : ses pales tournent (tout le modèle, compacté, dans `live`) autour du
 * moyeu (la pièce de métal clair), qui devient l'origine du meuble ; la tige reste fixe.
 */
const ceilingFan: Builder = (o) => {
  const root = kit({ file: 'ceilingFan', s: 1.3, hang: 0.8, paint: 'wood' })(o).solid!
  const rod = root.children[1]
  rod.removeFromParent()
  const hub = new THREE.Box3()
  root.traverse((m) => {
    if ((m as THREE.Mesh).isMesh && ((m as THREE.Mesh).material as THREE.Material).name === 'metalLight') hub.expandByObject(m)
  })
  const center = hub.getCenter(new THREE.Vector3())
  const rotor = compact(root)
  rotor.position.set(-center.x, 0, -center.z)
  const spin = new THREE.Group().add(rotor)
  return {
    solid: new THREE.Group().add(rod),
    live: spin,
    update(t) {
      spin.rotation.y = t * 4
    },
  }
}

const DEFS = {
  // --- Salle de bain
  'k-toilet': { file: 'toilet', s: 1, paint: 'porcelain' },
  'k-toilet-square': { file: 'toiletSquare', s: 1, paint: 'porcelain' },
  'k-bathtub': { file: 'bathtub', s: 1.15, paint: 'porcelain' },
  'k-shower': { file: 'shower', s: 0.9, paint: 'porcelain' },
  'k-shower-round': { file: 'showerRound', s: 0.9, paint: 'porcelain' },
  'k-bathroom-sink': { file: 'bathroomSink', s: 1.2, paint: 'porcelain' },
  'k-bathroom-sink-square': { file: 'bathroomSinkSquare', s: 1.2, paint: 'porcelain' },
  'k-bathroom-mirror': { file: 'bathroomMirror', s: 1.2, wall: 0.38, paint: 'wood' },
  'k-bathroom-cabinet': { file: 'bathroomCabinet', s: 1.3, wall: 0.42, paint: 'wood' },
  'k-bathroom-vanity': { file: 'bathroomCabinetDrawer', s: 1.2, paint: 'wood' },
  'k-washer': { file: 'washer', s: 1.25, paint: 'appliance' },
  'k-dryer': { file: 'dryer', s: 1.25, paint: 'appliance' },
  'k-washer-dryer': { file: 'washerDryerStacked', s: 1.05, paint: 'appliance' },
  'k-trashcan': { file: 'trashcan', s: 0.8, paint: 'metal' },
  'k-bath-mat': { file: 'rugDoormat', s: 1.4 },
  // --- Cuisine
  'k-fridge': { file: 'kitchenFridge', s: 1.05, paint: 'appliance' },
  'k-fridge-large': { file: 'kitchenFridgeLarge', s: 1.05, paint: 'appliance' },
  'k-fridge-small': { file: 'kitchenFridgeSmall', s: 1.2, paint: 'appliance' },
  'k-stove': { file: 'kitchenStove', s: 1.3, paint: 'wood' },
  'k-stove-electric': { file: 'kitchenStoveElectric', s: 1.3, paint: 'wood' },
  'k-kitchen-sink': { file: 'kitchenSink', s: 1.3, paint: 'wood' },
  'k-kitchen-cabinet': { file: 'kitchenCabinet', s: 1.3, paint: 'wood' },
  'k-kitchen-drawers': { file: 'kitchenCabinetDrawer', s: 1.3, paint: 'wood' },
  'k-kitchen-corner': { file: 'kitchenCabinetCornerInner', s: 1.3, paint: 'wood' },
  'k-kitchen-upper': { file: 'kitchenCabinetUpper', s: 1.3, wall: 0.44, paint: 'wood' },
  'k-kitchen-upper-double': { file: 'kitchenCabinetUpperDouble', s: 1.3, wall: 0.44, paint: 'wood' },
  'k-kitchen-bar': { file: 'kitchenBar', s: 1.3, paint: 'wood' },
  'k-kitchen-bar-end': { file: 'kitchenBarEnd', s: 1.3, paint: 'wood' },
  'k-microwave': { file: 'kitchenMicrowave', s: 1.2, paint: 'appliance', body: 'carpetWhite' },
  'k-coffee-machine': { file: 'kitchenCoffeeMachine', s: 1.2, paint: 'appliance', body: 'metalMedium' },
  'k-toaster': { file: 'toaster', s: 1.1, paint: 'appliance', body: 'metal' },
  'k-blender': { file: 'kitchenBlender', s: 1.2, paint: 'appliance', body: 'metalMedium' },
  'k-hood': { file: 'hoodModern', s: 1.3, wall: 0.46, paint: 'appliance', body: 'metalMedium' },
  'k-bar-stool': { file: 'stoolBar', s: 1.3, paint: 'fabric', tint: 'wood' },
  'k-bar-stool-square': { file: 'stoolBarSquare', s: 1.3, paint: 'fabric', tint: 'wood' },
  'k-dining-table': { file: 'tableCross', s: 1.3, paint: 'wood' },
  'k-dining-table-cloth': { file: 'tableCrossCloth', s: 1.3, paint: 'wood', tint: 'fabric' },
  'k-round-table': { file: 'tableRound', s: 1.25, paint: 'wood' },
  'k-table-cloth': { file: 'tableCloth', s: 1.3, paint: 'wood', tint: 'fabric' },
  // --- Salon
  'k-lounge-sofa': { file: 'loungeSofa', s: 1.4, paint: 'fabric' },
  'k-lounge-sofa-long': { file: 'loungeSofaLong', s: 1.4, paint: 'fabric' },
  'k-lounge-sofa-corner': { file: 'loungeSofaCorner', s: 1.4, paint: 'fabric' },
  'k-ottoman': { file: 'loungeSofaOttoman', s: 1.4, paint: 'fabric' },
  'k-lounge-chair': { file: 'loungeChair', s: 1.4, paint: 'fabric' },
  'k-lounge-chair-relax': { file: 'loungeChairRelax', s: 1.3, paint: 'fabric' },
  'k-design-chair': { file: 'loungeDesignChair', s: 1.4, paint: 'fabric' },
  'k-design-sofa': { file: 'loungeDesignSofa', s: 1.4, paint: 'fabric' },
  'k-design-sofa-corner': { file: 'loungeDesignSofaCorner', s: 1.4, paint: 'fabric' },
  'k-coffee-table-glass': { file: 'tableCoffeeGlass', s: 1.4, paint: 'metal' },
  'k-coffee-table-square': { file: 'tableCoffeeSquare', s: 1.4, paint: 'wood' },
  'k-glass-table': { file: 'tableGlass', s: 1.3, paint: 'metal' },
  'k-chair-modern': { file: 'chairModernCushion', s: 1.25, paint: 'fabric', tint: 'metal' },
  'k-chair-modern-frame': { file: 'chairModernFrameCushion', s: 1.25, paint: 'fabric', tint: 'metal' },
  'k-chair-rounded': { file: 'chairRounded', s: 1.25, paint: 'wood' },
  'k-desk-chair': { file: 'chairDesk', s: 1.15, paint: 'fabric' },
  'k-low-bench': { file: 'benchCushionLow', s: 1.4, paint: 'fabric', tint: 'wood' },
  'k-side-table-drawers': { file: 'sideTableDrawers', s: 1.3, paint: 'wood' },
  'k-tv-cabinet': { file: 'cabinetTelevision', s: 1.35, paint: 'wood' },
  'k-tv-cabinet-doors': { file: 'cabinetTelevisionDoors', s: 1.35, paint: 'wood' },
  'k-tv-modern': { file: 'televisionModern', s: 1 },
  'k-tv-vintage': { file: 'televisionVintage', s: 1, paint: 'wood' },
  'k-speaker-tall': { file: 'speaker', s: 1.2, paint: 'wood' },
  'k-speaker-small': { file: 'speakerSmall', s: 1.2, paint: 'wood' },
  'k-lamp-round-floor': { file: 'lampRoundFloor', s: 1.15, paint: 'metal' },
  'k-lamp-square-floor': { file: 'lampSquareFloor', s: 1.15, paint: 'metal' },
  'k-lamp-round-table': { file: 'lampRoundTable', s: 1.1, paint: 'metal' },
  'k-lamp-square-table': { file: 'lampSquareTable', s: 1.1, paint: 'metal' },
  'k-lamp-wall': { file: 'lampWall', s: 1.2, wall: 0.62 },
  'k-coat-rack': { file: 'coatRackStanding', s: 1.15, paint: 'wood' },
  'k-coat-rack-wall': { file: 'coatRack', s: 1.2, wall: 0.5, paint: 'wood' },
  'k-bear': { file: 'bear', s: 0.55, paint: 'fur' },
  'k-bear-giant': { file: 'bear', s: 1.3, paint: 'fur' },
  'k-pillow': { file: 'pillow', s: 1, paint: 'fabric' },
  'k-pillow-long': { file: 'pillowLong', s: 1, paint: 'fabric' },
  'k-plant-small-1': { file: 'plantSmall1', s: 1.3, paint: 'wood' },
  'k-plant-small-2': { file: 'plantSmall2', s: 1.3, paint: 'wood' },
  'k-plant-small-3': { file: 'plantSmall3', s: 1.3, paint: 'wood' },
  'k-potted-plant': { file: 'pottedPlant', s: 1.2, paint: 'wood' },
  'k-laptop': { file: 'laptop', s: 0.9 },
  'k-computer-screen': { file: 'computerScreen', s: 1 },
  'k-keyboard': { file: 'computerKeyboard', s: 1 },
  'k-desk': { file: 'desk', s: 1.45, paint: 'wood' },
  'k-desk-corner': { file: 'deskCorner', s: 1.45, paint: 'wood' },
  // --- Rangements, chambre, tapis
  'k-bookcase-open': { file: 'bookcaseOpen', s: 1.1, paint: 'wood' },
  'k-bookcase-low': { file: 'bookcaseOpenLow', s: 1.1, paint: 'wood' },
  'k-bookcase-doors': { file: 'bookcaseClosedDoors', s: 1.1, paint: 'wood' },
  'k-bookcase-wide': { file: 'bookcaseClosedWide', s: 1.1, paint: 'wood' },
  'k-box-closed': { file: 'cardboardBoxClosed', s: 1.2, raw: true },
  'k-box-open': { file: 'cardboardBoxOpen', s: 1.2, raw: true },
  'k-bed-bunk': { file: 'bedBunk', s: 1.1, paint: 'fabric', tint: 'wood' },
  'k-bed-double': { file: 'bedDouble', s: 1.35, paint: 'fabric', tint: 'wood' },
  'k-bed-single': { file: 'bedSingle', s: 1.35, paint: 'fabric', tint: 'wood' },
  'k-nightstand': { file: 'cabinetBedDrawerTable', s: 1.4, paint: 'wood' },
  'k-nightstand-drawers': { file: 'cabinetBedDrawer', s: 1.4, paint: 'wood' },
  'k-rug-rectangle': { file: 'rugRectangle', s: 1.2, paint: 'fabric' },
  'k-rug-rounded': { file: 'rugRounded', s: 1.2, paint: 'fabric' },
  'k-rug-square': { file: 'rugSquare', s: 1.2, paint: 'fabric' },
  'k-rug-disc': { file: 'rugRound', s: 1.2, paint: 'fabric' },
} as const satisfies Record<string, KitDef>

export const KENNEY = {
  ...(Object.fromEntries(Object.entries(DEFS).map(([id, def]) => [id, kit(def)])) as Record<keyof typeof DEFS, Builder>),
  'k-ceiling-fan': ceilingFan,
}
