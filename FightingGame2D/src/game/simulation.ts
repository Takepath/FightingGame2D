import type {
  CharacterDefinition,
  AttackLevel,
  CommandDefinition,
  CommandDirection,
  FighterAction,
  FrameInput,
  MoveDefinition,
  MoveUseState,
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
const PASS_THROUGH_HEIGHT = 96 * POSITION_SCALE;
const AIR_CONTROL_PERCENT = 22;
const AIR_DRAG_PERCENT = 97;
const PUSHBOX_PADDING = 8 * POSITION_SCALE;
const ATTACK_CENTER_FROM_GROUND = 86 * POSITION_SCALE;
const PROJECTILE_HITBOX_RADIUS = 14 * POSITION_SCALE;

/** 固定60FPSを秒数へ換算するためのフレーム数。 */
export const FRAMES_PER_SECOND = 60;

/** 1試合は最大3ラウンドで決着する。 */
export const MAX_ROUNDS = 3;

/** 2ラウンド先取で試合勝利とする。 */
export const ROUNDS_TO_WIN = 2;

/** 通常対戦の各ラウンド制限時間（秒）。 */
export const ROUND_TIME_SECONDS = 99;

/** ラウンド開始時に中央表示する時間（固定フレーム）。 */
export const ROUND_INTRO_FRAMES = FRAMES_PER_SECOND * 2;

/** ラウンド勝者を表示してから次のラウンドへ進む時間（固定フレーム）。 */
const ROUND_RESULT_FRAMES = FRAMES_PER_SECOND * 4;

/** 後ろ入力で選ばれるガード姿勢。 */
type GuardStance = "standing" | "crouching";

export interface FighterState {
  /** 固定小数点座標で保持する、各プレイヤーの決定論的な戦闘状態。 */
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
  /** ガード成功後に操作を抑止してガード姿勢を維持するフレーム数。 */
  guardStun: number;
  /** 現在のガード硬直で維持する立ち・しゃがみ姿勢。 */
  guardStance: GuardStance | null;
  previousButtons: number;
  inputHistory: number[];
}

export interface ProjectileState {
  /** 波動拳など、フレーム更新で移動する飛び道具の状態。 */
  owner: PlayerId;
  x: number;
  y: number;
  velocityX: number;
  life: number;
  damage: number;
  /** 飛び道具にも適用する上・中・下属性。 */
  attackLevel: AttackLevel;
  knockbackX: number;
  knockbackY: number;
  hitstun: number;
}

export class MatchSimulation implements DeterministicSimulation {
  public readonly fighters: [FighterState, FighterState];
  /** 現在進行中のラウンド番号（1〜3）。 */
  public round = 1;
  /** 各プレイヤーが取得したラウンド数。 */
  public readonly roundWins: [number, number] = [0, 0];
  /** 現在ラウンドの勝者。ラウンド進行中はnull。 */
  public winner: PlayerId | null = null;
  /** 2ラウンド先取で決まった試合全体の勝者。 */
  public matchWinner: PlayerId | null = null;
  /** 次ラウンドへ進むまでの結果表示フレーム。 */
  public roundEndFrame = 0;
  /** ラウンド開始表示を残す固定フレーム数。 */
  public roundIntroFrames = ROUND_INTRO_FRAMES;
  /** 残り試合時間。トレーニングでは減らさない。 */
  public roundTimeFrames = ROUND_TIME_SECONDS * FRAMES_PER_SECOND;
  /** トレーニングでKO後に全回復・再開するまでの固定フレーム数。 */
  public trainingResetFrames = 0;
  public readonly projectiles: ProjectileState[] = [];
  /** キャラクターごとに利用可能な技をCSV順で保持する索引。 */
  private readonly movesByCharacter = new Map<
    string,
    readonly MoveDefinition[]
  >();
  /** キャラクターと技IDから、実行中の技を即時取得する索引。 */
  private readonly movesByCharacterAndId = new Map<
    string,
    ReadonlyMap<string, MoveDefinition>
  >();
  /** command_idから方向コマンドを即時取得する索引。 */
  private readonly commandsById: ReadonlyMap<string, CommandDefinition>;
  /** コマンド判定に必要な入力履歴の最大フレーム数。 */
  private readonly inputHistoryLimit: number;
  /** トレーニング中、P1の攻撃後にP2の体力を即時回復するか。 */
  private trainingAutoRecovery = false;

  public constructor(
    private readonly characters: readonly [
      CharacterDefinition,
      CharacterDefinition,
    ],
    moves: MoveDefinition[],
    commands: readonly CommandDefinition[],
    /** トレーニング中は時計を止め、∞表示にする。 */
    private readonly training = false,
    /** P2がCPUの試合だけ、相手位置に合わせた自動振り向きを許可する。 */
    private readonly autoFacePlayerTwo = false,
  ) {
    /** 使用キャラクターとCSV技定義から、2人分の初期状態を生成する。 */
<<<<<<< HEAD
    this.createMoveIndexes(moves);
    this.commandsById = new Map(
      commands.map((command) => [command.id, command]),
    );
    this.inputHistoryLimit = Math.max(
      1,
      ...commands.map((command) => command.maxFrames + 1),
    );
    this.roundIntroFrames = this.training ? 0 : ROUND_INTRO_FRAMES;
=======
    this.moves = moves;
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    this.fighters = [this.createFighter(0), this.createFighter(1)];
  }

  public step(inputs: readonly [FrameInput, FrameInput]): void {
<<<<<<< HEAD
    /** 60Hzの固定フレームでラウンド演出・時計・戦闘を決定論的に処理する。 */
    if (this.training && this.trainingResetFrames > 0) {
      this.trainingResetFrames -= 1;
      if (this.trainingResetFrames === 0) this.resetTrainingFighters();
=======
    /** 60Hzの固定フレームで両者の移動・攻撃・飛び道具・当たり判定を処理する。 */
    if (this.winner !== null) {
      this.roundEndFrame += 1;
      if (this.roundEndFrame >= 240) this.nextRound();
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
      return;
    }

    if (this.matchWinner !== null) return;

    if (this.winner !== null) {
      this.roundEndFrame += 1;
      if (this.roundEndFrame >= ROUND_RESULT_FRAMES) this.nextRound();
      return;
    }

    if (this.roundIntroFrames > 0) {
      // 開始演出中に押されているキーを攻撃開始へ持ち越さない。
      this.fighters[0].previousButtons = inputs[0].buttons;
      this.fighters[1].previousButtons = inputs[1].buttons;
      this.roundIntroFrames -= 1;
      return;
    }

    if (!this.training) {
      this.roundTimeFrames -= 1;
      if (this.roundTimeFrames <= 0) {
        this.roundTimeFrames = 0;
        this.finishRound(this.winnerAtTimeUp());
        return;
      }
    }

    if (this.winner !== null) {
      return;
    }

    this.updateCpuFacing();
    this.updateFighter(this.fighters[0], inputs[0]);
    this.updateFighter(this.fighters[1], inputs[1]);
    this.resolveAttack(this.fighters[0], this.fighters[1], inputs[1]);
    // トレーニングKO直後は、同フレームの残り攻撃を解決せず再開待機へ移る。
    if (this.training && this.trainingResetFrames > 0) return;
    this.resolveAttack(this.fighters[1], this.fighters[0], inputs[0]);
    if (this.training && this.trainingResetFrames > 0) return;
    this.updateProjectiles(inputs);
    this.resolveCollision();
  }

  public resetMatch(): void {
    /** オンライン対戦の開始やローカル復帰時に対戦全体を初期状態へ戻す。 */
    this.round = 1;
    this.roundWins[0] = 0;
    this.roundWins[1] = 0;
    this.winner = null;
    this.matchWinner = null;
    this.roundEndFrame = 0;
    this.roundIntroFrames = this.training ? 0 : ROUND_INTRO_FRAMES;
    this.roundTimeFrames = ROUND_TIME_SECONDS * FRAMES_PER_SECOND;
    this.trainingResetFrames = 0;
    this.projectiles.length = 0;
    this.resetFighters();
  }

<<<<<<< HEAD
  /** トレーニング用の敵体力自動回復をオン・オフする。 */
  public setTrainingAutoRecovery(enabled: boolean): void {
    if (this.training) this.trainingAutoRecovery = enabled;
=======
  public checksum(): number {
    /** 全状態をFNV-1aで要約し、端末間の同期ずれをHUDで確認できるようにする。 */
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  }

  private createFighter(player: PlayerId): FighterState {
    /** CSV能力値とプレイヤー番号から、ラウンド開始位置のファイターを作る。 */
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
      guardStun: 0,
      guardStance: null,
      previousButtons: 0,
      inputHistory: [],
    };
  }

<<<<<<< HEAD
  /** CPUであるP2だけは、相手を通り越した時も攻撃方向を自動で合わせる。 */
  private updateCpuFacing(): void {
    if (!this.autoFacePlayerTwo) return;

    const [opponent, cpu] = this.fighters;
    if (opponent.x === cpu.x) return;
    cpu.facing = cpu.x < opponent.x ? 1 : -1;
  }

  /** 次の固定フレームで指定ファイターへ命中する攻撃があるかを予測する。 */
  public willAttackHitNextFrame(defender: FighterState): boolean {
    const attacker = this.fighters[defender.player === 0 ? 1 : 0];
    if (this.willMeleeHitNextFrame(attacker, defender)) return true;

    return this.projectiles.some(
      (projectile) =>
        projectile.owner === attacker.player &&
        this.willProjectileHitNextFrame(projectile, defender),
    );
  }

  /** CPUガードのため、発生直前の近接攻撃だけを命中候補として判定する。 */
  private willMeleeHitNextFrame(
    attacker: FighterState,
    defender: FighterState,
  ): boolean {
    const move = this.moveFor(attacker, attacker.activeMoveId);
    if (!move || attacker.attackConnected || move.attackType !== "melee") {
      return false;
    }

    const nextActionFrame = attacker.actionFrame + 1;
    if (
      nextActionFrame < move.startup ||
      nextActionFrame >= move.startup + move.active
    ) {
      return false;
    }

    return this.isMeleeInRange(
      attacker,
      defender,
      move,
      attacker.x + attacker.velocityX,
      attacker.y + attacker.velocityY,
    );
  }

  /** 次の固定フレームに飛び道具が指定ファイターへ命中するかを判定する。 */
  private willProjectileHitNextFrame(
    projectile: ProjectileState,
    defender: FighterState,
  ): boolean {
    const nextX = projectile.x + projectile.velocityX;
    return (
      Math.abs(nextX - defender.x) <=
        this.hurtboxHalfWidth(defender) + PROJECTILE_HITBOX_RADIUS &&
      this.distanceToHurtboxY(projectile.y, defender) <=
        PROJECTILE_HITBOX_RADIUS
    );
=======
  private updateFacing(): void {
    /** 相手の位置に応じて、両者が常に相手方向を向くように更新する。 */
    const [left, right] = this.fighters;
    if (left.x === right.x) return;
    left.facing = left.x < right.x ? 1 : -1;
    right.facing = left.facing === 1 ? -1 : 1;
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  }

  private updateFighter(fighter: FighterState, input: FrameInput): void {
    /** 1人分の入力を移動・ジャンプ・通常技・硬直へ反映する。 */
    this.recordInput(fighter, input.buttons);
    if (fighter.action === "ko") {
      fighter.previousButtons = input.buttons;
      return;
    }
    const newlyPressed = input.buttons & ~fighter.previousButtons;

    if ((newlyPressed & InputButton.Turn) !== 0) {
      // 向きは相手位置で変えず、手動反転入力があった時だけ切り替える。
      fighter.facing = fighter.facing === 1 ? -1 : 1;
    }

    if (fighter.stun > 0) {
      fighter.stun -= 1;
      fighter.action = "hit";
      fighter.actionFrame += 1;
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    if (fighter.guardStun > 0) {
      fighter.guardStun -= 1;
      fighter.action =
        fighter.guardStance === "crouching" ? "crouchBlock" : "block";
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
      const selectedMove = this.selectMove(fighter, newlyPressed, "air");
      if (selectedMove) {
        this.startMove(fighter, selectedMove);
        this.applyPhysics(fighter);
        fighter.previousButtons = input.buttons;
        return;
      }

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

    const selectedMove = this.selectMove(fighter, newlyPressed, "ground");
    if (selectedMove) {
      this.startMove(fighter, selectedMove);
      fighter.previousButtons = input.buttons;
      return;
    }

    // しゃがみ中は左右入力による歩行を受け付けず、その場に留まる。
    const crouching = pressed(input, InputButton.Down);
    const direction = crouching ? 0 : this.horizontalDirection(input);
    fighter.velocityX =
      direction === 0
        ? 0
        : direction * this.groundMoveSpeed(fighter, direction);
    // 下入力中は、ガードの成否にかかわらずしゃがみ用アニメーションを表示する。
    // 攻撃・被弾などの優先状態は上で処理済みのため、通常移動時だけを切り替える。
    fighter.action = crouching
      ? "crouchBlock"
      : direction === 0
        ? "idle"
        : "walk";
    fighter.actionFrame += 1;
    this.applyPhysics(fighter);
    fighter.previousButtons = input.buttons;
  }

  private applyPhysics(fighter: FighterState): void {
    /** 壁制限、空中慣性、重力、着地を固定小数点演算で適用する。 */
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
    useState: MoveUseState,
  ): MoveDefinition | undefined {
<<<<<<< HEAD
    /** 新規押下と現在の地上・空中状態から、CSVコマンド技を優先して選ぶ。 */
    const candidates = this.movesByCharacter.get(fighter.character.id) ?? [];
    for (const move of candidates) {
      if (
        (move.useState === "any" || move.useState === useState) &&
        move.commandId !== null &&
        this.matchesCommand(fighter, move.commandId) &&
        (newlyPressed & move.button) !== 0
      ) {
        return move;
      }
=======
    /** 新規押下から技を選び、波動拳コマンド時は飛び道具を優先する。 */
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    }
    for (const move of candidates) {
      if (
        (move.useState === "any" || move.useState === useState) &&
        move.commandId === null &&
        (newlyPressed & move.button) !== 0
      ) {
        return move;
      }
    }
    return undefined;
  }

  private startMove(fighter: FighterState, move: MoveDefinition): void {
    /** 選択済みの技を開始し、命中・飛び道具生成用の状態をリセットする。 */
    fighter.activeMoveId = move.id;
    fighter.action = move.animation;
    fighter.actionFrame = 0;
    fighter.attackConnected = false;
    fighter.projectileSpawned = false;
  }

  private moveFor(
    fighter: FighterState,
    id: string | null,
  ): MoveDefinition | undefined {
    /** 現在実行中の技IDを、キャラクター固有技も考慮して検索する。 */
    if (!id) return undefined;
    return this.movesByCharacterAndId.get(fighter.character.id)?.get(id);
  }

  /** 試合開始時にだけ技検索用の索引を作り、対戦中の配列走査を避ける。 */
  private createMoveIndexes(moves: readonly MoveDefinition[]): void {
    for (const character of this.characters) {
      if (this.movesByCharacter.has(character.id)) continue;

      const characterMoves: MoveDefinition[] = [];
      const movesById = new Map<string, MoveDefinition>();
      for (const move of moves) {
        if (move.characterId !== "all" && move.characterId !== character.id) {
          continue;
        }
        characterMoves.push(move);
        // 以前と同じくCSVで先に定義された技を優先する。
        if (!movesById.has(move.id)) movesById.set(move.id, move);
      }
      this.movesByCharacter.set(character.id, characterMoves);
      this.movesByCharacterAndId.set(character.id, movesById);
    }
  }

  private moveLength(move: MoveDefinition): number {
    /** 発生・持続・硬直の合計から技の終了フレームを求める。 */
    return move.startup + move.active + move.recovery;
  }

  private resolveAttack(
    attacker: FighterState,
    defender: FighterState,
    defenderInput: FrameInput,
  ): void {
    /** 近接技の判定、または飛び道具生成タイミングを処理する。 */
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

    if (!this.isMeleeInRange(attacker, defender, move)) return;

    this.applyHit(attacker, defender, move, defenderInput);
    attacker.attackConnected = true;
  }

  /** 攻撃者の前方・リーチ・高さが、相手の被弾判定に届いているかを返す。 */
  private isMeleeInRange(
    attacker: FighterState,
    defender: FighterState,
    move: Pick<MoveDefinition, "rangeX" | "rangeY">,
    attackerX = attacker.x,
    attackerY = attacker.y,
  ): boolean {
    // 向いている前方を正とする。負なら相手は背後にいるため技は当たらない。
    const forwardDistance = (defender.x - attackerX) * attacker.facing;
    // 攻撃距離はキャラクター中心ではなく、押し込み判定が接触する
    // 前方境界どうしの距離として扱う。これにより密着時のリーチが
    // 押し込み位置から始まり、しゃがみ中の相手にも近距離技が届く。
    const distanceFromPushbox =
      forwardDistance -
      this.hurtboxHalfWidth(attacker) -
      this.hurtboxHalfWidth(defender) -
      PUSHBOX_PADDING * 2;
    const verticalDistance = this.distanceToHurtboxY(
      attackerY - ATTACK_CENTER_FROM_GROUND,
      defender,
    );
    return (
      forwardDistance >= 0 &&
      distanceFromPushbox <= move.rangeX * POSITION_SCALE &&
      verticalDistance <= move.rangeY * POSITION_SCALE
    );
  }

  private spawnProjectile(attacker: FighterState, move: MoveDefinition): void {
    /** 攻撃者の向きとCSV速度を使い、波動拳の初期状態を生成する。 */
    this.projectiles.push({
      owner: attacker.player,
      x: attacker.x + attacker.facing * 64 * POSITION_SCALE,
      y: attacker.y - 82 * POSITION_SCALE,
      velocityX:
        attacker.facing *
        Math.round((move.projectileSpeed * POSITION_SCALE) / 60),
      life: move.projectileLifetime,
      damage: move.damage,
      attackLevel: move.attackLevel,
      knockbackX: move.knockbackX,
      knockbackY: move.knockbackY,
      hitstun: move.hitstun,
    });
  }

  private updateProjectiles(inputs: readonly [FrameInput, FrameInput]): void {
    /** 飛び道具を移動し、相手への命中・ガード・寿命切れを判定する。 */
<<<<<<< HEAD
    if (this.winner !== null) return;
=======
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.x += projectile.velocityX;
      projectile.life -= 1;
      const defender = this.fighters[projectile.owner === 0 ? 1 : 0];
      const attacker = this.fighters[projectile.owner];
      const collides =
        Math.abs(projectile.x - defender.x) <=
          this.hurtboxHalfWidth(defender) + PROJECTILE_HITBOX_RADIUS &&
        this.distanceToHurtboxY(projectile.y, defender) <=
          PROJECTILE_HITBOX_RADIUS;
      if (collides) {
        this.applyHit(attacker, defender, projectile, inputs[defender.player]);
        this.projectiles.splice(index, 1);
        // KOしたフレームは残る飛び道具も止め、1秒間の再開待機を正確に保つ。
        if (this.training && this.trainingResetFrames > 0) return;
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
      "damage" | "attackLevel" | "knockbackX" | "knockbackY" | "hitstun"
    >,
    defenderInput: FrameInput,
  ): void {
<<<<<<< HEAD
    /** 近接技と飛び道具に共通する上中下ガード、ダメージ、KO処理を適用する。 */
    const guardStance = this.guardStanceFor(defender, attacker, defenderInput);
=======
    /** 近接技と飛び道具に共通するダメージ、ノックバック、KO処理を適用する。 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    const defending =
      guardStance !== null &&
      this.canGuardAttack(guardStance, attack.attackLevel);
    if (!defending) {
      // 被弾してヒットスタンへ入った時点で、実行中の技の持続判定を止める。
      // 先に被弾した側は同一フレーム後半にも攻撃を出せず、残り持続も発生しない。
      defender.activeMoveId = null;
      defender.attackConnected = false;
    }
    const damage = defending ? 0 : attack.damage;
    defender.health = Math.max(0, defender.health - damage);
    if (
      this.training &&
      this.trainingAutoRecovery &&
      attacker.player === 0 &&
      defender.player === 1 &&
      damage > 0
    ) {
      // トレーニングの敵体力自動回復は、KO判定より先に即時適用する。
      defender.health = defender.character.maxHealth;
    }
    defender.velocityX = defending
      ? attacker.facing * Math.trunc((attack.knockbackX * POSITION_SCALE) / 180)
      : attacker.facing * Math.trunc((attack.knockbackX * POSITION_SCALE) / 60);
    defender.velocityY = defending
      ? 0
      : -Math.trunc((attack.knockbackY * POSITION_SCALE) / 60);
    defender.stun = defending ? 0 : attack.hitstun;
    defender.guardStun = defending
      ? Math.max(1, Math.trunc(attack.hitstun / 2))
      : 0;
    defender.guardStance = defending ? guardStance : null;
    defender.action = defending
      ? guardStance === "crouching"
        ? "crouchBlock"
        : "block"
      : "hit";
    defender.actionFrame = 0;

    if (defender.health === 0) {
      defender.action = "ko";
      defender.activeMoveId = null;
      this.finishRound(attacker.player);
    }
  }

  private applyAirControl(fighter: FighterState, input: FrameInput): void {
    /** ジャンプ中の左右入力を弱く加え、初速を残す空中慣性を作る。 */
    const direction = this.horizontalDirection(input);
    if (direction === 0) return;
    const desiredVelocity =
      direction *
      Math.round((fighter.character.walkSpeed * POSITION_SCALE * 82) / 6000);
    fighter.velocityX += Math.trunc(
      ((desiredVelocity - fighter.velocityX) * AIR_CONTROL_PERCENT) / 100,
    );
  }

  /** 地上移動は前方向を基準速度、後ろ方向をその3分の1の速度にする。 */
  private groundMoveSpeed(fighter: FighterState, direction: number): number {
    const forwardSpeed = Math.round(
      (fighter.character.walkSpeed * POSITION_SCALE) / 60,
    );
    return direction === fighter.facing
      ? forwardSpeed
      : Math.trunc(forwardSpeed / 3);
  }

  private horizontalDirection(input: FrameInput): number {
    /** 左右入力を -1 / 0 / 1 の水平移動方向へ変換する。 */
    return (
      Number(pressed(input, InputButton.Right)) -
      Number(pressed(input, InputButton.Left))
    );
  }

  private recordInput(fighter: FighterState, buttons: number): void {
<<<<<<< HEAD
    /** commands.csv の最大猶予フレームに合わせ、方向入力履歴を保持する。 */
=======
    /** 波動拳コマンド判定用に、直近18フレームの入力履歴を保持する。 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    fighter.inputHistory.push(buttons);
    if (fighter.inputHistory.length > this.inputHistoryLimit) {
      fighter.inputHistory.shift();
    }
  }

<<<<<<< HEAD
  /** command_idが指す方向入力列を、現在の向きを基準にして照合する。 */
  private matchesCommand(fighter: FighterState, commandId: string): boolean {
    const command = this.commandsById.get(commandId);
    const history = fighter.inputHistory;
    if (!command || history.length === 0) return false;

    let sequenceIndex = command.sequence.length - 1;
    const currentButtons = history[history.length - 1];
=======
  private isHadokenCommand(fighter: FighterState): boolean {
    /** ↓、↓＋前、前＋必殺の順序が短時間で入力されたか判定する。 */
    const current = fighter.inputHistory[fighter.inputHistory.length - 1] ?? 0;
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    if (
      !this.matchesCommandDirection(
        currentButtons,
        fighter.facing,
        command.sequence[sequenceIndex],
      )
    ) {
      return false;
    }
    sequenceIndex -= 1;

    const earliestFrame = Math.max(0, history.length - (command.maxFrames + 1));
    for (
      let index = history.length - 2;
      index >= earliestFrame && sequenceIndex >= 0;
      index -= 1
    ) {
      if (
        this.matchesCommandDirection(
          history[index],
          fighter.facing,
          command.sequence[sequenceIndex],
        )
      ) {
        sequenceIndex -= 1;
      }
    }
    return sequenceIndex < 0;
  }

<<<<<<< HEAD
  /** commands.csv のテンキー方向と、実際の十字入力が一致するかを返す。 */
  private matchesCommandDirection(
    buttons: number,
    facing: -1 | 1,
    direction: CommandDirection,
  ): boolean {
    const forward = this.isDirectionPressed(buttons, facing);
    const back = this.isDirectionPressed(buttons, facing === 1 ? -1 : 1);
    const up = (buttons & InputButton.Up) !== 0;
    const down = (buttons & InputButton.Down) !== 0;

    if (direction === "5") return !forward && !back && !up && !down;
    if (direction === "8") return up && !forward && !back && !down;
    if (direction === "2") return down && !forward && !back && !up;
    if (direction === "6") return forward && !back && !up && !down;
    if (direction === "4") return back && !forward && !up && !down;
    if (direction === "9") return up && forward && !back && !down;
    if (direction === "7") return up && back && !forward && !down;
    if (direction === "3") {
      return down && forward && !back && !up;
    }
    return down && back && !forward && !up;
  }

  /** 指定した向きに対応する左右入力が押されているかを返す。 */
  private isDirectionPressed(buttons: number, direction: -1 | 1): boolean {
    const button = direction === 1 ? InputButton.Right : InputButton.Left;
    return (buttons & button) !== 0;
  }

  /** 相手と反対方向への入力から立ち・しゃがみガード姿勢を判定する。 */
  private guardStanceFor(
    defender: FighterState,
    attacker: FighterState,
    input: FrameInput,
  ): GuardStance | null {
    const grounded =
      defender.y === GROUND_Y * POSITION_SCALE && defender.velocityY === 0;
    if (
      !grounded ||
      defender.stun > 0 ||
      defender.guardStun > 0 ||
      defender.activeMoveId !== null
    ) {
      return null;
    }

    // 手動反転中でも「敵と反対方向」を後ろ入力として扱う。
    const awayButton =
      attacker.x >= defender.x ? InputButton.Left : InputButton.Right;
    // 前後同時入力は前入力を優先し、後ろガードを無効にする。
    const forwardButton =
      attacker.x >= defender.x ? InputButton.Right : InputButton.Left;
    if (pressed(input, forwardButton) || !pressed(input, awayButton)) {
      return null;
    }

    return pressed(input, InputButton.Down) ? "crouching" : "standing";
  }

  /** 上段は立ち、下段はしゃがみ、中段はどちらの後ろ入力でも防げる。 */
  private canGuardAttack(
    stance: GuardStance,
    attackLevel: AttackLevel,
  ): boolean {
    if (attackLevel === "high") return stance === "standing";
    if (attackLevel === "low") return stance === "crouching";
    return true;
  }

  private hurtboxHalfWidth(fighter: FighterState): number {
    /** CSVの被弾判定横幅を、固定小数点の半幅へ変換する。 */
    return Math.round((fighter.character.hurtboxWidth * POSITION_SCALE) / 2);
  }

  private distanceToHurtboxY(pointY: number, fighter: FighterState): number {
    /** 点とキャラクターの胴体被弾判定との上下方向の最短距離を返す。 */
    const top = fighter.y - fighter.character.hurtboxTop * POSITION_SCALE;
    const bottom = fighter.y - fighter.character.hurtboxBottom * POSITION_SCALE;
    if (pointY < top) return top - pointY;
    if (pointY > bottom) return pointY - bottom;
    return 0;
  }

  private resolveCollision(): void {
    /** 本体幅に余白を足した押し戻し判定で、足元の重なりだけを防ぐ。 */
=======
  private isForward(buttons: number, facing: -1 | 1): boolean {
    /** キャラクターの向きから、入力が「前」かどうかを解釈する。 */
    return (
      (buttons & (facing === 1 ? InputButton.Right : InputButton.Left)) !== 0
    );
  }

  private resolveCollision(): void {
    /** キャラクター同士の重なりをプレイヤー番号基準で安定して押し戻す。 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    const [first, second] = this.fighters;
    if (Math.abs(first.y - second.y) >= PASS_THROUGH_HEIGHT) return;
    const distance = second.x - first.x;
    const overlap =
      this.hurtboxHalfWidth(first) +
      this.hurtboxHalfWidth(second) +
      PUSHBOX_PADDING * 2 -
      Math.abs(distance);
    if (overlap <= 0) return;

    // 同位置でも結果が揺れないよう、プレイヤー番号を押し戻し順の基準にする。
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
<<<<<<< HEAD
    /** ラウンド結果後、決着済みでなければ次ラウンドを開始する。 */
    if (this.training || this.matchWinner !== null) return;
=======
    /** KO演出後にラウンド数を進め、両者を開始位置へ戻す。 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    this.round += 1;
    this.winner = null;
    this.roundEndFrame = 0;
    this.roundIntroFrames = ROUND_INTRO_FRAMES;
    this.roundTimeFrames = ROUND_TIME_SECONDS * FRAMES_PER_SECOND;
    this.projectiles.length = 0;
    this.resetFighters();
  }

  /** 時間切れ時の残体力比較を行い、同値ならP1を勝者にする。 */
  private winnerAtTimeUp(): PlayerId {
    const [playerOne, playerTwo] = this.fighters;
    return playerOne.health >= playerTwo.health ? 0 : 1;
  }

  /** KO・時間切れの共通処理として、ラウンドと試合の勝者を確定する。 */
  private finishRound(winner: PlayerId): void {
    if (this.winner !== null) return;

    if (this.training) {
      // トレーニングはラウンド取得を行わず、KO姿勢を1秒表示してから再開する。
      this.trainingResetFrames = FRAMES_PER_SECOND;
      this.projectiles.length = 0;
      return;
    }

    this.winner = winner;
    this.roundWins[winner] += 1;
    this.roundEndFrame = 0;
    this.projectiles.length = 0;

    if (this.roundWins[winner] >= ROUNDS_TO_WIN) {
      this.matchWinner = winner;
    }
  }

  /** トレーニングのKO待機後、体力・位置・行動を初期状態へ戻す。 */
  private resetTrainingFighters(): void {
    this.projectiles.length = 0;
    this.resetFighters();
  }

  private resetFighters(): void {
    /** 描画ビューの参照を保ったまま、2人分の戦闘状態を初期化する。 */
    Object.assign(this.fighters[0], this.createFighter(0));
    Object.assign(this.fighters[1], this.createFighter(1));
  }
<<<<<<< HEAD
=======

  private actionCode(action: FighterAction): number {
    /** 文字列アクションをチェックサムに混ぜるための安定した数値へ変換する。 */
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
}
