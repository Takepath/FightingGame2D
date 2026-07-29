/** Buttons are stored as a bit field so an input frame can be replayed exactly. */
export const enum InputButton {
  Left = 1 << 0,
  Right = 1 << 1,
  Up = 1 << 2,
  Down = 1 << 3,
  Light = 1 << 4,
  Heavy = 1 << 5,
  Special = 1 << 6,
  Block = 1 << 7,
}

export interface FrameInput {
  buttons: number;
}

export type PlayerId = 0 | 1;
export type FighterAction =
  | "idle"
  | "walk"
  | "jump"
  | "light"
  | "heavy"
  | "special"
  | "hit"
  | "block"
  | "ko";

export interface MoveDefinition {
  characterId: string;
  id: string;
  button: InputButton;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  rangeX: number;
  rangeY: number;
  knockbackX: number;
  knockbackY: number;
  hitstun: number;
  animation: FighterAction;
  attackType: "melee" | "projectile";
  projectileSpeed: number;
  projectileLifetime: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  renderType: "blender" | "stick";
  animationAsset: string;
  primaryColor: number;
  accentColor: number;
  maxHealth: number;
  walkSpeed: number;
  jumpVelocity: number;
}

export interface BlenderAnimationFrame {
  /** [x1, y1, x2, y2, lineWidth] in fighter-local pixels. */
  segments: number[][];
}

export interface BlenderAnimationData {
  format: string;
  fps: number;
  animations: Record<string, BlenderAnimationFrame[]>;
}

export interface GameData {
  characters: CharacterDefinition[];
  moves: MoveDefinition[];
  blenderAnimations: Record<string, BlenderAnimationData>;
}

export function pressed(input: FrameInput, button: InputButton): boolean {
  return (input.buttons & button) !== 0;
}
