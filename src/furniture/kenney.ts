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
 * selon sa variante : tissu, essence de bois, couleur d'électroménager. Le verre reste à part,
 * translucide ; les abat-jour s'allument.
 */

/** Comment repeindre un modèle selon sa variante (le `label` du meuble). */
type Paint = 'fabric' | 'wood' | 'appliance'

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
}

/** Essences et laques du bois (matériaux « wood » et « woodDark » du kit) ; `oak` : celle d'origine. */
export const WOODS: Record<string, [string, string] | null> = {
  oak: null,
  honey: ['#c98f4e', '#a8733c'],
  walnut: ['#7a4e32', '#5a3822'],
  white: ['#eeeae2', '#cfc9bd'],
  graphite: ['#4a4f58', '#353a42'],
  sage: ['#9ab39a', '#7d977e'],
}

/** Couleurs de l'électroménager (matériau « metalLight » du kit) ; `steel` : celle d'origine. */
export const APPLIANCES: Record<string, string | null> = {
  steel: null,
  white: '#f2f1ec',
  cream: '#f1e3c2',
  mint: '#a8e0cc',
  red: '#d8453b',
  black: '#2b2d31',
}

const darker = (hex: string, k = 0.72) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()

/** Matériau d'une pièce du modèle, selon son nom dans le kit et la variante. */
function paint(source: THREE.Material, def: KitDef, label: string | undefined): THREE.Material {
  const name = source.name
  if (name === 'lamp') return glow('#fff0c8')
  if (def.paint === 'fabric') {
    const color = FABRIC[label ?? '']
    if (color && (name === 'carpet' || name === 'carpetBlue')) return lit(color)
    if (color && name === 'carpetDarker') return lit(darker(color))
  } else if (def.paint === 'wood') {
    const wood = WOODS[label ?? '']
    if (wood && name === 'wood') return lit(wood[0])
    if (wood && name === 'woodDark') return lit(wood[1])
  } else if (def.paint === 'appliance') {
    const color = APPLIANCES[label ?? '']
    if (color && name === 'metalLight') return lit(color)
  }
  return source
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
  const root = kit({ file: 'ceilingFan', s: 1.3, hang: 0.8 })(o).solid!
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
  'k-toilet': { file: 'toilet', s: 1 },
  'k-toilet-square': { file: 'toiletSquare', s: 1 },
  'k-bathtub': { file: 'bathtub', s: 1.15 },
  'k-shower': { file: 'shower', s: 0.9 },
  'k-shower-round': { file: 'showerRound', s: 0.9 },
  'k-bathroom-sink': { file: 'bathroomSink', s: 1.2 },
  'k-bathroom-sink-square': { file: 'bathroomSinkSquare', s: 1.2 },
  'k-bathroom-mirror': { file: 'bathroomMirror', s: 1.2, wall: 0.38, paint: 'wood' },
  'k-bathroom-cabinet': { file: 'bathroomCabinet', s: 1.3, wall: 0.42, paint: 'wood' },
  'k-bathroom-vanity': { file: 'bathroomCabinetDrawer', s: 1.2, paint: 'wood' },
  'k-washer': { file: 'washer', s: 1.25 },
  'k-dryer': { file: 'dryer', s: 1.25 },
  'k-washer-dryer': { file: 'washerDryerStacked', s: 1.05 },
  'k-trashcan': { file: 'trashcan', s: 0.8 },
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
  'k-microwave': { file: 'kitchenMicrowave', s: 1.2 },
  'k-coffee-machine': { file: 'kitchenCoffeeMachine', s: 1.2 },
  'k-toaster': { file: 'toaster', s: 1.1 },
  'k-blender': { file: 'kitchenBlender', s: 1.2 },
  'k-hood': { file: 'hoodModern', s: 1.3, wall: 0.46 },
  'k-bar-stool': { file: 'stoolBar', s: 1.3, paint: 'fabric' },
  'k-bar-stool-square': { file: 'stoolBarSquare', s: 1.3, paint: 'fabric' },
  'k-dining-table': { file: 'tableCross', s: 1.3, paint: 'wood' },
  'k-dining-table-cloth': { file: 'tableCrossCloth', s: 1.3, paint: 'wood' },
  'k-round-table': { file: 'tableRound', s: 1.25, paint: 'wood' },
  'k-table-cloth': { file: 'tableCloth', s: 1.3, paint: 'wood' },
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
  'k-coffee-table-glass': { file: 'tableCoffeeGlass', s: 1.4 },
  'k-coffee-table-square': { file: 'tableCoffeeSquare', s: 1.4, paint: 'wood' },
  'k-glass-table': { file: 'tableGlass', s: 1.3 },
  'k-chair-modern': { file: 'chairModernCushion', s: 1.25, paint: 'fabric' },
  'k-chair-modern-frame': { file: 'chairModernFrameCushion', s: 1.25, paint: 'fabric' },
  'k-chair-rounded': { file: 'chairRounded', s: 1.25, paint: 'wood' },
  'k-desk-chair': { file: 'chairDesk', s: 1.15, paint: 'fabric' },
  'k-low-bench': { file: 'benchCushionLow', s: 1.4, paint: 'fabric' },
  'k-side-table-drawers': { file: 'sideTableDrawers', s: 1.3, paint: 'wood' },
  'k-tv-cabinet': { file: 'cabinetTelevision', s: 1.35, paint: 'wood' },
  'k-tv-cabinet-doors': { file: 'cabinetTelevisionDoors', s: 1.35, paint: 'wood' },
  'k-tv-modern': { file: 'televisionModern', s: 1 },
  'k-tv-vintage': { file: 'televisionVintage', s: 1 },
  'k-speaker-tall': { file: 'speaker', s: 1.2 },
  'k-speaker-small': { file: 'speakerSmall', s: 1.2 },
  'k-lamp-round-floor': { file: 'lampRoundFloor', s: 1.15 },
  'k-lamp-square-floor': { file: 'lampSquareFloor', s: 1.15 },
  'k-lamp-round-table': { file: 'lampRoundTable', s: 1.1 },
  'k-lamp-square-table': { file: 'lampSquareTable', s: 1.1 },
  'k-lamp-wall': { file: 'lampWall', s: 1.2, wall: 0.62 },
  'k-coat-rack': { file: 'coatRackStanding', s: 1.15, paint: 'wood' },
  'k-coat-rack-wall': { file: 'coatRack', s: 1.2, wall: 0.5, paint: 'wood' },
  'k-bear': { file: 'bear', s: 0.55 },
  'k-bear-giant': { file: 'bear', s: 1.3 },
  'k-pillow': { file: 'pillow', s: 1, paint: 'fabric' },
  'k-pillow-long': { file: 'pillowLong', s: 1, paint: 'fabric' },
  'k-plant-small-1': { file: 'plantSmall1', s: 1.3 },
  'k-plant-small-2': { file: 'plantSmall2', s: 1.3 },
  'k-plant-small-3': { file: 'plantSmall3', s: 1.3 },
  'k-potted-plant': { file: 'pottedPlant', s: 1.2 },
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
  'k-box-closed': { file: 'cardboardBoxClosed', s: 1.2 },
  'k-box-open': { file: 'cardboardBoxOpen', s: 1.2 },
  'k-bed-bunk': { file: 'bedBunk', s: 1.1, paint: 'fabric' },
  'k-bed-double': { file: 'bedDouble', s: 1.35, paint: 'fabric' },
  'k-bed-single': { file: 'bedSingle', s: 1.35, paint: 'fabric' },
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
