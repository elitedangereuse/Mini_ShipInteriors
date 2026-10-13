/**
 * Les vaisseaux d'Elite Dangerous du jeu, modelés à la main avec les outils de build-ed-ships.mjs
 * (loft : profilé aux coins arrondis, du nez vers la poupe ; plate : plaque biseautée ; fin : dérive ;
 * nozzle : tuyère). En mètres, nez vers +z, dessus vers +y, bâbord vers +x ; ce qui est décrit à
 * bâbord est recopié à tribord. Peintures : 'hull' (la coque, peinte par le jeu), 'dark' (graphite),
 * 'trim' (liseré du constructeur), 'glass' (verrière).
 *
 * Chaque vaisseau garde ce qui le fait reconnaître (silhouette, verrière, réacteurs, dérives) et le
 * même vocabulaire de détails : une bulle de verrière, un bloc sur le dos avec ses trappes, une
 * quille sombre, des ouïes, des liserés, des panneaux sombres sur les ailes.
 */

const between = (z, a, b) => z < a && z > b

export const MODELS = {}

MODELS['vulture'] = ({ loft, plate, nozzle }) => {
  // La coque : un coin trapu, large à l'arrière.
  loft([
    { z: 16.5, w: 6.6, y0: -3.6, y1: 0.6, c: 1.3 },
    { z: 11, w: 10.4, y0: -4.2, y1: 2.4, c: 1.9 },
    { z: 6.4, w: 10.8, y0: -4.3, y1: 2.8, c: 2 },
    { z: 5.4, w: 10.9, y0: -4.3, y1: 2.9, c: 2 },
    { z: -1, w: 11.2, y0: -4.4, y1: 3, c: 2 },
    { z: -9, w: 14, y0: -4.4, y1: 2.6, c: 2 },
    { z: -19.4, w: 14.2, y0: -4.2, y1: 2.4, c: 2 },
  ], { paint: (z, part) => (between(z, 6.4, 5.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['dark', 'dark'] })
  // Les deux mandibules du nez, et le poste de pilotage entre elles.
  loft([
    { x: 4.3, z: 21.6, w: 0.7, y0: -3.3, y1: -2, c: 0.4 },
    { x: 4.3, z: 19.4, w: 1.5, y0: -3.7, y1: -0.4, c: 0.7 },
    { x: 4.6, z: 14, w: 2, y0: -3.8, y1: 1, c: 0.9 },
  ], { caps: ['hull', null], mirror: true })
  loft([
    { z: 20.6, w: 1.5, y0: -3, y1: -1.2, c: 0.7 },
    { z: 18.6, w: 2.4, y0: -3.2, y1: 0.6, c: 1.1 },
    { z: 15, w: 2.7, y0: -3.2, y1: 2.5, c: 1.2 },
    { z: 12.2, w: 2.4, y0: -2, y1: 3, c: 1.1 },
  ], { paint: (z, part) => (part === 'bottom' ? 'hull' : 'glass'), caps: ['glass', 'glass'] })
  plate([[2.9, 18.2, -0.25, -1], [5.9, 18.2, -0.25, -1], [6.1, 17.2, -0.05, -1], [2.7, 17.2, -0.05, -1]], 'trim')

  // Le pont supérieur : une grande aile plate qui déborde la coque, et la bosse du dos.
  plate([[1.5, 7, 4.1, 2.5], [11.6, -1, 3.9, 2.6], [17.3, -9.5, 3.7, 2.7], [17.3, -17.6, 3.7, 2.7], [13.2, -20.6, 3.8, 2.7], [1.5, -20.6, 4.1, 2.5]], 'hull', 0.5)
  loft([
    { z: 12, w: 3.2, y0: 1.4, y1: 2.9, c: 0.9 },
    { z: 3, w: 4.6, y0: 2.4, y1: 5, c: 1.4 },
    { z: -19.8, w: 4.6, y0: 2.4, y1: 4.9, c: 1.4 },
  ], { caps: ['hull', 'dark'] })
  // Les deux rails sombres du dos.
  loft([
    { x: 3.7, z: 9.5, w: 0.8, y0: 2.4, y1: 3.4, c: 0.4 },
    { x: 3.7, z: 2.5, w: 1.4, y0: 3.4, y1: 6.1, c: 0.6 },
    { x: 3.7, z: -21.5, w: 1.4, y0: 3.6, y1: 6.1, c: 0.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'], mirror: true })
  // Sur l'aile : deux trappes d'armes sombres et un liseré en bout d'aile.
  plate([[6.4, -4, 4.15, 3.6], [10.4, -6.4, 4.05, 3.6], [10.4, -15, 4.05, 3.6], [6.4, -15, 4.15, 3.6]], 'dark', 0.2)
  plate([[14.4, -8.2, 3.95, 3.4], [15.6, -9.9, 3.95, 3.4], [15.6, -17.6, 3.95, 3.4], [14.4, -18.4, 3.95, 3.4]], 'trim')
  // Les ailerons bas, sous l'aile.
  plate([[9, -5, -3.4, -4.6], [17.3, -11.5, -3.6, -4.6], [17.3, -18, -3.6, -4.6], [9, -19.6, -3.4, -4.6]], 'hull', 0.35)

  // Les deux gros réacteurs, en rectangle.
  loft([
    { x: 8.15, z: -13, w: 3.5, y0: -3, y1: 1.6, c: 1.1 },
    { x: 8.15, z: -20.4, w: 3.5, y0: -3, y1: 1.6, c: 1.1 },
  ], { caps: [null, 'dark'], mirror: true })
  nozzle(8.15, -0.74, -20.4, 2.77, 1.6)

  // Des ouïes sur les flancs, et la quille sombre.
  for (const z of [8, 4.4]) plate([[10.2, z, 0.8, -1.4], [10.95, z, 0.8, -1.4], [11.1, z - 2.6, 0.9, -1.4], [10.35, z - 2.6, 0.9, -1.4]], 'dark')
  loft([
    { z: 12, w: 3, y0: -4.9, y1: -3.8, c: 0.5 },
    { z: 6, w: 5, y0: -5.2, y1: -3.9, c: 0.6 },
    { z: -12, w: 5, y0: -5.2, y1: -3.9, c: 0.6 },
    { z: -17, w: 3.4, y0: -4.9, y1: -3.8, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

/** Le Chieftain et le Crusader : même coque, à leurs dérives près. */
function chieftain({ loft, plate, fin, nozzle }, crusader = false) {
  // Le fuselage : un bec à l'avant, un ventre profond, une taille fine avant la poupe.
  loft([
    { z: 34, w: 1.4, y0: -4.6, y1: -2.4, c: 0.8 },
    { z: 31, w: 3.4, y0: -6.4, y1: -0.8, c: 1.6 },
    { z: 27, w: 6.6, y0: -8, y1: 1.4, c: 2.8 },
    { z: 20, w: 9.6, y0: -9.2, y1: 4.4, c: 4 },
    { z: 16, w: 10.6, y0: -9.5, y1: 5.8, c: 4.4 },
    { z: 14.8, w: 10.9, y0: -9.6, y1: 6.2, c: 4.5 },
    { z: 8, w: 11.7, y0: -9.8, y1: 8.2, c: 4.8 },
    { z: -2, w: 11.6, y0: -9.6, y1: 9.4, c: 5 },
    { z: -12, w: 8.6, y0: -7.6, y1: 8.4, c: 4 },
    { z: -22, w: 6.6, y0: -4.6, y1: 6.2, c: 3 },
    { z: -23.2, w: 6.6, y0: -4.2, y1: 6, c: 2.9 },
    { z: -31, w: 6.8, y0: -1.6, y1: 4.6, c: 2.2 },
  ], {
    paint: (z, part) => ((between(z, 16, 14.8) || between(z, -22, -23.2)) && part !== 'bottom' ? 'trim' : 'hull'),
    caps: ['hull', 'dark'],
  })
  // La verrière : une bulle sur le bec.
  loft([
    { z: 28, w: 2.2, y0: -0.4, y1: 1.2, c: 0.7 },
    { z: 25.6, w: 3.6, y0: 0.2, y1: 3.5, c: 1.4 },
    { z: 20.4, w: 4, y0: 2.4, y1: 5.9, c: 1.6 },
    { z: 18.2, w: 3.2, y0: 3.8, y1: 5.9, c: 1.2 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Le dos : un bloc bas, avec ses trappes.
  loft([
    { z: 9, w: 3.6, y0: 7, y1: 8.8, c: 1.2 },
    { z: -1, w: 5, y0: 8, y1: 10.2, c: 1.8 },
    { z: -13, w: 4.4, y0: 7, y1: 9.3, c: 1.6 },
    { z: -21, w: 3.2, y0: 5, y1: 7.2, c: 1.2 },
  ], { paint: (z, part) => (z > -1 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  for (const z of [-3, -9]) plate([[1.2, z, 10.3, 9.6], [3.2, z, 10.3, 9.6], [3.2, z - 4.4, 10.15, 9.2], [1.2, z - 4.4, 10.15, 9.2]], 'dark', 0.15)
  // La quille sombre : soutes et train.
  loft([
    { z: 24, w: 2.4, y0: -9.6, y1: -7.6, c: 0.7 },
    { z: 14, w: 4.4, y0: -10.2, y1: -8.4, c: 0.8 },
    { z: -4, w: 4.4, y0: -10.2, y1: -8, c: 0.8 },
    { z: -13, w: 3, y0: -8.6, y1: -6.2, c: 0.7 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  // Les épaulières : deux prises d'air sombres sur les flancs.
  loft([
    { x: 10.2, z: 15, w: 1.5, y0: -3.4, y1: 2.6, c: 0.8 },
    { x: 10.8, z: 4, w: 2.3, y0: -4, y1: 3.4, c: 1.1 },
    { x: 10, z: -4, w: 1.6, y0: -3.4, y1: 2.8, c: 0.8 },
  ], { caps: ['dark', 'hull'], mirror: true })

  // Les bras avant, qui descendent vers les deux réacteurs bas.
  const arm = (x) => 0.2 - ((x - 10.5) / 13) * 3.6
  plate([[10.5, 11, 0.2, -3.2], [23.5, 5.2, -3.4, -5.8], [23.5, -4, -3.4, -5.8], [10.5, -2.5, 0.2, -3.2]], 'hull', 0.6)
  plate([[13, 7.4], [21, 3.8], [21, 0.4], [13, 2.6]].map(([x, z]) => [x, z, arm(x) + 0.25, arm(x) - 0.2]), 'dark', 0.2)
  loft([
    { x: 26.4, z: 9, w: 1.3, y0: -6.2, y1: -3.8, c: 0.6 },
    { x: 26.4, z: 6.4, w: 2.9, y0: -8, y1: -2, c: 1.4 },
    { x: 26.4, z: 2.6, w: 2.9, y0: -8, y1: -2, c: 1.4 },
    { x: 26.4, z: 0.6, w: 2.9, y0: -8, y1: -2, c: 1.4 },
    { x: 26.4, z: -5.6, w: 2.8, y0: -7.9, y1: -2.1, c: 1.4 },
  ], { paint: (z) => (between(z, 2.6, 0.6) ? 'trim' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(26.4, -5, -5.6, 2)

  // Les bras arrière, plus hauts, et leurs réacteurs.
  const rear = (x) => 3.4 - ((x - 5.5) / 14) * 3.4
  plate([[5.5, -15, 3.4, 0.4], [19.5, -21.5, 0, -2.6], [19.5, -28, 0, -2.6], [5.5, -27, 3.4, 0.4]], 'hull', 0.6)
  plate([[9, -19.2], [17, -22.8], [17, -25.6], [9, -23.4]].map(([x, z]) => [x, z, rear(x) + 0.25, rear(x) - 0.2]), 'dark', 0.2)
  loft([
    { x: 21.5, z: -17.6, w: 1.3, y0: -2.6, y1: -0.2, c: 0.6 },
    { x: 21.5, z: -20, w: 2.8, y0: -4.4, y1: 1.6, c: 1.4 },
    { x: 21.5, z: -24, w: 2.8, y0: -4.4, y1: 1.6, c: 1.4 },
    { x: 21.5, z: -26, w: 2.8, y0: -4.4, y1: 1.6, c: 1.4 },
    { x: 21.5, z: -32.5, w: 2.7, y0: -4.3, y1: 1.5, c: 1.4 },
  ], { paint: (z) => (between(z, -24, -26) ? 'trim' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(21.5, -1.4, -32.5, 2)

  // Les deux dérives de la poupe, penchées vers l'extérieur ; le Crusader y ajoute sa baie de chasseur, sombre, sur le dos.
  fin([[-22.5, 4.4], [-28.2, 9.6], [-30.8, 9.6], [-31.4, 3.2]], { x: 5.4, t: 1, lean: 0.38 })
  if (crusader) {
    loft([
      { z: -12, w: 2.6, y0: 7.4, y1: 9.6, c: 0.8 },
      { z: -15, w: 3.4, y0: 6.6, y1: 9.8, c: 1 },
      { z: -22, w: 3.2, y0: 5, y1: 8.4, c: 1 },
    ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  }
}

MODELS['alliance-chieftain'] = (t) => chieftain(t)
MODELS['alliance-crusader'] = (t) => chieftain(t, true)

MODELS['imperial-clipper'] = ({ loft, plate, nozzle }) => {
  // Le fuselage : un long nez effilé qui s'élargit jusqu'aux ailes. Un filet d'or derrière la verrière.
  loft([
    { z: 53.3, w: 1.2, y0: -5.3, y1: -4, c: 0.6 },
    { z: 51, w: 3, y0: -5.9, y1: -2.9, c: 1.2 },
    { z: 45, w: 6.4, y0: -6.4, y1: -0.2, c: 2.2 },
    { z: 35, w: 9, y0: -6.8, y1: 3.8, c: 3.2 },
    { z: 32.6, w: 9.3, y0: -6.8, y1: 4, c: 3.3 },
    { z: 31.4, w: 9.45, y0: -6.8, y1: 4.1, c: 3.3 },
    { z: 2, w: 12.5, y0: -6.8, y1: 5.8, c: 4 },
    { z: -30, w: 12.5, y0: -5.6, y1: 6.2, c: 4 },
    { z: -50, w: 9.5, y0: -2.2, y1: 6, c: 3 },
  ], { paint: (z, part) => (between(z, 32.6, 31.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière : une bulle posée sur le nez.
  loft([
    { z: 46.2, w: 3.2, y0: -1.6, y1: -0.4, c: 0.9 },
    { z: 44.2, w: 4.6, y0: -1.2, y1: 1.3, c: 1.6 },
    { z: 37, w: 6, y0: 1.2, y1: 4.6, c: 2 },
    { z: 34.2, w: 5.4, y0: 2.6, y1: 4.5, c: 1.3 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Sous le ventre, une quille sombre : la baie du train et des soutes.
  loft([
    { z: 20, w: 4, y0: -7.5, y1: -6.2, c: 0.6 },
    { z: 14, w: 6, y0: -7.9, y1: -6.2, c: 0.8 },
    { z: -26, w: 6, y0: -7.3, y1: -5, c: 0.8 },
    { z: -34, w: 4, y0: -6.2, y1: -4.4, c: 0.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  // Deux ouïes sombres de chaque bord, sur les flancs du fuselage.
  for (const z of [22, 16]) plate([[11.05, z, 1.2, -1.6], [11.9, z, 1.2, -1.6], [12.3, z - 4, 1.4, -1.5], [11.4, z - 4, 1.4, -1.5]], 'dark')

  // Le dos : un bloc qui monte derrière le fuselage et court jusqu'à la poupe ; sa rampe est sombre.
  loft([
    { z: 5, w: 7, y0: 4, y1: 6.4, c: 1.8 },
    { z: -12, w: 10, y0: 4, y1: 10.8, c: 4.4 },
    { z: -46, w: 9.2, y0: 3.2, y1: 11.5, c: 4.2 },
    { z: -47.4, w: 9.1, y0: 3.1, y1: 11.55, c: 4.2 },
    { z: -50.6, w: 9, y0: 3, y1: 11.6, c: 4.2 },
  ], { paint: (z, part) => (z > -12 && part === 'top' ? 'dark' : between(z, -46, -47.4) ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // Une arête le long du dos, et deux trappes de chaque côté.
  loft([
    { z: -13, w: 1.3, y0: 10, y1: 11.3, c: 0.5 },
    { z: -16, w: 1.6, y0: 10, y1: 12, c: 0.6 },
    { z: -44, w: 1.6, y0: 10, y1: 12.5, c: 0.6 },
  ], { caps: ['hull', 'dark'] })
  for (const z of [-20, -32]) plate([[2.4, z, 11.75, 11], [4.6, z, 11.75, 11], [4.6, z - 8, 11.9, 11], [2.4, z - 8, 11.9, 11]], 'dark', 0.2)

  // Les deux réacteurs principaux, de part et d'autre du dos ; une prise d'air sombre à l'avant.
  loft([
    { x: 10.1, z: -33, w: 2.6, y0: 0, y1: 4.6, c: 1.1 },
    { x: 10.1, z: -41, w: 3.7, y0: -1.3, y1: 5.7, c: 1.7 },
    { x: 10.1, z: -53.3, w: 3.7, y0: -1.3, y1: 5.7, c: 1.7 },
  ], { caps: ['dark', 'dark'], mirror: true })
  nozzle(10.1, 2.2, -53.3, 2.6)

  // Les ailes, en flèche vers l'arrière, qui descendent jusqu'aux nacelles ; bord d'attaque sombre.
  const wing = (x) => 1.6 - ((x - 11) / 33) * 5.4
  const panel = (pts, mat, lift, bevel) => plate(pts.map(([x, z]) => [x, z, wing(x) + lift, wing(x) - 0.2]), mat, bevel)
  plate([[11, 2, 1.6, -2], [44, -19, -3.8, -6], [44, -36, -3.8, -6], [11, -29, 1.6, -2]], 'hull', 0.7)
  plate([[11, 2.7, 1.85, -2.25], [44, -18.3, -3.55, -6.25], [44, -21.6, -3.55, -6.25], [11, -1.6, 1.85, -2.25]], 'dark', 0.5)
  // Sur chaque aile : un grand panneau en relief, un volet sombre au bord de fuite, un filet d'or.
  panel([[15, -5.5], [36, -18.8], [36, -24], [15, -17]], 'hull', 0.3, 0.3)
  panel([[26, -31.2], [42, -34.6], [42, -31], [26, -27.4]], 'dark', 0.22, 0.25)
  panel([[38.2, -17.5], [39.6, -18.4], [39.6, -33.2], [38.2, -32.9]], 'trim', 0.26, 0)
  // Le pied des ailes : un carénage qui les raccorde au fuselage.
  loft([
    { x: 13, z: 3, w: 1.6, y0: -2.4, y1: 1.8, c: 1 },
    { x: 14.5, z: -4, w: 3.2, y0: -2.9, y1: 2.9, c: 1.6 },
    { x: 14.5, z: -24, w: 3.2, y0: -2.9, y1: 2.9, c: 1.6 },
    { x: 13, z: -31, w: 1.6, y0: -2.4, y1: 1.8, c: 1 },
  ], { mirror: true })
  // Les mâts, du bord de fuite des ailes à la poupe : ils laissent les deux jours du Clipper.
  plate([[8, -41, 3.2, 0.4], [22, -27.5, -0.2, -3], [31, -32, -1.6, -4.4], [13, -51, 3.2, 0.4]], 'hull', 0.6)

  // Les nacelles de bout d'aile : un fuseau à l'avant, un anneau d'or, deux réacteurs à l'arrière.
  loft([
    { x: 47.4, z: -8.5, w: 0.9, y0: -5.8, y1: -4.2, c: 0.45 },
    { x: 47.4, z: -11, w: 2.2, y0: -7.4, y1: -2.6, c: 1 },
    { x: 47.4, z: -19, w: 4, y0: -10.2, y1: 0.4, c: 1.9 },
    { x: 47.4, z: -25.3, w: 4.25, y0: -11.2, y1: 0.9, c: 2 },
    { x: 47.4, z: -26.5, w: 4.3, y0: -11.4, y1: 1, c: 2 },
    { x: 47.4, z: -37, w: 4.3, y0: -12, y1: 1, c: 2 },
    { x: 47.4, z: -38.2, w: 4.25, y0: -12, y1: 1, c: 2 },
    { x: 47.4, z: -47.3, w: 3.9, y0: -11.8, y1: 0.6, c: 1.9 },
  ], {
    paint: (z) => (between(z, -26.5, -37) ? 'trim' : between(z, -25.3, -26.5) || between(z, -37, -38.2) ? 'dark' : 'hull'),
    caps: ['hull', 'dark'],
    mirror: true,
  })
  nozzle(47.4, -3.2, -47.3, 2)
  nozzle(47.4, -8.3, -47.3, 2)
  // Le pylône qui tient chaque nacelle au bout de l'aile.
  loft([
    { x: 43, z: -17.5, w: 1.2, y0: -6.2, y1: -3.4, c: 0.6 },
    { x: 43, z: -21, w: 1.8, y0: -6.8, y1: -2.8, c: 0.8 },
    { x: 43, z: -35, w: 1.8, y0: -6.8, y1: -2.8, c: 0.8 },
    { x: 43, z: -38, w: 1.2, y0: -6.2, y1: -3.4, c: 0.6 },
  ], { mirror: true })
}

MODELS['sidewinder'] = ({ loft, plate, nozzle }) => {
  // Un coin plat : la collerette, large à l'arrière, et le corps bombé posé dessus.
  plate([[0, 6.7, 0.5, -0.6], [5.9, 6.6, 0.4, -0.6], [10.7, -5.4, 0.3, -0.6], [10.5, -6.6, 0.3, -0.6], [0, -6.6, 0.5, -0.6]], 'hull', 0.4)
  loft([
    { z: 6.2, w: 3.8, y0: -0.7, y1: 0.5, c: 0.5 },
    { z: 3.4, w: 5.2, y0: -1.7, y1: 1.3, c: 1.3 },
    { z: -0.6, w: 6.8, y0: -2.5, y1: 2, c: 1.9 },
    { z: -4.4, w: 7.5, y0: -2.6, y1: 2.2, c: 2 },
    { z: -5.2, w: 7.6, y0: -2.6, y1: 2.2, c: 2 },
    { z: -6.5, w: 7.7, y0: -2.6, y1: 2.2, c: 2 },
  ], { paint: (z, part) => (between(z, -4.4, -5.2) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, sur le dos.
  loft([
    { z: 2.4, w: 1.3, y0: 0.9, y1: 1.7, c: 0.5 },
    { z: 0.4, w: 1.8, y0: 1.4, y1: 2.75, c: 0.8 },
    { z: -3.6, w: 1.8, y0: 1.6, y1: 2.85, c: 0.8 },
    { z: -4.6, w: 1.5, y0: 1.8, y1: 2.6, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les ouïes du dos, de chaque côté de la verrière.
  for (const x of [2.7, 3.7]) plate([[x, 0.4, 2.12, 1.6], [x + 0.7, 0.2, 2.1, 1.6], [x + 0.7, -3.4, 2.3, 1.8], [x, -3.4, 2.3, 1.8]], 'dark')
  // Le ventre.
  loft([
    { z: 3, w: 2.2, y0: -2.3, y1: -1.4, c: 0.4 },
    { z: 0, w: 3.4, y0: -2.9, y1: -2, c: 0.5 },
    { z: -5.4, w: 3.4, y0: -2.9, y1: -2, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  nozzle(5.14, -0.35, -6.5, 1.5, 1)
}

/** Le fuselage des deux Eagle : un nez en aiguille, une longue verrière, un ventre qui se creuse vers l'arrière. */
function eagleFuselage({ loft }) {
  loft([
    { z: 15.5, w: 0.5, y0: -0.7, y1: -0.1, c: 0.25 },
    { z: 13, w: 1.3, y0: -1, y1: 0.5, c: 0.6 },
    { z: 9, w: 2.4, y0: -1.3, y1: 1.5, c: 1.1 },
    { z: 3, w: 3.2, y0: -2.4, y1: 2.9, c: 1.5 },
    { z: -1.6, w: 3.5, y0: -3, y1: 3.3, c: 1.6 },
    { z: -2.4, w: 3.5, y0: -3.1, y1: 3.3, c: 1.6 },
    { z: -6, w: 3.6, y0: -3.4, y1: 3.3, c: 1.6 },
    { z: -12, w: 3.4, y0: -3.2, y1: 2.8, c: 1.5 },
    { z: -15.4, w: 1.6, y0: -0.6, y1: 2.4, c: 0.8 },
  ], { paint: (z, part) => (between(z, -1.6, -2.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 10, w: 1, y0: 0.8, y1: 1.7, c: 0.45 },
    { z: 7.4, w: 1.7, y0: 1.2, y1: 2.8, c: 0.8 },
    { z: 1.4, w: 1.9, y0: 2.2, y1: 3.7, c: 0.9 },
    { z: -0.8, w: 1.5, y0: 2.8, y1: 3.6, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // La quille.
  loft([
    { z: 2, w: 1.4, y0: -2.9, y1: -2, c: 0.4 },
    { z: -3, w: 2.2, y0: -3.7, y1: -2.8, c: 0.5 },
    { z: -11, w: 2.2, y0: -3.7, y1: -2.8, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['eagle'] = (t) => {
  const { loft, plate, nozzle } = t
  eagleFuselage(t)
  // Les ailes : un grand delta, dont les bouts tombants pointent vers l'avant.
  plate([[2.5, -1.2, 1, -0.6], [9, -1.2, 0.7, -0.5], [14.3, -3, -0.4, -1.1], [14.3, -7.2, -0.4, -1.1], [7.5, -12.6, 0.8, -0.5], [2.5, -12.6, 1, -0.6]], 'hull', 0.4)
  plate([[10, -1, 0.5, -0.6], [14.3, 1.9, -0.5, -1.2], [14.3, -4, -0.4, -1.1], [10, -3.6, 0.5, -0.6]], 'hull', 0.35)
  plate([[8.8, -3.4, 0.75, 0.2], [12.8, -4.4, 0.1, -0.4], [12.8, -7, 0.1, -0.4], [8.8, -9.8, 0.75, 0.2]], 'dark', 0.2)
  // Les deux réacteurs, sur les ailes.
  loft([
    { x: 6.7, z: -3.6, w: 1, y0: 0.2, y1: 1.2, c: 0.4 },
    { x: 6.7, z: -6.4, w: 1.5, y0: -0.2, y1: 1.7, c: 0.7 },
    { x: 6.7, z: -12.4, w: 1.5, y0: -0.2, y1: 1.7, c: 0.7 },
  ], { caps: ['dark', 'dark'], mirror: true })
  nozzle(6.7, 0.75, -12.4, 1.05, 0.7)
}

MODELS['imperial-eagle'] = (t) => {
  const { loft, plate, fin, nozzle } = t
  eagleFuselage(t)
  // Les ailes, en flèche inversée, portent chacune une nacelle à son bout.
  plate([[2.5, -1.5, 1, -0.6], [15, 1.8, -0.4, -1.3], [15, -6.2, -0.4, -1.3], [7, -12.6, 0.6, -0.6], [2.5, -13.6, 1, -0.6]], 'hull', 0.4)
  loft([
    { x: 16.1, z: 6.4, w: 0.5, y0: -1.4, y1: -0.6, c: 0.25 },
    { x: 16.1, z: 4.4, w: 1.15, y0: -2, y1: 0.1, c: 0.55 },
    { x: 16.1, z: 1.8, w: 1.2, y0: -2.1, y1: 0.2, c: 0.55 },
    { x: 16.1, z: -1.8, w: 1.2, y0: -2.1, y1: 0.2, c: 0.55 },
    { x: 16.1, z: -7.4, w: 1.15, y0: -2, y1: 0.2, c: 0.55 },
  ], { paint: (z) => (between(z, 1.8, -1.8) ? 'trim' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(16.1, -0.9, -7.4, 0.95)
  // L'aileron de queue.
  fin([[-11, 2.6], [-14.6, 4], [-15.6, 4], [-15.2, 2.2]], { t: 0.5 })
}

MODELS['viper-mk3'] = ({ loft, plate, nozzle }) => {
  // La coque : une pointe de flèche plate, deux dents au nez.
  loft([
    { z: 12.6, w: 3.6, y0: -2.2, y1: -1.1, c: 0.5 },
    { z: 10, w: 5, y0: -2.4, y1: -0.2, c: 1 },
    { z: 3, w: 7.4, y0: -2.4, y1: 1.8, c: 1.8 },
    { z: -3.4, w: 9.3, y0: -2.2, y1: 2.6, c: 2.1 },
    { z: -4.4, w: 9.4, y0: -2.2, y1: 2.6, c: 2.1 },
    { z: -13.2, w: 9.4, y0: -2, y1: 2.6, c: 2.1 },
  ], { paint: (z, part) => (between(z, -3.4, -4.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['dark', 'dark'] })
  loft([
    { x: 2.1, z: 14.1, w: 0.6, y0: -2.1, y1: -1.5, c: 0.25 },
    { x: 2.1, z: 12, w: 1.1, y0: -2.3, y1: -0.9, c: 0.5 },
  ], { caps: ['hull', null], mirror: true })
  // La verrière en bulle, et l'arête du dos derrière elle.
  loft([
    { z: 0.6, w: 1.5, y0: 1.6, y1: 2.5, c: 0.6 },
    { z: -1.8, w: 2.4, y0: 2, y1: 4.1, c: 1.1 },
    { z: -5.6, w: 2.4, y0: 2.2, y1: 4.3, c: 1.1 },
    { z: -6.8, w: 2.2, y0: 2.4, y1: 4.2, c: 1 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  loft([
    { z: -6.6, w: 2.2, y0: 2.2, y1: 4.1, c: 1 },
    { z: -13.6, w: 1.8, y0: 2.2, y1: 3.8, c: 0.8 },
  ], { caps: [null, 'dark'] })
  // Les deux réacteurs, en saillie de chaque bord.
  loft([
    { x: 9.6, z: -3.4, w: 1.2, y0: -0.6, y1: 0.8, c: 0.5 },
    { x: 9.6, z: -6, w: 2.4, y0: -1.5, y1: 1.6, c: 1 },
    { x: 9.6, z: -13.4, w: 2.4, y0: -1.5, y1: 1.6, c: 1 },
  ], { caps: ['dark', 'dark'], mirror: true })
  nozzle(9.5, 0.17, -13.4, 1.5, 1.05)
  // Deux trappes sombres sur le nez, et le caisson du ventre.
  plate([[1.2, 8, 0.45, -0.2], [3.4, 8, 0.4, -0.2], [4.6, 3, 1.75, 1], [1.2, 3, 1.85, 1]], 'dark', 0.2)
  loft([
    { z: 3, w: 1.6, y0: -3.3, y1: -2.2, c: 0.5 },
    { z: 0, w: 2.8, y0: -4.3, y1: -2.2, c: 0.7 },
    { z: -10, w: 2.8, y0: -4.3, y1: -2, c: 0.7 },
    { z: -12.6, w: 2, y0: -3.3, y1: -1.8, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['viper-mk4'] = ({ loft, plate, nozzle }) => {
  // La coque : plus trapue que celle du Mk III, large aux épaules, un bloc carré à l'arrière.
  loft([
    { z: 13.6, w: 5, y0: -2.3, y1: -1.1, c: 0.5 },
    { z: 10.5, w: 6.6, y0: -2.5, y1: -0.1, c: 1 },
    { z: 1.5, w: 12.1, y0: -2.4, y1: 1.6, c: 1.8 },
    { z: -4.5, w: 9.7, y0: -2.3, y1: 2.6, c: 2 },
    { z: -6, w: 11.7, y0: -2.2, y1: 2.4, c: 2 },
    { z: -9.4, w: 11.8, y0: -2.2, y1: 2.4, c: 2 },
    { z: -10.4, w: 11.8, y0: -2.2, y1: 2.4, c: 2 },
    { z: -13.8, w: 11.8, y0: -2, y1: 2.4, c: 2 },
  ], { paint: (z, part) => (between(z, -9.4, -10.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['dark', 'dark'] })
  loft([
    { x: 3.3, z: 14.6, w: 1, y0: -2.2, y1: -1.5, c: 0.3 },
    { x: 3.3, z: 12.6, w: 1.6, y0: -2.4, y1: -0.9, c: 0.6 },
  ], { caps: ['hull', null], mirror: true })
  // La verrière en bulle, et l'arête du dos derrière elle.
  loft([
    { z: 0, w: 1.3, y0: 1.6, y1: 2.5, c: 0.6 },
    { z: -2.2, w: 1.9, y0: 2, y1: 4.1, c: 0.9 },
    { z: -6.2, w: 1.9, y0: 2.2, y1: 4.3, c: 0.9 },
    { z: -7.4, w: 1.7, y0: 2.4, y1: 4.2, c: 0.8 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  loft([
    { z: -7.2, w: 2, y0: 2, y1: 4.1, c: 0.9 },
    { z: -14, w: 1.8, y0: 2, y1: 3.8, c: 0.8 },
  ], { caps: [null, 'dark'] })
  nozzle(9.84, -0.09, -13.8, 1.3, 0.9)
  // Deux trappes sombres sur le nez, des ouïes sur le bloc arrière, et le caisson du ventre.
  plate([[1.6, 8, 0.5, -0.2], [5.4, 8, 0.45, -0.2], [7, 3, 1.5, 0.8], [1.6, 3, 1.6, 0.8]], 'dark', 0.2)
  for (const x of [5, 7]) plate([[x, -7, 2.5, 2], [x + 1.2, -7, 2.5, 2], [x + 1.2, -12.4, 2.5, 2], [x, -12.4, 2.5, 2]], 'dark', 0.15)
  loft([
    { z: 3, w: 1.8, y0: -3.3, y1: -2.2, c: 0.5 },
    { z: 0, w: 3, y0: -4.3, y1: -2.2, c: 0.7 },
    { z: -10, w: 3, y0: -4.3, y1: -2, c: 0.7 },
    { z: -12.6, w: 2.2, y0: -3.3, y1: -1.8, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['cobra-mk3'] = ({ loft, plate, nozzle }) => {
  // Le losange du Cobra : deux plaques en gradins, larges à l'arrière, et le corps bombé dessus.
  plate([[0, 13.4, -0.7, -1.9], [5.3, 13.4, -0.7, -1.9], [21.1, -4, -0.9, -1.9], [21.1, -10.5, -0.9, -1.9], [0, -10.5, -0.7, -1.9]], 'hull', 0.5)
  plate([[0, 12.4, 0.2, -1.4], [4.6, 12.4, 0.2, -1.4], [18.2, -3, 0.5, -1.4], [18.2, -10.5, 0.5, -1.4], [0, -10.5, 0.5, -1.4]], 'hull', 0.5)
  loft([
    { z: 12.6, w: 4.2, y0: -1.6, y1: -0.2, c: 0.6 },
    { z: 8, w: 7.6, y0: -1.4, y1: 1.3, c: 1.4 },
    { z: -0.4, w: 13.6, y0: -1.2, y1: 3.4, c: 2.6 },
    { z: -5.6, w: 14.6, y0: -1.2, y1: 3.8, c: 2.8 },
    { z: -6.6, w: 14.7, y0: -1.2, y1: 3.8, c: 2.8 },
    { z: -10.6, w: 15, y0: -1.2, y1: 3.9, c: 2.8 },
  ], { paint: (z, part) => (between(z, -5.6, -6.6) ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, large, sur le nez.
  loft([
    { z: 10.2, w: 2.4, y0: -0.2, y1: 0.9, c: 0.5 },
    { z: 8.6, w: 3.4, y0: 0.2, y1: 2, c: 0.9 },
    { z: 5.6, w: 3.4, y0: 1, y1: 2.9, c: 0.9 },
    { z: 4.4, w: 2.9, y0: 1.6, y1: 2.7, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les deux gros réacteurs, côte à côte.
  loft([
    { x: 5.1, z: -8, w: 3.5, y0: -0.9, y1: 3, c: 1.2 },
    { x: 5.1, z: -13.2, w: 3.5, y0: -1, y1: 3.1, c: 1.2 },
  ], { caps: [null, 'dark'], mirror: true })
  nozzle(5.1, 1, -13.2, 3, 1.7)
  // Sur le dos : deux trappes ; sur les ailes : un panneau sombre ; dessous : le ventre.
  for (const x of [2, 6.4]) plate([[x, -1.4, 3.55, 3], [x + 3, -1.4, 3.5, 3], [x + 3, -4.6, 3.85, 3.3], [x, -4.6, 3.9, 3.3]], 'dark', 0.2)
  plate([[15.6, -3.6, 0.7, 0.2], [17.4, -5, 0.7, 0.2], [17.4, -9.6, 0.7, 0.2], [15.6, -9.6, 0.7, 0.2]], 'dark', 0.2)
  loft([
    { z: 9, w: 5, y0: -2.8, y1: -1.6, c: 0.6 },
    { z: 3, w: 10.6, y0: -4.1, y1: -1.6, c: 1 },
    { z: -10.2, w: 11.6, y0: -4.1, y1: -1.4, c: 1 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['cobra-mk4'] = ({ loft, plate, fin, nozzle }) => {
  // Plus large que le Mk III : deux dents au nez, une queue d'aronde à l'arrière.
  plate([[0, 15, -0.7, -1.9], [5.8, 15, -0.7, -1.9], [21.2, 0, -0.9, -1.9], [24.1, -4, -0.9, -1.9], [24.1, -12.5, -0.9, -1.9], [0, -12.5, -0.7, -1.9]], 'hull', 0.5)
  plate([[3, -12.2, -0.8, -1.9], [24.1, -12.2, -0.9, -1.9], [19, -17, -0.9, -1.9]], 'hull', 0.4)
  plate([[0, 13.8, 0.2, -1.4], [5, 13.8, 0.2, -1.4], [19.4, -0.4, 0.5, -1.4], [21.2, -4, 0.5, -1.4], [21.2, -12.5, 0.5, -1.4], [0, -12.5, 0.5, -1.4]], 'hull', 0.5)
  loft([
    { x: 4.75, z: 16.5, w: 0.9, y0: -1.8, y1: -1, c: 0.3 },
    { x: 4.75, z: 14.4, w: 1.2, y0: -1.9, y1: -0.5, c: 0.4 },
  ], { caps: ['hull', null], mirror: true })
  loft([
    { z: 14.2, w: 4.8, y0: -1.6, y1: -0.2, c: 0.6 },
    { z: 8, w: 9.6, y0: -1.4, y1: 1.6, c: 1.6 },
    { z: 0, w: 15.6, y0: -1.2, y1: 3.2, c: 2.6 },
    { z: -6.4, w: 16.6, y0: -1.2, y1: 3.8, c: 2.9 },
    { z: -7.4, w: 16.7, y0: -1.2, y1: 3.8, c: 2.9 },
    { z: -12.5, w: 17, y0: -1.2, y1: 4, c: 3 },
  ], { paint: (z) => (between(z, -6.4, -7.4) ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, sur le nez.
  loft([
    { z: 12.4, w: 2.6, y0: -0.2, y1: 0.9, c: 0.5 },
    { z: 10.8, w: 3.6, y0: 0.2, y1: 2, c: 0.9 },
    { z: 7.6, w: 3.6, y0: 1, y1: 2.9, c: 0.9 },
    { z: 6.4, w: 3, y0: 1.6, y1: 2.7, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  nozzle(5.3, -0.2, -12.5, 3.2, 1.1)
  // Les petites dérives des pointes de la queue.
  fin([[-12.6, -0.9], [-15.6, 2.4], [-16.6, 2.4], [-16.4, -0.9]], { x: 19.4, t: 0.6, lean: 0.25 })
  // Sur le dos : deux trappes ; sur les ailes : un panneau sombre ; dessous : le ventre.
  for (const x of [2.4, 8]) plate([[x, -2, 3.4, 2.9], [x + 3.6, -2, 3.3, 2.8], [x + 3.6, -6, 3.75, 3.2], [x, -6, 3.85, 3.3]], 'dark', 0.2)
  plate([[18, -4.4, 0.7, 0.2], [20.2, -5.6, 0.7, 0.2], [20.2, -11.6, 0.7, 0.2], [18, -11.6, 0.7, 0.2]], 'dark', 0.2)
  loft([
    { z: 10, w: 6, y0: -2.8, y1: -1.6, c: 0.6 },
    { z: 3, w: 13, y0: -4.3, y1: -1.6, c: 1 },
    { z: -12, w: 16, y0: -4.3, y1: -1.4, c: 1 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['adder'] = ({ loft, plate, fin, nozzle }) => {
  // Le fuselage : un nez rond, une soute qui s'élargit vers l'arrière.
  loft([
    { z: 15.7, w: 1.4, y0: -3.6, y1: -1.4, c: 0.8 },
    { z: 12, w: 3.6, y0: -4.2, y1: 0.1, c: 1.5 },
    { z: 5, w: 5.4, y0: -4.4, y1: 1.3, c: 2 },
    { z: 1, w: 6.2, y0: -4.4, y1: 2, c: 2.2 },
    { z: 0, w: 6.4, y0: -4.4, y1: 2.1, c: 2.2 },
    { z: -4, w: 6.9, y0: -4.4, y1: 2.4, c: 2.2 },
    { z: -14.6, w: 7, y0: -4.2, y1: 2.4, c: 2.2 },
  ], { paint: (z, part) => (between(z, 1, 0) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, sur le nez.
  loft([
    { z: 12.2, w: 2, y0: -0.8, y1: 0.5, c: 0.6 },
    { z: 10.4, w: 2.9, y0: -0.4, y1: 1.5, c: 1 },
    { z: 5.6, w: 3.2, y0: 0.4, y1: 2.3, c: 1.1 },
    { z: 4.2, w: 2.7, y0: 1, y1: 2.2, c: 0.8 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les ailes basses, en delta.
  plate([[4, 3, -2.9, -3.9], [14.4, -13, -3.3, -3.9], [14.4, -14.8, -3.3, -3.9], [4, -14.8, -2.9, -3.9]], 'hull', 0.4)
  plate([[8, -7.4, -2.95, -3.4], [12.6, -13, -3.15, -3.4], [12.6, -14, -3.15, -3.4], [8, -14, -2.95, -3.4]], 'dark', 0.15)
  // Les deux dérives, penchées vers l'extérieur.
  fin([[-5.4, 1.8], [-12.4, 4.8], [-15.2, 4.8], [-14.8, 1.6]], { x: 5.2, t: 0.8, lean: 0.42 })
  // Les réacteurs, et les longues prises d'air sombres du dos.
  loft([
    { x: 4.46, z: -9, w: 1.9, y0: -3.2, y1: 0.4, c: 0.9 },
    { x: 4.46, z: -15.4, w: 1.9, y0: -3.2, y1: 0.4, c: 0.9 },
  ], { caps: [null, 'dark'], mirror: true })
  nozzle(4.46, -1.44, -15.4, 1.55, 1.35)
  plate([[1.8, -1, 2.5, 2], [3.6, -1.4, 2.5, 2], [3.6, -9, 2.55, 2], [1.8, -9, 2.55, 2]], 'dark', 0.2)
}

/**
 * Les deux Diamondback : une tête massive, des ailes courtes à l'avant, deux grandes lames couchées
 * sur le dos, un réacteur dans l'axe et un sous chaque aile. `nose`, `tail` : les deux bouts du
 * fuselage ; `span` : la demi-envergure ; `pod` : l'écart des réacteurs d'aile ; `blade`, `tip` : la
 * largeur des lames et leur pointe arrière.
 */
function diamondback({ loft, plate, nozzle }, { nose, tail, span, pod, blade, tip }) {
  loft([
    { z: nose, w: 1.6, y0: -4.5, y1: -0.7, c: 1 },
    { z: nose - 4.6, w: 3.5, y0: -5.2, y1: 0.6, c: 1.6 },
    { z: 9.6, w: 4.4, y0: -5.8, y1: 2.7, c: 1.9 },
    { z: 2, w: 4.7, y0: -6, y1: 3.7, c: 2 },
    { z: 0.2, w: 4.7, y0: -6, y1: 3.7, c: 2 },
    { z: -0.8, w: 4.7, y0: -5.9, y1: 3.6, c: 2 },
    { z: -9, w: 4.1, y0: -5, y1: 3.1, c: 1.8 },
    { z: tail, w: 2.5, y0: -2.5, y1: 2.4, c: 1.2 },
  ], { paint: (z, part) => (between(z, 0.2, -0.8) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  nozzle(0, 0, tail, 1.3)
  // La verrière, haute, sur la tête.
  loft([
    { z: 11.6, w: 1.2, y0: 1.6, y1: 2.7, c: 0.5 },
    { z: 9.2, w: 1.7, y0: 2.4, y1: 4.5, c: 0.8 },
    { z: 3.2, w: 1.8, y0: 3.4, y1: 6, c: 0.8 },
    { z: 1.8, w: 1.5, y0: 4, y1: 5.7, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les ailes courtes, tombantes.
  plate([[3.5, 8.8, -0.8, -2], [span, 3.6, -2.5, -3.3], [span, -1.5, -2.5, -3.3], [3.5, -1.5, -0.8, -2]], 'hull', 0.4)
  // Les deux lames du dos, couchées vers l'extérieur.
  plate([[1.4, 4.4, 5.2, 4.5], [blade, -6, 1.9, 1.3], [blade, -10.6, 1.9, 1.3], [3.4, tip, 4.6, 4.1], [1.4, -13.6, 5, 4.3]], 'hull', 0.35)
  // Les réacteurs d'aile.
  loft([
    { x: pod, z: 0, w: 1.2, y0: -2.5, y1: -0.6, c: 0.6 },
    { x: pod, z: -2.6, w: 1.8, y0: -3.2, y1: 0.3, c: 0.9 },
    { x: pod, z: -8, w: 1.8, y0: -3.2, y1: 0.3, c: 0.9 },
  ], { caps: ['dark', 'dark'], mirror: true })
  nozzle(pod, -1.5, -8, 1.35)
  // Le ventre.
  loft([
    { z: 12, w: 2.2, y0: -6.2, y1: -5.2, c: 0.5 },
    { z: 6, w: 3, y0: -6.6, y1: -5.4, c: 0.6 },
    { z: -6, w: 3, y0: -6.4, y1: -5, c: 0.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['diamondback-scout'] = (t) => diamondback(t, { nose: 19.4, tail: -13.4, span: 12.1, pod: 5.5, blade: 8.8, tip: -19.4 })
MODELS['diamondback-explorer'] = (t) => diamondback(t, { nose: 22.4, tail: -21.9, span: 13.6, pod: 7.1, blade: 8.3, tip: -20.6 })

MODELS['imperial-courier'] = ({ loft, plate, nozzle }) => {
  // Le fuselage : une aiguille à l'avant, deux réacteurs côte à côte à la poupe.
  loft([
    { z: 20.5, w: 0.4, y0: -1.5, y1: -1, c: 0.2 },
    { z: 16, w: 1.5, y0: -1.8, y1: -0.2, c: 0.7 },
    { z: 10, w: 3, y0: -2, y1: 1.6, c: 1.3 },
    { z: 3, w: 4.6, y0: -2.2, y1: 3, c: 1.8 },
    { z: 1.4, w: 4.9, y0: -2.2, y1: 3.1, c: 1.9 },
    { z: 0.4, w: 5.1, y0: -2.2, y1: 3.1, c: 1.9 },
    { z: -8, w: 6.4, y0: -2.2, y1: 3.3, c: 2.1 },
    { z: -13, w: 6.4, y0: -2, y1: 2.6, c: 1.9 },
    { z: -19.4, w: 6, y0: -1.5, y1: 1.4, c: 1.2 },
  ], { paint: (z, part) => (between(z, 1.4, 0.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  nozzle(3.15, -0.14, -19.4, 1.3, 1.05)
  loft([
    { z: 10.8, w: 1.2, y0: 0.8, y1: 1.6, c: 0.5 },
    { z: 8.6, w: 1.9, y0: 1.2, y1: 2.9, c: 0.9 },
    { z: 4.4, w: 2.1, y0: 2.2, y1: 3.7, c: 0.9 },
    { z: 3, w: 1.7, y0: 2.8, y1: 3.5, c: 0.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les ailes courtes, qui descendent vers les nacelles ; un anneau d'or sur chacune.
  plate([[4.6, 0.4, 0.6, -0.8], [11.6, -2.6, -1, -2.1], [11.6, -10, -1, -2.1], [4.6, -12.4, 0.6, -0.8]], 'hull', 0.4)
  loft([
    { x: 12.4, z: 5.6, w: 0.5, y0: -2.1, y1: -1.3, c: 0.25 },
    { x: 12.4, z: 3, w: 1.2, y0: -3, y1: -0.5, c: 0.6 },
    { x: 12.4, z: 0, w: 1.25, y0: -3.1, y1: -0.4, c: 0.6 },
    { x: 12.4, z: -4, w: 1.25, y0: -3.1, y1: -0.4, c: 0.6 },
    { x: 12.4, z: -13.2, w: 1.15, y0: -3.1, y1: -0.4, c: 0.6 },
  ], { paint: (z) => (between(z, 0, -4) ? 'trim' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(12.4, -1.76, -13.2, 0.85)
  // Deux trappes sur le dos, et la quille.
  plate([[1.2, -4, 3.45, 2.8], [2.8, -4, 3.4, 2.8], [2.8, -8.6, 3.45, 2.8], [1.2, -8.6, 3.5, 2.8]], 'dark', 0.15)
  loft([
    { z: 6, w: 1.8, y0: -2.7, y1: -1.9, c: 0.4 },
    { z: 0, w: 3.2, y0: -3, y1: -2, c: 0.5 },
    { z: -14, w: 3.2, y0: -2.8, y1: -1.8, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['asp-explorer'] = ({ loft, plate, fin, nozzle }) => {
  // L'échine : la poutre centrale, haute et profonde, d'où descendent les deux grands pans de l'aile.
  loft([
    { z: 25.4, w: 6.5, y0: -5, y1: 1, c: 2 },
    { z: 20, w: 7, y0: -7, y1: 3.2, c: 2.6 },
    { z: 10, w: 7.5, y0: -9, y1: 6.4, c: 3 },
    { z: 4, w: 7.5, y0: -9.4, y1: 7, c: 3 },
    { z: 2.6, w: 7.5, y0: -9.4, y1: 7.1, c: 3 },
    { z: -6, w: 7.5, y0: -9, y1: 7.2, c: 3 },
    { z: -22, w: 7.5, y0: -5, y1: 6.6, c: 3 },
    { z: -25.6, w: 7, y0: -3, y1: 6, c: 2.6 },
  ], { paint: (z, part) => (between(z, 4, 2.6) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  plate([[5, 24, 2.4, -5], [9, 25, 0, -1.6], [25.6, 3, -0.4, -1.6], [18.5, -25, 0.4, -1.2], [5, -25, 5.6, -3]], 'hull', 0.6)
  plate([[12, 6, 2.5, 1.8], [19.4, 2.4, 0.95, 0.4], [16.6, -8, 1.5, 0.9], [12, -8, 2.7, 2]], 'dark', 0.3)
  // La verrière : une bulle qui avance au bout du nez.
  loft([
    { z: 28.3, w: 1.6, y0: -3.4, y1: -0.6, c: 0.8 },
    { z: 26, w: 2.6, y0: -4.4, y1: 1.6, c: 1.2 },
    { z: 22, w: 3, y0: -4, y1: 3.6, c: 1.4 },
    { z: 19, w: 2.6, y0: 0, y1: 4.2, c: 1.2 },
  ], { paint: (z, part) => (part === 'bottom' ? 'hull' : 'glass'), caps: ['glass', 'glass'] })
  // Les deux dérives, penchées vers l'extérieur.
  fin([[-11, 5.6], [-20, 10], [-27.6, 10], [-27, 5.2]], { x: 10.4, t: 1.1, lean: 0.5 })
  // Les réacteurs : deux tuyères l'une sur l'autre, de chaque bord.
  loft([
    { x: 10.26, z: -14, w: 1.6, y0: -1.6, y1: 3, c: 0.8 },
    { x: 10.26, z: -18, w: 2.5, y0: -3.2, y1: 4.8, c: 1.2 },
    { x: 10.26, z: -27, w: 2.5, y0: -3.2, y1: 4.8, c: 1.2 },
  ], { caps: ['hull', 'dark'], mirror: true })
  nozzle(10.26, 2.6, -27, 1.7)
  nozzle(10.26, -1.2, -27, 1.7)
  // Sur le dos : deux trappes ; dessous : la quille.
  for (const z of [-4, -12]) plate([[1.4, z, 7.4, 6.6], [4, z, 7.4, 6.6], [4, z - 5, 7.3, 6.4], [1.4, z - 5, 7.3, 6.4]], 'dark', 0.2)
  loft([
    { z: 16, w: 3, y0: -9.4, y1: -7.6, c: 0.7 },
    { z: 8, w: 4.6, y0: -10, y1: -8.4, c: 0.8 },
    { z: -8, w: 4.6, y0: -9.8, y1: -8, c: 0.8 },
    { z: -16, w: 3, y0: -7.6, y1: -5.6, c: 0.7 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

/**
 * Les cargos Lakon à passerelle avancée (Type-6, Keelback) : une caisse aux flancs arrondis, une
 * échine sur le dos, la verrière au bout du nez. `w` : demi-largeur de la caisse ; `engines` : de
 * chaque bord, [x, y, rayon, hauteur] des tuyères ; `pod` : le carénage des réacteurs [x, demi-largeur].
 */
function lakonHauler({ loft, plate, nozzle }, { w, engines, pod }) {
  loft([
    { z: 21.6, w: 5.5, y0: -3.6, y1: 3.6, c: 2 },
    { z: 19.4, w: w - 4.2, y0: -4.4, y1: 4.6, c: 3 },
    { z: 12, w: w - 0.6, y0: -5.8, y1: 5.1, c: 4.2 },
    { z: 10.8, w, y0: -6, y1: 5.2, c: 4.4 },
    { z: -10, w, y0: -6, y1: 5.2, c: 4.4 },
    { z: -21.4, w: w - 3.2, y0: -4.4, y1: 4.6, c: 3.6 },
  ], { paint: (z, part) => (between(z, 12, 10.8) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // L'échine, et la verrière au bout du nez.
  loft([
    { z: 20, w: 2.6, y0: 3.6, y1: 5.6, c: 1 },
    { z: 14, w: 3.2, y0: 4.2, y1: 6.8, c: 1.3 },
    { z: -6, w: 3.4, y0: 4.4, y1: 7.5, c: 1.4 },
    { z: -19.4, w: 3, y0: 3.8, y1: 6, c: 1.2 },
  ], { paint: (z, part) => (z > 14 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 24.2, w: 1.9, y0: -0.6, y1: 2.6, c: 0.9 },
    { z: 22.6, w: 2.6, y0: -1, y1: 4.4, c: 1.2 },
    { z: 20.4, w: 2.6, y0: 0, y1: 5, c: 1.2 },
  ], { paint: (z, part) => (part === 'bottom' ? 'hull' : 'glass'), caps: ['glass', 'glass'] })
  // Les réacteurs, dans leur carénage.
  const top = Math.max(...engines.map((e) => e[1] + e[3])) + 0.7, bottom = Math.min(...engines.map((e) => e[1] - e[3])) - 0.7
  loft([
    { x: pod[0], z: -15, w: pod[1] - 0.6, y0: bottom + 0.6, y1: top - 0.6, c: 1 },
    { x: pod[0], z: -17, w: pod[1], y0: bottom, y1: top, c: 1.2 },
    { x: pod[0], z: -23.4, w: pod[1], y0: bottom, y1: top, c: 1.2 },
  ], { caps: ['hull', 'dark'], mirror: true })
  for (const [x, y, r, ry] of engines) nozzle(x, y, -23.4, r, ry)
  // Sur le dos : les trappes de soute ; dessous : la quille.
  for (const z of [6, -3]) plate([[5, z, 5.4, 4.6], [w - 5, z, 5.4, 4.6], [w - 5, z - 6, 5.4, 4.6], [5, z - 6, 5.4, 4.6]], 'dark', 0.25)
  loft([
    { z: 14, w: 3, y0: -7, y1: -5.4, c: 0.7 },
    { z: 6, w: 4.4, y0: -7.6, y1: -5.6, c: 0.8 },
    { z: -8, w: 4.4, y0: -7.6, y1: -5.6, c: 0.8 },
    { z: -16, w: 3, y0: -6.6, y1: -4.8, c: 0.7 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['type-6'] = (t) => lakonHauler(t, { w: 13.6, engines: [[6.67, 2.1, 2.05, 2.5]], pod: [6.67, 2.9] })

MODELS['keelback'] = (t) => {
  const { loft, nozzle } = t
  lakonHauler(t, { w: 15.2, engines: [[10.22, 0.2, 1.6, 1.6], [6.6, 0.2, 1.6, 1.6]], pod: [8.4, 4.3] })
  // Les deux réacteurs orientables, en saillie sur les flancs.
  loft([
    { x: 17.6, z: -1.6, w: 1.4, y0: -1.6, y1: 1.8, c: 0.7 },
    { x: 17.6, z: -3.6, w: 2.6, y0: -2.6, y1: 2.8, c: 1.2 },
    { x: 17.6, z: -7, w: 2.6, y0: -2.6, y1: 2.8, c: 1.2 },
    { x: 17.6, z: -8, w: 2.6, y0: -2.6, y1: 2.8, c: 1.2 },
    { x: 17.6, z: -10.4, w: 2.4, y0: -2.4, y1: 2.6, c: 1.1 },
  ], { paint: (z) => (between(z, -7, -8) ? 'trim' : 'hull'), caps: ['dark', 'dark'], mirror: true })
}

MODELS['dolphin'] = ({ loft, plate, nozzle }) => {
  // Un fuseau tout en rondeurs ; le dôme vitré occupe le nez.
  const hull = [
    { z: 26, w: 1.6, y0: -3, y1: 0.4, c: 1.2 },
    { z: 24, w: 3.6, y0: -3.6, y1: 2, c: 1.8 },
    { z: 18.5, w: 5.4, y0: -3.9, y1: 3.6, c: 2.4 },
    { z: 17.5, w: 5.5, y0: -3.9, y1: 3.8, c: 2.5 },
    { z: 12, w: 5.9, y0: -4, y1: 4.3, c: 2.7 },
    { z: 0, w: 6, y0: -4, y1: 4.4, c: 2.7 },
    { z: -12, w: 5.6, y0: -3.9, y1: 4.2, c: 2.6 },
    { z: -20, w: 3.6, y0: -3, y1: 3, c: 1.7 },
    { z: -22.4, w: 3, y0: -2, y1: 2, c: 1.2 },
  ]
  loft(hull, {
    paint: (z, part) => (between(z, 24, 18.5) && part !== 'bottom' ? 'glass' : between(z, 18.5, 17.5) && part !== 'bottom' ? 'trim' : 'hull'),
    caps: ['hull', 'dark'],
  })
  nozzle(2.9, 0.2, -22.4, 0.9)
  // La rangée de hublots, de chaque bord.
  loft([
    { z: 13, w: 5.95, y0: 0.6, y1: 1.6, c: 0.2 },
    { z: 0, w: 6.06, y0: 0.6, y1: 1.6, c: 0.2 },
    { z: -11, w: 5.72, y0: 0.6, y1: 1.6, c: 0.2 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  // Trois paires d'ailerons : à l'avant, au milieu, et les grands de la queue.
  plate([[4.8, 15.4, -1.9, -2.5], [10.3, 10.4, -2.1, -2.5], [10.3, 8.6, -2.1, -2.5], [4.8, 9.4, -1.9, -2.5]], 'hull', 0.2)
  plate([[4.8, -4, -1.9, -2.5], [10.3, -8, -2.1, -2.5], [10.3, -9.6, -2.1, -2.5], [4.8, -8.4, -1.9, -2.5]], 'hull', 0.2)
  plate([[2.6, -16.6, 1.9, 1.3], [10.4, -24, 1.7, 1.3], [10.4, -25.6, 1.7, 1.3], [2.6, -21, 1.9, 1.3]], 'hull', 0.2)
  // Le dos, et la quille.
  loft([
    { z: 10, w: 1.6, y0: 3.8, y1: 4.7, c: 0.4 },
    { z: 4, w: 2.2, y0: 3.9, y1: 5, c: 0.5 },
    { z: -10, w: 2.2, y0: 3.8, y1: 4.9, c: 0.5 },
    { z: -15, w: 1.6, y0: 3.4, y1: 4.3, c: 0.4 },
  ], { paint: (z, part) => (part === 'top' ? 'dark' : 'hull') })
  loft([
    { z: 12, w: 2.2, y0: -4.5, y1: -3.6, c: 0.4 },
    { z: 6, w: 3, y0: -4.7, y1: -3.6, c: 0.5 },
    { z: -10, w: 3, y0: -4.7, y1: -3.5, c: 0.5 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['orca'] = ({ loft, plate, nozzle }) => {
  // Le paquebot : une longue coque ronde, effilée à l'avant, coupée net à l'arrière.
  loft([
    { z: 65, w: 1.6, y0: -5.4, y1: -2.6, c: 1.2 },
    { z: 60, w: 5.4, y0: -7.4, y1: 1, c: 3 },
    { z: 50, w: 10.4, y0: -8.6, y1: 5, c: 5 },
    { z: 44, w: 12.6, y0: -8.9, y1: 6.8, c: 5.6 },
    { z: 42, w: 13.2, y0: -9, y1: 7.4, c: 5.8 },
    { z: 30, w: 16, y0: -9, y1: 9.8, c: 6.6 },
    { z: 0, w: 16.2, y0: -9, y1: 11, c: 7 },
    { z: -30, w: 16.2, y0: -9, y1: 10.6, c: 7 },
    { z: -55, w: 15.6, y0: -9, y1: 8.4, c: 6 },
    { z: -57.4, w: 15.5, y0: -9, y1: 8.2, c: 5.8 },
    { z: -63.4, w: 15, y0: -8.6, y1: 6.6, c: 5 },
  ], {
    paint: (z, part) => ((between(z, 44, 42) || between(z, -55, -57.4)) && part !== 'bottom' ? 'trim' : 'hull'),
    caps: ['hull', 'dark'],
  })
  nozzle(9.81, -2.7, -63.4, 1.7)
  nozzle(5.6, -2.7, -63.4, 1.7)
  // La verrière, sur le nez, et le pont supérieur.
  loft([
    { z: 55, w: 2.6, y0: 1, y1: 3, c: 1 },
    { z: 52, w: 4.4, y0: 2.4, y1: 5.6, c: 1.8 },
    { z: 47.4, w: 4.8, y0: 4, y1: 7.2, c: 1.9 },
    { z: 45.4, w: 4, y0: 5, y1: 7, c: 1.4 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  loft([
    { z: 28, w: 4, y0: 8.6, y1: 10.6, c: 1.2 },
    { z: 16, w: 5.6, y0: 9.4, y1: 12, c: 1.6 },
    { z: -34, w: 5.6, y0: 9.2, y1: 11.8, c: 1.6 },
    { z: -46, w: 4, y0: 8, y1: 10, c: 1.2 },
  ], { paint: (z, part) => (part === 'top' ? 'dark' : 'hull') })
  // Les deux rangées de hublots, de chaque bord.
  for (const y of [2.6, -1.6]) {
    loft([
      { z: 34, w: 14.95, y0: y, y1: y + 1.6, c: 0.3 },
      { z: 28, w: 16.1, y0: y, y1: y + 1.6, c: 0.3 },
      { z: -40, w: 16.26, y0: y, y1: y + 1.6, c: 0.3 },
      { z: -52, w: 15.86, y0: y, y1: y + 1.6, c: 0.3 },
    ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  }
  // Les ailerons : une paire à l'avant, une plus grande à l'arrière.
  plate([[14, 40, -4.4, -5.6], [22, 27, -4.8, -5.6], [22, 24, -4.8, -5.6], [14, 26, -4.4, -5.6]], 'hull', 0.4)
  plate([[15.4, -17, -4.4, -5.6], [25.4, -32.6, -4.8, -5.6], [25.4, -36, -4.8, -5.6], [15.4, -30, -4.4, -5.6]], 'hull', 0.4)
  loft([
    { z: 30, w: 6, y0: -10, y1: -8.6, c: 0.8 },
    { z: 20, w: 8, y0: -10.6, y1: -8.6, c: 1 },
    { z: -40, w: 8, y0: -10.6, y1: -8.6, c: 1 },
    { z: -50, w: 6, y0: -10, y1: -8.4, c: 0.8 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['type-7'] = ({ loft, plate, nozzle }) => {
  // La caisse : une tête basse à l'avant, la grande soute en bosse derrière elle, la poupe qui s'affine.
  loft([
    { z: 40.5, w: 5, y0: -9.6, y1: -2, c: 2 },
    { z: 37, w: 11, y0: -11, y1: 1, c: 3.4 },
    { z: 30, w: 13.6, y0: -11.6, y1: 7, c: 4.4 },
    { z: 24, w: 15.6, y0: -11.6, y1: 11, c: 5 },
    { z: 21, w: 16.2, y0: -11.6, y1: 11.2, c: 5 },
    { z: 19.4, w: 16.4, y0: -11.6, y1: 11.3, c: 5 },
    { z: 2, w: 16.6, y0: -11.6, y1: 11.4, c: 5 },
    { z: -6, w: 14.5, y0: -10.6, y1: 7.4, c: 4.4 },
    { z: -34, w: 13.4, y0: -7, y1: 7, c: 4 },
    { z: -40, w: 9, y0: -5, y1: 6, c: 3 },
  ], { paint: (z, part) => (between(z, 21, 19.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, sur le front de la tête.
  loft([
    { z: 39.4, w: 3.4, y0: -2.6, y1: 0.2, c: 1 },
    { z: 35.6, w: 5.6, y0: -1.6, y1: 4, c: 1.8 },
    { z: 31.6, w: 5.6, y0: 1, y1: 6.8, c: 1.8 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les deux gros réacteurs, posés haut sur la poupe.
  loft([
    { x: 13.4, z: -11, w: 2.4, y0: 4.6, y1: 9, c: 1.2 },
    { x: 13.4, z: -17, w: 3.7, y0: 2.4, y1: 11.4, c: 1.8 },
    { x: 13.4, z: -28, w: 3.7, y0: 1.8, y1: 11.4, c: 1.8 },
    { x: 13.4, z: -29.6, w: 3.7, y0: 1.8, y1: 11.4, c: 1.8 },
    { x: 13.4, z: -39.4, w: 3.7, y0: 1.4, y1: 11.2, c: 1.8 },
  ], { paint: (z) => (between(z, -28, -29.6) ? 'trim' : 'hull'), caps: ['dark', 'dark'], mirror: true })
  nozzle(13.4, 7.6, -39.4, 2.1)
  nozzle(13.4, 3.4, -39.4, 1.5)
  // Les ailes basses : une paire au milieu, une à l'arrière.
  plate([[14, 7, -5.4, -7.4], [28, 0.5, -6.2, -7.3], [28, -7.5, -6.2, -7.3], [14, -8, -5.4, -7.4]], 'hull', 0.5)
  plate([[12, -21, -4.8, -6.6], [24.5, -26, -5.6, -6.6], [24.5, -33, -5.6, -6.6], [12, -33, -4.8, -6.6]], 'hull', 0.5)
  // Sur le dos : les trappes de soute ; dessous : la quille.
  for (const z of [17, 8]) plate([[2, z, 11.7, 10.8], [9, z, 11.7, 10.8], [9, z - 6, 11.7, 10.8], [2, z - 6, 11.7, 10.8]], 'dark', 0.3)
  loft([
    { z: 30, w: 4, y0: -12.4, y1: -10.8, c: 0.8 },
    { z: 22, w: 6.4, y0: -12.9, y1: -11, c: 1 },
    { z: -2, w: 6.4, y0: -12.9, y1: -11, c: 1 },
    { z: -12, w: 4, y0: -11.6, y1: -9.4, c: 0.8 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['fer-de-lance'] = ({ loft, plate, fin, nozzle }) => {
  // Un fer de lance : une lame plate qui s'élargit jusqu'à la poupe, le corps bombé par-dessus.
  plate([[0, 36.6, -5.4, -6.6], [1.4, 36.4, -5.4, -6.6], [25.6, -24, -5.6, -6.6], [24, -26.4, -5.6, -6.6], [0, -26.4, -5.4, -6.6]], 'hull', 0.5)
  loft([
    { z: 36, w: 0.8, y0: -6.2, y1: -5, c: 0.4 },
    { z: 28, w: 3.6, y0: -6.4, y1: -3, c: 1.4 },
    { z: 12, w: 8.6, y0: -6.4, y1: 0.6, c: 2.6 },
    { z: 0, w: 12.4, y0: -6.4, y1: 3, c: 3.2 },
    { z: -1.4, w: 12.8, y0: -6.4, y1: 3.2, c: 3.2 },
    { z: -20, w: 17.6, y0: -6.4, y1: 3.6, c: 3.4 },
    { z: -33, w: 17.6, y0: -6, y1: 3.4, c: 3.2 },
  ], { paint: (z, part) => (between(z, 0, -1.4) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  // La verrière, au milieu du dos.
  loft([
    { z: 13, w: 1.4, y0: 0, y1: 1.4, c: 0.6 },
    { z: 9, w: 2.4, y0: 0.8, y1: 3.2, c: 1.1 },
    { z: 1, w: 2.8, y0: 2.4, y1: 4.4, c: 1.2 },
    { z: -1, w: 2.3, y0: 3, y1: 4.2, c: 0.8 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les deux gros réacteurs, et leurs dérives.
  loft([
    { x: 12.65, z: -10, w: 2.6, y0: -2, y1: 4, c: 1.3 },
    { x: 12.65, z: -18, w: 4.4, y0: -5, y1: 5.6, c: 2.2 },
    { x: 12.65, z: -36.4, w: 4.2, y0: -5.4, y1: 4.6, c: 2.1 },
  ], { caps: ['dark', 'dark'], mirror: true })
  nozzle(12.65, -2, -36.4, 1.9)
  fin([[-20, 5], [-29, 7.6], [-33, 7.6], [-33, 4.4]], { x: 12.6, t: 0.9, lean: 0.3 }, 'dark')
  // Les pointes relevées de la lame, deux bandes sombres sur le nez, le dos, la quille.
  fin([[-16, -6.2], [-25, -2.2], [-26.4, -2.2], [-26.4, -6.2]], { x: 24.4, t: 0.8, lean: 0.4 })
  plate([[2.6, 24, -2.3, -3.4], [4.4, 21, -1.5, -2.6], [8.6, 6, 1.3, 0.2], [5.4, 6, 1.5, 0.4]], 'dark')
  loft([
    { z: -3, w: 3.4, y0: 2.6, y1: 4.2, c: 1 },
    { z: -12, w: 5, y0: 3, y1: 5.4, c: 1.6 },
    { z: -32, w: 5, y0: 2.8, y1: 5, c: 1.6 },
  ], { paint: (z, part) => (part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 12, w: 3, y0: -7.2, y1: -6, c: 0.5 },
    { z: 0, w: 6, y0: -7.6, y1: -6, c: 0.7 },
    { z: -28, w: 8, y0: -7.6, y1: -5.8, c: 0.7 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['mamba'] = ({ loft, plate, fin, nozzle }) => {
  // Deux longues lames de part et d'autre du poste de pilotage, soudées à l'arrière.
  loft([
    { x: 9.6, z: 39.6, w: 2.8, y0: -4, y1: -2.6, c: 0.6 },
    { x: 11, z: 28, w: 5.6, y0: -4.6, y1: -1, c: 1.4 },
    { x: 12.6, z: 8, w: 8.6, y0: -5, y1: 1.2, c: 2 },
    { x: 13, z: -8, w: 10.8, y0: -5, y1: 2.2, c: 2.2 },
    { x: 13.4, z: -30, w: 11.4, y0: -4.6, y1: 2.6, c: 2.2 },
    { x: 14, z: -35.6, w: 11, y0: -4, y1: 2.4, c: 2 },
  ], { caps: ['hull', 'dark'], mirror: true })
  loft([
    { z: 25.6, w: 2.6, y0: -4.4, y1: -1.6, c: 1 },
    { z: 22, w: 3.6, y0: -5.4, y1: 0.4, c: 1.4 },
    { z: 9, w: 4.6, y0: -5.8, y1: 1.4, c: 1.8 },
    { z: 7.6, w: 4.7, y0: -5.8, y1: 1.5, c: 1.8 },
    { z: -10, w: 5.6, y0: -5.8, y1: 2.6, c: 2 },
    { z: -22, w: 4, y0: -5, y1: 2.6, c: 1.8 },
  ], { paint: (z, part) => (between(z, 9, 7.6) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 24.4, w: 1.9, y0: -1.4, y1: 0.2, c: 0.7 },
    { z: 21.6, w: 2.9, y0: -0.8, y1: 2.6, c: 1.2 },
    { z: 13, w: 3.2, y0: 0.6, y1: 3.4, c: 1.3 },
    { z: 10.4, w: 2.6, y0: 1.2, y1: 3, c: 0.9 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les deux capots des réacteurs, sur le dos des lames.
  loft([
    { x: 9.6, z: 2, w: 2.2, y0: 0.6, y1: 2.6, c: 0.9 },
    { x: 10.4, z: -8, w: 5, y0: 0.6, y1: 5.2, c: 2.2 },
    { x: 10.6, z: -37, w: 5.4, y0: -1.6, y1: 5.6, c: 2.4 },
    { x: 10.6, z: -39, w: 5, y0: -1.2, y1: 5, c: 2.2 },
  ], { paint: (z, part) => (z > -8 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(8.6, 1.4, -39, 2.1)
  nozzle(13, -1, -39, 1.5)
  // Les ailettes de bout d'aile, et la quille.
  fin([[-28, -4.2], [-34, -0.6], [-35.6, -0.6], [-35.6, -4.2]], { x: 25, t: 0.7, lean: 0.1 })
  plate([[14, 12, 1.75, 1], [18, 6, 2, 1.2], [19.4, -20, 2.75, 2], [15, -20, 2.75, 2]], 'dark', 0.25)
  loft([
    { z: 16, w: 2.6, y0: -6.6, y1: -5.4, c: 0.5 },
    { z: 4, w: 3.6, y0: -6.9, y1: -5.4, c: 0.6 },
    { z: -18, w: 3.6, y0: -6.6, y1: -4.8, c: 0.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['python'] = ({ loft, plate, nozzle }) => {
  // La grande raie : une lame large, pincée derrière le nez, et le corps en toit par-dessus.
  loft([
    { z: 44, w: 2, y0: -5.4, y1: -4, c: 0.6 },
    { z: 31, w: 10.6, y0: -6.2, y1: -3.4, c: 1.1 },
    { z: 21, w: 14.6, y0: -6.4, y1: -3, c: 1.2 },
    { z: 12, w: 15.4, y0: -6.4, y1: -2.8, c: 1.2 },
    { z: 9, w: 17, y0: -6.4, y1: -2.8, c: 1.2 },
    { z: -12, w: 28.8, y0: -6.4, y1: -2.6, c: 1.3 },
    { z: -28, w: 26.6, y0: -6.2, y1: -2.6, c: 1.3 },
    { z: -39, w: 21, y0: -6, y1: -2.6, c: 1.2 },
  ], { caps: ['hull', 'dark'] })
  loft([
    { z: 42, w: 1.4, y0: -5, y1: -3.4, c: 0.6 },
    { z: 31, w: 5, y0: -5, y1: -0.4, c: 1.8 },
    { z: 12, w: 8.4, y0: -5, y1: 3, c: 3 },
    { z: 10.4, w: 8.8, y0: -5, y1: 3.2, c: 3.1 },
    { z: -8, w: 13, y0: -5, y1: 6.2, c: 4.6 },
    { z: -30, w: 14.4, y0: -5, y1: 8.4, c: 5 },
    { z: -32, w: 14.4, y0: -5, y1: 8.6, c: 5 },
    { z: -41.6, w: 14, y0: -5, y1: 8.8, c: 5 },
  ], {
    paint: (z, part) => ((between(z, 12, 10.4) || between(z, -30, -32)) && part !== 'bottom' ? 'trim' : 'hull'),
    caps: ['hull', 'dark'],
  })
  nozzle(11.2, -2.3, -41.6, 1.6)
  nozzle(7.5, -2.3, -41.6, 1.6)
  // La verrière, longue, sur le nez.
  loft([
    { z: 31, w: 2, y0: -1, y1: 0.6, c: 0.8 },
    { z: 27, w: 3.2, y0: -0.4, y1: 2.2, c: 1.3 },
    { z: 16, w: 3.6, y0: 1.4, y1: 4, c: 1.4 },
    { z: 13.4, w: 3, y0: 2.2, y1: 3.8, c: 1 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Sur le dos : l'arête et ses trappes ; sur les ailes : un panneau sombre ; dessous : la quille.
  loft([
    { z: -4, w: 2.6, y0: 4.6, y1: 6.6, c: 0.9 },
    { z: -14, w: 4, y0: 6, y1: 8.6, c: 1.3 },
    { z: -40, w: 4, y0: 7.6, y1: 9.6, c: 1.3 },
  ], { paint: (z, part) => (part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  for (const z of [-14, -25]) plate([[6, z, 6.5, 5], [10, z, 5.2, 4], [10, z - 7, 5.8, 4.4], [6, z - 7, 7.2, 5.6]], 'dark', 0.25)
  plate([[17, -6, -2.3, -3], [25.6, -12, -2.3, -3], [24, -27, -2.3, -3], [17, -27, -2.3, -3]], 'dark', 0.3)
  loft([
    { z: 20, w: 4, y0: -7.4, y1: -6, c: 0.6 },
    { z: 8, w: 7, y0: -7.9, y1: -6, c: 0.8 },
    { z: -30, w: 9, y0: -7.9, y1: -5.8, c: 0.8 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

/**
 * Les deux Krait : une grande aile en pointe de flèche, deux lames qui encadrent le poste de pilotage
 * à l'avant, deux antennes tombantes en bout d'aile. Le Mk II porte deux blocs de trois réacteurs
 * doubles sur le dos ; le Phantom, plus fin, une seule rangée à la poupe.
 */
function krait({ loft, plate, fin, nozzle }, phantom) {
  // L'aile : mince aux bords, épaisse au centre.
  loft([
    { x: 6.4, z: 35.6, w: 3.4, y0: -2.4, y1: 0.6, c: 0.7 },
    { x: 8, z: 26, w: 6.6, y0: -3.6, y1: 1.4, c: 1.2 },
    { x: 13, z: 8, w: 13, y0: -5, y1: 2, c: 1.5 },
    { x: 17.6, z: -8, w: 17.8, y0: -5.4, y1: 2.4, c: 1.6 },
    { x: 17.6, z: -14, w: 17.8, y0: -5, y1: 2.4, c: 1.6 },
    { x: 13, z: -22, w: 12.6, y0: -4, y1: 2.4, c: 1.5 },
    { x: 12, z: -32, w: 9.6, y0: -3, y1: 2.2, c: 1.3 },
  ], { caps: ['hull', 'dark'], mirror: true })
  // Le fuselage, entre les deux lames.
  loft([
    { z: 34.6, w: 1.8, y0: -2.4, y1: 0.4, c: 0.8 },
    { z: 30, w: 3, y0: -3.6, y1: 1.6, c: 1.2 },
    { z: 17.4, w: 3.6, y0: -5.4, y1: 2.8, c: 1.5 },
    { z: 16, w: 3.7, y0: -5.6, y1: 2.9, c: 1.5 },
    { z: 0, w: 5.4, y0: -7, y1: 3.6, c: 2 },
    { z: -14, w: 5.4, y0: -6.6, y1: 3.6, c: 2 },
    { z: -24, w: 4.4, y0: -4, y1: 3.2, c: 1.6 },
  ], { paint: (z, part) => (between(z, 17.4, 16) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 28, w: 1.6, y0: 1.2, y1: 2.2, c: 0.6 },
    { z: 25.6, w: 2.6, y0: 1.6, y1: 3.8, c: 1.1 },
    { z: 19.6, w: 2.8, y0: 2.4, y1: 4.4, c: 1.2 },
    { z: 18, w: 2.3, y0: 2.8, y1: 4.2, c: 0.8 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Les antennes tombantes des bouts d'aile, et les ailettes de la poupe.
  fin([[2, 1.6], [-20, 1.6], [-16, -1], [-4, -1.6]], { x: 35.4, t: 0.6 }, 'dark')
  plate([[12.6, -24, 1.9, 0.9], [20.6, -27, 1.5, 0.9], [19.4, -37, 1.5, 0.9], [14, -36, 1.9, 0.9]], 'hull', 0.3)
  if (phantom) {
    // Le Phantom : un dos plat, une rangée de réacteurs à la poupe.
    loft([
      { z: -2, w: 5, y0: 2.6, y1: 4.6, c: 1.2 },
      { z: -14, w: 11, y0: 2, y1: 6.8, c: 2 },
      { z: -33.6, w: 11, y0: 0.6, y1: 6.4, c: 2 },
    ], { paint: (z, part) => (z > -14 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
    for (const x of [1.3, 3.82, 6.34, 8.86]) nozzle(x, 2.4, -33.6, 1.05)
    plate([[13, 6, 2.25, 1.6], [26, -6, 2.65, 2], [26, -12, 2.65, 2], [13, -12, 2.65, 2]], 'dark', 0.3)
  } else {
    // Le Mk II : la baie sombre du dos, et deux blocs de réacteurs.
    loft([
      { z: 6, w: 2.4, y0: 2.6, y1: 4, c: 0.8 },
      { z: 0, w: 5, y0: 2.6, y1: 5, c: 1.2 },
      { z: -8, w: 5, y0: 2.6, y1: 5, c: 1.2 },
      { z: -22, w: 2.4, y0: 2.6, y1: 4.6, c: 0.9 },
    ], { paint: () => 'dark', caps: ['dark', 'dark'] })
    loft([
      { x: 7.6, z: 2, w: 2.6, y0: 1.6, y1: 4.4, c: 1.2 },
      { x: 7.6, z: -6, w: 4.6, y0: -1.2, y1: 6.2, c: 1.8 },
      { x: 7.6, z: -36, w: 4.6, y0: -1.6, y1: 5.8, c: 1.8 },
    ], { caps: ['hull', 'dark'], mirror: true })
    for (const x of [4.68, 7.6, 10.51]) for (const y of [3.77, 0]) nozzle(x, y, -36, 1.25)
  }
  // La quille.
  loft([
    { z: 16, w: 2.6, y0: -6.6, y1: -5, c: 0.5 },
    { z: 2, w: 4, y0: -7.8, y1: -6, c: 0.7 },
    { z: -14, w: 4, y0: -7.4, y1: -5.6, c: 0.7 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['krait-mk2'] = (t) => krait(t, false)
MODELS['krait-phantom'] = (t) => krait(t, true)

/**
 * Le Dropship et l'Assault Ship fédéraux : une tête de bélier, un ventre profond, une bosse sur le
 * dos, deux réacteurs rectangulaires. Le Dropship a deux paires d'ailes droites ; l'Assault Ship,
 * de grandes ailes en flèche et des réacteurs plus larges.
 */
function federal({ loft, plate, fin, nozzle }, assault) {
  loft([
    { z: 37, w: 2.4, y0: -7.6, y1: -4, c: 1.2 },
    { z: 32, w: 6.4, y0: -9, y1: -0.6, c: 2.4 },
    { z: 22, w: 10.6, y0: -9.8, y1: 3.6, c: 3.4 },
    { z: 12.6, w: 13.4, y0: -10, y1: 5.2, c: 3.8 },
    { z: 11, w: 13.6, y0: -10, y1: 5.4, c: 3.8 },
    { z: -10, w: 13.4, y0: -9.6, y1: 6.4, c: 3.8 },
    { z: -22, w: 11.4, y0: -6, y1: 6.4, c: 3.4 },
    { z: -35, w: 10.6, y0: -3.6, y1: 5.6, c: 3 },
  ], { paint: (z, part) => (between(z, 12.6, 11) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 26, w: 2.6, y0: 1.2, y1: 2.8, c: 0.9 },
    { z: 23, w: 3.6, y0: 2.2, y1: 5.2, c: 1.4 },
    { z: 16.6, w: 3.8, y0: 4, y1: 6.6, c: 1.4 },
    { z: 14.6, w: 3.2, y0: 4.6, y1: 6.4, c: 1 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // La bosse du dos, jusqu'à la poupe.
  loft([
    { z: 10, w: 4, y0: 4.6, y1: 6.8, c: 1.2 },
    { z: -6, w: 6, y0: 5.6, y1: 9.6, c: 2 },
    { z: -34, w: 6.4, y0: 4.6, y1: 10.2, c: 2.2 },
  ], { paint: (z, part) => (z > -6 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  for (const z of [-10, -20]) plate([[1.6, z, 10.2, 9.4], [4.6, z, 10.2, 9.4], [4.6, z - 6, 10.4, 9.4], [1.6, z - 6, 10.4, 9.4]], 'dark', 0.2)
  if (assault) {
    plate([[11, -4, 4.4, 2.6], [24.6, -22, 3.4, 2.4], [24.6, -31, 3.4, 2.4], [11, -30, 4.4, 2.6]], 'hull', 0.5)
    plate([[13.4, -12, 4.5, 3.6], [22, -23, 3.85, 3], [22, -29, 3.85, 3], [13.4, -28, 4.5, 3.6]], 'dark', 0.25)
    nozzle(7.4, 1.1, -35, 3.2, 2.6)
  } else {
    plate([[12, 6, 3.6, 2.2], [26, 0, 3, 2.2], [26, -4.6, 3, 2.2], [12, -4, 3.6, 2.2]], 'hull', 0.4)
    plate([[10, -22, 4.6, 3], [20, -24, 4, 3], [26, -28, 3.8, 3], [26, -33, 3.8, 3], [10, -33, 4.6, 3]], 'hull', 0.4)
    nozzle(5.57, 0.4, -35, 2.4, 3.2)
  }
  // Les ailerons bas, la quille.
  plate([[12, -2, -6.4, -7.6], [26, -9, -8.6, -9.4], [26, -13, -8.6, -9.4], [12, -12, -6.4, -7.6]], 'hull', 0.3)
  loft([
    { z: 24, w: 4, y0: -10.6, y1: -9, c: 0.7 },
    { z: 12, w: 7, y0: -11, y1: -9.2, c: 0.9 },
    { z: -10, w: 7, y0: -11, y1: -9, c: 0.9 },
    { z: -20, w: 5, y0: -8.6, y1: -6, c: 0.8 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['federal-dropship'] = (t) => federal(t, false)
MODELS['federal-assault-ship'] = (t) => federal(t, true)

MODELS['type-9'] = ({ loft, plate, fin, nozzle }) => {
  // La baleine : une caisse énorme, ronde à l'avant, la passerelle tout en bas du nez.
  loft([
    { z: 57, w: 14, y0: -12, y1: -1, c: 4 },
    { z: 48, w: 34, y0: -13.6, y1: 3, c: 6 },
    { z: 34, w: 46, y0: -14, y1: 8, c: 7 },
    { z: 16, w: 53, y0: -14, y1: 12, c: 8 },
    { z: 13, w: 54, y0: -14, y1: 12.4, c: 8 },
    { z: -6, w: 56, y0: -13, y1: 14, c: 8 },
    { z: -26, w: 50, y0: -10, y1: 13, c: 7 },
    { z: -32, w: 31, y0: -8, y1: 13, c: 6 },
    { z: -52, w: 29, y0: -6, y1: 10, c: 5 },
  ], { paint: (z, part) => (between(z, 16, 13) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 59.6, w: 3, y0: -11, y1: -5, c: 1.4 },
    { z: 57.6, w: 6, y0: -12, y1: -2, c: 2 },
    { z: 54, w: 7, y0: -12, y1: 0, c: 2.2 },
  ], { paint: (z, part) => (part === 'bottom' ? 'hull' : 'glass'), caps: ['glass', 'glass'] })
  // Le dos : l'échine, ses trappes de soute, les deux grandes prises d'air sombres des flancs.
  loft([
    { z: 30, w: 8, y0: 6, y1: 11, c: 2.4 },
    { z: 10, w: 12, y0: 10, y1: 16.4, c: 3.4 },
    { z: -30, w: 12, y0: 10, y1: 16.6, c: 3.4 },
    { z: -54, w: 9, y0: 6, y1: 13, c: 3 },
  ], { paint: (z, part) => (z > 10 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  for (const z of [4, -10, -24]) plate([[2, z, 17.1, 16], [9, z, 17.1, 16], [9, z - 9, 17.1, 16], [2, z - 9, 17.1, 16]], 'dark', 0.4)
  for (const z of [30, 12, -6]) plate([[22, z, 12.5, 9], [40, z, 12.2, 9], [40, z - 11, 13.6, 10], [22, z - 11, 14, 10]], 'dark', 0.5)
  // Les deux réacteurs, énormes.
  loft([
    { x: 21.5, z: -40, w: 8, y0: -3.4, y1: 12, c: 4 },
    { x: 21.5, z: -53.6, w: 8, y0: -3.4, y1: 12, c: 4 },
  ], { caps: [null, 'dark'], mirror: true })
  nozzle(21.5, 4.3, -53.6, 6)
  // Les ailerons relevés des bords, et le ventre.
  fin([[-4, 8], [-22, 19], [-30, 19], [-28, 8]], { x: 52, t: 1.6, lean: 0.5 })
  fin([[-40, 12], [-52, 19], [-58, 19], [-56, 11]], { x: 9, t: 1.2 })
  loft([
    { z: 44, w: 10, y0: -16, y1: -13, c: 1.4 },
    { z: 30, w: 16, y0: -19.6, y1: -13, c: 2 },
    { z: -14, w: 16, y0: -19.6, y1: -12, c: 2 },
    { z: -30, w: 10, y0: -15, y1: -9, c: 1.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['type-10'] = ({ loft, plate, fin, nozzle }) => {
  // Le Type-9 cuirassé : la même caisse, des épaules carrées, deux rangées de réacteurs, un aileron de poupe.
  loft([
    { z: 58, w: 12, y0: -13, y1: -3, c: 3 },
    { z: 50, w: 26, y0: -15, y1: 2, c: 5 },
    { z: 38, w: 40, y0: -16, y1: 8, c: 6 },
    { z: 16, w: 50, y0: -16, y1: 13, c: 7 },
    { z: 13, w: 51, y0: -16, y1: 13.4, c: 7 },
    { z: -4, w: 54, y0: -15, y1: 15, c: 7 },
    { z: -24, w: 52, y0: -11, y1: 13, c: 6 },
    { z: -29.6, w: 50, y0: -9, y1: 11, c: 5 },
  ], { paint: (z, part) => (between(z, 16, 13) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { z: 59.6, w: 3, y0: -12, y1: -6, c: 1.4 },
    { z: 57.6, w: 6, y0: -13.4, y1: -3, c: 2 },
    { z: 54, w: 7, y0: -13.4, y1: -1, c: 2.2 },
  ], { paint: (z, part) => (part === 'bottom' ? 'hull' : 'glass'), caps: ['glass', 'glass'] })
  // Les épaules, et les dents du nez.
  plate([[50, 8, 6, 0], [67, -6, 4, 0.6], [67, -22, 4, 0.6], [50, -26, 6, 0]], 'hull', 1)
  plate([[54, -6, 6.6, 5], [62, -9, 5.2, 4], [62, -19, 5.2, 4], [54, -21, 6.6, 5]], 'dark', 0.4)
  for (const x of [22, 34]) loft([
    { x, z: 56 - (x - 22) * 0.9, w: 3, y0: -10, y1: -5, c: 1.2 },
    { x, z: 40 - (x - 22) * 0.9, w: 3.6, y0: -12, y1: -2, c: 1.4 },
  ], { caps: ['dark', null], mirror: true })
  // La poupe, plus étroite, et son grand aileron.
  loft([
    { z: -26, w: 30, y0: -9, y1: 14, c: 6 },
    { z: -45.4, w: 30, y0: -7, y1: 13, c: 5 },
    { z: -55, w: 26, y0: -4, y1: 12, c: 4 },
  ], { caps: [null, 'dark'] })
  fin([[-40, 12], [-50, 19], [-58, 19], [-56, 11]], { x: 29, t: 2.4 })
  plate([[0, -47, 19.6, 17.6], [30, -47, 19.6, 17.6], [30, -58, 19.6, 17.6], [0, -57, 19.6, 17.6]], 'hull', 0.6)
  for (const x of [43.5, 35.3]) nozzle(x, 0.8, -29.6, 3.4)
  for (const x of [26.2, 18]) nozzle(x, 0.8, -55, 3.4)
  // Le dos : l'échine, ses trappes, les prises d'air des flancs ; dessous : le ventre.
  loft([
    { z: 34, w: 8, y0: 6, y1: 11, c: 2.4 },
    { z: 14, w: 12, y0: 11, y1: 17.4, c: 3.4 },
    { z: -30, w: 12, y0: 11, y1: 17.6, c: 3.4 },
    { z: -48, w: 9, y0: 9, y1: 15, c: 3 },
  ], { paint: (z, part) => (z > 14 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  for (const z of [6, -8, -22]) plate([[2, z, 18.1, 17], [9, z, 18.1, 17], [9, z - 9, 18.1, 17], [2, z - 9, 18.1, 17]], 'dark', 0.4)
  for (const z of [30, 12, -6]) plate([[22, z, 13.5, 10], [40, z, 13.2, 10], [40, z - 11, 14.6, 11], [22, z - 11, 15, 11]], 'dark', 0.5)
  loft([
    { z: 44, w: 10, y0: -18, y1: -15, c: 1.4 },
    { z: 30, w: 16, y0: -21.6, y1: -15, c: 2 },
    { z: -14, w: 16, y0: -21.6, y1: -14, c: 2 },
    { z: -26, w: 10, y0: -17, y1: -10, c: 1.6 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['federal-corvette'] = ({ loft, plate, nozzle }) => {
  // Une longue lame : la proue carrée, le corps qui s'élargit, les deux grandes ailes de poupe.
  loft([
    { z: 83.6, w: 6, y0: -5, y1: 0, c: 2 },
    { z: 78, w: 10, y0: -6.4, y1: 2, c: 2.6 },
    { z: 48, w: 16, y0: -8, y1: 3.4, c: 3 },
    { z: 46, w: 17.6, y0: -8, y1: 3.6, c: 3 },
    { z: 18, w: 20, y0: -9, y1: 5, c: 3.4 },
    { z: 15, w: 20.4, y0: -9, y1: 5.2, c: 3.4 },
    { z: -10, w: 25, y0: -10, y1: 7, c: 4 },
    { z: -40, w: 28, y0: -10, y1: 8, c: 4 },
    { z: -78, w: 26, y0: -9, y1: 7, c: 4 },
  ], { paint: (z, part) => (between(z, 18, 15) && part !== 'bottom' ? 'trim' : 'hull'), caps: ['hull', 'dark'] })
  nozzle(17.87, -3.3, -78, 7.4, 5)
  // La passerelle, en bulle basse sur l'avant.
  loft([
    { z: 62, w: 2.6, y0: 2.4, y1: 4, c: 1 },
    { z: 58, w: 3.6, y0: 2.8, y1: 6, c: 1.4 },
    { z: 51, w: 3.8, y0: 3, y1: 6.4, c: 1.4 },
    { z: 48.6, w: 3.2, y0: 3.2, y1: 5.6, c: 1 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // Le dos : le château, puis les deux carénages de la poupe.
  loft([
    { z: 30, w: 6, y0: 3.6, y1: 6.6, c: 1.6 },
    { z: 0, w: 11, y0: 5, y1: 11, c: 3 },
    { z: -24, w: 12, y0: 6, y1: 14.4, c: 3.6 },
    { z: -44, w: 12, y0: 6, y1: 14, c: 3.6 },
    { z: -56, w: 8, y0: 6, y1: 10, c: 2.4 },
  ], { paint: (z, part) => (z > 0 && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  loft([
    { x: 14, z: -44, w: 6, y0: 5, y1: 9.6, c: 2 },
    { x: 14, z: -52, w: 9, y0: 5, y1: 11.6, c: 2.6 },
    { x: 14, z: -82.6, w: 9, y0: 4, y1: 11, c: 2.6 },
  ], { caps: ['hull', 'dark'], mirror: true })
  for (const z of [-8, -20, -32]) plate([[2, z, 14.9, 13.4], [8, z, 14.3, 13], [8, z - 8, 14.6, 13], [2, z - 8, 15, 13.4]], 'dark', 0.3)
  // Les ailes de poupe, et leurs panneaux.
  plate([[24, -22, 2, -3], [43.4, -40, 0.6, -2.6], [43.4, -50, 0.6, -2.6], [34, -82, 1, -2.6], [24, -80, 2, -3]], 'hull', 0.8)
  plate([[28, -36, 2.05, 1], [40, -44, 1.2, 0.2], [38, -60, 1.3, 0.3], [28, -62, 2.05, 1]], 'dark', 0.4)
  // Les flancs : une longue rainure sombre ; dessous : la quille.
  loft([
    { z: 44, w: 17.9, y0: -3.6, y1: -1.2, c: 0.4 },
    { z: 17, w: 20.34, y0: -3.6, y1: -1.2, c: 0.4 },
    { z: -10, w: 25.06, y0: -3.6, y1: -1.2, c: 0.4 },
    { z: -20, w: 26.06, y0: -3.6, y1: -1.2, c: 0.4 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
  loft([
    { z: 60, w: 5, y0: -9.6, y1: -7, c: 1 },
    { z: 30, w: 9, y0: -12, y1: -8, c: 1.4 },
    { z: -50, w: 12, y0: -13.6, y1: -9, c: 1.6 },
    { z: -66, w: 8, y0: -12, y1: -8, c: 1.2 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}

MODELS['imperial-cutter'] = ({ loft, plate, fin, nozzle }) => {
  // Le grand yacht impérial : un fuselage en amande, une arête qui monte jusqu'à la queue.
  loft([
    { z: 96.3, w: 2, y0: -6, y1: -3, c: 1.4 },
    { z: 90, w: 7, y0: -8, y1: 0, c: 3 },
    { z: 70, w: 14, y0: -10, y1: 4, c: 5 },
    { z: 46, w: 17.4, y0: -11.6, y1: 5.6, c: 6 },
    { z: 43, w: 17.6, y0: -11.8, y1: 5.8, c: 6 },
    { z: 10, w: 18, y0: -13, y1: 7, c: 6.4 },
    { z: -10, w: 19, y0: -15, y1: 9, c: 7 },
    { z: -50, w: 15, y0: -16, y1: 12, c: 6 },
    { z: -53, w: 14.4, y0: -16, y1: 12.2, c: 6 },
    { z: -76, w: 9, y0: -15, y1: 8, c: 4 },
  ], {
    paint: (z, part) => ((between(z, 46, 43) || between(z, -50, -53)) && part !== 'bottom' ? 'trim' : 'hull'),
    caps: ['hull', 'dark'],
  })
  nozzle(0, -9, -76, 5.6)
  loft([
    { z: 84, w: 3, y0: 0.6, y1: 2.6, c: 1.2 },
    { z: 78, w: 5.6, y0: 1.6, y1: 5.6, c: 2.2 },
    { z: 58, w: 6, y0: 4, y1: 8, c: 2.4 },
    { z: 54, w: 5, y0: 5, y1: 7.6, c: 1.6 },
  ], { paint: () => 'glass', caps: ['glass', 'glass'] })
  // L'arête du dos, qui file en pointe derrière la poupe ; son réacteur.
  loft([
    { z: 40, w: 3, y0: 5, y1: 7.6, c: 1 },
    { z: 0, w: 5, y0: 7, y1: 11.6, c: 1.8 },
    { z: -50, w: 5, y0: 9, y1: 15.6, c: 2 },
    { z: -84, w: 3.6, y0: 5, y1: 15, c: 1.6 },
  ], { paint: (z, part) => (between(z, 40, 0) && part === 'top' ? 'dark' : 'hull'), caps: ['hull', 'dark'] })
  fin([[-78, 14.6], [-96, 17.4], [-96, 15.6], [-84, 12]], { t: 1.2 })
  nozzle(0, 2.3, -84, 2.2)
  // Les ailes, qui portent les nacelles ; les deux réacteurs d'emplanture.
  plate([[16, -4, 2, -4], [48, -34, 2.6, -1.4], [48, -50, 2.6, -1.4], [15, -66, 3, -4]], 'hull', 1)
  plate([[26, -34, 2.6, 1.4], [40, -40, 2.9, 1.6], [40, -46, 2.9, 1.6], [26, -50, 2.9, 1.4]], 'dark', 0.4)
  loft([
    { x: 17.8, z: -40, w: 3, y0: -3, y1: 2, c: 1.4 },
    { x: 17.8, z: -50, w: 4.2, y0: -5, y1: 3.6, c: 2 },
    { x: 17.8, z: -67, w: 4, y0: -4.6, y1: 3.2, c: 2 },
  ], { caps: ['hull', 'dark'], mirror: true })
  nozzle(17.8, -0.7, -67, 3)
  // Les nacelles : un fuseau, un anneau d'or, un réacteur.
  loft([
    { x: 51, z: -8, w: 1.2, y0: 0, y1: 2, c: 0.6 },
    { x: 51, z: -16, w: 3.6, y0: -4, y1: 6, c: 1.8 },
    { x: 51, z: -28, w: 4.6, y0: -6.4, y1: 9, c: 2.2 },
    { x: 51, z: -40, w: 4.6, y0: -6.4, y1: 9, c: 2.2 },
    { x: 51, z: -55.6, w: 4, y0: -5, y1: 6, c: 2 },
  ], { paint: (z) => (between(z, -28, -40) ? 'trim' : 'hull'), caps: ['hull', 'dark'], mirror: true })
  nozzle(50.56, -0.7, -55.6, 3)
  // La quille.
  loft([
    { z: 60, w: 5, y0: -12.4, y1: -10, c: 1 },
    { z: 30, w: 8, y0: -14.6, y1: -11, c: 1.4 },
    { z: -30, w: 8, y0: -17.6, y1: -14, c: 1.4 },
    { z: -56, w: 5, y0: -17, y1: -14, c: 1 },
  ], { paint: () => 'dark', caps: ['dark', 'dark'] })
}
