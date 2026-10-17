import * as THREE from 'three'
import type { Deck } from './deck'

/*
 * Mémoire graphique des ponts. Une texture ne part au GPU que la première fois qu'un objet qui la
 * porte est dessiné : en vue isométrique, où l'on ne dessine plus que les pièces dans le champ
 * (cf. Deck.cull), chaque affiche, écran ou sol dessiné qui entrait dans le champ coûtait un
 * à-coup (un canvas de 1024 × 2048, ses mipmaps). Les textures du pont affiché partent donc
 * toutes, à son arrivée : d'un coup pendant le noir du trajet d'ascenseur ou le chargement, sinon
 * quelques-unes par image. Et celles d'un pont quitté depuis un moment sont libérées : leur canvas
 * reste, elles repartiront au retour. Une fois tous les ponts visités, le GPU ne garde plus que
 * celles du pont affiché (et ce qu'il partage avec les autres).
 */

/** Un pont caché depuis ce délai (secondes) rend sa mémoire graphique. */
const RELEASE_AFTER = 45
/** Temps (ms) consacré par image aux textures du pont affiché, quand rien ne cache l'écran. */
const BUDGET = 3

/** Textures dessinées dans un canvas (affiches, écrans, sols peints) : celles qu'on peut renvoyer. */
function managed(t: THREE.Texture): boolean {
  return (t as THREE.CanvasTexture).isCanvasTexture === true
}

/** Textures portées par les matériaux d'un objet et de ses enfants (cartes et uniformes). */
function texturesOf(root: THREE.Object3D, out: Set<THREE.Texture>, skip?: (o: THREE.Object3D) => boolean): Set<THREE.Texture> {
  const visit = (o: THREE.Object3D) => {
    if (skip?.(o)) return
    const m = (o as THREE.Mesh).material
    if (m) {
      for (const material of Array.isArray(m) ? m : [m]) {
        for (const value of Object.values(material)) if ((value as THREE.Texture)?.isTexture) out.add(value as THREE.Texture)
        const uniforms = (material as THREE.ShaderMaterial).uniforms
        if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture)?.isTexture) out.add(u.value as THREE.Texture)
      }
    }
    for (const c of o.children) visit(c)
  }
  visit(root)
  return out
}

export class DeckTextures {
  /** Textures du pont affiché qui restent à envoyer. */
  private queue: THREE.Texture[] = []
  /** Depuis quand (secondes) chaque pont est caché ; supprimé quand sa mémoire est rendue. */
  private readonly hiddenSince = new Map<Deck, number>()
  private shown: Deck | null = null
  /** Ponts bâtis hors de la liste du jeu (les arènes, cf. adopt). */
  private readonly adopted: Deck[] = []

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly decks: readonly Deck[]) {}

  /**
   * Un pont que le jeu ne range pas avec les autres (une arène) : caché, sa mémoire se rend comme la
   * leur. Sans cela, il ne la rendait jamais, et ce qu'il partage avec le vaisseau restait compté
   * comme affiché.
   */
  adopt(deck: Deck) {
    if (!this.adopted.includes(deck)) this.adopted.push(deck)
  }

  /**
   * Le pont affiché change : ses textures partent au GPU, toutes à la fois si l'écran est noir
   * (`now`), sinon quelques-unes par image (cf. update).
   */
  show(deck: Deck, now = false) {
    if (deck !== this.shown) {
      if (this.shown) this.hiddenSince.set(this.shown, performance.now() / 1000)
      this.hiddenSince.delete(deck)
      this.shown = deck
    }
    this.queue = [...texturesOf(deck.group, new Set())].filter(managed)
    if (now) this.flush()
  }

  /** Envoie tout ce qui reste du pont affiché. */
  flush() {
    for (const t of this.queue) this.renderer.initTexture(t)
    this.queue.length = 0
  }

  /** À chaque image : un peu du pont affiché ; la mémoire des ponts quittés depuis longtemps. */
  update() {
    if (this.queue.length) {
      const start = performance.now()
      do this.renderer.initTexture(this.queue.pop()!)
      while (this.queue.length && performance.now() - start < BUDGET)
    }
    const time = performance.now() / 1000
    for (const [deck, since] of this.hiddenSince) {
      if (time - since < RELEASE_AFTER || deck.group.visible) continue
      this.hiddenSince.delete(deck)
      this.release(deck)
    }
  }

  /** Rend la mémoire des textures de ce pont que rien d'affiché ne partage. */
  private release(deck: Deck) {
    const hidden = new Set([...this.decks, ...this.adopted].filter((d) => !d.group.visible).map((d) => d.group as THREE.Object3D))
    const used = texturesOf(this.scene, new Set(), (o) => hidden.has(o))
    for (const t of texturesOf(deck.group, new Set())) if (managed(t) && !used.has(t)) t.dispose()
  }
}
