import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { Fireworks } from "fireworks-js";
import { CpuController, type CpuLevel } from "./cpu";
import { FrameSynchronizer } from "./frameSynchronizer";
import { FighterView } from "./fighterView";
import {
  FIXED_CANCEL_KEY_CODE,
  formatGamepadBinding,
  formatKeyboardCode,
  gamepadConfig,
  getKeyboardActionDefinition,
  InputManager,
  keyboardConfig,
  KEYBOARD_ACTIONS,
  type KeyBindingTarget,
} from "./input";
import {
  OnlineFrameBridge,
  RoomClient,
  type MatchResultAction,
} from "./online";
import { FIGHTING_GAME_CONFIG } from "./gameConfig";
import {
  FRAMES_PER_SECOND,
  GROUND_Y,
  HIT_STOP_FRAMES,
  MAX_ROUNDS,
  MAX_SPECIAL_GAUGE,
  MAX_SUPER_GAUGE,
  MatchSimulation,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type ProjectileState,
} from "./simulation";
import {
  TrainingCpuController,
  type TrainingAttackMode,
  type TrainingGuardMode,
  type TrainingJumpMode,
  type TrainingMoveMode,
} from "./trainingCpu";
import {
  InputButton,
  type CharacterDefinition,
  type GameData,
  type ProjectileDefinition,
} from "./types";

// 60FPS固定シミュレーション用の更新間隔
const FIXED_STEP_MS = 1000 / 60;

// 1フレーム描画中に実行できるシミュレーション更新の最大回数
const MAX_STEPS_PER_RENDER = 5;

/** トレーニング画面の左端へ表示する、最新入力から遡る履歴の最大件数。 */
const MAX_TRAINING_INPUT_HISTORY = 8;

/** 同一入力をまとめて表示するための、ボタンと継続フレーム数。 */
interface TrainingInputHistoryEntry {
  readonly buttons: number;
  elapsedFrames: number;
}

/** 入力履歴の継続時間として表示する最大フレーム数。 */
const MAX_TRAINING_INPUT_ELAPSED_FRAMES = 99;

/** 試合勝者の決定時に打ち上げる花火の本数。 */
/** 超必殺ゲージは100単位のバーと、右側の百の位で表示する。 */
const SUPER_GAUGE_BAR_MAX = 100;
const SUPER_GAUGE_BAR_WIDTH = 190;

const MATCH_RESULT_FIREWORKS = 3;

/** 写真のような多色の大輪に見せるため、各打上げへ重ねる色の層。 */
const MATCH_RESULT_FIREWORK_HUES = [
  { min: 320, max: 350 },
  { min: 270, max: 300 },
  { min: 25, max: 48 },
] as const;

/** public配下に配置する、強い攻撃命中時の効果音ファイル。 */
const HIT_STOP_SOUND_PATH = "data/sounds/slap-1.mp3";

/**
 * 試合終了モーダルから、メニュー画面へ戻るための遷移処理です。
 * 実際の画面生成はMenuFlowに任せ、対戦画面はUI操作だけを担当します。
 */
type MatchResultNavigation = {
  readonly returnToTop: () => void;
  readonly returnToCharacterSelect: () => void;
};

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

  /** 一時停止・試合終了モーダルからメニューへ戻る処理。 */
  private static resultNavigation: MatchResultNavigation | null = null;

  /** ゲーム画面全体 */
  private readonly world = new Container();

  /** ステージ背景 */
  private readonly stageArt = new Graphics();

  /** 飛び道具描画 */
  private readonly projectileArt = new Graphics();

  /** PNGを使う飛び道具を重ねる描画レイヤー。 */
  private readonly projectileSpriteLayer = new Container();

  /** 飛び道具状態ごとに再利用するPNGスプライト。 */
  private readonly projectileSprites = new Map<ProjectileState, Sprite>();

  /** projectiles.csv の定義をIDで引ける描画用索引。 */
  private readonly projectileDefinitionsById = new Map<
    string,
    ProjectileDefinition
  >();

  /** HUD(体力バーなど) */
  private readonly hudArt = new Graphics();

  /** トレーニング入力履歴の背景パネル。 */
  private readonly trainingInputHistoryArt = new Graphics();

  /** トレーニング時に被弾・攻撃判定を重ねて表示するレイヤー。 */
  private readonly trainingCollisionDebugArt = new Graphics();

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

  /** 勝敗確定時に表示する、再試合・画面遷移専用のモーダル。 */
  private readonly matchResultMenu =
    document.getElementById("match-result-menu")!;

  /** 試合勝者を表示する見出し。 */
  private readonly matchResultTitle =
    document.getElementById("match-result-title")!;

  /** オンライン時の合意待ち状態を表示する領域。 */
  private readonly matchResultStatus = document.getElementById(
    "match-result-status",
  )!;

  /** 同じキャラクター・カラーで対戦をやり直すボタン。 */
  private readonly rematchButton = document.getElementById(
    "match-rematch",
  )! as HTMLButtonElement;

  /** キャラクター選択画面へ戻るボタン。 */
  private readonly characterSelectButton = document.getElementById(
    "match-character-select",
  )! as HTMLButtonElement;

  /** 試合終了モーダルからTop画面へ戻るボタン。 */
  private readonly matchResultTopButton = document.getElementById(
    "match-top",
  )! as HTMLButtonElement;

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

  /** トレーニング中、P1の必殺技ゲージを技使用直後に回復する設定の選択欄。 */
  private readonly trainingAutoSpecialGaugeRecoverySelect =
    document.getElementById(
      "training-auto-special-gauge-recovery",
    )! as HTMLSelectElement;

  /** トレーニング中のP1入力履歴を表示するかを切り替える選択欄。 */
  private readonly trainingInputHistorySelect = document.getElementById(
    "training-input-history",
  )! as HTMLSelectElement;

  /** トレーニング中の被弾・攻撃判定を表示するかを切り替える選択欄。 */
  private readonly trainingCollisionDebugSelect = document.getElementById(
    "training-collision-debug",
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

  /** 被撃側の連続ヒット数を表示するCOMBOテキスト。 */
  private readonly comboText: Text;

  /** 超必殺ゲージの百の位を、各プレイヤーのバー右側へ表示するテキスト。 */
  private readonly superGaugeDigits: [Text, Text];

  /** トレーニング中のP1入力履歴を縦並びで描画するText。 */
  private readonly trainingInputHistoryText: Text;

  /** 各入力の継続フレームを、入力履歴の左側へ描画するText。 */
  private readonly trainingInputHistoryFrameText: Text;

  /** 入力履歴表示のオン・オフ状態。トレーニング以外では常にオフ。 */
  private trainingInputHistoryEnabled = false;

  /** 被弾判定（赤）と有効中の攻撃判定（青）のトレーニング表示状態。 */
  private trainingCollisionDebugEnabled = false;

  /** 最新入力を先頭に保持する、表示専用の入力履歴と継続フレーム。 */
  private readonly trainingInputHistory: TrainingInputHistoryEntry[] = [];

  /** 同じ入力を押し続けた場合に履歴を増やさないための直前入力。 */
  private previousTrainingInputButtons = 0;

  /** 前回HUDへ描画した体力。変化時だけGraphicsを描き直す。 */
  private readonly displayedHealth: [number, number] = [-1, -1];

  /** 前回HUDへ描画した必殺技ゲージ。変化時だけGraphicsを描き直す。 */
  private readonly displayedSpecialGauge: [number, number] = [-1, -1];

  /** 前回HUDへ描画した超必殺ゲージ。変化時だけGraphicsと百の位を更新する。 */
  private readonly displayedSuperGauge: [number, number] = [-1, -1];

  /** 強い攻撃の命中時に再生する、ユーザー提供の打撃音。 */
  private readonly hitStopSound = new Audio();

  /** 前回描画時のヒットストップ残りフレーム。音の重複再生を防ぐ。 */
  private previousHitStopFrames = 0;

  /** 前フレームに飛び道具Graphicsが存在したか。 */
  private hadProjectiles = false;

  /** 経過時間蓄積 */
  private accumulatorMs = 0;

  /** 一時停止フラグ */
  private paused = false;

  /** オンライン同期 */
  private online: OnlineFrameBridge | null = null;

  /** 現在のオンラインルーム接続。再試合時に同じルームを再利用する。 */
  private onlineClient: RoomClient | null = null;

  /** 自分のプレイヤー番号 */
  private onlinePlayer: 0 | 1 | null = null;

  /** 再試合ごとに増えるオンライン試合の世代番号。 */
  private onlineMatchEpoch = 0;

  /** P2が受け取った、次の再試合用の試合世代番号。 */
  private pendingOnlineRematchEpoch: number | null = null;

  /** 終了後の相手選択イベントを解除する関数。 */
  private removeMatchResultActionListener: (() => void) | null = null;

  /** P1からの再試合開始通知を解除する関数。 */
  private removeRematchStartListener: (() => void) | null = null;

  /** 自分が試合終了モーダルで選択した次の遷移。 */
  private localMatchResultAction: MatchResultAction | null = null;

  /** 相手が試合終了モーダルで選択した次の遷移。 */
  private remoteMatchResultAction: MatchResultAction | null = null;

  /** 同一試合で試合終了モーダルを重ねて開かないための状態。 */
  private matchResultMenuShown = false;

  /** P1が同じ試合で再試合開始通知を重複送信しないための状態。 */
  private rematchStartSent = false;

  /** P2が受信した再試合開始通知を、モーダル表示まで保持する状態。 */
  private onlineRematchStartReceived = false;

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
    resultNavigation: MatchResultNavigation | null = null,
  ): void {
    MatchScreen.gameData = data;
    MatchScreen.selectedCharacters = selectedCharacters;
    MatchScreen.training = training;
    MatchScreen.cpuLevel = cpuLevel;
    MatchScreen.resultNavigation = resultNavigation;
  }

  /**
   * コンストラクタ
   * ゲーム画面の初期化
   */
  public constructor() {
    super();

    const data = MatchScreen.gameData;
    if (!data) throw new Error("ゲームデータが初期化されていません");

    // 対戦中のCSV配列走査を避けるため、飛び道具の見た目をIDで索引化する。
    for (const definition of data.projectileDefinitions) {
      this.projectileDefinitionsById.set(definition.id, definition);
    }

    // 使用キャラクター決定
    const selectedCharacters = MatchScreen.selectedCharacters;
    if (!selectedCharacters) {
      throw new Error("対戦キャラクターが選択されていません");
    }

    this.training = MatchScreen.training;
    this.cpuLevel = MatchScreen.cpuLevel;
    // 公開URLを使って、Viteのbase URL配下でも効果音を正しく取得する。
    this.hitStopSound.src = this.gameAssetUrl(HIT_STOP_SOUND_PATH);
    this.hitStopSound.preload = "auto";
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
    this.comboText = this.createText("", 32, "#ffe58a");
    this.comboText.visible = false;
    this.superGaugeDigits = [
      this.createText("0", 24, "#ff6b78"),
      this.createText("0", 24, "#ff6b78"),
    ];
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
    this.trainingInputHistoryFrameText = new Text({
      text: "",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 17,
        fontWeight: "700",
        fill: "#9bc0de",
        stroke: { color: "#070b16", width: 3 },
        lineHeight: 31,
        align: "right",
      },
    });
    this.roundText.position.set(STAGE_WIDTH / 2, 18);
    // トレーニングはラウンド制を使わないため、ラウンド数のHUDを隠す。
    this.roundText.visible = !this.training;
    this.title.position.set(STAGE_WIDTH / 2, 55);
    this.info.position.set(STAGE_WIDTH / 2, 677);
    this.koText.position.set(STAGE_WIDTH / 2, 265);
    // 画面下部の操作説明の左右に、赤系統で統一した超必殺ゲージの百の位を置く。
    // P2はP1と鏡配置にし、数値をゲージの内側（画面中央側）へ寄せる。
    this.superGaugeDigits[0].position.set(36 + SUPER_GAUGE_BAR_WIDTH + 18, 649);
    this.superGaugeDigits[1].position.set(
      STAGE_WIDTH - 36 - SUPER_GAUGE_BAR_WIDTH - 18,
      649,
    );
    // 左列に経過フレーム、右列に入力を並べてコマンド入力の間隔を確認しやすくする。
    this.trainingInputHistoryFrameText.anchor.set(1, 0);
    this.trainingInputHistoryFrameText.position.set(76, 133);
    this.trainingInputHistoryFrameText.visible = false;
    this.trainingInputHistoryText.position.set(84, 128);
    this.trainingInputHistoryText.visible = false;

    // 描画順に追加
    this.world.addChild(
      this.stageArt,
      this.projectileArt,
      this.projectileSpriteLayer,
      this.fighterViews[0],
      this.fighterViews[1],
      this.trainingCollisionDebugArt,
      this.hudArt,
      this.trainingInputHistoryArt,
    );

    this.world.addChild(
      this.title,
      this.info,
      this.roundText,
      this.koText,
      this.comboText,
      this.superGaugeDigits[0],
      this.superGaugeDigits[1],
      this.trainingInputHistoryFrameText,
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
    this.trainingAutoSpecialGaugeRecoverySelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingInputHistorySelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingCollisionDebugSelect.addEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.topButton.addEventListener("click", this.leaveToTop);
    this.rematchButton.addEventListener("click", this.requestRematch);
    this.characterSelectButton.addEventListener(
      "click",
      this.requestCharacterSelect,
    );
    this.matchResultTopButton.addEventListener(
      "click",
      this.requestTopFromMatchResult,
    );
  }

  /**
   * オンライン対戦開始
   */
  public startOnline(client: RoomClient, matchEpoch = 0): void {
    if (client.player === null) return;
    // 外部通信由来の値でも安全に扱えるよう、非負整数だけを試合世代として採用する。
    const normalizedMatchEpoch =
      Number.isInteger(matchEpoch) && matchEpoch >= 0 ? matchEpoch : 0;

    // 同じ画面で再試合した場合も、古い入力購読を残さず新しい同期ブリッジへ差し替える。
    this.online?.destroy();
    this.removeMatchResultActionListener?.();
    this.removeRematchStartListener?.();

    // 通信の揺らぎに合わせて入力遅延を可変調整する同期ブリッジを開始する。
    this.online = new OnlineFrameBridge(
      client,
      FIGHTING_GAME_CONFIG.onlineSync,
      normalizedMatchEpoch,
    );
    this.onlineClient = client;
    this.onlinePlayer = client.player;
    this.onlineMatchEpoch = normalizedMatchEpoch;
    this.removeMatchResultActionListener = client.onMatchResultAction(
      this.receiveMatchResultAction,
    );
    this.removeRematchStartListener = client.onRematchStart(
      this.receiveOnlineRematchStart,
    );
    this.resetMatchState();
  }

  /**
   * オンライン対戦終了
   */
  public stopOnline(): void {
    this.online?.destroy();
    this.online = null;
    this.onlineClient = null;
    this.onlinePlayer = null;
    this.onlineMatchEpoch = 0;
    this.pendingOnlineRematchEpoch = null;
    this.removeMatchResultActionListener?.();
    this.removeMatchResultActionListener = null;
    this.removeRematchStartListener?.();
    this.removeRematchStartListener = null;
    this.resetMatchState();
  }

  /** 再試合・オンライン再接続で共有する、試合状態と表示キャッシュの初期化処理。 */
  private resetMatchState(): void {
    this.synchronizer.reset();
    this.simulation.resetMatch();
    // CPUのコマンド途中状態も消し、再試合を初回対戦と同じ条件で始める。
    this.cpu?.reset();
    this.previousHitStopFrames = 0;
    this.accumulatorMs = 0;
    this.paused = false;
    this.closeMatchResultMenu();
    this.fireworksLaunchedForMatch = false;
    this.localMatchResultAction = null;
    this.remoteMatchResultAction = null;
    this.rematchStartSent = false;
    this.onlineRematchStartReceived = false;
    this.pendingOnlineRematchEpoch = null;
    this.displayedHealth[0] = -1;
    this.displayedHealth[1] = -1;
    this.displayedSpecialGauge[0] = -1;
    this.displayedSpecialGauge[1] = -1;
    this.displayedSuperGauge[0] = -1;
    this.displayedSuperGauge[1] = -1;
    this.projectileArt.clear();
    this.clearProjectileSprites();
    this.hadProjectiles = false;
    this.matchResultFireworks.forEach((fireworksAtPoint) => {
      fireworksAtPoint.forEach((fireworks) => fireworks.stop(true));
    });
  }

  /**
   * 毎フレーム更新
   * 描画フレームとは独立して60FPSシミュレーションを実行
   */
  public update(time: Ticker): void {
    // Home は Esc と同じ固定キャンセル。停止中も監視して再開操作を受け付ける。
    if (this.input.consumeGamepadHomePress()) this.handleCancelInput();
    this.captureGamepadBinding();
    // 試合終了モーダル中のオンライン対戦だけは、遅れている相手が同じ終了フレームへ
    // 到達できるよう、ニュートラルを含む入力同期を継続する。
    if (this.paused && !(this.online && this.isMatchResultMenuOpen())) {
      return;
    }

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
    if (!this.isPauseMenuOpen() && !this.isMatchResultMenuOpen()) {
      this.paused = false;
    }
  }

  /** 終了処理 */
  public reset(): void {
    // 対戦画面を閉じる時は、再利用していた飛び道具PNGも確実に解放する。
    this.clearProjectileSprites();
    // 画面遷移時は残っている花火Canvasも停止・破棄する。
    this.matchResultFireworks.forEach((fireworksAtPoint) => {
      fireworksAtPoint.forEach((fireworks) => fireworks.stop(true));
    });
    // 画面遷移後に効果音だけが残らないよう停止し、ブラウザー側の音声リソースを解放する。
    this.hitStopSound.pause();
    this.hitStopSound.removeAttribute("src");
    this.hitStopSound.load();
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
    this.trainingAutoSpecialGaugeRecoverySelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingInputHistorySelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.trainingCollisionDebugSelect.removeEventListener(
      "change",
      this.updateTrainingCpuSettings,
    );
    this.topButton.removeEventListener("click", this.leaveToTop);
    this.rematchButton.removeEventListener("click", this.requestRematch);
    this.characterSelectButton.removeEventListener(
      "click",
      this.requestCharacterSelect,
    );
    this.matchResultTopButton.removeEventListener(
      "click",
      this.requestTopFromMatchResult,
    );
    this.online?.destroy();
    this.online = null;
    this.onlineClient = null;
    this.onlinePlayer = null;
    this.removeMatchResultActionListener?.();
    this.removeMatchResultActionListener = null;
    this.removeRematchStartListener?.();
    this.removeRematchStartListener = null;
    this.stopKeyBinding();
    this.closePauseMenu();
    this.closeMatchResultMenu();
    this.input.destroy();
  }

  /** ESCキーで一時停止メニューを開閉する。 */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== FIXED_CANCEL_KEY_CODE || event.repeat) return;
    event.preventDefault();
    this.handleCancelInput();
  };

  /** Esc と Xbox Home に共通するキャンセル・一時停止の遷移を処理する。 */
  private handleCancelInput(): void {
    if (this.keyBindingTarget) {
      this.stopKeyBinding();
      this.keyConfigStatus.textContent = "入力の変更を取り消しました。";
      return;
    }
    // 試合終了後は結果モーダルの選択を確定するまで、Esc/Homeで通常の一時停止を重ねない。
    if (this.isMatchResultMenuOpen()) return;
    if (!this.isPauseMenuOpen()) {
      this.openPauseMenu();
    } else if (this.isOptionsOpen()) {
      this.showMainMenu();
    } else {
      this.resumeMatch();
    }
  }

  /** 試合を停止して通常メニューを画面中央へ表示する。 */
  private openPauseMenu = (): void => {
    if (this.isMatchResultMenuOpen()) return;
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

      // Xbox はキーボードと別の保存設定を表示し、同じ待機操作で再割り当てする。
      const gamepadSection = document.createElement("div");
      gamepadSection.className = "key-config-gamepad";

      const gamepadHeading = document.createElement("h3");
      gamepadHeading.textContent = "XBOX CONTROLLER";
      gamepadSection.append(gamepadHeading);

      const gamepadBindings = document.createElement("div");
      gamepadBindings.className = "key-config-bindings";
      for (const { action, label } of KEYBOARD_ACTIONS) {
        const row = document.createElement("div");
        row.className = "key-config-row";

        const actionLabel = document.createElement("span");
        actionLabel.textContent = label;

        const gamepadButton = document.createElement("button");
        gamepadButton.type = "button";
        gamepadButton.className = "key-config-binding";
        gamepadButton.textContent = gamepadConfig
          .getBindings(player, action)
          .map(formatGamepadBinding)
          .join(" / ");
        gamepadButton.setAttribute(
          "aria-label",
          `PLAYER ${player + 1}の${label}: ${gamepadButton.textContent}`,
        );
        gamepadButton.addEventListener("click", () =>
          this.startKeyBinding({ player, action }, gamepadButton),
        );

        row.append(actionLabel, gamepadButton);
        gamepadBindings.append(row);
      }

      gamepadSection.append(gamepadBindings);
      group.append(bindings, gamepadSection);
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
    this.input.beginGamepadBindingCapture(target.player);

    const definition = getKeyboardActionDefinition(target.action);
    this.keyConfigStatus.textContent = `P${target.player + 1}の「${definition.label}」に割り当てるキーまたは Xbox コントローラーの入力を押してください。Esc または Home でキャンセルします。`;
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

  /** キーコンフィグ待機中の Xbox コントローラー入力を処理する。 */
  private captureGamepadBinding(): void {
    const target = this.keyBindingTarget;
    if (!target) return;

    const binding = this.input.consumeGamepadBindingCapture();
    if (!binding) return;

    const result = gamepadConfig.assign(target, binding);
    if (result.ok) {
      const definition = getKeyboardActionDefinition(target.action);
      const bindingName = formatGamepadBinding(binding);
      this.stopKeyBinding();
      this.renderKeyConfig();
      this.keyConfigStatus.textContent = `P${target.player + 1}の「${definition.label}」を ${bindingName} に設定しました。`;
      return;
    }

    if (result.reason === "duplicate" && result.conflictingTarget) {
      const definition = getKeyboardActionDefinition(
        result.conflictingTarget.action,
      );
      this.keyConfigStatus.textContent = `${formatGamepadBinding(binding)} は P${result.conflictingTarget.player + 1}の「${definition.label}」に設定済みです。別の入力を押してください。`;
      return;
    }

    this.keyConfigStatus.textContent =
      "Home は Esc と同じ固定キャンセル操作のため、割り当てできません。";
  }

  /** キー入力待機を終了し、イベント監視と見た目を元に戻す。 */
  private stopKeyBinding(): void {
    if (this.keyBindingTarget) {
      this.keyBindingTarget.button.classList.remove("is-waiting-for-key");
    }
    this.keyBindingTarget = null;
    this.input.endGamepadBindingCapture();
    window.removeEventListener("keydown", this.captureKeyBinding, true);
  }

  /** キー配置を標準状態へ戻し、設定一覧を描き直す。 */
  private resetKeyConfig = (): void => {
    this.stopKeyBinding();
    keyboardConfig.reset();
    gamepadConfig.reset();
    this.renderKeyConfig();
    this.keyConfigStatus.textContent =
      "キーボードと Xbox コントローラーの配置を初期設定に戻しました。";
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
    this.simulation.setTrainingAutoSpecialGaugeRecovery(
      this.trainingAutoSpecialGaugeRecoverySelect.value === "on",
    );
    this.setTrainingInputHistoryEnabled(
      this.trainingInputHistorySelect.value === "on",
    );
    this.setTrainingCollisionDebugEnabled(
      this.trainingCollisionDebugSelect.value === "on",
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
    this.trainingInputHistoryFrameText.text = "";
    this.trainingInputHistoryText.text = "";
    this.trainingInputHistoryFrameText.visible = nextEnabled;
    this.trainingInputHistoryText.visible = nextEnabled;
  }

  /** トレーニング用の被弾・攻撃判定表示を有効・無効化する。 */
  private setTrainingCollisionDebugEnabled(enabled: boolean): void {
    const nextEnabled = this.training && enabled;
    if (this.trainingCollisionDebugEnabled === nextEnabled) return;

    this.trainingCollisionDebugEnabled = nextEnabled;
    if (!nextEnabled) {
      this.trainingCollisionDebugArt.clear();
      return;
    }
    this.drawTrainingCollisionDebug();
  }

  /** 被弾判定を赤、技の有効中の攻撃判定を青の半透明ボックスで描画する。 */
  private drawTrainingCollisionDebug(): void {
    const art = this.trainingCollisionDebugArt;
    if (!this.trainingCollisionDebugEnabled) return;
    art.clear();

    for (const collision of this.simulation.getCollisionDebugBoxes()) {
      art
        .rect(
          collision.hurtbox.x,
          collision.hurtbox.y,
          collision.hurtbox.width,
          collision.hurtbox.height,
        )
        .fill({ color: 0xef4444, alpha: 0.2 })
        .stroke({ color: 0xff7373, width: 2, alpha: 0.9 });

      const attackbox = collision.attackbox;
      if (!attackbox) continue;
      art
        .rect(attackbox.x, attackbox.y, attackbox.width, attackbox.height)
        .fill({ color: 0x38bdf8, alpha: 0.2 })
        .stroke({ color: 0x7dd3fc, width: 2, alpha: 0.9 });
    }
  }

  /** P1の同一入力をまとめ、切替時に直前入力の継続フレームを確定する。 */
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
        InputButton.Special |
        InputButton.Throw);
    if (trackedButtons === this.previousTrainingInputButtons) {
      const currentEntry = this.trainingInputHistory[0];
      if (
        trackedButtons !== 0 &&
        currentEntry?.buttons === trackedButtons &&
        currentEntry.elapsedFrames < MAX_TRAINING_INPUT_ELAPSED_FRAMES
      ) {
        currentEntry.elapsedFrames += 1;
        this.renderTrainingInputHistory();
      }
      return;
    }

    this.previousTrainingInputButtons = trackedButtons;
    // ニュートラルへの復帰は表示せず、次の同一入力を再度記録できるようにする。
    if (trackedButtons === 0) return;

    this.trainingInputHistory.unshift({
      buttons: trackedButtons,
      // 切替直後は1Fとして始め、次の固定フレームから同一入力へ加算する。
      elapsedFrames: 1,
    });
    if (this.trainingInputHistory.length > MAX_TRAINING_INPUT_HISTORY) {
      this.trainingInputHistory.pop();
    }
    this.renderTrainingInputHistory();
  }

  /** 入力履歴を継続フレーム・矢印・攻撃名へ変換して、画面左端へ縦並びで描画する。 */
  private renderTrainingInputHistory(): void {
    const inputLines = this.trainingInputHistory.map((entry) =>
      this.formatTrainingInput(entry.buttons),
    );
    const frameLines = this.trainingInputHistory.map(
      (entry) => String(entry.elapsedFrames) + "F",
    );
    this.setTextIfChanged(
      this.trainingInputHistoryFrameText,
      frameLines.join("\n"),
    );
    this.setTextIfChanged(this.trainingInputHistoryText, inputLines.join("\n"));

    const panelHeight = Math.max(44, inputLines.length * 31 + 18);
    this.trainingInputHistoryArt.clear();
    this.trainingInputHistoryArt
      .roundRect(18, 116, 194, panelHeight, 8)
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
    if ((buttons & InputButton.Throw) !== 0) actions.push("投");
    return [direction, ...actions].filter(Boolean).join(" ");
  }

  private isPauseMenuOpen(): boolean {
    return !this.pauseMenu.classList.contains("is-hidden");
  }

  /** 試合終了後の再試合・遷移モーダルが表示中かを返す。 */
  private isMatchResultMenuOpen(): boolean {
    return !this.matchResultMenu.classList.contains("is-hidden");
  }

  /** 試合を終了し、画面遷移をMenuFlowへ委譲する。 */
  private leaveToTop = (): void => {
    this.closePauseMenu();
    MatchScreen.resultNavigation?.returnToTop();
  };

  /** 勝敗確定後に一度だけ、次の対戦先を選ぶモーダルを開く。 */
  private openMatchResultMenuIfNeeded(): void {
    if (
      this.training ||
      this.simulation.matchWinner === null ||
      this.matchResultMenuShown
    ) {
      return;
    }

    this.matchResultMenuShown = true;
    this.paused = true;
    this.accumulatorMs = 0;
    this.localMatchResultAction = null;
    this.rematchStartSent = false;
    this.rematchButton.disabled = false;
    this.characterSelectButton.disabled = false;
    this.matchResultTopButton.disabled = false;
    this.matchResultTitle.textContent = `P${this.simulation.matchWinner + 1} WINS THE MATCH`;
    this.matchResultStatus.textContent = "";
    this.matchResultMenu.classList.remove("is-hidden");
    this.matchResultMenu.setAttribute("aria-hidden", "false");
    this.rematchButton.focus();
    // 先に届いていた相手の選択も、モーダルを表示した時点で必ず反映する。
    this.applyStoredMatchResultAction();
  }

  /** 試合終了モーダルを閉じ、次の試合のために選択状態を初期化する。 */
  private closeMatchResultMenu(): void {
    this.matchResultMenu.classList.add("is-hidden");
    this.matchResultMenu.setAttribute("aria-hidden", "true");
    this.matchResultStatus.textContent = "";
    this.matchResultMenuShown = false;
  }

  /** 再試合の合意待ち中は、次の遷移が途中で変わらないよう全操作を固定する。 */
  private lockMatchResultChoices(): void {
    this.rematchButton.disabled = true;
    this.characterSelectButton.disabled = true;
    this.matchResultTopButton.disabled = true;
  }

  /** 再試合ボタンの操作を、ローカルまたはオンライン同期へ振り分ける。 */
  private requestRematch = (): void => {
    this.requestMatchResultAction("rematch");
  };

  /** キャラクター選択ボタンの操作を、ローカルまたはオンライン同期へ振り分ける。 */
  private requestCharacterSelect = (): void => {
    this.requestMatchResultAction("character-select");
  };

  /** Top画面へ戻るボタンの操作を、ローカルまたはオンライン同期へ振り分ける。 */
  private requestTopFromMatchResult = (): void => {
    this.requestMatchResultAction("top");
  };

  /**
   * 試合終了モーダルの操作を処理する。
   * オンラインの再試合だけは、双方が再試合を選ぶまで開始を保留する。
   */
  private requestMatchResultAction(action: MatchResultAction): void {
    if (!this.isMatchResultMenuOpen()) return;

    if (!this.onlineClient) {
      if (action === "rematch") {
        this.restartMatch();
      } else {
        this.finishMatchNavigation(action);
      }
      return;
    }

    this.localMatchResultAction = action;
    this.onlineClient.sendMatchResultAction(action, this.onlineMatchEpoch);

    if (action === "rematch") {
      this.lockMatchResultChoices();
      this.tryStartOnlineRematch();
      return;
    }

    // キャラクター選択・Topは、片方の選択を優先して両端末を同じ画面へ遷移させる。
    this.finishMatchNavigation(action);
  }

  /** 相手の試合終了モーダル操作を受け、同じ遷移へ同期する。 */
  private receiveMatchResultAction = (
    action: MatchResultAction,
    matchEpoch: number,
  ): void => {
    // 前試合の遅延イベントを、再試合後の選択として採用しない。
    if (matchEpoch !== this.onlineMatchEpoch) return;
    // こちらの同期フレームが数フレーム遅れていても選択を失わないよう、先に保持する。
    this.remoteMatchResultAction = action;
    this.applyStoredMatchResultAction();
  };

  /** 保持済みの相手選択を、結果モーダルの表示後に反映する。 */
  private applyStoredMatchResultAction(): void {
    if (!this.isMatchResultMenuOpen()) return;

    const action = this.remoteMatchResultAction;
    if (!action) return;
    if (action === "rematch") {
      if (this.localMatchResultAction === "rematch") {
        this.tryStartOnlineRematch();
      } else {
        this.matchResultStatus.textContent =
          "相手が再試合を希望しています。再試合を選ぶと開始します。";
      }
      return;
    }

    // 相手側のキャラクター選択・Topを優先し、片方だけが対戦画面に残らないようにする。
    this.finishMatchNavigation(action);
  }

  /**
   * 再試合を両者で合意した後の開始を制御する。
   * P1は開始通知を先に送信してから同期ブリッジを初期化し、P2はその通知を受けてから初期化する。
   */
  private tryStartOnlineRematch(): void {
    if (
      !this.onlineClient ||
      this.localMatchResultAction !== "rematch" ||
      this.remoteMatchResultAction !== "rematch"
    ) {
      return;
    }

    if (this.onlinePlayer === 0) {
      if (this.rematchStartSent) return;
      this.rematchStartSent = true;
      const nextMatchEpoch = this.onlineMatchEpoch + 1;
      // WebSocketの送信順を利用し、P2にはこの通知より先に新試合の入力が届かないようにする。
      this.onlineClient.sendRematchStart(nextMatchEpoch);
      this.restartMatch(nextMatchEpoch);
      return;
    }

    if (
      this.onlinePlayer === 1 &&
      this.onlineRematchStartReceived &&
      this.pendingOnlineRematchEpoch !== null
    ) {
      this.restartMatch(this.pendingOnlineRematchEpoch);
    } else {
      this.matchResultStatus.textContent = "相手の再試合開始を待っています。";
    }
  }

  /** P1からの開始通知を受けたP2だけが、同じキャラクターで再試合を開始する。 */
  private receiveOnlineRematchStart = (matchEpoch: number): void => {
    // 次世代以外の通知は、重複・遅延した古い開始通知として無視する。
    if (this.onlinePlayer !== 1 || matchEpoch !== this.onlineMatchEpoch + 1) {
      return;
    }

    // 終局表示より先に届いた場合も、選択通知と同様に保持してから合意後に開始する。
    this.pendingOnlineRematchEpoch = matchEpoch;
    this.onlineRematchStartReceived = true;
    this.tryStartOnlineRematch();
  };

  /** 再試合以外の遷移をMenuFlowへ委譲する。 */
  private finishMatchNavigation(
    action: Exclude<MatchResultAction, "rematch">,
  ): void {
    this.closeMatchResultMenu();
    if (action === "character-select") {
      MatchScreen.resultNavigation?.returnToCharacterSelect();
      return;
    }
    MatchScreen.resultNavigation?.returnToTop();
  }

  /** 同じキャラクター・カラー・CPU設定のまま、現在の対戦画面を初期化して再試合する。 */
  private restartMatch(matchEpoch = this.onlineMatchEpoch): void {
    if (this.training || !this.isMatchResultMenuOpen()) return;

    const client = this.onlineClient;
    this.closeMatchResultMenu();
    if (client) {
      this.startOnline(client, matchEpoch);
    } else {
      this.resetMatchState();
    }
    this.refreshViews();
  }

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
      right.health === this.displayedHealth[1] &&
      left.specialGauge === this.displayedSpecialGauge[0] &&
      right.specialGauge === this.displayedSpecialGauge[1] &&
      left.superGauge === this.displayedSuperGauge[0] &&
      right.superGauge === this.displayedSuperGauge[1]
    ) {
      return;
    }

    this.displayedHealth[0] = left.health;
    this.displayedHealth[1] = right.health;
    this.displayedSpecialGauge[0] = left.specialGauge;
    this.displayedSpecialGauge[1] = right.specialGauge;
    this.displayedSuperGauge[0] = left.superGauge;
    this.displayedSuperGauge[1] = right.superGauge;
    const art = this.hudArt;
    art.clear();

    this.drawHealthBar(
      48,
      45,
      470,
      left.health / left.character.maxHealth,
      left.character.primaryColor,
      left.character.colorVariant === "black",
      false,
    );
    this.drawHealthBar(
      STAGE_WIDTH - 48,
      45,
      470,
      right.health / right.character.maxHealth,
      right.character.primaryColor,
      right.character.colorVariant === "black",
      true,
    );
    // キャラクターカラーとは独立した固定色で、HPバー直下に必殺技ゲージを描画する。
    this.drawSpecialGauge(48, 74, 470, left.specialGauge, false);
    this.drawSpecialGauge(STAGE_WIDTH - 48, 74, 470, right.specialGauge, true);
    this.drawSuperGauge(36, 632, SUPER_GAUGE_BAR_WIDTH, left.superGauge);
    this.drawSuperGauge(
      STAGE_WIDTH - 36,
      632,
      SUPER_GAUGE_BAR_WIDTH,
      right.superGauge,
      true,
    );
    this.setTextIfChanged(
      this.superGaugeDigits[0],
      String(Math.floor(left.superGauge / SUPER_GAUGE_BAR_MAX)),
    );
    this.setTextIfChanged(
      this.superGaugeDigits[1],
      String(Math.floor(right.superGauge / SUPER_GAUGE_BAR_MAX)),
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
   * @param whiteOutline 黒系カラー用の白い境界線を表示するか
   * @param reverse 右側表示か
   */
  private drawHealthBar(
    x: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
    whiteOutline: boolean,
    reverse: boolean,
  ): void {
    const barX = reverse ? x - width : x;
    this.hudArt
      .roundRect(barX, y, width, 25, 7)
      .fill({ color: 0x030712, alpha: 0.85 });
    if (whiteOutline) {
      // 黒系の残量バーが夜景背景へ溶け込まないよう、外枠を白で強調する。
      this.hudArt.roundRect(barX, y, width, 25, 7).stroke({
        color: 0xffffff,
        width: 2,
        alpha: 0.95,
      });
    }
    const fillWidth = Math.max(0, Math.round((width - 6) * ratio));
    const fillX = reverse ? x - 3 - fillWidth : x + 3;
    this.hudArt.roundRect(fillX, y + 3, fillWidth, 19, 5).fill({ color });
  }

  /** 最大100の必殺技ゲージを、キャラクター色に依存しない黄色で描画する。 */
  private drawSpecialGauge(
    x: number,
    y: number,
    width: number,
    gauge: number,
    reverse: boolean,
  ): void {
    const barX = reverse ? x - width : x;
    this.hudArt
      .roundRect(barX, y, width, 11, 4)
      .fill({ color: 0x030712, alpha: 0.9 })
      .stroke({ color: 0xf7d04f, width: 1, alpha: 0.8 });
    const fillWidth = Math.max(
      0,
      Math.round(((width - 4) * gauge) / MAX_SPECIAL_GAUGE),
    );
    const fillX = reverse ? x - 2 - fillWidth : x + 2;
    this.hudArt
      .roundRect(fillX, y + 2, fillWidth, 7, 3)
      .fill({ color: 0xf7d04f });
  }

  /**
   * 最大300の超必殺ゲージを、右肩上がりの100単位グラフとして描画する。
   * P2側は図形・蓄積方向とも反転し、P1側と鏡配置にする。
   * 百の位はTextでバーの画面中央側へ表示し、バー自体は現在の100単位内の進捗を表す。
   */
  private drawSuperGauge(
    x: number,
    y: number,
    width: number,
    gauge: number,
    reverse = false,
  ): void {
    const barX = reverse ? x - width : x;
    const innerX = barX + 2;
    const innerWidth = width - 4;
    const height = 20;
    // 300到達時だけは、最終ストックが満タンであることをバーでも示す。
    const segmentGauge =
      gauge >= MAX_SUPER_GAUGE
        ? SUPER_GAUGE_BAR_MAX
        : gauge % SUPER_GAUGE_BAR_MAX;
    const fillWidth = Math.round(
      (innerWidth * segmentGauge) / SUPER_GAUGE_BAR_MAX,
    );
    const topAt = (pointX: number) => {
      const ratio = (pointX - innerX) / innerWidth;
      return reverse ? y + ratio * 8 : y + 8 - ratio * 8;
    };

    // 外枠を右肩上がりの四角形にし、P2では水平方向に反転してグラフの目盛りを重ねる。
    this.hudArt
      .moveTo(barX, y + height)
      .lineTo(barX + width, y + height)
      .lineTo(barX + width, topAt(barX + width))
      .lineTo(barX, topAt(barX))
      .closePath()
      .fill({ color: 0x19070b, alpha: 0.94 })
      .stroke({ color: 0xff6573, width: 2, alpha: 0.95 });

    for (const ratio of [0.25, 0.5, 0.75]) {
      const gridX = innerX + innerWidth * ratio;
      this.hudArt
        .moveTo(gridX, y + height - 2)
        .lineTo(gridX, topAt(gridX) + 2)
        .stroke({ color: 0xff6573, width: 1, alpha: 0.28 });
    }

    if (fillWidth <= 0) return;
    const fillStartX = reverse ? innerX + innerWidth - fillWidth : innerX;
    const fillEndX = reverse ? innerX + innerWidth : innerX + fillWidth;
    this.hudArt
      .moveTo(fillStartX, y + height - 2)
      .lineTo(fillEndX, y + height - 2)
      .lineTo(fillEndX, topAt(fillEndX) + 2)
      .lineTo(fillStartX, topAt(fillStartX) + 2)
      .closePath()
      .fill({ color: 0xe34452, alpha: 0.96 });
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
    this.drawTrainingCollisionDebug();
    this.drawProjectiles();
    this.drawHud();
    this.playHitStopSound();
    this.updateComboText();
    this.playMatchResultFireworks();
    this.openMatchResultMenuIfNeeded();
    if (!this.training) {
      this.setTextIfChanged(
        this.roundText,
        `ROUND ${this.simulation.round} / ${MAX_ROUNDS}`,
      );
    }
    let infoText = this.online
      ? `ONLINE P${(this.onlinePlayer ?? 0) + 1}  •  INPUT DELAY ${this.online.delayFrames}F  •  後ろ: 立ちガード / ↓+後ろ: しゃがみガード`
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

  /** 2段目以降の連続ヒット数を、攻撃側HPバーの中央寄り下へ表示する。 */
  private updateComboText(): void {
    const comboTarget = this.simulation.fighters.find(
      (fighter) => fighter.comboHitCount >= 2 && fighter.action === "hit",
    );
    if (!comboTarget) {
      this.comboText.visible = false;
      return;
    }

    const attacker = comboTarget.comboStarterPlayer;
    if (attacker === null) {
      this.comboText.visible = false;
      return;
    }
    this.comboText.visible = true;
    this.comboText.position.set(attacker === 0 ? 490 : STAGE_WIDTH - 490, 92);
    this.setTextIfChanged(this.comboText, `${comboTarget.comboHitCount} HIT`);
  }

  /** ヒットストップ開始の瞬間だけ、打撃効果音を先頭から再生する。 */
  private playHitStopSound(): void {
    const hitStopFrames = this.simulation.hitStopFrames;
    const started =
      hitStopFrames === HIT_STOP_FRAMES &&
      this.previousHitStopFrames !== HIT_STOP_FRAMES;
    this.previousHitStopFrames = hitStopFrames;
    if (!started) return;

    this.hitStopSound.currentTime = 0;
    // ブラウザーの自動再生制限で拒否された場合も、ゲーム進行を止めない。
    void this.hitStopSound.play().catch(() => undefined);
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

  /** projectiles.csv の定義に応じて、円形またはPNGの飛び道具を描画する。 */
  private drawProjectiles(): void {
    const projectiles = this.simulation.projectiles;
    if (projectiles.length === 0) {
      if (this.hadProjectiles) this.projectileArt.clear();
      this.hadProjectiles = false;
      this.clearProjectileSprites();
      return;
    }

    this.hadProjectiles = true;
    this.projectileArt.clear();
    const activeSpriteProjectiles = new Set<ProjectileState>();
    for (const projectile of projectiles) {
      const definition = this.projectileDefinitionsById.get(
        projectile.visualId,
      );
      if (!definition) continue;

      const x = projectile.x / 100;
      const y = projectile.y / 100;
      if (definition.renderType === "sprite") {
        activeSpriteProjectiles.add(projectile);
        const sprite = this.projectileSpriteFor(projectile, definition);
        sprite.position.set(x, y);
        continue;
      }

      this.projectileArt
        .circle(x, y, definition.outerRadius)
        .fill({ color: definition.outerColor, alpha: 0.16 });
      this.projectileArt
        .circle(x, y, definition.middleRadius)
        .fill({ color: definition.middleColor, alpha: 0.5 });
      this.projectileArt
        .circle(x, y, definition.coreRadius)
        .fill({ color: definition.coreColor });
    }
    this.removeInactiveProjectileSprites(activeSpriteProjectiles);
  }

  /** 指定飛び道具のPNGを一度だけ生成し、後続フレームでは再利用する。 */
  private projectileSpriteFor(
    projectile: ProjectileState,
    definition: ProjectileDefinition,
  ): Sprite {
    const existing = this.projectileSprites.get(projectile);
    if (existing) return existing;

    const sprite = Sprite.from(this.gameAssetUrl(definition.asset));
    sprite.anchor.set(0.5);
    sprite.width = definition.width;
    sprite.height = definition.height;
    this.projectileSpriteLayer.addChild(sprite);
    this.projectileSprites.set(projectile, sprite);
    return sprite;
  }

  /** 消滅済み・円形へ変更済みの飛び道具PNGだけを破棄する。 */
  private removeInactiveProjectileSprites(
    activeProjectiles: ReadonlySet<ProjectileState>,
  ): void {
    for (const [projectile, sprite] of this.projectileSprites) {
      if (activeProjectiles.has(projectile)) continue;
      sprite.destroy();
      this.projectileSprites.delete(projectile);
    }
  }

  /** 対戦終了時などに、保持中の飛び道具PNGをすべて破棄する。 */
  private clearProjectileSprites(): void {
    for (const sprite of this.projectileSprites.values()) sprite.destroy();
    this.projectileSprites.clear();
  }

  /** public配下のゲームアセットを、Viteの公開URLへ変換する。 */
  private gameAssetUrl(path: string): string {
    return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
  }
}
