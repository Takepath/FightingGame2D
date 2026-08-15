import type { Ticker } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Fireworks } from "fireworks-js";
import { CpuController, type CpuLevel } from "./cpu";
import { FrameSynchronizer } from "./frameSynchronizer";
import { FighterView } from "./fighterView";
import {
  FIXED_CANCEL_KEY_CODE,
  formatKeyboardCode,
  getKeyboardActionDefinition,
  InputManager,
  keyboardConfig,
  KEYBOARD_ACTIONS,
  type KeyBindingTarget,
} from "./input";
import { OnlineFrameBridge, RoomClient } from "./online";
import {
  FRAMES_PER_SECOND,
  GROUND_Y,
  MAX_ROUNDS,
  MatchSimulation,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./simulation";
import {
  TrainingCpuController,
  type TrainingAttackMode,
  type TrainingGuardMode,
  type TrainingJumpMode,
  type TrainingMoveMode,
} from "./trainingCpu";
import { InputButton, type CharacterDefinition, type GameData } from "./types";

// 60FPS固定シミュレーション用の更新間隔
const FIXED_STEP_MS = 1000 / 60;

// 1フレーム描画中に実行できるシミュレーション更新の最大回数
const MAX_STEPS_PER_RENDER = 5;

/** トレーニング画面の左端へ表示する、最新入力から遡る履歴の最大件数。 */
const MAX_TRAINING_INPUT_HISTORY = 8;

/** 試合勝者の決定時に打ち上げる花火の本数。 */
const MATCH_RESULT_FIREWORKS = 3;

/** 写真のような多色の大輪に見せるため、各打上げへ重ねる色の層。 */
const MATCH_RESULT_FIREWORK_HUES = [
  { min: 320, max: 350 },
  { min: 270, max: 300 },
  { min: 25, max: 48 },
] as const;

/**
 * 対戦画面クラス
 * 描画(Render)とゲームシミュレーション(60Hz)を分離して管理する
 */
export class MatchScreen extends Container {
  /** ゲーム全体の設定データ */
  private static gameData: GameData | null = null;
  /** メニュー遷移で決定した、今回の対戦に使う2人のキャラクター。 */
  private static selectedCharacters:
    | readonly [CharacterDefinition, CharacterDefinition]
    | null = null;

  /** トレーニングではP2の入力を受け付けない。 */
  private static training = false;

  /** nullならP2は人間操作、数値ならローカルCPUとして扱う。 */
  private static cpuLevel: CpuLevel | null = null;

  /** 一時停止メニューからTop画面へ戻る処理。 */
  private static returnToTop: (() => void) | null = null;

  /** ゲーム画面全体 */
  private readonly world = new Container();

  /** ステージ背景 */
  private readonly stageArt = new Graphics();

  /** 飛び道具描画 */
  private readonly projectileArt = new Graphics();

  /** HUD(体力バーなど) */
  private readonly hudArt = new Graphics();

  /** トレーニング入力履歴の背景パネル。 */
  private readonly trainingInputHistoryArt = new Graphics();

  /** 入力管理 */
  private readonly input = new InputManager();

  /** ESCキーで表示する一時停止モーダル。 */
  private readonly pauseMenu = document.getElementById("match-pause-menu")!;

  /** モーダルの通常メニュー。 */
  private readonly pauseMenuMain = document.getElementById("pause-menu-main")!;

  /** モーダルのオプション表示。 */
  private readonly pauseMenuOptions =
    document.getElementById("pause-menu-options")!;

  /** 対戦再開ボタン。 */
  private readonly resumeButton = document.getElementById("pause-resume")!;

  /** オプション画面を開くボタン。 */
  private readonly optionsButton = document.getElementById("pause-options")!;

  /** Top画面へ戻るボタン。 */
  private readonly topButton = document.getElementById("pause-top")!;

  /** オプション画面から通常メニューへ戻るボタン。 */
  private readonly optionsBackButton =
    document.getElementById("pause-options-back")!;

  /** キーコンフィグのプレイヤー別操作一覧。 */
  private readonly keyConfigList = document.getElementById("key-config-list")!;

  /** キー割り当ての案内・結果を表示する領域。 */
  private readonly keyConfigStatus =
    document.getElementById("key-config-status")!;

  /** キー配置を標準状態へ戻すボタン。 */
  private readonly keyConfigResetButton = document.getElementById(
    "key-config-reset",
  )! as HTMLButtonElement;

  /** トレーニング専用CPU設定全体の表示領域。 */
  private readonly trainingCpuOptions = document.getElementById(
    "training-cpu-options",
  )!;

  /** トレーニングCPUのガード種別選択。 */
  private readonly trainingGuardSelect = document.getElementById(
    "training-cpu-guard",
  )! as HTMLSelectElement;

  /** トレーニングCPUのジャンプ種別選択。 */
  private readonly trainingJumpSelect = document.getElementById(
    "training-cpu-jump",
  )! as HTMLSelectElement;

  /** トレーニングCPUの移動種別選択。 */
  private readonly trainingMoveSelect = document.getElementById(
    "training-cpu-move",
  )! as HTMLSelectElement;

  /** トレーニングCPUの攻撃種別選択。 */
  private readonly trainingAttackSelect = document.getElementById(
    "training-cpu-attack",
  )! as HTMLSelectElement;

  /** トレーニング中、P1の攻撃後に敵体力を回復する設定の選択欄。 */
  private readonly trainingAutoRecoverySelect = document.getElementById(
    "training-auto-recovery",
  )! as HTMLSelectElement;

  /** トレーニング中のP1入力履歴を表示するかを切り替える選択欄。 */
  private readonly trainingInputHistorySelect = document.getElementById(
    "training-input-history",
  )! as HTMLSelectElement;

  /** キー入力を待機している操作。nullなら通常のオプション表示中。 */
  private keyBindingTarget:
    | (KeyBindingTarget & { readonly button: HTMLButtonElement })
    | null = null;

  /** フレーム同期管理(オンライン同期用) */
  private readonly synchronizer = new FrameSynchronizer();

  /** ゲームシミュレーション */
  private readonly simulation: MatchSimulation;

  /** この試合がトレーニングモードかどうか。 */
  private readonly training: boolean;

  /** ローカル対戦で選択されたCPUレベル。 */
  private readonly cpuLevel: CpuLevel | null;

  /** P2を操作するCPU。トレーニング・オンライン対戦では生成しない。 */
  private readonly cpu: CpuController | null;

  /** トレーニングでP2を操作する、設定変更可能なダミーCPU。 */
  private readonly trainingCpu: TrainingCpuController | null;

  /** プレイヤー表示 */
  private readonly fighterViews: [FighterView, FighterView];

  /** タイトル表示 */
  private readonly title: Text;

  /** 情報表示 */
  private readonly info: Text;

  /** ラウンド表示 */
  private readonly roundText: Text;

  /** KO表示 */
  private readonly koText: Text;

  /** トレーニング中のP1入力履歴を縦並びで描画するText。 */
  private readonly trainingInputHistoryText: Text;

  /** 入力履歴表示のオン・オフ状態。トレーニング以外では常にオフ。 */
  private trainingInputHistoryEnabled = false;

  /** 最新入力を先頭に保持する、表示専用の入力履歴。 */
  private readonly trainingInputHistory: number[] = [];

  /** 同じ入力を押し続けた場合に履歴を増やさないための直前入力。 */
  private previousTrainingInputButtons = 0;

  /** 前回HUDへ描画した体力。変化時だけGraphicsを描き直す。 */
  private readonly displayedHealth: [number, number] = [-1, -1];

  /** 前フレームに飛び道具Graphicsが存在したか。 */
  private hadProjectiles = false;

  /** 経過時間蓄積 */
  private accumulatorMs = 0;

  /** 一時停止フラグ */
  private paused = false;

  /** オンライン同期 */
  private online: OnlineFrameBridge | null = null;

  /** 自分のプレイヤー番号 */
  private onlinePlayer: 0 | 1 | null = null;

  /** 花火用Canvasを重ねる、操作を受け付けない画面全体のレイヤー。 */
  private readonly fireworksLayer = document.getElementById("fireworks-layer")!;

  /** 3本の発射位置と多色の層を個別に制御する、fireworks-jsの花火演出。 */
  private readonly matchResultFireworks: readonly (readonly Fireworks[])[];

  /** 同じ試合決着で花火を重複発射しないための状態。 */
  private fireworksLaunchedForMatch = false;

  /**
   * ゲームデータを設定
   */
  public static configure(
    data: GameData,
    selectedCharacters: readonly [CharacterDefinition, CharacterDefinition],
    training = false,
    cpuLevel: CpuLevel | null = null,
    returnToTop: (() => void) | null = null,
  ): void {
    MatchScreen.gameData = data;
    MatchScreen.selectedCharacters = selectedCharacters;
    MatchScreen.training = training;
    MatchScreen.cpuLevel = cpuLevel;
    MatchScreen.returnToTop = returnToTop;
  }

  /**
   * コンストラクタ
   * ゲーム画面の初期化
   */
  public constructor() {
    super();

    const data = MatchScreen.gameData;
    if (!data) throw new Error("ゲームデータが初期化されていません");

    // 使用キャラクター決定
    const selectedCharacters = MatchScreen.selectedCharacters;
    if (!selectedCharacters) {
      throw new Error("対戦キャラクターが選択されていません");
    }

    this.training = MatchScreen.training;
    this.cpuLevel = MatchScreen.cpuLevel;
    // トレーニングでは試合勝敗がないため、花火インスタンスを生成しない。
    this.matchResultFireworks = this.training
      ? []
      : Array.from({ length: MATCH_RESULT_FIREWORKS }, () =>
          MATCH_RESULT_FIREWORK_HUES.map(
            (hue) =>
              new Fireworks(this.fireworksLayer, {
                autoresize: true,
                mouse: { click: false, move: false, max: 1 },
                sound: { enabled: false },
                // 色層を重ねて、写真のようなピンク・紫・金の大輪を作る。
                hue,
                particles: 72,
                explosion: 11,
                brightness: { min: 66, max: 100 },
                decay: { min: 0.008, max: 0.015 },
                friction: 0.98,
                gravity: 1,
                flickering: 72,
                opacity: 0.24,
                traceLength: 9,
                traceSpeed: 12,
                lineWidth: {
                  trace: { min: 2, max: 3 },
                  explosion: { min: 1, max: 2 },
                },
                // launch(1)だけで発射し、自動発射を混在させない。
                intensity: 0,
              }),
          ),
        );

    // シミュレーション生成
    this.simulation = new MatchSimulation(
      selectedCharacters,
      data.moves,
      data.commands,
      this.training,
    );
    this.cpu = this.cpuLevel === null ? null : new CpuController(this.cpuLevel);
    this.trainingCpu = this.training ? new TrainingCpuController() : null;

    // プレイヤー表示生成
    this.fighterViews = [
      new FighterView(
        this.simulation.fighters[0],
        data.blenderAnimations[selectedCharacters[0].id],
      ),
      new FighterView(
        this.simulation.fighters[1],
        data.blenderAnimations[selectedCharacters[1].id],
      ),
    ];

    // HUD文字生成
    this.title = this.createText("99", 34, "#ecf5ff");
    this.info = this.createText("", 14, "#a9c7ed");
    this.roundText = this.createText("ROUND 1 / 3", 15, "#ffffff");
    this.koText = this.createText("", 64, "#fff1a3");
    this.trainingInputHistoryText = new Text({
      text: "",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 25,
        fontWeight: "800",
        fill: "#ecf8ff",
        stroke: { color: "#070b16", width: 5 },
        lineHeight: 31,
      },
    });
    this.roundText.position.set(STAGE_WIDTH / 2, 18);
    // トレーニングはラウンド制を使わないため、ラウンド数のHUDを隠す。
    this.roundText.visible = !this.training;
    this.title.position.set(STAGE_WIDTH / 2, 55);
    this.info.position.set(STAGE_WIDTH / 2, 677);
    this.koText.position.set(STAGE_WIDTH / 2, 265);
    this.trainingInputHistoryText.position.set(34, 128);
    this.trainingInputHistoryText.visible = false;

    // 描画順に追加
    this.world.addChild(
      this.stageArt,
      this.projectileArt,
      this.fighterViews[0],
      this.fighterViews[1],
      this.hudArt,
      this.trainingInputHistoryArt,
    );

    this.world.addChild(
      this.title,
      this.info,
      this.roundText,
      this.koText,
      this.trainingInputHistoryText,
    );

    this.addChild(this.world);

    // 初回描画
    this.drawStage();
    this.drawHud();
    this.refreshViews();

    this.renderKeyConfig();
    this.trainingCpuOptions.classList.toggle("is-hidden", !this.training);
    this.updateTrainingCpuSettings();

    window.addEventListener("keydown", this.onKeyDown);
    this.resumeButton.addEventListener("click", this.resumeMatch);
    this.optionsButton.addEventListener("click", this.showOptions);
    this.optionsBackButton.addEventListener("click", this.showMainMenu);
    this.keyConfigResetButton.addEventListener("click", this.resetKeyConfig);
    this.trainingGuardSelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingJumpSelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingMoveSelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingAttackSelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingAutoRecoverySelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingInputHistorySelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.topButton.addEventListener("click", this.leaveToTop);
  }

  /**
   * オンライン対戦開始
   */
  public startOnline(client: RoomClient): void {
    if (client.player === null) return;

    this.online = new OnlineFrameBridge(client);
    this.onlinePlayer = client.player;

    this.synchronizer.reset();
    this.simulation.resetMatch();
    this.accumulatorMs = 0;
  }

  /**
   * オンライン対戦終了
   */
  public stopOnline(): void {
    if (!this.online) return;

    this.online = null;
    this.onlinePlayer = null;

    this.synchronizer.reset();
    this.simulation.resetMatch();
    this.accumulatorMs = 0;
  }

  /**
   * 毎フレーム更新
   * 描画フレームとは独立して60FPSシミュレーションを実行
   */
  public update(time: Ticker): void {
    if (this.paused) return;

    this.accumulatorMs += Math.min(time.deltaMS, 250);

    let executedSteps = 0;

    while (
      this.accumulatorMs >= FIXED_STEP_MS &&
      executedSteps < MAX_STEPS_PER_RENDER
    ) {
      // オンラインなら同期入力
      // オフラインならローカル入力
      const inputs = this.online
        ? this.online.inputsForFrame(
            this.synchronizer.frame,
            this.input.sample(0),
          )
        : ([
            this.input.sample(0),
            this.training
              ? (this.trainingCpu?.sample(
                  this.synchronizer.frame,
                  this.simulation.fighters[1],
                  this.simulation.fighters[0],
                  this.simulation.willAttackHitNextFrame(
                    this.simulation.fighters[1],
                  ),
                ) ?? { buttons: 0 })
              : this.cpu
                ? this.cpu.sample(
                    this.synchronizer.frame,
                    this.simulation.fighters[1],
                    this.simulation.fighters[0],
                    this.simulation.projectiles,
                  )
                : this.input.sample(1),
          ] as const);

      if (!inputs) {
        // 相手入力待ち
        this.accumulatorMs = Math.min(this.accumulatorMs, FIXED_STEP_MS);
        break;
      }

      // 入力履歴は見た目だけに使い、決定論的シミュレーションへは影響させない。
      this.recordTrainingInputHistory(inputs[0].buttons);

      // シミュレーション1フレーム進める
      this.synchronizer.advance(this.simulation, inputs);

      this.accumulatorMs -= FIXED_STEP_MS;
      executedSteps++;
    }

    // 長時間停止後の大量更新を防止
    if (executedSteps === MAX_STEPS_PER_RENDER) this.accumulatorMs = 0;

    // シミュレーションが進んだ時だけ、状態に追従する表示を更新する。
    if (executedSteps > 0) this.refreshViews();
  }

  /**
   * ウィンドウサイズ変更
   */
  public resize(width: number, height: number): void {
    const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);

    this.world.scale.set(scale);

    this.world.position.set(
      (width - STAGE_WIDTH * scale) / 2,
      (height - STAGE_HEIGHT * scale) / 2,
    );
  }

  /** フォーカスを失った */
  public blur(): void {
    this.paused = true;
    this.accumulatorMs = 0;
  }

  /** フォーカス復帰 */
  public focus(): void {
    if (!this.isPauseMenuOpen()) this.paused = false;
  }

  /** 終了処理 */
  public reset(): void {
    // 画面遷移時は残っている花火Canvasも停止・破棄する。
    this.matchResultFireworks.forEach((fireworksAtPoint) => {
      fireworksAtPoint.forEach((fireworks) => fireworks.stop(true));
    });
    window.removeEventListener("keydown", this.onKeyDown);
    this.resumeButton.removeEventListener("click", this.resumeMatch);
    this.optionsButton.removeEventListener("click", this.showOptions);
    this.optionsBackButton.removeEventListener("click", this.showMainMenu);
    this.keyConfigResetButton.removeEventListener("click", this.resetKeyConfig);
    this.trainingGuardSelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingJumpSelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingMoveSelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingAttackSelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingAutoRecoverySelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingInputHistorySelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.topButton.removeEventListener("click", this.leaveToTop);
    this.stopKeyBinding();
    this.closePauseMenu();
    this.input.destroy();
  }

  /** ESCキーで一時停止メニューを開閉する。 */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== FIXED_CANCEL_KEY_CODE || event.repeat) return;
    event.preventDefault();
    if (!this.isPauseMenuOpen()) {
      this.openPauseMenu();
    } else if (this.isOptionsOpen()) {
      this.showMainMenu();
    } else {
      this.resumeMatch();
    }
  };

  /** 試合を停止して通常メニューを画面中央へ表示する。 */
  private openPauseMenu = (): void => {
    this.paused = true;
    this.accumulatorMs = 0;
    this.showMainMenu();
    this.pauseMenu.classList.remove("is-hidden");
    this.pauseMenu.setAttribute("aria-hidden", "false");
    this.resumeButton.focus();
  };

  /** モーダルを閉じて固定フレーム更新を再開する。 */
  private resumeMatch = (): void => {
    this.closePauseMenu();
    this.paused = false;
  };

  /** 一時停止モーダルを閉じる。 */
  private closePauseMenu(): void {
    this.stopKeyBinding();
    this.pauseMenu.classList.add("is-hidden");
    this.pauseMenu.setAttribute("aria-hidden", "true");
  }

  /** オプション説明へ切り替える。 */
  private showOptions = (): void => {
    this.pauseMenuMain.classList.add("is-hidden");
    this.pauseMenuOptions.classList.remove("is-hidden");
    this.renderKeyConfig();
    this.keyConfigStatus.textContent = "変更したい操作を選んでください。";
    this.optionsBackButton.focus();
  };

  /** 通常の一時停止メニューへ切り替える。 */
  private showMainMenu = (): void => {
    this.stopKeyBinding();
    this.pauseMenuMain.classList.remove("is-hidden");
    this.pauseMenuOptions.classList.add("is-hidden");
  };

  /** キーコンフィグ画面が開かれているかを判定する。 */
  private isOptionsOpen(): boolean {
    return !this.pauseMenuOptions.classList.contains("is-hidden");
  }

  /** 現在のキー配置から、P1・P2の設定ボタンを生成する。 */
  private renderKeyConfig(): void {
    this.keyConfigList.replaceChildren();

    for (const player of [0, 1] as const) {
      const group = document.createElement("section");
      group.className = "key-config-player";

      const heading = document.createElement("h2");
      heading.textContent = `PLAYER ${player + 1}`;
      group.append(heading);

      const bindings = document.createElement("div");
      bindings.className = "key-config-bindings";

      for (const { action, label } of KEYBOARD_ACTIONS) {
        const row = document.createElement("div");
        row.className = "key-config-row";

        const actionLabel = document.createElement("span");
        actionLabel.textContent = label;

        const keyButton = document.createElement("button");
        keyButton.type = "button";
        keyButton.className = "key-config-binding";
        keyButton.textContent = formatKeyboardCode(
          keyboardConfig.getBinding(player, action),
        );
        keyButton.setAttribute(
          "aria-label",
          `PLAYER ${player + 1}の${label}: ${keyButton.textContent}`,
        );
        keyButton.addEventListener("click", () =>
          this.startKeyBinding({ player, action }, keyButton),
        );

        row.append(actionLabel, keyButton);
        bindings.append(row);
      }

      group.append(bindings);
      this.keyConfigList.append(group);
    }
  }

  /** 選択した操作に対する次のキー入力を待機する。 */
  private startKeyBinding(
    target: KeyBindingTarget,
    button: HTMLButtonElement,
  ): void {
    this.stopKeyBinding();
    this.keyBindingTarget = { ...target, button };
    button.classList.add("is-waiting-for-key");

    const definition = getKeyboardActionDefinition(target.action);
    this.keyConfigStatus.textContent = `P${target.player + 1}の「${definition.label}」に割り当てるキーを押してください。Escでキャンセルします。`;
    window.addEventListener("keydown", this.captureKeyBinding, true);
    button.focus();
  }

  /** キーコンフィグ待機中のキー入力を処理する。 */
  private captureKeyBinding = (event: KeyboardEvent): void => {
    const target = this.keyBindingTarget;
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;

    if (event.code === FIXED_CANCEL_KEY_CODE) {
      this.stopKeyBinding();
      this.keyConfigStatus.textContent = "キーの変更を取り消しました。";
      return;
    }

    const result = keyboardConfig.assign(target, event.code);
    if (result.ok) {
      const definition = getKeyboardActionDefinition(target.action);
      const keyName = formatKeyboardCode(event.code);
      this.stopKeyBinding();
      this.renderKeyConfig();
      this.keyConfigStatus.textContent = `P${target.player + 1}の「${definition.label}」を ${keyName} に設定しました。`;
      return;
    }

    if (result.reason === "duplicate" && result.conflictingTarget) {
      const conflicting = result.conflictingTarget;
      const definition = getKeyboardActionDefinition(conflicting.action);
      this.keyConfigStatus.textContent = `${formatKeyboardCode(event.code)} は P${conflicting.player + 1}の「${definition.label}」に設定済みです。別のキーを押してください。`;
      return;
    }

    this.keyConfigStatus.textContent =
      "Escと修飾キーは割り当てできません。別のキーを押してください。";
  };

  /** キー入力待機を終了し、イベント監視と見た目を元に戻す。 */
  private stopKeyBinding(): void {
    if (this.keyBindingTarget) {
      this.keyBindingTarget.button.classList.remove("is-waiting-for-key");
    }
    this.keyBindingTarget = null;
    window.removeEventListener("keydown", this.captureKeyBinding, true);
  }

  /** キー配置を標準状態へ戻し、設定一覧を描き直す。 */
  private resetKeyConfig = (): void => {
    this.stopKeyBinding();
    keyboardConfig.reset();
    this.renderKeyConfig();
    this.keyConfigStatus.textContent = "キー配置を初期設定に戻しました。";
    this.keyConfigResetButton.focus();
  };

  /** オプション画面の選択値を、トレーニング中のP2ダミーと体力回復へ即時反映する。 */
  private updateTrainingCpuSettings = (): void => {
    if (!this.training) return;

    this.trainingCpu?.setSettings({
      guard: this.trainingGuardSelect.value as TrainingGuardMode,
      jump: this.trainingJumpSelect.value as TrainingJumpMode,
      move: this.trainingMoveSelect.value as TrainingMoveMode,
      attack: this.trainingAttackSelect.value as TrainingAttackMode,
    });
    this.simulation.setTrainingAutoRecovery(
      this.trainingAutoRecoverySelect.value === "on",
    );
    this.setTrainingInputHistoryEnabled(
      this.trainingInputHistorySelect.value === "on",
    );
  };

  /** モーダルが開いているかを返す。 */
  /** トレーニング入力履歴を有効・無効化し、切替時は古い表示を消去する。 */
  private setTrainingInputHistoryEnabled(enabled: boolean): void {
    const nextEnabled = this.training && enabled;
    if (this.trainingInputHistoryEnabled === nextEnabled) return;

    this.trainingInputHistoryEnabled = nextEnabled;
    this.trainingInputHistory.length = 0;
    this.previousTrainingInputButtons = 0;
    this.trainingInputHistoryArt.clear();
    this.trainingInputHistoryText.text = "";
    this.trainingInputHistoryText.visible = nextEnabled;
  }

  /** P1の入力変化だけを、最新順のトレーニング入力履歴へ記録する。 */
  private recordTrainingInputHistory(buttons: number): void {
    if (!this.trainingInputHistoryEnabled) return;

    const trackedButtons =
      buttons &
      (InputButton.Left |
        InputButton.Right |
        InputButton.Up |
        InputButton.Down |
        InputButton.Light |
        InputButton.Heavy |
        InputButton.Special);
    if (trackedButtons === this.previousTrainingInputButtons) return;

    this.previousTrainingInputButtons = trackedButtons;
    // ニュートラルへの復帰は表示せず、次の同一入力を再度記録できるようにする。
    if (trackedButtons === 0) return;

    this.trainingInputHistory.unshift(trackedButtons);
    if (this.trainingInputHistory.length > MAX_TRAINING_INPUT_HISTORY) {
      this.trainingInputHistory.pop();
    }
    this.renderTrainingInputHistory();
  }

  /** 入力履歴を矢印・攻撃名へ変換して、画面左端の縦並びへ描画する。 */
  private renderTrainingInputHistory(): void {
    const lines = this.trainingInputHistory.map((buttons) =>
      this.formatTrainingInput(buttons),
    );
    this.setTextIfChanged(this.trainingInputHistoryText, lines.join("\n"));

    const panelHeight = Math.max(44, lines.length * 31 + 18);
    this.trainingInputHistoryArt.clear();
    this.trainingInputHistoryArt
      .roundRect(18, 116, 112, panelHeight, 8)
      .fill({ color: 0x071425, alpha: 0.8 })
      .stroke({ color: 0x4fc3dd, width: 1, alpha: 0.75 });
  }

  /** 入力ビットを、トレーニング表示用の方向記号と攻撃名へ整形する。 */
  private formatTrainingInput(buttons: number): string {
    const hasLeft = (buttons & InputButton.Left) !== 0;
    const hasRight = (buttons & InputButton.Right) !== 0;
    const hasUp = (buttons & InputButton.Up) !== 0;
    const hasDown = (buttons & InputButton.Down) !== 0;

    let direction = "";
    if (hasUp && hasLeft) direction = "↖";
    else if (hasUp && hasRight) direction = "↗";
    else if (hasDown && hasLeft) direction = "↙";
    else if (hasDown && hasRight) direction = "↘";
    else if (hasUp) direction = "↑";
    else if (hasDown) direction = "↓";
    else if (hasLeft) direction = "←";
    else if (hasRight) direction = "→";

    const actions: string[] = [];
    if ((buttons & InputButton.Special) !== 0) actions.push("必");
    if ((buttons & InputButton.Heavy) !== 0) actions.push("強");
    if ((buttons & InputButton.Light) !== 0) actions.push("弱");
    return [direction, ...actions].filter(Boolean).join(" ");
  }

  private isPauseMenuOpen(): boolean {
    return !this.pauseMenu.classList.contains("is-hidden");
  }

  /** 試合を終了し、画面遷移をMenuFlowへ委譲する。 */
  private leaveToTop = (): void => {
    this.closePauseMenu();
    MatchScreen.returnToTop?.();
  };

  /**
   * 共通Text生成
   */
  private createText(text: string, size: number, color: string): Text {
    return new Text({
      text,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: size,
        fontWeight: "800",
        fill: color,
        stroke: { color: "#070b16", width: 5 },
        letterSpacing: 1,
      },
      anchor: 0.5,
    });
  }

  /**
   * ステージ背景描画
   * 地面・背景・建物・装飾を描画
   */
  private drawStage(): void {
    const art = this.stageArt;
    art.clear();
    art.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill({ color: 0x080d1c });
    art.rect(0, 300, STAGE_WIDTH, 270).fill({ color: 0x152546 });
    art
      .rect(0, GROUND_Y, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y)
      .fill({ color: 0x0d162b });
    art
      .rect(0, GROUND_Y - 5, STAGE_WIDTH, 5)
      .fill({ color: 0x6dcbf1, alpha: 0.8 });

    for (let x = -100; x < STAGE_WIDTH + 160; x += 64) {
      art
        .moveTo(x, STAGE_HEIGHT)
        .lineTo(x + 230, GROUND_Y)
        .stroke({
          color: 0x2d4a76,
          width: 1,
          alpha: 0.75,
        });
    }
    for (let y = GROUND_Y + 24; y < STAGE_HEIGHT; y += 30) {
      art
        .moveTo(0, y)
        .lineTo(STAGE_WIDTH, y)
        .stroke({ color: 0x2d4a76, width: 1, alpha: 0.7 });
    }

    art.circle(220, 250, 96).fill({ color: 0x493b78, alpha: 0.22 });
    art.circle(1050, 220, 132).fill({ color: 0x11798d, alpha: 0.18 });
    art.rect(80, 330, 210, 130).fill({ color: 0x091225, alpha: 0.65 });
    art.rect(990, 310, 190, 150).fill({ color: 0x091225, alpha: 0.65 });
    for (let x = 106; x <= 248; x += 34) {
      art.rect(x, 352, 20, 50).fill({ color: 0x4fc3dd, alpha: 0.34 });
    }
    for (let x = 1018; x <= 1148; x += 32) {
      art.rect(x, 335, 18, 66).fill({ color: 0xb67bdf, alpha: 0.3 });
    }
  }

  /**
   * HUD描画
   * 体力バー・ラウンド表示位置などを更新
   */
  private drawHud(): void {
    const [left, right] = this.simulation.fighters;
    if (
      left.health === this.displayedHealth[0] &&
      right.health === this.displayedHealth[1]
    ) {
      return;
    }

    this.displayedHealth[0] = left.health;
    this.displayedHealth[1] = right.health;
    const art = this.hudArt;
    art.clear();

    this.drawHealthBar(
      48,
      45,
      470,
      left.health / left.character.maxHealth,
      left.character.primaryColor,
      false,
    );
    this.drawHealthBar(
      STAGE_WIDTH - 48,
      45,
      470,
      right.health / right.character.maxHealth,
      right.character.primaryColor,
      true,
    );
  }

  /**
   * 体力バー描画
   *
   * @param x 表示位置X
   * @param y 表示位置Y
   * @param width バーの幅
   * @param ratio 残体力(0～1)
   * @param color バー色
   * @param reverse 右側表示か
   */
  private drawHealthBar(
    x: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
    reverse: boolean,
  ): void {
    const barX = reverse ? x - width : x;
    this.hudArt
      .roundRect(barX, y, width, 25, 7)
      .fill({ color: 0x030712, alpha: 0.85 });
    const fillWidth = Math.max(0, Math.round((width - 6) * ratio));
    const fillX = reverse ? x - 3 - fillWidth : x + 3;
    this.hudArt.roundRect(fillX, y + 3, fillWidth, 19, 5).fill({ color });
  }

  /**
   * 全表示更新
   * ・キャラクター
   * ・飛び道具
   * ・HUD
   * ・ラウンド表示
   * ・勝者表示
   * ・同期情報
   */
  private refreshViews(): void {
    this.fighterViews[0].update();
    this.fighterViews[1].update();
    this.drawProjectiles();
    this.drawHud();
    this.playMatchResultFireworks();
    if (!this.training) {
      this.setTextIfChanged(
        this.roundText,
        `ROUND ${this.simulation.round} / ${MAX_ROUNDS}`,
      );
    }
    let infoText = this.online
      ? `ONLINE P${(this.onlinePlayer ?? 0) + 1}  •  後ろ: 立ちガード / ↓+後ろ: しゃがみガード  •  ↓ ↘ → + 必殺技 = 波動拳`
      : "Esc > オプション  •  後ろ: 立ちガード / ↓+後ろ: しゃがみガード  •  空中攻撃";
    if (this.training && !this.online) {
      infoText =
        "TRAINING  •  後ろ: 立ちガード / ↓+後ろ: しゃがみガード  •  空中攻撃";
    } else if (this.cpuLevel !== null && !this.online) {
      infoText = `CPU LEVEL ${this.cpuLevel}  •  後ろ: 立ちガード / ↓+後ろ: しゃがみガード`;
    }
    this.setTextIfChanged(this.info, infoText);

    let centerText = "";
    if (this.training && this.simulation.trainingResetFrames > 0) {
      centerText = "TRAINING RESET";
    } else if (!this.training && this.simulation.roundIntroFrames > 0) {
      centerText = `ROUND ${this.simulation.round}`;
    } else if (!this.training && this.simulation.matchWinner !== null) {
      centerText = `P${this.simulation.matchWinner + 1} WINS THE MATCH`;
    } else if (!this.training && this.simulation.winner !== null) {
      centerText = `P${this.simulation.winner + 1} TAKES ROUND`;
    }
    this.setTextIfChanged(this.koText, centerText);

    this.setTextIfChanged(
      this.title,
      this.training
        ? "∞"
        : String(
            Math.ceil(this.simulation.roundTimeFrames / FRAMES_PER_SECOND),
          ),
    );
  }

  /** 2本先取で試合勝者が決定した瞬間だけ、下から中央へ3発の花火を打ち上げる。 */
  private playMatchResultFireworks(): void {
    if (this.training || this.matchResultFireworks.length === 0) return;

    if (this.simulation.matchWinner === null) {
      this.fireworksLaunchedForMatch = false;
      return;
    }
    if (this.fireworksLaunchedForMatch) return;

    const width = this.fireworksLayer.clientWidth || window.innerWidth;
    const height = this.fireworksLayer.clientHeight || window.innerHeight;
    const explosionY = Math.round(height / 2);

    this.matchResultFireworks.forEach((fireworksAtPoint, index) => {
      // 25%・50%・75%の等間隔から垂直に打ち上げ、上下中央へ到達させる。
      const pointPercent = ((index + 1) / (MATCH_RESULT_FIREWORKS + 1)) * 100;
      const explosionX = Math.round((width * pointPercent) / 100);

      // fireworks-jsの発射点と到達範囲を同じ座標へ固定して、斜めに飛ばないようにする。
      fireworksAtPoint.forEach((fireworks) => {
        fireworks.updateOptions({
          rocketsPoint: { min: pointPercent, max: pointPercent },
          boundaries: {
            x: explosionX,
            y: explosionY,
            width: explosionX * 3,
            height: explosionY * 2,
            debug: false,
          },
        });
        fireworks.launch(1);
      });
    });

    // 花火は演出専用であり、対戦の決定論的なゲーム状態には影響しない。
    this.fireworksLaunchedForMatch = true;
  }

  /** Textの内容が変化した時だけ更新し、文字テクスチャの再生成を避ける。 */

  private setTextIfChanged(target: Text, value: string): void {
    if (target.text !== value) target.text = value;
  }

  /**
   * 飛び道具描画
   * 全Projectileを円形エフェクトとして表示
   */
  private drawProjectiles(): void {
    const projectiles = this.simulation.projectiles;
    if (projectiles.length === 0) {
      if (this.hadProjectiles) this.projectileArt.clear();
      this.hadProjectiles = false;
      return;
    }

    this.hadProjectiles = true;
    this.projectileArt.clear();
    for (const projectile of projectiles) {
      const x = projectile.x / 100;
      const y = projectile.y / 100;
      const color =
        this.simulation.fighters[projectile.owner].character.accentColor;
      this.projectileArt.circle(x, y, 22).fill({ color, alpha: 0.16 });
      this.projectileArt.circle(x, y, 14).fill({ color, alpha: 0.5 });
      this.projectileArt.circle(x, y, 7).fill({ color: 0xe8f8ff });
    }
  }
}
