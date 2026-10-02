type Pad = Pick<Gamepad, 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>

export interface GamepadInput {
  connected: boolean
  active: boolean
  moveX: number
  moveY: number
  lookX: number
  lookY: number
  zoom: number
  sprint: boolean
  interact: boolean
  action: boolean
  cancel: boolean
  /** Y (triangle) : au nouvel appui. */
  next: boolean
  /** R3 (clic du stick droit) : au nouvel appui. */
  turn: boolean
  rotateLeft: boolean
  rotateRight: boolean
  help: boolean
  up: boolean
  down: boolean
}

export class GamepadControls {
  /** Boutons enfoncés à la dernière lecture (indices, et 'up' / 'down'). */
  readonly held: Set<string>
  constructor(read?: () => readonly (Pad | null)[])
  suspend(): void
  poll(enabled?: boolean): GamepadInput
}
