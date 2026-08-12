import {
  POSITION_SCALE,
  type FighterState,
  type ProjectileState,
} from "./simulation";
import { type FrameInput, InputButton } from "./types";

/** ローカル対戦で選択できるCPU難易度。 */
export type CpuLevel = 0 | 1 | 2 | 3;

/**
 * レベル3の行動をキャラクターごとに調整するテンプレート。
 *
 * `characters.csv` の `id` と同じキーを追加すれば、新キャラクターにも
 * 距離感・攻撃頻度・飛び道具使用頻度を個別に設定できる。
 */
export interface CpuCharacterTemplate {
  /** 最も戦いやすいと判断する相手との距離（ゲーム内ピクセル）。 */
  preferredDistance: number;
  /** この距離より近い場合に、防御しながら距離を取る。 */
  retreatDistance: number;
  /** 強攻撃を選ぶ最大距離。 */
  heavyRange: number;
  /** 波動拳を使い始める最小距離。 */
  specialDistance: number;
  /** 波動拳を試行するフレーム間隔。小さいほど積極的。 */
  specialInterval: number;
  /** 近接攻撃を試行するフレーム間隔。小さいほど強気。 */
  attackInterval: number;
  /** 飛び道具を後ろ入力でガードし始める距離。 */
  blockDistance: number;
}

/**
 * レベル3用のキャラクター別CPUテンプレート。
 * 新キャラクターを追加する場合は、このオブジェクトへCSVのidをキーとして追加する。
 */
export const CPU_CHARACTER_TEMPLATES: Readonly<
  Record<string, CpuCharacterTemplate>
> = {
  default: {
    preferredDistance: 142,
    retreatDistance: 72,
    heavyRange: 136,
    specialDistance: 280,
    specialInterval: 180,
    attackInterval: 28,
    blockDistance: 330,
  },
  blender_hero: {
    preferredDistance: 166,
    retreatDistance: 76,
    heavyRange: 152,
    specialDistance: 250,
    specialInterval: 132,
    attackInterval: 24,
    blockDistance: 360,
  },
  stick_rival: {
    preferredDistance: 124,
    retreatDistance: 62,
    heavyRange: 142,
    specialDistance: 310,
    specialInterval: 196,
    attackInterval: 20,
    blockDistance: 310,
  },
};

/** CPUがP2の入力フレームを作るコントローラー。 */
export class CpuController {
  /** 波動拳コマンドの入力段階。0以外ならコマンドを最後まで入力する。 */
  private hadokenStep = 0;

  public constructor(private readonly level: CpuLevel) {}

  /**
   * 現在の戦況からP2の入力を決定する。
   * 乱数を使わず、同じフレーム・状態では常に同じ入力を返す。
   */
  public sample(
    frame: number,
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
  ): FrameInput {
    if (
      this.level === 0 ||
      self.action === "ko" ||
      self.stun > 0 ||
      self.activeMoveId
    ) {
      this.hadokenStep = 0;
      return { buttons: 0 };
    }

    if (this.hadokenStep > 0) {
      return { buttons: this.continueHadoken(self) };
    }

    const distance = Math.abs(self.x - opponent.x) / POSITION_SCALE;

    if (this.level === 1) {
      return { buttons: this.levelOneInput(frame, self, distance) };
    }
    if (this.level === 2) {
      return {
        buttons: this.levelTwoInput(frame, self, distance, projectiles),
      };
    }
    return {
      buttons: this.levelThreeInput(frame, self, distance, projectiles),
    };
  }

  /** レベル1: 接近して近距離で弱攻撃だけを行う。 */
  private levelOneInput(
    frame: number,
    self: FighterState,
    distance: number,
  ): number {
    if (distance > 118) return this.toward(self);
    if (frame % 54 === 0) return this.toward(self) | InputButton.Light;
    return 0;
  }

  /** レベル2: 接近・後ろ入力ガード・弱強攻撃を使い分ける。 */
  private levelTwoInput(
    frame: number,
    self: FighterState,
    distance: number,
    projectiles: readonly ProjectileState[],
  ): number {
    if (this.hasIncomingProjectile(self, projectiles)) {
      return this.away(self);
    }
    if (distance > 164) return this.toward(self);
    if (distance < 72 && frame % 42 < 14) {
      return this.away(self);
    }
    if (distance <= 140 && frame % 78 === 0) return InputButton.Heavy;
    if (distance <= 118 && frame % 34 === 0) return InputButton.Light;
    return 0;
  }

  /** レベル3: キャラクターテンプレートに従って最適距離・防御・波動拳を判断する。 */
  private levelThreeInput(
    frame: number,
    self: FighterState,
    distance: number,
    projectiles: readonly ProjectileState[],
  ): number {
    const template =
      CPU_CHARACTER_TEMPLATES[self.character.id] ??
      CPU_CHARACTER_TEMPLATES.default;

    if (this.hasIncomingProjectile(self, projectiles)) {
      return this.away(self);
    }
    if (
      distance >= template.specialDistance &&
      frame % template.specialInterval === 0
    ) {
      return this.startHadoken();
    }
    if (distance > template.preferredDistance + 22) return this.toward(self);
    if (distance < template.retreatDistance) {
      return frame % 32 < 20 ? this.away(self) : 0;
    }
    if (
      distance <= template.heavyRange &&
      frame % template.attackInterval === 0
    ) {
      return InputButton.Heavy;
    }
    if (frame % Math.max(14, template.attackInterval - 6) === 0) {
      return InputButton.Light;
    }
    return 0;
  }

  /** 波動拳コマンドの最初の「下」入力を開始する。 */
  private startHadoken(): number {
    this.hadokenStep = 1;
    return InputButton.Down;
  }

  /** 「下 → 下前 → 前＋必殺」を固定3フレームで入力する。 */
  private continueHadoken(self: FighterState): number {
    const forward = this.toward(self);
    if (this.hadokenStep === 1) {
      this.hadokenStep = 2;
      return InputButton.Down | forward;
    }
    this.hadokenStep = 0;
    return forward | InputButton.Special;
  }

  /** 相手方向の左右入力を返す。 */
  private toward(self: FighterState): InputButton.Left | InputButton.Right {
    return self.facing === 1 ? InputButton.Right : InputButton.Left;
  }

  /** 相手から離れる左右入力を返す。 */
  private away(self: FighterState): InputButton.Left | InputButton.Right {
    return self.facing === 1 ? InputButton.Left : InputButton.Right;
  }

  /** 次の固定フレームで自分へ命中する飛び道具だけをガード対象にする。 */
  private hasIncomingProjectile(
    self: FighterState,
    projectiles: readonly ProjectileState[],
  ): boolean {
    const horizontalReach =
      (self.character.hurtboxWidth / 2 + 14) * POSITION_SCALE;
    const hurtboxTop = self.y - self.character.hurtboxTop * POSITION_SCALE;
    const hurtboxBottom =
      self.y - self.character.hurtboxBottom * POSITION_SCALE;
    return projectiles.some((projectile) => {
      if (projectile.owner === self.player) return false;

      const nextX = projectile.x + projectile.velocityX;
      return (
        Math.abs(nextX - self.x) <= horizontalReach &&
        projectile.y >= hurtboxTop &&
        projectile.y <= hurtboxBottom
      );
    });
  }
}
