import * as THREE from 'three'
import { DIRS, type ShipMap } from '../map'

/*
 * Champ de lumière d'un pont : l'éclairement de toutes ses lampes, calculé une fois sur le plan
 * (une petite texture vue de dessus) et lu par les shaders d'après la position du fragment.
 *
 * Le pont peut ainsi avoir autant de lampes qu'on veut : la réserve de vraies lumières (cf.
 * rig.ts) n'en porte que huit, celles qui sont près du joueur. Les murs arrêtent la lumière (une
 * lampe n'éclaire plus la pièce d'à côté), les portes et les cloisons vitrées la laissent passer.
 *
 * Tous les matériaux éclairés du jeu le reçoivent, sans y penser : le crochet `onBeforeCompile`
 * par défaut de three est remplacé ici. Un matériau qui pose le sien (cf. surfaces.ts) appelle
 * `patchLightField`.
 */

/** Texels par tuile : une tache de lumière se dessine à 25 cm près. */
const RES = 4
/** Marge autour du plan, en tuiles : du noir, pour que rien ne bave hors du pont. */
const PAD = 1
/** Hauteur d'une lampe au-dessus de ce qu'elle éclaire : elle règle la largeur de sa tache de lumière. */
const HEIGHT = 1.2
/** Part de la lumière qui passe une porte (elle s'ouvre et se ferme, le champ ne bouge pas). */
const DOOR = 0.7

/** Lampe à inscrire dans le champ, en coordonnées du pont. */
export interface FieldSource {
  x: number
  z: number
  color: THREE.Color
  intensity: number
  /** Portée, en tuiles. */
  distance: number
}

const BLACK = new THREE.DataTexture(new Uint8Array(4), 1, 1)
BLACK.needsUpdate = true

/** Uniformes communs à tous les matériaux : le champ du pont affiché, son cadre, sa force. */
const uniforms = {
  uLightField: { value: BLACK as THREE.Texture },
  /** Coin (x, z) du cadre, puis l'inverse de sa largeur et de sa profondeur. */
  uLightFieldBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLightFieldGain: { value: 0 },
}

/** Force du champ dans l'image (0 : éteint). */
export const lightFieldGain = uniforms.uLightFieldGain

/** Champ de lumière d'un pont (cf. bakeLightField) ; `dispose` quand on le remplace. */
export interface LightField {
  texture: THREE.DataTexture
  box: THREE.Vector4
}

/** Le champ que lisent les shaders ; null : aucun (les conduits, une scène sans lampes). */
export function showLightField(field: LightField | null) {
  uniforms.uLightField.value = field?.texture ?? BLACK
  if (field) uniforms.uLightFieldBox.value.copy(field.box)
}

/**
 * Rend une scène hors du vaisseau (vignette du catalogue, portrait, galerie) : le champ du pont
 * affiché ne doit pas s'y déposer.
 */
export function withoutLightField<T>(render: () => T): T {
  const gain = uniforms.uLightFieldGain.value
  uniforms.uLightFieldGain.value = 0
  try {
    return render()
  } finally {
    uniforms.uLightFieldGain.value = gain
  }
}

/**
 * Calcule le champ de lumière d'un pont.
 * @param glazed bords de tuile vitrés (cf. ShipMap.edgeKey) : la lumière les traverse
 */
export function bakeLightField(map: ShipMap, sources: FieldSource[], glazed?: Set<string>): LightField {
  const tw = map.width + 2 * PAD, th = map.height + 2 * PAD
  const W = tw * RES, H = th * RES
  // Ce que laisse passer le bord est (east) et le bord sud (south) de chaque tuile du cadre.
  const east = new Float32Array(tw * th), south = new Float32Array(tw * th)
  const pass = (x: number, z: number, dir: number) => {
    const kind = map.edge(x, z, dir)
    if (kind === 'open') return 1
    if (kind === 'door') return DOOR
    const d = DIRS[dir]
    const a = map.room(x, z), b = map.room(x + d.dx, z + d.dz)
    // Un demi-mur des quartiers, une cloison vitrée : la lumière passe par-dessus, ou au travers.
    if (a && b && map.low.has(map.edgeKey(x, z, dir))) return 1
    return a && b && glazed?.has(map.edgeKey(x, z, dir)) ? 0.85 : 0
  }
  for (let z = -PAD; z < map.height + PAD; z++) {
    for (let x = -PAD; x < map.width + PAD; x++) {
      const i = (z + PAD) * tw + x + PAD
      east[i] = pass(x, z, 1)
      south[i] = pass(x, z, 2)
    }
  }

  const light = new Float32Array(W * H * 3)
  const x0 = -PAD - 0.5, z0 = -PAD - 0.5
  for (const s of sources) {
    const stx = Math.round(s.x), stz = Math.round(s.z)
    if (!map.room(stx, stz) || s.intensity <= 0) continue
    const reach = s.distance
    const minI = Math.max(0, Math.floor((s.x - reach - x0) * RES)), maxI = Math.min(W - 1, Math.ceil((s.x + reach - x0) * RES))
    const minJ = Math.max(0, Math.floor((s.z - reach - z0) * RES)), maxJ = Math.min(H - 1, Math.ceil((s.z + reach - z0) * RES))
    for (let j = minJ; j <= maxJ; j++) {
      const pz = z0 + (j + 0.5) / RES
      for (let i = minI; i <= maxI; i++) {
        const px = x0 + (i + 0.5) / RES
        const dx = px - s.x, dz = pz - s.z
        const d2 = dx * dx + dz * dz
        if (d2 >= reach * reach) continue
        const d = Math.sqrt(d2)
        // Pleine jusqu'aux deux tiers de la portée, puis elle s'éteint en douceur.
        const edge = Math.min(1, (reach - d) / (reach * 0.35))
        // Une lampe éclaire surtout sous elle : sa tache au sol se voit, et il reste de l'ombre entre deux lampes.
        const cos2 = (HEIGHT * HEIGHT) / (d2 + HEIGHT * HEIGHT)
        let e = s.intensity * edge * edge * (3 - 2 * edge) * cos2 * Math.sqrt(cos2)
        if (e < 0.002) continue
        // Le rayon de la lampe au texel, de tuile en tuile : chaque bord franchi en retient sa part.
        let tx = stx, tz = stz
        const ex = Math.round(px), ez = Math.round(pz)
        const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1
        let tMaxX = dx !== 0 ? (tx + stepX * 0.5 - s.x) / dx : Infinity
        let tMaxZ = dz !== 0 ? (tz + stepZ * 0.5 - s.z) / dz : Infinity
        const tDX = dx !== 0 ? stepX / dx : Infinity, tDZ = dz !== 0 ? stepZ / dz : Infinity
        while ((tx !== ex || tz !== ez) && e > 0) {
          if (tMaxX < tMaxZ) {
            e *= east[(tz + PAD) * tw + (stepX > 0 ? tx : tx - 1) + PAD]
            tx += stepX
            tMaxX += tDX
          } else {
            e *= south[((stepZ > 0 ? tz : tz - 1) + PAD) * tw + tx + PAD]
            tz += stepZ
            tMaxZ += tDZ
          }
        }
        if (e <= 0) continue
        const k = (j * W + i) * 3
        light[k] += s.color.r * e
        light[k + 1] += s.color.g * e
        light[k + 2] += s.color.b * e
      }
    }
  }

  const data = new Uint16Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = THREE.DataUtils.toHalfFloat(Math.min(light[i * 3 + c], 60))
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1)
  }
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return { texture, box: new THREE.Vector4(x0, z0, 1 / tw, 1 / th) }
}

// ---------------------------------------------------------------- shader

const VERTEX_HEAD = `
uniform vec4 uLightFieldBox;
varying vec2 vLightFieldUv;
`

// La position du monde, décalée d'un rien le long de la normale : la face d'un mur lit la
// lumière de sa pièce, pas celle de la pièce d'en face.
const VERTEX_BODY = `#include <project_vertex>
  {
    vec4 lfPos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      lfPos = instanceMatrix * lfPos;
    #endif
    lfPos = modelMatrix * lfPos;
    vec3 lfNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    vLightFieldUv = (lfPos.xz + lfNormal.xz * 0.2 - uLightFieldBox.xy) * uLightFieldBox.zw;
  }
`

const FRAGMENT_HEAD = `
uniform sampler2D uLightField;
uniform float uLightFieldGain;
varying vec2 vLightFieldUv;
`

const FRAGMENT_BODY = `#include <lights_fragment_end>
  reflectedLight.indirectDiffuse += texture2D(uLightField, vLightFieldUv).rgb * uLightFieldGain * diffuseColor.rgb;
`

/** Ajoute le champ de lumière au shader d'un matériau éclairé (sans effet sur les autres). */
export function patchLightField(shader: THREE.WebGLProgramParametersWithUniforms) {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>') || !shader.vertexShader.includes('#include <defaultnormal_vertex>')) return
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY)
  shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <lights_fragment_end>', FRAGMENT_BODY)
}

/**
 * Matériau hors du champ de lumière : ce qui est posé par-dessus les pièces sans en faire partie
 * (le couvercle d'une pièce fermée ne s'éclaire pas des lampes qu'il cache).
 */
export function unlitByField<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = () => {}
  material.customProgramCacheKey = () => 'no-light-field'
  return material
}

// Tout matériau qui n'a pas son propre crochet reçoit le champ (personnages, animaux, pièces mobiles).
THREE.Material.prototype.onBeforeCompile = patchLightField
