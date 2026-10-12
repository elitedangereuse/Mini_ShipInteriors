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
  /** Croix ou stick gauche, à gauche puis à droite : au nouvel appui, comme `up` et `down`. */
  left: boolean
  right: boolean
  /** Select / View / Share : au nouvel appui. */
  menu: boolean
}

export class GamepadControls {
  /** Boutons enfoncés à la dernière lecture (indices, et 'up' / 'down' / 'left' / 'right'). */
  readonly held: Set<string>
  constructor(read?: () => readonly (Pad | null)[])
  suspend(): void
  poll(enabled?: boolean): GamepadInput
}
