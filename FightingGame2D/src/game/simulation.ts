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
/** 投げ成功時、投げた側を通常技の最大リーチ外へ退かせる距離。 */
const THROW_SELF_KNOCKBACK_DISTANCE = 320 * POSITION_SCALE;
/** 投げ抜け時に両者を離す距離。 */
const THROW_TECH_KNOCKBACK_DISTANCE = 120 * POSITION_SCALE;
/** 投げ抜け時に両者へ与える横方向のノックバック速度。 */
const THROW_TECH_KNOCKBACK_SPEED = (780 * POSITION_SCALE) / 60;
/** 後ろ投げ後、強攻撃の最大リーチに加えて確保する余白。 */
const BACK_THROW_HEAVY_RANGE_MARGIN = 12 * POSITION_SCALE;
/** ガード解除や技選択で扱う、全攻撃ボタンのビット集合。 */
const ATTACK_BUTTON_MASK =
  InputButton.Light |
  InputButton.Heavy |
  InputButton.Special |
  InputButton.Throw;

/** 攻撃とジャンプを、行動可能になる直前に受け付ける先行入力の対象とする。 */
const BUFFERABLE_ACTION_BUTTON_MASK = ATTACK_BUTTON_MASK | InputButton.Up;

/** 押下後に行動可能になるまで受け付ける、先行入力の固定フレーム数。 */
export const INPUT_BUFFER_FRAMES = 5;

/** コマンドの最後の方向入力後に、技ボタンを受け付ける固定猶予フレーム数。 */
const COMMAND_BUTTON_GRACE_FRAMES = 2;

/** 固定60FPSを秒数へ換算するためのフレーム数。 */
export const FRAMES_PER_SECOND = 60;

/** 必殺技ゲージの最大値。HUDとCSVの消費量もこの値を上限にする。 */
export const MAX_SPECIAL_GAUGE = 100;

/** 超必殺ゲージの最大値。技を使うたびにCSV指定量を加算する。 */
export const MAX_SUPER_GAUGE = 300;

/** 必殺技ゲージを1ポイント回復するまでの固定フレーム数（毎秒1ポイント）。 */
const SPECIAL_GAUGE_RECOVERY_FRAMES = FRAMES_PER_SECOND;

/** ヒットスタンがこの値を超えた実ヒットで、ヒットストップを開始する。 */
const HIT_STOP_HITSTUN_THRESHOLD = 30;

/** 強い攻撃が命中した後、ゲーム進行を静止する固定フレーム数。 */
export const HIT_STOP_FRAMES = 5;

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

/** 初段を含めて弱攻撃を3HITまでにするため、初段後に選べる弱攻撃の最大回数。 */
const COMBO_LIGHT_CANCEL_LIMIT = 2;

/** 初段を含めて強攻撃を2HITまでにするため、初段後に選べる強攻撃の最大回数。 */
const COMBO_HEAVY_CANCEL_LIMIT = 1;

/** 弱・強を種類ごとに切り替えても超えられない、通常技キャンセルの総数。 */
const COMBO_NORMAL_CANCEL_LIMIT =
  COMBO_LIGHT_CANCEL_LIMIT + COMBO_HEAVY_CANCEL_LIMIT;

/** 後ろ入力で選ばれるガード姿勢。 */
type GuardStance = "standing" | "crouching";

/** キャンセルの成否が確定するまで、被弾側で保留するノックバック。 */
interface PendingKnockback {
  /** このノックバックを発生させた攻撃側。 */
  readonly attacker: PlayerId;
  /** 攻撃時の向きを反映済みの横速度。 */
  readonly velocityX: number;
  /** 攻撃時の縦速度。 */
  readonly velocityY: number;
}

/** トレーニングの判定表示に渡す、ステージ座標系の矩形。 */
export interface CollisionDebugBox {
  /** 矩形の左上X座標（ピクセル）。 */
  readonly x: number;
  /** 矩形の左上Y座標（ピクセル）。 */
  readonly y: number;
  /** 矩形の横幅（ピクセル）。 */
  readonly width: number;
  /** 矩形の高さ（ピクセル）。 */
  readonly height: number;
}

/** 1キャラクター分の被弾・攻撃判定表示情報。 */
export interface FighterCollisionDebug {
  /** characters.csv の被弾判定。 */
  readonly hurtbox: CollisionDebugBox;
  /** 現在の有効フレーム中にだけ存在する、近接攻撃の判定。 */
  readonly attackbox: CollisionDebugBox | null;
}

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
  /** 最大100で管理する必殺技ゲージ。 */
  specialGauge: number;
  /** 必殺技ゲージを1ポイント回復するまでに経過した固定フレーム数。 */
  specialGaugeRecoveryFrames: number;
  /** 最大300で管理する超必殺ゲージ。ラウンド開始時は0で、技の使用で増加する。 */
  superGauge: number;
  action: FighterAction;
  actionFrame: number;
  activeMoveId: string | null;
  /** 現在の技で既に処理した攻撃判定の持続フレーム数。 */
  activeFramesResolved: number;
  attackConnected: boolean;
  projectileSpawned: boolean;
  /** 投げを開始した瞬間の相手基準の方向。-1:後ろ、0:ニュートラル、1:前。 */
  throwDirection: -1 | 0 | 1;
  /** 現在の被コンボ段数。1は始動ヒット、2以上をCOMBO表示する。 */
  comboHitCount: number;
  /** 現在のコンボを始動したプレイヤー。コンボ外ではnull。 */
  comboStarterPlayer: PlayerId | null;
  /** 始動技のCSV補正率。段数ごとの減衰へ加算して使用する。 */
  comboStarterProration: number;
  /** 命中した弱・強から、次の攻撃へキャンセルできる状態か。 */
  comboCancelable: boolean;
  /** 現在のコンボでキャンセル先に選んだ弱攻撃の回数。 */
  comboLightCancels: number;
  /** 現在のコンボでキャンセル先に選んだ強攻撃の回数。 */
  comboHeavyCancels: number;
  /** 現在のコンボでキャンセル先に選んだ弱・強の合計回数。 */
  comboNormalCancels: number;
  /** 現在のコンボで必殺技キャンセルを使用済みか。 */
  comboSpecialCanceled: boolean;
  /** 現在のコンボで投げキャンセルを使用済みか。 */
  comboThrowCanceled: boolean;
  /** キャンセルされなかった時だけ適用する、保留中のノックバック。 */
  pendingKnockback: PendingKnockback | null;
  stun: number;
  /** ガード成功後に操作を抑止してガード姿勢を維持するフレーム数。 */
  guardStun: number;
  /** 現在のガード硬直で維持する立ち・しゃがみ姿勢。 */
  guardStance: GuardStance | null;
  previousButtons: number;
  /** 押下フレームから5フレーム先までの攻撃・ジャンプ押下を保持する先行入力履歴。 */
  bufferedActionHistory: number[];
  inputHistory: number[];
}

export interface ProjectileState {
  /** 波動拳など、フレーム更新で移動する飛び道具の状態。 */
  owner: PlayerId;
  /** projectiles.csv を参照する見た目ID。 */
  visualId: string;
  x: number;
  y: number;
  velocityX: number;
  life: number;
  damage: number;
  /** true の飛び道具は後ろ入力ガードを無視してダメージを与える。 */
  guardPiercing: boolean;
  /** 飛び道具を出した技のコンボ始動補正率。 */
  starterProration: number;
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
  /** 強い攻撃の命中後に残る、入力・物理・時計を静止するフレーム数。 */
  public hitStopFrames = 0;
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

  /** トレーニング中、P1が技を使った直後に必殺技ゲージを最大へ戻すか。 */
  private trainingAutoSpecialGaugeRecovery = false;

  public constructor(
    private readonly characters: readonly [
      CharacterDefinition,
      CharacterDefinition,
    ],
    moves: MoveDefinition[],
    commands: readonly CommandDefinition[],
    /** トレーニング中は時計を止め、∞表示にする。 */
    private readonly training = false,
  ) {
    /** 使用キャラクターとCSV技定義から、2人分の初期状態を生成する。 */
    this.createMoveIndexes(moves);
    this.commandsById = new Map(
      commands.map((command) => [command.id, command]),
    );
    this.inputHistoryLimit = Math.max(
      1,
      ...commands.map((command) => command.maxFrames + 1),
    );
    this.roundIntroFrames = this.training ? 0 : ROUND_INTRO_FRAMES;
    this.fighters = [this.createFighter(0), this.createFighter(1)];
  }

  public step(inputs: readonly [FrameInput, FrameInput]): void {
    /** 60Hzの固定フレームでラウンド演出・時計・戦闘を決定論的に処理する。 */
    if (this.hitStopFrames > 0) {
      // ヒットストップ中は全ファイター・飛び道具・時計を進めず、画面を固定する。
      this.hitStopFrames -= 1;
      return;
    }
    if (this.training && this.trainingResetFrames > 0) {
      this.trainingResetFrames -= 1;
      if (this.trainingResetFrames === 0) this.resetTrainingFighters();
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

    this.updateFacing();
    this.updateFighter(this.fighters[0], inputs[0]);
    this.updateFighter(this.fighters[1], inputs[1]);
    this.resolveAttack(this.fighters[0], this.fighters[1], inputs[1]);
    // トレーニングKO直後は、同フレームの残り攻撃を解決せず再開待機へ移る。
    if (this.training && this.trainingResetFrames > 0) return;
    this.resolveAttack(this.fighters[1], this.fighters[0], inputs[0]);
    if (this.training && this.trainingResetFrames > 0) return;
    this.updateProjectiles(inputs);
    this.resolveCollision();
    // 飛び越えや押し戻し後の位置も反映し、次フレームの入力方向を正しく判定する。
    this.updateFacing();
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
    this.hitStopFrames = 0;
    this.projectiles.length = 0;
    this.resetFighters();
  }

  /** トレーニング用の敵体力自動回復をオン・オフする。 */
  public setTrainingAutoRecovery(enabled: boolean): void {
    if (this.training) this.trainingAutoRecovery = enabled;
  }

  /** トレーニング用の自キャラ必殺技ゲージ自動回復をオン・オフする。 */
  public setTrainingAutoSpecialGaugeRecovery(enabled: boolean): void {
    if (this.training) this.trainingAutoSpecialGaugeRecovery = enabled;
  }

  /**
   * トレーニング用に、現在の被弾判定と有効フレーム中の近接攻撃判定を返す。
   * 描画専用の読み取り処理であり、決定論的なゲーム状態は変更しない。
   */
  public getCollisionDebugBoxes(): readonly [
    FighterCollisionDebug,
    FighterCollisionDebug,
  ] {
    return [
      this.createCollisionDebug(this.fighters[0], this.fighters[1]),
      this.createCollisionDebug(this.fighters[1], this.fighters[0]),
    ];
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
      // ラウンド開始時は、両者の必殺技ゲージを最大値から開始する。
      specialGauge: MAX_SPECIAL_GAUGE,
      specialGaugeRecoveryFrames: 0,
      superGauge: 0,
      action: "idle",
      actionFrame: 0,
      activeMoveId: null,
      activeFramesResolved: 0,
      attackConnected: false,
      projectileSpawned: false,
      throwDirection: 0,
      comboHitCount: 0,
      comboStarterPlayer: null,
      comboStarterProration: 0,
      comboCancelable: false,
      comboLightCancels: 0,
      comboHeavyCancels: 0,
      comboNormalCancels: 0,
      comboSpecialCanceled: false,
      comboThrowCanceled: false,
      pendingKnockback: null,
      stun: 0,
      guardStun: 0,
      guardStance: null,
      previousButtons: 0,
      bufferedActionHistory: [],
      inputHistory: [],
    };
  }

  /** 1キャラクター分の判定表示情報を、実際の判定式と同じ座標系で組み立てる。 */
  private createCollisionDebug(
    fighter: FighterState,
    opponent: FighterState,
  ): FighterCollisionDebug {
    const centerX = fighter.x / POSITION_SCALE;
    const groundY = fighter.y / POSITION_SCALE;
    const hurtbox = {
      x: centerX - fighter.character.hurtboxWidth / 2,
      y: groundY - fighter.character.hurtboxTop,
      width: fighter.character.hurtboxWidth,
      height: fighter.character.hurtboxTop - fighter.character.hurtboxBottom,
    };
    const move = this.moveFor(fighter, fighter.activeMoveId);
    if (
      !move ||
      move.attackType !== "melee" ||
      !this.isMoveInActiveFrame(fighter, move)
    ) {
      return { hurtbox, attackbox: null };
    }

    if (move.button === InputButton.Throw) {
      // 投げはリーチではなく、両者の押し込み判定が接触する範囲で成立する。
      const horizontalRadius =
        (this.hurtboxHalfWidth(fighter) +
          this.hurtboxHalfWidth(opponent) +
          PUSHBOX_PADDING * 2) /
        POSITION_SCALE;
      const verticalRadius = PASS_THROUGH_HEIGHT / POSITION_SCALE;
      return {
        hurtbox,
        attackbox: {
          x: centerX - horizontalRadius,
          y: groundY - verticalRadius,
          width: horizontalRadius * 2,
          height: verticalRadius * 2,
        },
      };
    }

    // 通常の近接技は、自分の被弾判定前端から押し込み余白とrange_x/range_yへ伸びる箱として表示する。
    // この青箱と相手の赤箱が重なる範囲を、横方向の命中可能範囲と一致させる。
    const pushboxFront =
      centerX +
      (fighter.facing * this.hurtboxHalfWidth(fighter)) / POSITION_SCALE;
    const attackWidth = Math.max(
      1,
      move.rangeX + (PUSHBOX_PADDING * 2) / POSITION_SCALE,
    );
    return {
      hurtbox,
      attackbox: {
        x: fighter.facing === 1 ? pushboxFront : pushboxFront - attackWidth,
        y: groundY - ATTACK_CENTER_FROM_GROUND / POSITION_SCALE - move.rangeY,
        width: attackWidth,
        height: Math.max(1, move.rangeY * 2),
      },
    };
  }

  /** 両プレイヤーを相手側へ自動で向け、飛び越え後も攻撃・コマンド方向を一致させる。 */
  private updateFacing(): void {
    const [playerOne, playerTwo] = this.fighters;
    if (playerOne.x === playerTwo.x) return;

    playerOne.facing = playerOne.x < playerTwo.x ? 1 : -1;
    playerTwo.facing = playerOne.facing === 1 ? -1 : 1;
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

    // 持続済みのフレーム数がactiveに達した技は、次フレームの命中候補にしない。
    if (attacker.activeFramesResolved >= move.active) return false;

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
  }

  private updateFighter(fighter: FighterState, input: FrameInput): void {
    /** 1人分の入力を移動・ジャンプ・通常技・硬直へ反映する。 */
    if (fighter.action === "ko") {
      fighter.previousButtons = input.buttons;
      return;
    }
    // 入力可否・被弾状態にかかわらず、対戦が進行している毎フレームでゲージを回復する。
    this.recoverSpecialGauge(fighter);
    // コンボ確定中は入力履歴も含めて破棄し、ガード・無敵技・先行入力を一切受け付けない。
    if (this.isComboLocked(fighter)) {
      this.updateComboLockedFighter(fighter, input);
      return;
    }
    this.clearComboState(fighter);
    this.recordInput(fighter, input.buttons);
    const newlyPressed = input.buttons & ~fighter.previousButtons;
    // 行動できない間の攻撃・ジャンプも、5フレーム先まで実行候補として保持する。
    this.recordBufferedActions(fighter, newlyPressed);
    const bufferedActions = this.bufferedActionsFor(fighter);
    const bufferedAttackButtons = bufferedActions & ATTACK_BUTTON_MASK;

    if (fighter.guardStun > 0) {
      if (bufferedAttackButtons !== 0) {
        // 攻撃ボタンを押したらガード硬直を解除し、同じ入力で攻撃開始を許可する。
        fighter.guardStun = 0;
        fighter.guardStance = null;
        fighter.action = "idle";
        fighter.actionFrame = 0;
      } else {
        fighter.guardStun -= 1;
        fighter.action =
          fighter.guardStance === "crouching" ? "crouchBlock" : "block";
        fighter.actionFrame += 1;
        this.applyPhysics(fighter);
        fighter.previousButtons = input.buttons;
        return;
      }
    }

    const activeMove = this.moveFor(fighter, fighter.activeMoveId);
    if (activeMove) {
      const cancelMove = this.selectMove(
        fighter,
        bufferedAttackButtons,
        fighter.y < GROUND_Y * POSITION_SCALE ? "air" : "ground",
      );
      if (cancelMove && this.canComboCancel(fighter, activeMove, cancelMove)) {
        // 次のキャンセル技の発生まで被撃側を確定状態に保ち、連打技も連続ヒットにする。
        this.extendComboHitstunForCancel(fighter, cancelMove);
        // 先行技はキャンセル成立のため、保留していたノックバックを破棄する。
        this.discardPendingKnockback(fighter.player);
        this.startMove(fighter, cancelMove, true, input.buttons);
        this.applyPhysics(fighter);
        fighter.previousButtons = input.buttons;
        return;
      }

      fighter.actionFrame += 1;
      if (fighter.actionFrame >= this.moveLength(activeMove)) {
        // 保留ノックバックは被撃側のヒットスタン終了時に適用する。
        // ここで適用すると、後順の相手入力更新が速度を上書きするため行わない。
        fighter.activeMoveId = null;
        fighter.activeFramesResolved = 0;
        fighter.action = "idle";
        fighter.actionFrame = 0;
        fighter.attackConnected = false;
        fighter.comboCancelable = false;
      }
      this.applyPhysics(fighter);
      fighter.previousButtons = input.buttons;
      return;
    }

    if (fighter.y < GROUND_Y * POSITION_SCALE) {
      const selectedMove = this.selectMove(
        fighter,
        bufferedAttackButtons,
        "air",
      );
      if (selectedMove) {
        this.startMove(fighter, selectedMove, false, input.buttons);
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

    if ((bufferedActions & InputButton.Up) !== 0) {
      // 先行入力で記録したジャンプは、実行した時点で消費する。
      this.consumeBufferedActions(fighter, InputButton.Up);
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

    const selectedMove = this.selectMove(
      fighter,
      bufferedAttackButtons,
      "ground",
    );
    if (selectedMove) {
      this.startMove(fighter, selectedMove, false, input.buttons);
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

  /** ヒットスタン中、または空中で被弾姿勢の間をコンボ確定状態として扱う。 */
  private isComboLocked(fighter: FighterState): boolean {
    return (
      fighter.stun > 0 ||
      (fighter.action === "hit" &&
        (fighter.y < GROUND_Y * POSITION_SCALE || fighter.velocityY < 0))
    );
  }

  /** コンボ確定状態の入力を無効化し、被弾・空中落下だけを更新する。 */
  private updateComboLockedFighter(
    fighter: FighterState,
    input: FrameInput,
  ): void {
    fighter.bufferedActionHistory.length = 0;
    fighter.inputHistory.length = 0;
    const pendingAttacker = fighter.pendingKnockback?.attacker;
    const releasePendingBeforePhysics =
      fighter.stun === 1 &&
      fighter.y >= GROUND_Y * POSITION_SCALE &&
      pendingAttacker !== undefined;
    if (fighter.stun > 0) fighter.stun -= 1;
    fighter.action = "hit";
    fighter.actionFrame += 1;
    if (releasePendingBeforePhysics && pendingAttacker !== undefined) {
      // 攻撃側のキャンセル受付後、最終ヒットの横・縦速度を物理更新より先に反映する。
      // これによりP1/P2の更新順に依存せず、同フレームからノックバックが移動へ反映される。
      this.applyPendingKnockback(pendingAttacker);
    }
    this.applyPhysics(fighter);
    if (
      !releasePendingBeforePhysics &&
      fighter.stun === 0 &&
      fighter.y >= GROUND_Y * POSITION_SCALE &&
      fighter.pendingKnockback !== null
    ) {
      // 最終段がキャンセルされなかった時だけ、硬直終了と同時にノックバックを開始する。
      // この位置なら同フレームの入力処理によって横速度が上書きされない。
      this.applyPendingKnockback(fighter.pendingKnockback.attacker);
      // 空中やられが着地した直後も、ノックバックを適用したフレームから移動させる。
      this.applyPhysics(fighter);
    }
    fighter.previousButtons = input.buttons;
  }

  /** コンボ確定状態を抜けたファイターの段数・始動補正を消去する。 */
  private clearComboState(fighter: FighterState): void {
    fighter.comboHitCount = 0;
    fighter.comboStarterPlayer = null;
    fighter.comboStarterProration = 0;
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
    attackButtons: number,
    useState: MoveUseState,
  ): MoveDefinition | undefined {
    /** 現在または先行入力の攻撃ボタンと地上・空中状態から、CSVコマンド技を優先して選ぶ。 */
    const candidates = this.movesByCharacter.get(fighter.character.id) ?? [];
    let selectedCommandMove: MoveDefinition | undefined;
    let selectedPriority = -1;
    let selectedSequenceLength = -1;
    for (const move of candidates) {
      if (move.useState !== "any" && move.useState !== useState) {
        continue;
      }
      if (
        move.commandIds.length === 0 ||
        !this.hasSpecialGaugeForMove(fighter, move) ||
        (attackButtons & move.button) === 0
      ) {
        continue;
      }

      for (const commandId of move.commandIds) {
        const command = this.commandsById.get(commandId);
        if (!command || !this.matchesCommand(fighter, commandId)) continue;

        // 優先度、次に入力列の長さで比較する。同値ならCSVの先行行を維持して決定論性を保つ。
        const isHigherPriority = command.priority > selectedPriority;
        const isLongerAtSamePriority =
          command.priority === selectedPriority &&
          command.sequence.length > selectedSequenceLength;
        if (!isHigherPriority && !isLongerAtSamePriority) continue;

        selectedCommandMove = move;
        selectedPriority = command.priority;
        selectedSequenceLength = command.sequence.length;
      }
    }
    if (selectedCommandMove) return selectedCommandMove;

    for (const move of candidates) {
      if (
        (move.useState === "any" || move.useState === useState) &&
        move.commandIds.length === 0 &&
        this.hasSpecialGaugeForMove(fighter, move) &&
        (attackButtons & move.button) !== 0
      ) {
        return move;
      }
    }
    return undefined;
  }

  private startMove(
    fighter: FighterState,
    move: MoveDefinition,
    isComboCancel = false,
    inputButtons = 0,
  ): void {
    /** 選択済みの技を開始し、命中・飛び道具生成用の状態をリセットする。 */
    // 技を開始したフレームにだけCSV指定の必殺技ゲージを消費する。
    fighter.specialGauge -= move.specialGaugeCost;
    // 超必殺ゲージは命中の有無にかかわらず、技を開始した時点でCSV指定量だけ蓄積する。
    fighter.superGauge = Math.min(
      MAX_SUPER_GAUGE,
      fighter.superGauge + move.superGaugeGain,
    );
    if (
      this.training &&
      this.trainingAutoSpecialGaugeRecovery &&
      fighter.player === 0 &&
      move.specialGaugeCost > 0
    ) {
      // 自キャラが必殺技ゲージを使った直後に満タンへ戻し、連続した技検証を可能にする。
      fighter.specialGauge = MAX_SPECIAL_GAUGE;
      fighter.specialGaugeRecoveryFrames = 0;
    }
    // 実行した技の攻撃ボタンは先行入力履歴から消費し、同じ押下の再実行を防ぐ。
    this.consumeBufferedActions(fighter, move.button);
    fighter.activeMoveId = move.id;
    fighter.activeFramesResolved = 0;
    fighter.action = move.animation;
    fighter.actionFrame = 0;
    fighter.attackConnected = false;
    fighter.projectileSpawned = false;
    // 投げ方向は入力開始時に確定し、10Fの発生中にキーを離しても変化させない。
    fighter.throwDirection =
      move.button === InputButton.Throw
        ? this.throwDirectionFor(fighter, inputButtons)
        : 0;
    fighter.comboCancelable = false;
    this.applySelfMove(fighter, move);

    if (!isComboCancel) {
      // 通常始動では、前のコンボのキャンセル回数を初期化する。
      fighter.comboLightCancels = 0;
      fighter.comboHeavyCancels = 0;
      fighter.comboNormalCancels = 0;
      fighter.comboSpecialCanceled = false;
      fighter.comboThrowCanceled = false;
      return;
    }

    // キャンセル先の種別を記録し、弱3回・強2回・必殺1回・投げ1回の上限を守る。
    if (move.button === InputButton.Light) {
      fighter.comboLightCancels += 1;
      fighter.comboNormalCancels += 1;
    } else if (move.button === InputButton.Heavy) {
      fighter.comboHeavyCancels += 1;
      fighter.comboNormalCancels += 1;
    } else if (move.button === InputButton.Special) {
      fighter.comboSpecialCanceled = true;
    } else if (move.button === InputButton.Throw) {
      fighter.comboThrowCanceled = true;
    }
  }

  /** CSVのself_move_x/yを、向きと60FPS固定フレームに合わせて自分へ適用する。 */
  private applySelfMove(fighter: FighterState, move: MoveDefinition): void {
    if (move.selfMoveX !== 0) {
      fighter.velocityX =
        fighter.facing *
        Math.round((move.selfMoveX * POSITION_SCALE) / FRAMES_PER_SECOND);
    }
    if (move.selfMoveY !== 0) {
      // CSVの正のY値を上昇として扱い、ゲーム座標系の負Y速度へ変換する。
      fighter.velocityY = -Math.round(
        (move.selfMoveY * POSITION_SCALE) / FRAMES_PER_SECOND,
      );
    }
  }

  /** 技のCSV消費量を支払える残量があるかを返す。 */
  private hasSpecialGaugeForMove(
    fighter: FighterState,
    move: MoveDefinition,
  ): boolean {
    return fighter.specialGauge >= move.specialGaugeCost;
  }

  /** 最大値未満の必殺技ゲージを、60FPS固定で毎秒1ポイント回復する。 */
  private recoverSpecialGauge(fighter: FighterState): void {
    if (fighter.specialGauge >= MAX_SPECIAL_GAUGE) {
      // 満タン中の端数を残さず、消費後に正確に1秒で次の1ポイントを回復する。
      fighter.specialGaugeRecoveryFrames = 0;
      return;
    }

    fighter.specialGaugeRecoveryFrames += 1;
    if (fighter.specialGaugeRecoveryFrames < SPECIAL_GAUGE_RECOVERY_FRAMES) {
      return;
    }

    fighter.specialGauge = Math.min(
      MAX_SPECIAL_GAUGE,
      fighter.specialGauge + 1,
    );
    fighter.specialGaugeRecoveryFrames = 0;
  }

  /** 命中技から、moves.csvのcancel_intoで許可された種別へキャンセルできるか返す。 */
  private canComboCancel(
    fighter: FighterState,
    activeMove: MoveDefinition,
    cancelMove: MoveDefinition,
  ): boolean {
    if (!fighter.comboCancelable || !this.isComboSourceMove(activeMove)) {
      return false;
    }
    const defender = this.fighters[fighter.player === 0 ? 1 : 0];
    // キャンセルは相手がヒットスタン中、または空中やられ中に限る。
    // 硬直終了後の遅い入力で保留ノックバックを取り消さないようにする。
    if (!this.isComboContinuation(fighter, defender)) return false;
    // キャンセル先は、実行中の技のCSV設定に登録された種別だけに限定する。
    if (!activeMove.cancelInto.includes(cancelMove.button)) return false;
    if (cancelMove.button === InputButton.Light) {
      return (
        fighter.comboNormalCancels < COMBO_NORMAL_CANCEL_LIMIT &&
        fighter.comboLightCancels < COMBO_LIGHT_CANCEL_LIMIT
      );
    }
    if (cancelMove.button === InputButton.Heavy) {
      return (
        fighter.comboNormalCancels < COMBO_NORMAL_CANCEL_LIMIT &&
        fighter.comboHeavyCancels < COMBO_HEAVY_CANCEL_LIMIT
      );
    }
    if (cancelMove.button === InputButton.Special) {
      return !fighter.comboSpecialCanceled;
    }
    return (
      cancelMove.button === InputButton.Throw && !fighter.comboThrowCanceled
    );
  }

  /** cancel_intoを持つ近接技だけを、命中後のコンボキャンセル始動技として扱う。 */
  private isComboSourceMove(move: MoveDefinition): boolean {
    return move.attackType === "melee" && move.cancelInto.length > 0;
  }

  /**
   * 命中済みの通常技をキャンセルした場合、次の技の発生フレームまで被撃側を確定状態に保つ。
   * ガードされた技は被撃状態ではないため、ガード硬直を延長しない。
   */
  private extendComboHitstunForCancel(
    attacker: FighterState,
    cancelMove: MoveDefinition,
  ): void {
    const defender = this.fighters[attacker.player === 0 ? 1 : 0];
    if (!this.isComboContinuation(attacker, defender)) return;

    // キャンセル開始フレームで1減算され、発生フレームでは被撃側が先に更新される。
    // 次の技が命中する解決時まで硬直を残すため、発生+2Fを最低保証する。
    defender.stun = Math.max(defender.stun, cancelMove.startup + 2);
  }

  /** 最終段がキャンセルされなかった時に、相手へ保留済みのノックバックを反映する。 */
  private applyPendingKnockback(attacker: PlayerId): void {
    const defender = this.fighters[attacker === 0 ? 1 : 0];
    const pending = defender.pendingKnockback;
    if (!pending || pending.attacker !== attacker) return;

    defender.velocityX = pending.velocityX;
    defender.velocityY = pending.velocityY;
    defender.pendingKnockback = null;
  }

  /** 次のコンボ技が出た時に、先行技のノックバックだけを破棄する。 */
  private discardPendingKnockback(attacker: PlayerId): void {
    const defender = this.fighters[attacker === 0 ? 1 : 0];
    if (defender.pendingKnockback?.attacker === attacker) {
      defender.pendingKnockback = null;
    }
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
    if (!move || !this.isMoveInActiveFrame(attacker, move)) return;

    // actionFrameが別状態で変化しても、CSVのactive回数を超える攻撃判定は出さない。
    attacker.activeFramesResolved += 1;
    if (attacker.attackConnected) return;

    if (move.attackType === "projectile") {
      if (!attacker.projectileSpawned) {
        attacker.projectileSpawned = true;
        this.spawnProjectile(attacker, move);
      }
      return;
    }

    // 投げは通常技のリーチではなく、押し込み判定の接触中だけ成立させる。
    if (move.button === InputButton.Throw) {
      this.resolveThrow(attacker, defender, move, defenderInput);
      return;
    }

    if (!this.isMeleeInRange(attacker, defender, move)) return;

    const connected = this.applyHit(
      attacker,
      defender,
      move,
      defenderInput,
      this.isComboSourceMove(move),
    );
    attacker.attackConnected = true;
    // 命中・ガードのどちらでも、弱・強は次の技へキャンセルできる。
    attacker.comboCancelable = connected && this.isComboSourceMove(move);
  }

  /** 投げの成立、後ろ投げ、投げ抜けを専用に解決する。 */
  private resolveThrow(
    attacker: FighterState,
    defender: FighterState,
    move: MoveDefinition,
    defenderInput: FrameInput,
  ): void {
    // 相手を押せない距離・高さでは投げを空振りにする。
    if (!this.isPushableForThrow(attacker, defender)) {
      attacker.attackConnected = true;
      return;
    }

    // 発生10F中に相手も投げを出した場合は、ダメージなしの投げ抜けにする。
    if (this.isThrowTech(defender)) {
      this.applyThrowTech(attacker, defender);
      return;
    }

    const backwardThrow = attacker.throwDirection === -1;
    // 後ろ投げだけは、CSVで設定した投げダメージの80%にする。
    const damage = backwardThrow
      ? Math.trunc((move.damage * 80) / 100)
      : move.damage;
    this.applyHit(attacker, defender, { ...move, damage }, defenderInput);
    attacker.attackConnected = true;

    if (backwardThrow) {
      // 後ろ入力投げは位置を入れ替えた後、両者の強攻撃が届かない間隔まで離す。
      const attackerX = attacker.x;
      attacker.x = defender.x;
      defender.x = attackerX;
      this.separateAfterBackwardThrow(attacker, defender);
      attacker.velocityX = 0;
      defender.velocityX = 0;
      return;
    }

    // ニュートラル・前入力投げは、投げた側だけを全通常技の外へ退かせる。
    attacker.x = this.clampToStage(
      defender.x - attacker.facing * THROW_SELF_KNOCKBACK_DISTANCE,
    );
    attacker.velocityX =
      -attacker.facing * Math.trunc(THROW_TECH_KNOCKBACK_SPEED / 2);
  }

  /** 相手との押し込み判定が重なり、投げられる高さにいるかを調べる。 */
  private isPushableForThrow(
    attacker: FighterState,
    defender: FighterState,
  ): boolean {
    if (Math.abs(attacker.y - defender.y) >= PASS_THROUGH_HEIGHT) return false;
    const pushDistance =
      this.hurtboxHalfWidth(attacker) +
      this.hurtboxHalfWidth(defender) +
      PUSHBOX_PADDING * 2;
    return Math.abs(attacker.x - defender.x) <= pushDistance;
  }

  /**
   * 後ろ投げ後に、両者の近接強攻撃が届かない中心間距離まで位置を離す。
   * キャラクター固有CSVのrange_xを参照するため、強攻撃のリーチを変更しても追従する。
   */
  private separateAfterBackwardThrow(
    attacker: FighterState,
    defender: FighterState,
  ): void {
    const maximumHeavyReach = Math.max(
      this.maximumHeavyMeleeReach(attacker),
      this.maximumHeavyMeleeReach(defender),
    );
    const requiredSeparation = Math.min(
      RIGHT_WALL - LEFT_WALL,
      this.hurtboxHalfWidth(attacker) +
        this.hurtboxHalfWidth(defender) +
        PUSHBOX_PADDING * 2 +
        maximumHeavyReach * POSITION_SCALE +
        BACK_THROW_HEAVY_RANGE_MARGIN,
    );
    // 入れ替え後に攻撃側がいる方向へ距離を伸ばし、ステージ端なら相手側を動かす。
    const direction = attacker.x >= defender.x ? 1 : -1;
    const movedAttackerX = defender.x + direction * requiredSeparation;
    if (movedAttackerX >= LEFT_WALL && movedAttackerX <= RIGHT_WALL) {
      attacker.x = movedAttackerX;
      return;
    }
    defender.x = this.clampToStage(attacker.x - direction * requiredSeparation);
  }

  /** 指定キャラクターが持つ近接強攻撃の、CSV上の最大range_xを返す。 */
  private maximumHeavyMeleeReach(fighter: FighterState): number {
    const moves = this.movesByCharacter.get(fighter.character.id) ?? [];
    return moves.reduce((maximum, move) => {
      if (move.button !== InputButton.Heavy || move.attackType !== "melee") {
        return maximum;
      }
      return Math.max(maximum, move.rangeX);
    }, 0);
  }

  /** 相手が投げの発生中かを調べ、同時入力を投げ抜けとして扱う。 */
  private isThrowTech(defender: FighterState): boolean {
    const move = this.moveFor(defender, defender.activeMoveId);
    return (
      move?.button === InputButton.Throw && defender.actionFrame <= move.startup
    );
  }

  /** 前入力を優先して、投げ開始時の入力を相手基準の方向へ変換する。 */
  private throwDirectionFor(
    fighter: FighterState,
    inputButtons: number,
  ): -1 | 0 | 1 {
    const forward = this.isDirectionPressed(inputButtons, fighter.facing);
    const backward = this.isDirectionPressed(
      inputButtons,
      fighter.facing === 1 ? -1 : 1,
    );
    if (forward) return 1;
    return backward ? -1 : 0;
  }

  /** 投げ抜けとして攻撃を中断し、両者を反対側へ弾く。 */
  private applyThrowTech(first: FighterState, second: FighterState): void {
    const direction = first.x <= second.x ? 1 : -1;
    this.resetAfterThrowTech(first);
    this.resetAfterThrowTech(second);
    first.x = this.clampToStage(
      first.x - direction * THROW_TECH_KNOCKBACK_DISTANCE,
    );
    second.x = this.clampToStage(
      second.x + direction * THROW_TECH_KNOCKBACK_DISTANCE,
    );
    first.velocityX = -direction * THROW_TECH_KNOCKBACK_SPEED;
    second.velocityX = direction * THROW_TECH_KNOCKBACK_SPEED;
  }

  /** 投げ抜け後に、技・コンボ・ガード中の状態を解除する。 */
  private resetAfterThrowTech(fighter: FighterState): void {
    fighter.activeMoveId = null;
    fighter.activeFramesResolved = 0;
    fighter.attackConnected = true;
    fighter.projectileSpawned = false;
    fighter.throwDirection = 0;
    fighter.comboCancelable = false;
    fighter.pendingKnockback = null;
    fighter.stun = 0;
    fighter.guardStun = 0;
    fighter.guardStance = null;
    fighter.action = "idle";
    fighter.actionFrame = 0;
  }

  /** 現在フレームが技の持続中かを、CSVのactive回数と処理済み回数の両方で判定する。 */
  private isMoveInActiveFrame(
    fighter: FighterState,
    move: Pick<MoveDefinition, "startup" | "active">,
  ): boolean {
    const activeStart = move.startup;
    const activeEnd = activeStart + move.active;
    return (
      fighter.actionFrame >= activeStart &&
      fighter.actionFrame < activeEnd &&
      fighter.activeFramesResolved < move.active
    );
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
      visualId: move.projectileId ?? "",
      x: attacker.x + attacker.facing * 64 * POSITION_SCALE,
      y: attacker.y - 82 * POSITION_SCALE,
      velocityX:
        attacker.facing *
        Math.round((move.projectileSpeed * POSITION_SCALE) / 60),
      life: move.projectileLifetime,
      damage: move.damage,
      guardPiercing: move.guardPiercing,
      starterProration: move.starterProration,
      attackLevel: move.attackLevel,
      knockbackX: move.knockbackX,
      knockbackY: move.knockbackY,
      hitstun: move.hitstun,
    });
  }

  private updateProjectiles(inputs: readonly [FrameInput, FrameInput]): void {
    /** 飛び道具を移動し、相手への命中・ガード・寿命切れを判定する。 */
    if (this.winner !== null) return;
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
        const connected = this.applyHit(
          attacker,
          defender,
          projectile,
          inputs[defender.player],
        );
        if (connected) {
          this.projectiles.splice(index, 1);
          // KOしたフレームは残る飛び道具も止め、1秒間の再開待機を正確に保つ。
          if (this.training && this.trainingResetFrames > 0) return;
        }
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
      | "damage"
      | "guardPiercing"
      | "starterProration"
      | "attackLevel"
      | "knockbackX"
      | "knockbackY"
      | "hitstun"
    >,
    defenderInput: FrameInput,
    /** 弱・強の命中なら、キャンセル成否までノックバックを保留する。 */
    deferKnockback = false,
  ): boolean {
    /** 近接技と飛び道具に共通する上中下ガード、ダメージ、KO処理を適用する。 */
    if (this.isMoveInvincible(defender)) {
      // 技開始からCSV指定フレーム中は、打撃・飛び道具・投げを問わず命中を無効化する。
      // 飛び道具は消さずに通過させ、無敵終了後に残っていれば通常どおり命中判定する。
      return false;
    }
    const comboContinuation = this.isComboContinuation(attacker, defender);
    const guardStance = this.guardStanceFor(defender, attacker, defenderInput);
    // コンボ中とguard_bleak=trueの技・飛び道具は、入力中のガードを常に貫通する。
    const defending =
      !comboContinuation &&
      !attack.guardPiercing &&
      guardStance !== null &&
      this.canGuardAttack(guardStance, attack.attackLevel);
    if (!defending) {
      if (attack.hitstun > HIT_STOP_HITSTUN_THRESHOLD) {
        // 同一フレームに複数の強い攻撃が重なっても、静止時間は常に5Fに固定する。
        this.hitStopFrames = Math.max(this.hitStopFrames, HIT_STOP_FRAMES);
      }
      const hitCount = comboContinuation ? defender.comboHitCount + 1 : 1;
      const starterProration = comboContinuation
        ? defender.comboStarterProration
        : attack.starterProration;
      defender.comboHitCount = hitCount;
      defender.comboStarterPlayer = attacker.player;
      defender.comboStarterProration = starterProration;
      // 攻撃を受けて先行技が中断された場合は、未キャンセル技のノックバックを確定する。
      this.applyPendingKnockback(defender.player);
      // 被弾してヒットスタンへ入った時点で、実行中の技の持続判定を止める。
      // 先に被弾した側は同一フレーム後半にも攻撃を出せず、残り持続も発生しない。
      defender.activeMoveId = null;
      defender.activeFramesResolved = 0;
      defender.attackConnected = false;
      defender.throwDirection = 0;
      defender.comboCancelable = false;
      // コンボ中に押した入力は、コンボ終了後の技発動にも持ち越さない。
      defender.bufferedActionHistory.length = 0;
      defender.inputHistory.length = 0;
    }
    const damage = defending
      ? 0
      : Math.trunc(
          (attack.damage *
            this.comboDamagePercent(
              defender.comboHitCount,
              defender.comboStarterProration,
            )) /
            100,
        );
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
    const velocityX = defending
      ? attacker.facing * Math.trunc((attack.knockbackX * POSITION_SCALE) / 180)
      : attacker.facing * Math.trunc((attack.knockbackX * POSITION_SCALE) / 60);
    const velocityY = defending
      ? 0
      : -Math.trunc((attack.knockbackY * POSITION_SCALE) / 60);
    const shouldDeferKnockback =
      deferKnockback && !defending && defender.health > 0;
    if (shouldDeferKnockback) {
      // 弱・強のヒット時は、次のキャンセル入力までノックバックを保留する。
      defender.pendingKnockback = {
        attacker: attacker.player,
        velocityX,
        velocityY,
      };
      defender.velocityX = 0;
      defender.velocityY = 0;
    } else {
      // ガード・必殺技・KOはキャンセル対象外なので、その場でノックバックする。
      defender.pendingKnockback = null;
      defender.velocityX = velocityX;
      defender.velocityY = velocityY;
    }
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
      defender.activeFramesResolved = 0;
      this.finishRound(attacker.player);
    }
    // ガードされた場合も攻撃が接触した事実を返し、攻撃側のキャンセルを許可する。
    return true;
  }

  /** 実行中の技が、moves.csvのinvincible_framesで指定した無敵時間中かを返す。 */
  private isMoveInvincible(fighter: FighterState): boolean {
    const move = this.moveFor(fighter, fighter.activeMoveId);
    return (
      move !== undefined &&
      move.invincibleFrames > 0 &&
      fighter.actionFrame < move.invincibleFrames
    );
  }

  /** 被撃側が同じ攻撃者の被弾状態なら、次の命中を連続ヒットとして扱う。 */
  private isComboContinuation(
    attacker: FighterState,
    defender: FighterState,
  ): boolean {
    return (
      defender.action === "hit" &&
      (defender.stun > 0 || defender.y < GROUND_Y * POSITION_SCALE) &&
      defender.comboHitCount > 0 &&
      defender.comboStarterPlayer === attacker.player
    );
  }

  /**
   * 段数に応じた補正率を返す。
   * 1・2段目は100%、3段目から80%、以降10%ずつ減衰し、最低10%で固定する。
   */
  private comboDamagePercent(
    hitCount: number,
    starterProration: number,
  ): number {
    const basePercent = hitCount <= 2 ? 100 : Math.max(10, 110 - hitCount * 10);
    return Math.max(10, basePercent + starterProration);
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
    /** commands.csv の最大猶予フレームに合わせ、方向入力履歴を保持する。 */
    fighter.inputHistory.push(buttons);
    if (fighter.inputHistory.length > this.inputHistoryLimit) {
      fighter.inputHistory.shift();
    }
  }

  /** 攻撃・ジャンプの新規押下を、押下後5フレーム先まで実行候補として記録する。 */
  private recordBufferedActions(
    fighter: FighterState,
    newlyPressed: number,
  ): void {
    fighter.bufferedActionHistory.push(
      newlyPressed & BUFFERABLE_ACTION_BUTTON_MASK,
    );
    // 押下したフレームとその後の5フレームを含めるため、履歴は6件保持する。
    if (fighter.bufferedActionHistory.length > INPUT_BUFFER_FRAMES + 1) {
      fighter.bufferedActionHistory.shift();
    }
  }

  /** 有効期限内の先行入力をビット集合として返す。 */
  private bufferedActionsFor(fighter: FighterState): number {
    return fighter.bufferedActionHistory.reduce(
      (buttons, bufferedButtons) => buttons | bufferedButtons,
      0,
    );
  }

  /** 実行済みのボタンを先行入力履歴の全フレームから取り除く。 */
  private consumeBufferedActions(fighter: FighterState, buttons: number): void {
    for (
      let index = 0;
      index < fighter.bufferedActionHistory.length;
      index += 1
    ) {
      fighter.bufferedActionHistory[index] &= ~buttons;
    }
  }

  /**
   * command_idが指す方向入力列を、現在の向きを基準にして照合する。
   * 最後の方向入力を離した後も、固定猶予内なら技ボタンによる発動を受け付ける。
   */
  private matchesCommand(fighter: FighterState, commandId: string): boolean {
    const command = this.commandsById.get(commandId);
    const history = fighter.inputHistory;
    if (!command || history.length === 0) return false;

    /** 技ボタンを押した現在フレームを基準に、コマンド全体の制限時間を計算する。 */
    const latestInputFrame = history.length - 1;
    const earliestEndFrame = Math.max(
      0,
      latestInputFrame - COMMAND_BUTTON_GRACE_FRAMES,
    );
    for (
      let endFrame = latestInputFrame;
      endFrame >= earliestEndFrame;
      endFrame -= 1
    ) {
      let sequenceIndex = command.sequence.length - 1;
      if (
        !this.matchesCommandDirection(
          history[endFrame],
          fighter.facing,
          command.sequence[sequenceIndex],
        )
      ) {
        continue;
      }
      sequenceIndex -= 1;

      /**
       * 最後の方向入力ではなく技ボタン時点を起点にすることで、
       * 2F猶予を使っても commands.csv の max_frames を超えて受け付けない。
       */
      const earliestFrame = Math.max(0, latestInputFrame - command.maxFrames);
      for (
        let index = endFrame - 1;
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
      if (sequenceIndex < 0) return true;
    }
    return false;
  }

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
    if (direction === "3") return down && forward && !back && !up;
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

    // 自動振り向き後の相手位置を基準に、「敵と反対方向」を後ろ入力として扱う。
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
    first.x = this.clampToStage(first.x - direction * shiftFirst);
    second.x = this.clampToStage(second.x + direction * shiftSecond);
  }

  /** ステージ端を越えないよう、横座標を固定小数点座標のまま制限する。 */
  private clampToStage(x: number): number {
    return Math.max(LEFT_WALL, Math.min(RIGHT_WALL, x));
  }

  private nextRound(): void {
    /** ラウンド結果後、決着済みでなければ次ラウンドを開始する。 */
    if (this.training || this.matchWinner !== null) return;
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
}
