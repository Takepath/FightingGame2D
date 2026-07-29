import type {
  CharacterDefinition,
  FighterAction,
  FrameInput,
  MoveDefinition,
  PlayerId,
} from "./types";
import { InputButton, pressed } from "./types";
import type { DeterministicSimulation } from "./frameSynchronizer";

export const POSITION_SCALE = 100;
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
export const GROUND_Y = 570;

const LEFT_WALL = 68 * POSITION_SCALE;
const RIGHT_WALL = (STAGE_WIDTH - 68) * POSITION_SCALE;
const GRAVITY_PER_FRAME = 78;
const FIGHTER_HALF_WIDTH = 42 * POSITION_SCALE;
const AIR_CONTROL_PERCENT = 22;
const AIR_DRAG_PERCENT = 97;

export interface FighterState {
  readonly player: PlayerId;
  readonly character: CharacterDefinition;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: -1 | 1;
  health: number;
  action: FighterAction;
  actionFrame: number;
  activeMoveId: string | null;
  attackConnected: boolean;
  projectileSpawned: boolean;
  stun: number;
  previousButtons: number;
  inputHistory: number[];
}

export interface ProjectileState {
  owner: PlayerId;
  x: number;
  y: number;
  velocityX: number;
  life: number;
  damage: number;
  knockbackX: number;
  knockbackY: number;
  hitstun: number;
}

export class MatchSimulation implements DeterministicSimulation {
  public readonly fighters: [FighterState, FighterState];
  public round = 1;
  public winner: PlayerId | null = null;
  public roundEndFrame = 0;
  public readonly projectiles: ProjectileState[] = [];
  private readonly moves: MoveDefinition[];

  public constructor(
    private readonly characters: readonly [
      CharacterDefinition,
      CharacterDefinition,
    ],
    moves: MoveDefinition[],
  ) {
    this.moves = moves;
    this.fighters = [this.createFighter(0), this.createFighter(1)];
  }

  public step(inputs: readonly [FrameInput, FrameInput]): void {
    if (this.winner !== null) {
      this.roundEndFrame += 1;
      if (this.roundEndFrame >= 240) this.nextRound();
      return;
    }

    this.updateFacing();
    this.updateFighter(this.fighters[0], inputs[0]);
    this.updateFighter(this.fighters[1], inputs[1]);
    this.resolveAttack(this.fighters[0], this.fighters[1], inputs[1]);
    this.resolveAttack(this.fighters[1], this.fighters[0], inputs[0]);
    this.updateProjectiles(inputs);
    this.resolveCollision();
  }

  public resetMatch(): void {
    this.round = 1;
    this.winner = null;
    this.roundEndFrame = 0;
    this.projectiles.length = 0;
    this.resetFighters();
  }

  public checksum(): number {
    // FNV-1a over the complete simulation state. This makes desyncs observable in the HUD.
    let hash = 0x811c9dc5;
    const values = [this.round, this.winner ?? -1, this.roundEndFrame];
    for (const fighter of this.fighters) {
      values.push(
        fighter.x,
        fighter.y,
        fighter.velocityX,
        fighter.velocityY,
        fighter.facing,
        fighter.health,
        fighter.actionFrame,
        fighter.stun,
        fighter.previousButtons,
        fighter.activeMoveId ? fighter.activeMoveId.length : 0,
        this.actionCode(fighter.action),
        fighter.projectileSpawned ? 1 : 0,
        ...fighter.inputHistory,
      );
    }
    values.push(this.projectiles.length);
    for (const projectile of this.projectiles) {
      values.push(
        projectile.owner,
        projectile.x,
        projectile.y,
        projectile.velocityX,
        projectile.life,
        projectile.damage,
        projectile.knockbackX,
        projectile.knockbackY,
        projectile.hitstun,
      );
    }
    for (const value of values) {
      hash ^= value | 0;
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private createFighter(player: PlayerId): FighterState {
    const character = this.characters[player];
    return {
      player,
      character,
      x: (player === 0 ? 360 : 920) * POSITION_SCALE,
      y: GROUND_Y * POSITION_SCALE,
      velocityX: 0,
      velocityY: 0,
      facing: player === 0 ? 1 : -1,
      health: character.maxHealth,
      action: "idle",
      actionFrame: 0,
      activeMoveId: null,
      attackConnected: false,
      projectileSpawned: false,
      stun: 0,
      previousButtons: 0,
      inputHistory: [],
    };
  }

  private updateFacing(): void {
    const [left, right] = this.fighters;
    if (left.x === right.x) return;
    left.facing = left.x < right.x ? 1 : -1;
    right.facing = left.facing === 1 ? -1 : 1;
  }

  private updateFighter(fighter: FighterState, input: FrameInput): void {
    this.recordInput(fighter, input.buttons);
    if (fighter.action === "ko") {
      fighter.previousButtons = input.buttons;
      return;
    }
    const newlyPressed = input.buttons & ~fighter.previousButtons;

    if (fighter.stun > 0) {
      fighter.stun -= 1;
      fighter.action = "hit";
      fighter.actionFrame += 1;
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    const activeMove = this.moveFor(fighter, fighter.activeMoveId);
    if (activeMove) {
      fighter.actionFrame += 1;
      if (fighter.actionFrame >= this.moveLength(activeMove)) {
        fighter.activeMoveId = null;
        fighter.action = "idle";
        fighter.actionFrame = 0;
        fighter.attackConnected = false;
      }
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    if (fighter.y < GROUND_Y * POSITION_SCALE) {
      fighter.action = "jump";
      this.applyAirControl(fighter, input);
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    if ((newlyPressed & InputButton.Up) !== 0) {
      const direction = this.horizontalDirection(input);
      if (direction !== 0) {
        fighter.velocityX =
          direction *
          Math.round((fighter.character.walkSpeed * POSITION_SCALE) / 60);
      }
      fighter.velocityY = -fighter.character.jumpVelocity;
      fighter.action = "jump";
      fighter.actionFrame = 0;
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    const selectedMove = this.selectMove(fighter, newlyPressed);
    if (selectedMove) {
      fighter.activeMoveId = selectedMove.id;
      fighter.action = selectedMove.animation;
      fighter.actionFrame = 0;
      fighter.attackConnected = false;
      fighter.projectileSpawned = false;
      fighter.previousButtons = input.buttons;
      return;
    }

    if (pressed(input, InputButton.Block)) {
      fighter.action = "block";
      fighter.actionFrame += 1;
    } else {
      const direction = this.horizontalDirection(input);
      fighter.velocityX =
        direction === 0
          ? 0
          : direction *
            Math.round((fighter.character.walkSpeed * POSITION_SCALE) / 60);
      fighter.action = direction === 0 ? "idle" : "walk";
      fighter.actionFrame += 1;
    }
    this.applyPhysics(fighter);
    fighter.previousButtons = input.buttons;
  }

  private applyPhysics(fighter: FighterState): void {
    const airborne =
      fighter.y < GROUND_Y * POSITION_SCALE || fighter.velocityY < 0;
    fighter.x = Math.max(
      LEFT_WALL,
      Math.min(RIGHT_WALL, fighter.x + fighter.velocityX),
    );
    fighter.velocityX = Math.trunc(
      (fighter.velocityX * (airborne ? AIR_DRAG_PERCENT : 84)) / 100,
    );
    if (airborne) {
      fighter.y += fighter.velocityY;
      fighter.velocityY += GRAVITY_PER_FRAME;
      if (fighter.y >= GROUND_Y * POSITION_SCALE) {
        fighter.y = GROUND_Y * POSITION_SCALE;
        fighter.velocityY = 0;
        if (fighter.action === "jump") fighter.action = "idle";
      }
    }
  }

  private selectMove(
    fighter: FighterState,
    newlyPressed: number,
  ): MoveDefinition | undefined {
    const candidates = this.moves.filter(
      (move) =>
        move.characterId === "all" || move.characterId === fighter.character.id,
    );
    if (
      (newlyPressed & InputButton.Special) !== 0 &&
      this.isHadokenCommand(fighter)
    ) {
      return candidates.find(
        (move) =>
          move.attackType === "projectile" &&
          (newlyPressed & move.button) !== 0,
      );
    }
    return candidates.find(
      (move) =>
        move.attackType === "melee" && (newlyPressed & move.button) !== 0,
    );
  }

  private moveFor(
    fighter: FighterState,
    id: string | null,
  ): MoveDefinition | undefined {
    if (!id) return undefined;
    return this.moves.find(
      (move) =>
        move.id === id &&
        (move.characterId === "all" ||
          move.characterId === fighter.character.id),
    );
  }

  private moveLength(move: MoveDefinition): number {
    return move.startup + move.active + move.recovery;
  }

  private resolveAttack(
    attacker: FighterState,
    defender: FighterState,
    defenderInput: FrameInput,
  ): void {
    if (this.winner !== null) return;
    const move = this.moveFor(attacker, attacker.activeMoveId);
    if (!move || attacker.attackConnected) return;
    const activeStart = move.startup;
    const activeEnd = move.startup + move.active;
    if (attacker.actionFrame < activeStart || attacker.actionFrame >= activeEnd)
      return;

    if (move.attackType === "projectile") {
      if (!attacker.projectileSpawned) {
        attacker.projectileSpawned = true;
        this.spawnProjectile(attacker, move);
      }
      return;
    }

    const horizontalDistance = Math.abs(attacker.x - defender.x);
    const verticalDistance = Math.abs(attacker.y - defender.y);
    if (
      horizontalDistance > move.rangeX * POSITION_SCALE ||
      verticalDistance > move.rangeY * POSITION_SCALE
    ) {
      return;
    }

    this.applyHit(attacker, defender, move, defenderInput);
    attacker.attackConnected = true;
  }

  private spawnProjectile(attacker: FighterState, move: MoveDefinition): void {
    this.projectiles.push({
      owner: attacker.player,
      x: attacker.x + attacker.facing * 64 * POSITION_SCALE,
      y: attacker.y - 82 * POSITION_SCALE,
      velocityX:
        attacker.facing *
        Math.round((move.projectileSpeed * POSITION_SCALE) / 60),
      life: move.projectileLifetime,
      damage: move.damage,
      knockbackX: move.knockbackX,
      knockbackY: move.knockbackY,
      hitstun: move.hitstun,
    });
  }

  private updateProjectiles(inputs: readonly [FrameInput, FrameInput]): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.x += projectile.velocityX;
      projectile.life -= 1;
      const defender = this.fighters[projectile.owner === 0 ? 1 : 0];
      const attacker = this.fighters[projectile.owner];
      const collides =
        Math.abs(projectile.x - defender.x) <= 43 * POSITION_SCALE &&
        Math.abs(projectile.y - (defender.y - 78 * POSITION_SCALE)) <=
          115 * POSITION_SCALE;
      if (collides) {
        this.applyHit(attacker, defender, projectile, inputs[defender.player]);
        this.projectiles.splice(index, 1);
      } else if (
        projectile.life <= 0 ||
        projectile.x < LEFT_WALL ||
        projectile.x > RIGHT_WALL
      ) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  private applyHit(
    attacker: FighterState,
    defender: FighterState,
    attack: Pick<
      MoveDefinition,
      "damage" | "knockbackX" | "knockbackY" | "hitstun"
    >,
    defenderInput: FrameInput,
  ): void {
    const defending =
      pressed(defenderInput, InputButton.Block) &&
      defender.y === GROUND_Y * POSITION_SCALE;
    const damage = defending
      ? Math.max(1, Math.trunc(attack.damage / 4))
      : attack.damage;
    defender.health = Math.max(0, defender.health - damage);
    defender.velocityX =
      attacker.facing * Math.trunc((attack.knockbackX * POSITION_SCALE) / 60);
    defender.velocityY = defending
      ? 0
      : -Math.trunc((attack.knockbackY * POSITION_SCALE) / 60);
    defender.stun = defending ? Math.trunc(attack.hitstun / 2) : attack.hitstun;
    defender.action = defending ? "block" : "hit";
    defender.actionFrame = 0;

    if (defender.health === 0) {
      defender.action = "ko";
      defender.activeMoveId = null;
      this.winner = attacker.player;
      this.roundEndFrame = 0;
    }
  }

  private applyAirControl(fighter: FighterState, input: FrameInput): void {
    const direction = this.horizontalDirection(input);
    if (direction === 0) return;
    const desiredVelocity =
      direction *
      Math.round((fighter.character.walkSpeed * POSITION_SCALE * 82) / 6000);
    fighter.velocityX += Math.trunc(
      ((desiredVelocity - fighter.velocityX) * AIR_CONTROL_PERCENT) / 100,
    );
  }

  private horizontalDirection(input: FrameInput): number {
    return (
      Number(pressed(input, InputButton.Right)) -
      Number(pressed(input, InputButton.Left))
    );
  }

  private recordInput(fighter: FighterState, buttons: number): void {
    fighter.inputHistory.push(buttons);
    if (fighter.inputHistory.length > 18) fighter.inputHistory.shift();
  }

  private isHadokenCommand(fighter: FighterState): boolean {
    const current = fighter.inputHistory[fighter.inputHistory.length - 1] ?? 0;
    if (
      !pressed({ buttons: current }, InputButton.Special) ||
      !this.isForward(current, fighter.facing)
    ) {
      return false;
    }

    const history = fighter.inputHistory.slice(0, -1);
    let downFrame = -1;
    for (let index = 0; index < history.length; index += 1) {
      const buttons = history[index];
      const down = (buttons & InputButton.Down) !== 0;
      const forward = this.isForward(buttons, fighter.facing);
      if (down && !forward) downFrame = index;
      if (downFrame >= 0 && index > downFrame && down && forward) return true;
    }
    return false;
  }

  private isForward(buttons: number, facing: -1 | 1): boolean {
    return (
      (buttons & (facing === 1 ? InputButton.Right : InputButton.Left)) !== 0
    );
  }

  private resolveCollision(): void {
    const [first, second] = this.fighters;
    const distance = second.x - first.x;
    const overlap = FIGHTER_HALF_WIDTH * 2 - Math.abs(distance);
    if (overlap <= 0) return;

    // Player order is the deterministic tie breaker for same-position states.
    const direction = distance >= 0 ? 1 : -1;
    const shiftFirst = Math.trunc(overlap / 2);
    const shiftSecond = overlap - shiftFirst;
    first.x = Math.max(
      LEFT_WALL,
      Math.min(RIGHT_WALL, first.x - direction * shiftFirst),
    );
    second.x = Math.max(
      LEFT_WALL,
      Math.min(RIGHT_WALL, second.x + direction * shiftSecond),
    );
  }

  private nextRound(): void {
    this.round += 1;
    this.winner = null;
    this.roundEndFrame = 0;
    this.projectiles.length = 0;
    this.resetFighters();
  }

  private resetFighters(): void {
    // Keep the state object identity so the existing renderer views follow the next round.
    Object.assign(this.fighters[0], this.createFighter(0));
    Object.assign(this.fighters[1], this.createFighter(1));
  }

  private actionCode(action: FighterAction): number {
    const actions: FighterAction[] = [
      "idle",
      "walk",
      "jump",
      "light",
      "heavy",
      "special",
      "hit",
      "block",
      "ko",
    ];
    return actions.indexOf(action);
  }
}
