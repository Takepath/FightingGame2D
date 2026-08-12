import { GROUND_Y, POSITION_SCALE, type FighterState } from "./simulation";
import { type FrameInput, InputButton } from "./types";

/** トレーニングCPUのガード行動。 */
export type TrainingGuardMode = "none" | "standing" | "crouching" | "random";

/** トレーニングCPUのジャンプ行動。 */
export type TrainingJumpMode = "always" | "random" | "never";

/** トレーニングCPUの移動行動。 */
export type TrainingMoveMode = "standing" | "forward" | "backward" | "random";

/** トレーニングCPUの攻撃行動。 */
export type TrainingAttackMode = "none" | "light" | "heavy" | "special";

/** オプション画面で変更する、トレーニングCPUの行動設定。 */
export interface TrainingCpuSettings {
  readonly guard: TrainingGuardMode;
  readonly jump: TrainingJumpMode;
  readonly move: TrainingMoveMode;
  readonly attack: TrainingAttackMode;
}

/** トレーニング開始時に使用する、何もしないダミー用の標準設定。 */
export const DEFAULT_TRAINING_CPU_SETTINGS: TrainingCpuSettings = {
  guard: "none",
  jump: "never",
  move: "standing",
  attack: "none",
};

type GuardStance = "standing" | "crouching";

const RANDOM_MOVE_INTERVAL = 75;
const RANDOM_JUMP_INTERVAL = 90;
const ATTACK_INTERVAL = 42;

/**
 * トレーニングモード用のP2入力を決定する。
 * Math.randomを使わず、フレーム番号から再現可能な選択を行う。
 */
export class TrainingCpuController {
  /** オプション画面で設定された現在の行動。 */
  private settings: TrainingCpuSettings = DEFAULT_TRAINING_CPU_SETTINGS;

  /** ランダムガードの対象として最後に検出した相手技。 */
  private observedOpponentMoveId: string | null = null;

  /** 相手技ごとに確定するランダムガード姿勢。 */
  private randomGuardStance: GuardStance = "standing";

  /** トレーニングCPUの行動設定を更新する。 */
  public setSettings(settings: TrainingCpuSettings): void {
    this.settings = { ...settings };
  }

  /** 現在の行動設定を、画面表示用に複製して返す。 */
  public getSettings(): TrainingCpuSettings {
    return { ...this.settings };
  }

  /** 現在の対戦状態から、P2用の入力フレームを生成する。 */
  public sample(
    frame: number,
    self: FighterState,
    opponent: FighterState,
    /** 次フレームに攻撃が命中する見込みなら、後ろ入力でガードする。 */
    imminentThreat: boolean,
  ): FrameInput {
    this.updateRandomGuardStance(frame, opponent);

    if (
      self.action === "ko" ||
      self.stun > 0 ||
      self.guardStun > 0 ||
      self.activeMoveId
    ) {
      return { buttons: 0 };
    }

    const guardStance = imminentThreat ? this.currentGuardStance() : null;
    let buttons = this.movementInput(frame, self, opponent);

    if (guardStance !== null) {
      // ガード設定中は移動・ジャンプ・攻撃を優先せず、確実に後ろ入力を出す。
      buttons = this.away(self, opponent);
      if (guardStance === "crouching") buttons |= InputButton.Down;
      return { buttons };
    }

    // 「ガードしない」時も、攻撃を受ける瞬間の後ろ移動を中立へ戻してガードを防ぐ。
    if (imminentThreat && this.isAwayInput(buttons, self, opponent)) {
      buttons = 0;
    }

    buttons |= this.jumpInput(frame, self);
    buttons |= this.attackInput(frame);
    return { buttons };
  }

  /** 相手の攻撃開始ごとに、ランダムガードの立ち・しゃがみを1回だけ確定する。 */
  private updateRandomGuardStance(frame: number, opponent: FighterState): void {
    if (opponent.activeMoveId === null) {
      this.observedOpponentMoveId = null;
      return;
    }
    if (this.observedOpponentMoveId === opponent.activeMoveId) return;

    this.observedOpponentMoveId = opponent.activeMoveId;
    this.randomGuardStance =
      this.randomValue(frame + opponent.player * 17) % 2 === 0
        ? "standing"
        : "crouching";
  }

  /** 現在のガード設定を、実際に入力する姿勢へ変換する。 */
  private currentGuardStance(): GuardStance | null {
    if (this.settings.guard === "standing") return "standing";
    if (this.settings.guard === "crouching") return "crouching";
    if (this.settings.guard === "random") return this.randomGuardStance;
    return null;
  }

  /** 設定された直立・前後・ランダム移動を、左右入力へ変換する。 */
  private movementInput(
    frame: number,
    self: FighterState,
    opponent: FighterState,
  ): number {
    if (this.settings.move === "forward") return this.toward(self, opponent);
    if (this.settings.move === "backward") return this.away(self, opponent);
    if (this.settings.move !== "random") return 0;

    const selection =
      this.randomValue(Math.floor(frame / RANDOM_MOVE_INTERVAL)) % 3;
    if (selection === 0) return this.toward(self, opponent);
    if (selection === 1) return this.away(self, opponent);
    return 0;
  }

  /** 設定された常時・ランダム・なしのジャンプを、押下フレームだけ生成する。 */
  private jumpInput(frame: number, self: FighterState): number {
    if (self.y !== GROUND_Y * POSITION_SCALE || self.velocityY !== 0) return 0;
    if (this.settings.jump === "always") {
      return frame % 12 === 0 ? InputButton.Up : 0;
    }
    if (
      this.settings.jump === "random" &&
      frame % RANDOM_JUMP_INTERVAL === 0 &&
      this.randomValue(Math.floor(frame / RANDOM_JUMP_INTERVAL)) % 3 === 0
    ) {
      return InputButton.Up;
    }
    return 0;
  }

  /** 設定された攻撃だけを、一定間隔の新規押下として生成する。 */
  private attackInput(frame: number): number {
    if (frame % ATTACK_INTERVAL !== 0) return 0;
    if (this.settings.attack === "light") return InputButton.Light;
    if (this.settings.attack === "heavy") return InputButton.Heavy;
    if (this.settings.attack === "special") return InputButton.Special;
    return 0;
  }

  /** 敵と反対方向（後ろ）の入力を返す。 */
  private away(
    self: FighterState,
    opponent: FighterState,
  ): InputButton.Left | InputButton.Right {
    return opponent.x >= self.x ? InputButton.Left : InputButton.Right;
  }

  /** 敵方向（前）の入力を返す。 */
  private toward(
    self: FighterState,
    opponent: FighterState,
  ): InputButton.Left | InputButton.Right {
    return opponent.x >= self.x ? InputButton.Right : InputButton.Left;
  }

  /** 現在の入力が敵と反対方向かを判定する。 */
  private isAwayInput(
    buttons: number,
    self: FighterState,
    opponent: FighterState,
  ): boolean {
    return (buttons & this.away(self, opponent)) !== 0;
  }

  /** 固定フレームから0以上の疑似乱数値を再現可能に生成する。 */
  private randomValue(seed: number): number {
    return (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
  }
}
