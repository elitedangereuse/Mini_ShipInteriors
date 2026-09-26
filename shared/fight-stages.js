// L'identifiant choisi par la simulation est partagé avec les deux clients.
export const FIGHT_STAGES = [
  { id: 'street', name: ['Dojo du Coin', 'Corner Dojo'], music: 'street' },
  { id: 'rooftop', name: ['Toits sous la pluie', 'Rainy Rooftops'], music: 'rooftop' },
  { id: 'harbor', name: ['Port du Soleil', 'Sunset Harbor'], music: 'harbor' },
  { id: 'temple', name: ['Temple des Cimes', 'Mountain Temple'], music: 'temple' },
]
export const fightStage = id => FIGHT_STAGES.find(stage => stage.id === id) ?? FIGHT_STAGES[0]
export const chooseFightStage = roll => FIGHT_STAGES[Math.min(FIGHT_STAGES.length - 1, Math.max(0, Math.floor(roll * FIGHT_STAGES.length)))].id
