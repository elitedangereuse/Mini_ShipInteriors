import { tr } from '../i18n'
import type { CatalogEntry } from './catalog'

/*
 * Le jardinage dans les quartiers (cf. src/gardening/) : la tuile de terre cultivable, le cabanon
 * (sans lui, Capucine ne vend rien), les caisses où va la récolte, et le mobilier de jardin. Les
 * constructeurs sont dans src/furniture/gardening.ts ; les bacs, l'établi, le compost et la
 * grainothèque de la serre sont rangés dans la même catégorie (cf. catalog-ship.ts).
 */

export const GARDEN_ENTRIES: CatalogEntry[] = [
  // La tuile se pose comme un sol : calée sur le quadrillage, plusieurs d'un trait en glissant ; on
  // marche dessus, et on la travaille en mode jardinage.
  { id: 'soil-tile', name: tr('Tuile de terre cultivable', 'Plot of soil'), category: 'gardening', model: 'soil-tile', mount: 'flat', grid: true },
  {
    id: 'garden-shed', name: tr('Cabanon de jardinage', 'Garden shed'), category: 'gardening', model: 'garden-shed', mount: 'floor',
    use: 'garden-shed', action: tr('Ouvrir le cabanon', 'Open the shed'),
  },
  {
    id: 'harvest-crate', name: tr('Caisses de récolte', 'Harvest crates'), category: 'gardening', model: 'harvest-crate', mount: 'floor',
    use: 'garden-stock', action: tr('Voir la récolte', 'Check the harvest'),
  },
  {
    id: 'wheelbarrow', name: tr('Brouette', 'Wheelbarrow'), category: 'gardening', model: 'wheelbarrow', mount: 'floor',
    interact: tr('Une brouette de terreau. La roue grince en fa dièse.', 'A barrow of compost. The wheel squeaks in F sharp.'),
  },
  {
    id: 'scarecrow', name: tr('Épouvantail', 'Scarecrow'), category: 'gardening', model: 'scarecrow', mount: 'floor',
    interact: [
      tr('Une vieille combinaison de vol bourrée de paille. Aucun corbeau à bord : il fait bien son travail.', 'An old flight suit stuffed with straw. No crows aboard: it does its job well.'),
      tr('Il a le regard vide des pilotes qui reviennent de Hutton Orbital.', 'It has the empty stare of pilots back from Hutton Orbital.'),
    ],
  },
  {
    id: 'garden-gnome', name: tr('Nain de jardin', 'Garden gnome'), category: 'gardening', model: 'garden-gnome', mount: 'top',
    variants: [
      { id: '#d9453a', label: tr('Bonnet rouge', 'Red hat'), swatch: '#d9453a' },
      { id: '#ff8a1c', label: tr('Bonnet orange', 'Orange hat'), swatch: '#ff8a1c' },
      { id: '#3f8f5c', label: tr('Bonnet vert', 'Green hat'), swatch: '#3f8f5c' },
      { id: '#3c5a8a', label: tr('Bonnet bleu', 'Blue hat'), swatch: '#3c5a8a' },
    ],
    interact: tr('Un nain de jardin, le pouce levé. La nuit, il change de place. Personne ne l\'a jamais vu faire.', 'A garden gnome, thumb up. At night it moves. Nobody has ever seen it do so.'),
  },
  {
    id: 'garden-fence', name: tr('Clôture de piquets', 'Picket fence'), category: 'gardening', model: 'garden-fence', mount: 'floor',
    variants: [{ id: '1', label: tr('Une tuile', 'One tile') }, { id: '2', label: tr('Deux tuiles', 'Two tiles') }],
  },
  {
    id: 'beehive', name: tr('Ruche', 'Beehive'), category: 'gardening', model: 'beehive', mount: 'floor',
    interact: tr('Ça bourdonne là-dedans. Capucine dit qu\'elles sont gentilles. Capucine porte des gants.', 'It hums in there. Capucine says they are friendly. Capucine wears gloves.'),
  },
]
