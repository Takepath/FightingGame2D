import { type FrameInput, InputButton, type PlayerId } from "./types";

const keyboardBindings: Record<PlayerId, Record<string, InputButton>> = {
  0: {
    KeyA: InputButton.Left,
    KeyD: InputButton.Right,
    KeyW: InputButton.Up,
    KeyS: InputButton.Down,
    KeyF: InputButton.Light,
    KeyG: InputButton.Heavy,
    KeyH: InputButton.Special,
    KeyQ: InputButton.Block,
  },
  1: {
    ArrowLeft: InputButton.Left,
    ArrowRight: InputButton.Right,
    ArrowUp: InputButton.Up,
    ArrowDown: InputButton.Down,
    Numpad1: InputButton.Light,
    Numpad2: InputButton.Heavy,
    Numpad3: InputButton.Special,
    Numpad0: InputButton.Block,
  },
};

function buttonDown(gamepad: Gamepad, index: number): boolean {
  return Boolean(
    gamepad.buttons[index]?.pressed ||
    (gamepad.buttons[index]?.value ?? 0) > 0.5,
  );
}

/** Captures physical controls once per simulation tick; the game never reads them during simulation. */
export class InputManager {
  private readonly heldKeys = new Set<string>();

  public constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
  }

  public sample(player: PlayerId): FrameInput {
    let buttons = 0;
    for (const [key, bit] of Object.entries(keyboardBindings[player])) {
      if (this.heldKeys.has(key)) buttons |= bit;
    }

    const gamepad = navigator.getGamepads()[player];
    if (gamepad?.connected) buttons |= this.sampleXboxGamepad(gamepad);
    return { buttons };
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) event.preventDefault();
    this.heldKeys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) event.preventDefault();
    this.heldKeys.delete(event.code);
  };

  private clear = (): void => this.heldKeys.clear();

  private isGameKey(code: string): boolean {
    return Object.values(keyboardBindings).some((bindings) => code in bindings);
  }

  private sampleXboxGamepad(gamepad: Gamepad): number {
    let buttons = 0;
    const horizontal = gamepad.axes[0] ?? 0;
    const vertical = gamepad.axes[1] ?? 0;
    if (horizontal < -0.45 || buttonDown(gamepad, 14))
      buttons |= InputButton.Left;
    if (horizontal > 0.45 || buttonDown(gamepad, 15))
      buttons |= InputButton.Right;
    if (vertical < -0.45 || buttonDown(gamepad, 12)) buttons |= InputButton.Up;
    if (vertical > 0.45 || buttonDown(gamepad, 13)) buttons |= InputButton.Down;
    // Standard Xbox mapping: A, X, B, and right bumper.
    if (buttonDown(gamepad, 0)) buttons |= InputButton.Light;
    if (buttonDown(gamepad, 2)) buttons |= InputButton.Heavy;
    if (buttonDown(gamepad, 1)) buttons |= InputButton.Special;
    if (buttonDown(gamepad, 5)) buttons |= InputButton.Block;
    return buttons;
  }
}
