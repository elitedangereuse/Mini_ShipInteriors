import * as THREE from 'three'
import { drawnTexture } from '../furniture/kit'
import type { PlayerState } from '../net'
import { RemotePlayer } from '../remote'
import { ARENA_LEVEL, type CharacterId } from '../../shared/arena.js'
import { characterById, Drone } from './characters'
import type { Relation } from './ui'

/*
 * La scène de fin de partie, à la façon de Brawl Stars : tous les combattants côte à côte, face à
 * la caméra, le camp du joueur à gauche, celui d'en face à droite. Les vainqueurs dansent ; les
 * battus font non de la tête. Le fond rayonne à la couleur du camp qui gagne.
 *
 * La scène est hors du plan de l'arène, au nord, dos à elle : un fond la cache. Chaque combattant y
 * a une doublure, sous les traits de son personnage (Nico avec Boulon) ; le client cache les vrais le
 * temps de la scène (cf. ArenaClient.staging).
 */

/** Un combattant sur la scène : qui il est pour le joueur, son personnage, et si son camp a gagné (null : égalité). */
export interface PodiumEntry { id: number; name: string; character: CharacterId; rel: Relation; won: boolean | null }

/** Écart entre deux combattants d'un camp, et ce qu'on ajoute entre les deux camps (tuiles). */
const SPACING = 0.62
const GAP = 0.36
/**
 * D'où la caméra regarde la scène (cf. IsoCamera.turnTo) : du nord, presque à hauteur d'homme. La
 * droite de l'écran est alors vers -x.
 */
export const STAGE_AZIMUTH = Math.PI
export const STAGE_ELEVATION = 0.17
/** Largeur et profondeur du décor : de quoi remplir le cadre sur un écran large. */
const WIDE = 22
const BACK = 0.8
/** Les projecteurs de la scène : celui de face, et l'appoint d'ambiance. */
const KEY_LIGHT = 1.5
const FILL_LIGHT = 0.9

interface Figure { entry: PodiumEntry; puppet: RemotePlayer; next: number; drone: Drone | null }

export class Podium {
  private readonly decor = new THREE.Group()
  private figures: Figure[] = []
  private readonly owned: { dispose(): void }[] = []
  /** Ce que la caméra cadre (monde), et la largeur de scène à montrer (tuiles). */
  readonly focus = new THREE.Vector3()
  width = 0

  /**
   * @param deck le pont de l'arène : le décor y vit, dans son repère
   * @param at le milieu de la scène, dans ce repère
   */
  constructor(private deck: THREE.Object3D, private scene: THREE.Scene, private at: { x: number; z: number }) {
    this.decor.visible = false
    deck.add(this.decor)
  }

  get shown(): boolean {
    return this.decor.visible
  }

  /** Monte la scène : `entries` de gauche à droite de l'écran, `tints` la couleur de chaque relation. */
  show(entries: PodiumEntry[], tints: Record<Relation, string>) {
    this.clear()
    const y = this.deck.getWorldPosition(new THREE.Vector3()).y
    // Les places, de gauche à droite : un espace de plus là où l'on change de camp.
    const xs: number[] = []
    let x = 0
    entries.forEach((e, i) => {
      if (i) x += SPACING + ((e.rel === 'enemy') !== (entries[i - 1].rel === 'enemy') ? GAP : 0)
      xs.push(x)
    })
    const span = x
    this.width = span + 1.1
    this.focus.set(this.at.x, y, this.at.z)
    const winners = entries.map((e, i) => (e.won ? xs[i] - span / 2 : null)).filter((v): v is number => v !== null)
    const winner = entries.find((e) => e.won)
    this.build(winner ? tints[winner.rel === 'enemy' ? 'enemy' : 'ally'] : null, winners.length ? (winners[0] + winners[winners.length - 1]) / 2 : 0)
    entries.forEach((entry, i) => {
      const sx = xs[i] - span / 2
      const character = characterById(entry.character)
      const state = { id: entry.id, name: entry.name, skin: entry.character, x: this.at.x - sx, z: this.at.z, yaw: Math.PI, level: ARENA_LEVEL, anim: 'idle' } as PlayerState
      const puppet = new RemotePlayer(entry.id, state, () => y, () => character.rig())
      this.scene.add(puppet.group)
      const drone = character.drone ? new Drone() : null
      if (drone) puppet.group.add(drone.root)
      // Les vainqueurs dansent ; à égalité, chacun salue.
      if (entry.won) puppet.emote('danse')
      else if (entry.won === null) puppet.emote('salut')
      this.figures.push({ entry, puppet, next: 0.6 + i * 0.35, drone })
      // Sa pastille, au sol, à sa couleur.
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.25, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: tints[entry.rel], transparent: true, opacity: entry.won === false ? 0.3 : 0.75, depthWrite: false }))
      spot.position.set(this.at.x - sx, 0.012, this.at.z)
      this.decor.add(spot)
      this.owned.push(spot.geometry, spot.material)
    })
    this.decor.visible = true
  }

  /** Le sol et le fond : sombre, avec les rayons du camp qui gagne derrière lui (`sx` : son milieu, à l'écran). */
  private build(tint: string | null, sx: number) {
    // Le sol : une flaque de lumière sous les combattants (au bas de l'image : le fond de la scène), qui s'éteint vers la caméra.
    const boards = drawnTexture(256, 256, (g) => {
      const pool = g.createRadialGradient(128, 240, 0, 128, 240, 150)
      pool.addColorStop(0, '#34405f')
      pool.addColorStop(0.5, '#1a2135')
      pool.addColorStop(1, '#0d111c')
      g.fillStyle = pool
      g.fillRect(0, 0, 256, 256)
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDE, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: boards }))
    floor.position.set(this.at.x, 0, this.at.z + BACK - 7)
    const W = 1024, H = 384, tall = 8
    const texture = drawnTexture(W, H, (g) => {
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#0b0f1a')
      sky.addColorStop(1, '#1b2338')
      g.fillStyle = sky
      g.fillRect(0, 0, W, H)
      if (!tint) return
      // Les rayons partent de derrière les vainqueurs, à hauteur d'homme.
      const cx = W / 2 + (sx / WIDE) * W, cy = H * (1 - 1.5 / tall)
      g.fillStyle = tint
      g.globalAlpha = 0.2
      for (let i = 0; i < 28; i += 2) {
        g.beginPath()
        g.moveTo(cx, cy)
        g.arc(cx, cy, W, (i / 28) * Math.PI * 2, ((i + 1) / 28) * Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      const halo = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.9)
      halo.addColorStop(0, `${tint}cc`)
      halo.addColorStop(0.45, `${tint}33`)
      halo.addColorStop(1, `${tint}00`)
      g.fillStyle = halo
      g.fillRect(0, 0, W, H)
    })
    // Tourné vers la caméra (au nord) : sa gauche est celle de l'écran.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(WIDE, tall).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: texture }))
    back.position.set(this.at.x, tall / 2 - 1, this.at.z + BACK)
    // Les projecteurs de la scène : de face, depuis la caméra, et un appoint d'ambiance. Le plan
    // éclaire peu ici, hors de son terrain (de nuit au site gardien, dans la pénombre de la ruche).
    const key = new THREE.DirectionalLight('#fff6e8', KEY_LIGHT)
    key.position.set(this.at.x + 1.5, 3.2, this.at.z - 6)
    key.target.position.set(this.at.x, 0.5, this.at.z)
    const fill = new THREE.HemisphereLight('#ffffff', '#5a647c', FILL_LIGHT)
    this.decor.add(floor, back, key, key.target, fill)
    this.owned.push(key, fill, floor.geometry, floor.material as THREE.Material, back.geometry, back.material as THREE.Material, texture, boards)
  }

  update(dt: number) {
    for (const f of this.figures) {
      f.puppet.update(dt)
      f.drone?.update(dt)
      // Les battus : non de la tête, de temps en temps.
      if (f.entry.won !== false || (f.next -= dt) > 0) continue
      f.next = 2.8 + Math.random() * 1.6
      f.puppet.emote('non')
    }
  }

  /** Les pieds de chaque combattant (monde), pour poser sa fiche dessous. */
  feet(): { id: number; at: THREE.Vector3 }[] {
    return this.figures.map((f) => ({ id: f.entry.id, at: f.puppet.group.position }))
  }

  clear() {
    // Les doublures (et Boulon) ne servent qu'à cette scène : libérées.
    for (const f of this.figures) {
      f.puppet.dispose()
      f.drone?.dispose()
    }
    this.figures = []
    this.decor.clear()
    for (const o of this.owned) o.dispose()
    this.owned.length = 0
    this.decor.visible = false
  }
}
