import {
  POSITION_SCALE,
  type FighterState,
  type ProjectileState,
} from "./simulation";
import { type CpuCharacterSettings, FIGHTING_GAME_CONFIG } from "./gameConfig";
import {
  type CommandDefinition,
  type CommandDirection,
  type FrameInput,
  InputButton,
  type MoveDefinition,
} from "./types";

/** ローカル対戦で選択できるCPU難易度。 */
export type CpuLevel = 0 | 1 | 2 | 3;

/** gameConfig.tsへ集約した、レベル3用キャラクター別CPUテンプレート。 */
const CPU_CHARACTER_TEMPLATES = FIGHTING_GAME_CONFIG.cpu.characters;
/** 難易度共通の距離・判断周期。 */
const CPU_LEVEL_SETTINGS = FIGHTING_GAME_CONFIG.cpu.levels;

/** CPUがP2の入力フレームを作るコントローラー。 */
export class CpuController {
  /** CSVコマンドから生成した、残りの方向・攻撃入力列。 */
  private commandInputQueue: number[] = [];

  /** 直前のsample呼び出しがコマンド入力列の1フレームだったか。 */
  private sampledCommandFrame = false;

  /** トレーニングCPUが移動入力を混ぜないための読み取り専用状態。 */
  public get didSampleCommandFrame(): boolean {
    return this.sampledCommandFrame;
  }

  /** コマンドIDを毎判断時に配列走査しないための索引。 */
  private readonly commandsById: ReadonlyMap<string, CommandDefinition>;

  public constructor(
    private readonly level: CpuLevel,
    private readonly moves: readonly MoveDefinition[] = [],
    commands: readonly CommandDefinition[] = [],
  ) {
    this.commandsById = new Map(
      commands.map((command) => [command.id, command]),
    );
  }

  /** コマンド技の途中入力を破棄し、次の判断を最初から始める。 */
  public reset(): void {
    this.commandInputQueue.length = 0;
    this.sampledCommandFrame = false;
  }

  /**
   * CPU Lv3 と同じ技選択だけを返す。
   * トレーニング用で移動・ジャンプ設定を残したまま、通常技・投げ・コマンド技を再利用する。
   */
  public sampleLevelThreeAttack(
    frame: number,
    self: FighterState,
    opponent: FighterState,
  ): FrameInput {
    this.sampledCommandFrame = false;
    if (self.action === "ko" || self.stun > 0 || self.activeMoveId) {
      this.commandInputQueue.length = 0;
      return { buttons: 0 };
    }

    if (this.commandInputQueue.length > 0) {
      this.sampledCommandFrame = true;
      return { buttons: this.continueCommand() };
    }

    const distance = Math.abs(self.x - opponent.x) / POSITION_SCALE;
    const template =
      CPU_CHARACTER_TEMPLATES[self.character.id] ??
      CPU_CHARACTER_TEMPLATES.default;
    if (
      distance >= template.specialDistance &&
      frame % template.specialInterval === 0
    ) {
      return { buttons: this.startCommandMove(self, template) };
    }
    return {
      buttons: this.levelThreeAttackInput(
        frame,
        self,
        opponent,
        distance,
        template,
      ),
    };
  }

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
    this.sampledCommandFrame = false;
    if (
      this.level === 0 ||
      self.action === "ko" ||
      self.stun > 0 ||
      self.activeMoveId
    ) {
      this.commandInputQueue.length = 0;
      return { buttons: 0 };
    }

    if (this.commandInputQueue.length > 0) {
      this.sampledCommandFrame = true;
      return { buttons: this.continueCommand() };
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
      buttons: this.levelThreeInput(
        frame,
        self,
        opponent,
        distance,
        projectiles,
      ),
    };
  }

  /** レベル1: 接近して近距離で弱攻撃だけを行う。 */
  private levelOneInput(
    frame: number,
    self: FighterState,
    distance: number,
  ): number {
    const settings = CPU_LEVEL_SETTINGS.one;
    if (distance > settings.approachDistance) return this.toward(self);
    if (frame % settings.attackInterval === 0) {
      return this.toward(self) | InputButton.Light;
    }
    return 0;
  }

  /** レベル2: 接近・後ろ入力ガード・弱強攻撃を使い分ける。 */
  private levelTwoInput(
    frame: number,
    self: FighterState,
    distance: number,
    projectiles: readonly ProjectileState[],
  ): number {
    const settings = CPU_LEVEL_SETTINGS.two;
    if (this.hasIncomingProjectile(self, projectiles)) {
      return this.away(self);
    }
    if (distance > settings.approachDistance) return this.toward(self);
    if (
      distance < settings.retreatDistance &&
      frame % settings.retreatCycleFrames < settings.retreatInputFrames
    ) {
      return this.away(self);
    }
    if (
      distance <= settings.heavyRange &&
      frame % settings.heavyInterval === 0
    ) {
      return InputButton.Heavy;
    }
    if (
      distance <= settings.lightRange &&
      frame % settings.lightInterval === 0
    ) {
      return InputButton.Light;
    }
    return 0;
  }

  /** レベル3: キャラクターテンプレートに従って最適距離・防御・波動拳を判断する。 */
  private levelThreeInput(
    frame: number,
    self: FighterState,
    opponent: FighterState,
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
      return this.startCommandMove(self, template);
    }
    const levelSettings = CPU_LEVEL_SETTINGS.three;
    if (distance > template.preferredDistance + levelSettings.approachMargin) {
      return this.toward(self);
    }
    const attackButtons = this.levelThreeAttackInput(
      frame,
      self,
      opponent,
      distance,
      template,
    );
    // 押し込み判定が重なる密着距離では、Lv3 が通常技より投げを優先する。
    if (attackButtons !== 0) return attackButtons;
    if (distance < template.retreatDistance) {
      return frame % levelSettings.retreatCycleFrames <
        levelSettings.retreatInputFrames
        ? this.away(self)
        : 0;
    }
    return attackButtons;
  }

  /** CPU Lv3 が距離・フレームから選ぶ攻撃のみを決定する。 */
  private levelThreeAttackInput(
    frame: number,
    self: FighterState,
    opponent: FighterState,
    distance: number,
    template: CpuCharacterSettings,
  ): number {
    const levelSettings = CPU_LEVEL_SETTINGS.three;
    if (distance > template.preferredDistance + levelSettings.approachMargin) {
      return 0;
    }
    if (
      this.isThrowRange(self, opponent) &&
      frame % template.attackInterval === 0
    ) {
      return InputButton.Throw;
    }
    if (distance < template.retreatDistance) return 0;
    if (
      distance <= template.heavyRange &&
      frame % template.attackInterval === 0
    ) {
      return InputButton.Heavy;
    }
    if (
      frame %
        Math.max(
          levelSettings.minimumLightInterval,
          template.attackInterval - levelSettings.lightIntervalOffset,
        ) ===
      0
    ) {
      return InputButton.Light;
    }
    return 0;
  }

  /** シミュレーションの投げ可能距離と同じ、押し込み判定の重なりを確認する。 */
  private isThrowRange(self: FighterState, opponent: FighterState): boolean {
    const throwMove = this.throwMoveForCharacter(self);
    if (!throwMove) return false;
    const verticalRange = throwMove.rangeY * POSITION_SCALE;
    const horizontalRange =
      ((self.character.hurtboxWidth + opponent.character.hurtboxWidth) / 2 +
        FIGHTING_GAME_CONFIG.match.physics.pushboxPadding * 2 +
        throwMove.rangeX) *
      POSITION_SCALE;
    return (
      Math.abs(self.y - opponent.y) < verticalRange &&
      Math.abs(self.x - opponent.x) <= horizontalRange
    );
  }

  /** CPUテンプレートとmoves/commands.csvから、実行するコマンド技を選ぶ。 */
  private startCommandMove(
    self: FighterState,
    template: CpuCharacterSettings,
  ): number {
    const move = this.commandMoveFor(self, template.specialMoveId);
    const command = move ? this.commandForMove(move) : undefined;
    if (!move || !command) {
      // 未定義技へ暗黙の波動拳入力を割り当てず、CSVを唯一の技定義として扱う。
      this.commandInputQueue.length = 0;
      return 0;
    }
    this.commandInputQueue = this.commandInputs(self, move, command);
    this.sampledCommandFrame = true;
    return this.continueCommand();
  }

  /** 現在キャラクター用の固有技を優先し、指定IDまたは利用可能なコマンド技を返す。 */
  private commandMoveFor(
    self: FighterState,
    preferredMoveId: string | undefined,
  ): MoveDefinition | undefined {
    // simulationと同じく、同名IDはCSV行順に関係なくキャラクター固有行で上書きする。
    const effectiveMoves = new Map<string, MoveDefinition>();
    for (const move of this.moves) {
      if (move.characterId === "all" && !effectiveMoves.has(move.id)) {
        effectiveMoves.set(move.id, move);
      }
    }
    for (const move of this.moves) {
      if (move.characterId === self.character.id) {
        effectiveMoves.set(move.id, move);
      }
    }
    const usable = [...effectiveMoves.values()].filter(
      (move) =>
        move.commandIds.length > 0 &&
        move.specialGaugeCost <= self.specialGauge &&
        (move.useState === "ground" || move.useState === "any"),
    );
    if (preferredMoveId) {
      const preferred = usable.find((move) => move.id === preferredMoveId);
      if (preferred) return preferred;
    }
    return (
      usable.find((move) => move.characterId === self.character.id) ?? usable[0]
    );
  }

  /** 複数の簡易コマンドがある場合は、優先度・入力長の順でCPU入力を選ぶ。 */
  private commandForMove(move: MoveDefinition): CommandDefinition | undefined {
    return move.commandIds
      .map((id) => this.commandsById.get(id))
      .filter((command): command is CommandDefinition => Boolean(command))
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          right.sequence.length - left.sequence.length,
      )[0];
  }

  /** テンキー方向を現在の向きへ変換し、溜め時間を含む固定フレーム入力列を作る。 */
  private commandInputs(
    self: FighterState,
    move: MoveDefinition,
    command: CommandDefinition,
  ): number[] {
    const inputs: number[] = [];
    command.sequence.forEach((direction, index) => {
      const directionInput = this.directionInput(self, direction);
      const repeats =
        index === 0 && command.chargeFrames > 0 ? command.chargeFrames : 1;
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        inputs.push(directionInput);
      }
    });
    if (inputs.length === 0) return [move.button];
    inputs[inputs.length - 1] |= move.button;
    return inputs;
  }

  /** CSVのテンキー方向を、CPU自身の前後方向を基準にした入力ビットへ変換する。 */
  private directionInput(
    self: FighterState,
    direction: CommandDirection,
  ): number {
    const forward = this.toward(self);
    const backward = this.away(self);
    const horizontal =
      direction === "1" || direction === "4" || direction === "7"
        ? backward
        : direction === "3" || direction === "6" || direction === "9"
          ? forward
          : 0;
    const vertical =
      direction === "1" || direction === "2" || direction === "3"
        ? InputButton.Down
        : direction === "7" || direction === "8" || direction === "9"
          ? InputButton.Up
          : 0;
    return horizontal | vertical;
  }

  /** 生成済みコマンド列から次の1フレーム分を返す。 */
  private continueCommand(): number {
    return this.commandInputQueue.shift() ?? 0;
  }

  /** move_idへ依存せず、固有定義を優先して地上で使える投げ技を返す。 */
  private throwMoveForCharacter(
    self: FighterState,
  ): MoveDefinition | undefined {
    const isGroundThrow = (move: MoveDefinition): boolean =>
      move.button === InputButton.Throw &&
      (move.useState === "ground" || move.useState === "any");
    return (
      this.moves.find(
        (move) => move.characterId === self.character.id && isGroundThrow(move),
      ) ??
      this.moves.find(
        (move) => move.characterId === "all" && isGroundThrow(move),
      )
    );
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
    const hurtboxTop = self.y - self.character.hurtboxTop * POSITION_SCALE;
    const hurtboxBottom =
      self.y - self.character.hurtboxBottom * POSITION_SCALE;
    return projectiles.some((projectile) => {
      if (projectile.owner === self.player) return false;

      const nextX = projectile.x + projectile.velocityX;
      const horizontalReach =
        (self.character.hurtboxWidth / 2) * POSITION_SCALE +
        projectile.hitboxRadius;
      return (
        Math.abs(nextX - self.x) <= horizontalReach &&
        projectile.y + projectile.hitboxRadius >= hurtboxTop &&
        projectile.y - projectile.hitboxRadius <= hurtboxBottom
      );
    });
  }
}
