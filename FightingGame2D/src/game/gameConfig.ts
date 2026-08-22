import type { GameDataSourcePaths } from "./definitions";
import type { OnlineInputDelayOptions } from "./online";
import type { RoomLobbyOptions } from "./roomLobby";
import type { ColorVariant } from "./types";

/** キャラクター選択UIがレイアウトを保証する製品上限。 */
export const MAX_SUPPORTED_CHARACTERS = 25;

/** キーコンフィグで変更できるゲーム操作。 */
export type ConfigurableInputAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "light"
  | "heavy"
  | "special"
  | "throw";

/** Gamepad APIのボタン・軸を表す、初期割り当て用の識別子。 */
export type ConfiguredGamepadBinding =
  | `button:${number}`
  | `axis:${number}:${-1 | 1}`;

/** CPU Lv3の距離・行動頻度をキャラクターごとに調整する設定。 */
export interface CpuCharacterSettings {
  readonly preferredDistance: number;
  readonly retreatDistance: number;
  readonly heavyRange: number;
  readonly specialDistance: number;
  readonly specialInterval: number;
  readonly attackInterval: number;
  /** 未指定時は、そのキャラクターが使えるコマンド技から自動選択する。 */
  readonly specialMoveId?: string;
}

/** 画面デザインを変えずにゲーム内容・接続先を差し替えるための設定。 */
export interface FightingGameConfig {
  readonly engine: {
    readonly background: string;
    /** 決定論的同期の基準値。ゲーム要件上60から変更しない。 */
    readonly fixedFps: number;
    readonly resize: {
      readonly minWidth: number;
      readonly minHeight: number;
      readonly letterbox: boolean;
    };
  };
  readonly data: GameDataSourcePaths;
  readonly onlineRoom: RoomLobbyOptions;
  /** 通信状態に応じて自動調整するオンライン対戦の入力遅延設定。 */
  readonly onlineSync: OnlineInputDelayOptions;
  readonly characterSelect: {
    /** CSVに定義できるキャラクター数。選択画面は最大25体に対応する。 */
    readonly maxCharacters: number;
    /** カラー決定後にVS画面を表示する時間。 */
    readonly matchupDurationMs: number;
  };
  /** キャラクター選択後に表示する共通カラーと自動ずらし順。 */
  readonly colorSelect: {
    readonly order: readonly ColorVariant[];
    readonly palette: Readonly<
      Record<
        Exclude<ColorVariant, "default">,
        {
          readonly label: string;
          readonly primaryColor: number;
          readonly accentColor: number;
        }
      >
    >;
  };
  /** 全ブラウザーで一致させる、決定論的な対戦ルール。 */
  readonly match: {
    readonly stage: {
      readonly width: number;
      readonly height: number;
      readonly groundY: number;
      readonly wallPadding: number;
      readonly startX: readonly [number, number];
    };
    readonly physics: {
      readonly gravityPerFrame: number;
      readonly passThroughHeight: number;
      readonly airControlPercent: number;
      readonly airMovementSpeedPercent: number;
      readonly airDragPercent: number;
      readonly groundDragPercent: number;
      readonly backwardWalkRatio: number;
      readonly pushboxPadding: number;
    };
    readonly input: {
      readonly bufferFrames: number;
      readonly commandButtonGraceFrames: number;
      readonly chargeInputGapFrames: number;
    };
    readonly gauges: {
      readonly specialMax: number;
      readonly superMax: number;
      readonly specialRecoveryFrames: number;
    };
    readonly rounds: {
      readonly winsRequired: number;
      readonly timeSeconds: number;
      readonly introFrames: number;
      readonly resultFrames: number;
    };
    readonly combat: {
      readonly attackCenterFromGround: number;
      readonly projectileHitboxRadius: number;
      readonly projectileSpawnOffsetX: number;
      readonly projectileSpawnOffsetY: number;
      readonly throwTechKnockbackDistance: number;
      readonly throwTechKnockbackSpeed: number;
      readonly backThrowHeavyRangeMargin: number;
      readonly backThrowDamagePercent: number;
      readonly hitStopHitstunThreshold: number;
      readonly hitStopFrames: number;
      readonly lightCancelLimit: number;
      readonly heavyCancelLimit: number;
      readonly comboProration: {
        readonly fullDamageHits: number;
        readonly fullDamagePercent: number;
        readonly firstReducedHitPercent: number;
        readonly decayPerHitPercent: number;
        readonly minimumPercent: number;
      };
    };
  };
  /** シミュレーション結果を変えない、表示・演出用の設定。 */
  readonly presentation: {
    readonly maxCatchUpStepsPerRender: number;
    readonly maxFrameDeltaMs: number;
    readonly trainingInputHistoryLimit: number;
    readonly trainingInputElapsedFramesLimit: number;
    readonly superGaugeBarWidth: number;
    /** 色替えマスクの長辺上限。原寸PNGを常駐させず、表示品質とメモリを調整する。 */
    readonly spriteColorMaskMaxDimension: number;
    readonly hitStopSoundPath: string;
    readonly fireworks: {
      readonly count: number;
      readonly cleanupDelayMs: number;
      readonly hueLayers: readonly {
        readonly min: number;
        readonly max: number;
      }[];
      readonly particles: number;
      readonly explosion: number;
      readonly brightness: { readonly min: number; readonly max: number };
      readonly decay: { readonly min: number; readonly max: number };
      readonly friction: number;
      readonly gravity: number;
      readonly flickering: number;
      readonly opacity: number;
      readonly traceLength: number;
      readonly traceSpeed: number;
      readonly lineWidth: {
        readonly trace: { readonly min: number; readonly max: number };
        readonly explosion: { readonly min: number; readonly max: number };
      };
    };
  };
  /** CPUの判断間隔と、キャラクター別Lv3テンプレート。 */
  readonly cpu: {
    readonly levels: {
      readonly one: {
        readonly approachDistance: number;
        readonly attackInterval: number;
      };
      readonly two: {
        readonly approachDistance: number;
        readonly retreatDistance: number;
        readonly retreatCycleFrames: number;
        readonly retreatInputFrames: number;
        readonly heavyRange: number;
        readonly heavyInterval: number;
        readonly lightRange: number;
        readonly lightInterval: number;
      };
      readonly three: {
        readonly approachMargin: number;
        readonly retreatCycleFrames: number;
        readonly retreatInputFrames: number;
        readonly minimumLightInterval: number;
        readonly lightIntervalOffset: number;
      };
    };
    readonly training: {
      readonly randomMoveInterval: number;
      readonly randomJumpInterval: number;
      readonly alwaysJumpInterval: number;
      readonly randomJumpChanceDivisor: number;
      readonly attackInterval: number;
    };
    readonly characters: Readonly<Record<string, CpuCharacterSettings>>;
  };
  /** 初回起動・リセット時の入力割り当てとGamepadしきい値。 */
  readonly input: {
    readonly keyboardDefaults: Readonly<
      Record<0 | 1, Readonly<Record<ConfigurableInputAction, string>>>
    >;
    readonly gamepadDefaults: Readonly<
      Record<
        0 | 1,
        Readonly<
          Record<ConfigurableInputAction, readonly ConfiguredGamepadBinding[]>
        >
      >
    >;
    readonly gamepad: {
      readonly buttonThreshold: number;
      readonly axisThreshold: number;
      readonly captureAxisThreshold: number;
    };
  };
}

/** SSRや静的検査でもwindow参照で失敗しない、同一オリジンのルームURLを返す。 */
function defaultRoomEndpoint(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1:5173/room";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/room`;
}

/** P1・P2で共通利用するStandard Gamepad配置を、参照共有せず設定へ展開する。 */
const DEFAULT_GAMEPAD_PLAYER_BINDINGS = {
  left: ["axis:0:-1", "button:14"],
  right: ["axis:0:1", "button:15"],
  up: ["axis:1:-1", "button:12"],
  down: ["axis:1:1", "button:13"],
  light: ["button:0"],
  heavy: ["button:2"],
  special: ["button:1"],
  throw: ["button:7"],
} as const satisfies Readonly<
  Record<ConfigurableInputAction, readonly ConfiguredGamepadBinding[]>
>;

/** 固定60FPSを秒単位の速度へ換算するための基準値。 */
const FIXED_FPS = 60;
/** 描画・シミュレーション・リサイズで共有する基準解像度。 */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

/**
 * ユーザー編集データ以外の設定を集約する唯一の場所。
 * キャラクター・技・コマンド・飛び道具はpublic/dataのCSVで管理し、
 * 全キャラクターへ共通するルール・表示・CPU・初期入力だけをここで管理する。
 */
export const FIGHTING_GAME_CONFIG: FightingGameConfig = {
  engine: {
    background: "#080d1c",
    fixedFps: FIXED_FPS,
    resize: {
      minWidth: STAGE_WIDTH,
      minHeight: STAGE_HEIGHT,
      letterbox: false,
    },
  },
  data: {
    charactersCsv: "data/characters.csv",
    movesCsv: "data/moves.csv",
    commandsCsv: "data/commands.csv",
    projectilesCsv: "data/projectiles.csv",
  },
  onlineRoom: {
    // Viteとルームサーバーは同じ環境変数からこの値を受け取り、上下限の不一致を防ぐ。
    minPassphraseLength: __ROOM_MIN_PASSPHRASE_LENGTH__,
    maxPassphraseLength: __ROOM_MAX_PASSPHRASE_LENGTH__,
    endpoint: defaultRoomEndpoint(),
  },
  onlineSync: {
    initialFrames: 6,
    minFrames: 3,
    maxFrames: 15,
    decreaseAfterStableFrames: 240,
    maxFutureFrameLead: 120,
  },
  characterSelect: {
    maxCharacters: MAX_SUPPORTED_CHARACTERS,
    matchupDurationMs: 1800,
  },
  colorSelect: {
    order: ["default", "black", "red", "yellow", "white"],
    palette: {
      black: { label: "黒系", primaryColor: 0x1b2432, accentColor: 0x7d8ba1 },
      red: { label: "赤系", primaryColor: 0xcf354a, accentColor: 0xffb0b7 },
      yellow: {
        label: "黄色系",
        primaryColor: 0xe1b71b,
        accentColor: 0xfff1a2,
      },
      white: { label: "白系", primaryColor: 0xeaf0fa, accentColor: 0x788cae },
    },
  },
  match: {
    stage: {
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      groundY: 570,
      wallPadding: 68,
      startX: [360, 920],
    },
    physics: {
      gravityPerFrame: 78,
      passThroughHeight: 96,
      airControlPercent: 22,
      airMovementSpeedPercent: 82,
      airDragPercent: 97,
      groundDragPercent: 84,
      backwardWalkRatio: 1 / 3,
      pushboxPadding: 8,
    },
    input: {
      bufferFrames: 5,
      commandButtonGraceFrames: 6,
      chargeInputGapFrames: 4,
    },
    gauges: {
      specialMax: 100,
      superMax: 300,
      specialRecoveryFrames: FIXED_FPS,
    },
    rounds: {
      winsRequired: 2,
      timeSeconds: 99,
      introFrames: FIXED_FPS * 2,
      resultFrames: FIXED_FPS * 4,
    },
    combat: {
      attackCenterFromGround: 86,
      projectileHitboxRadius: 14,
      projectileSpawnOffsetX: 64,
      projectileSpawnOffsetY: 82,
      throwTechKnockbackDistance: 120,
      throwTechKnockbackSpeed: 780,
      backThrowHeavyRangeMargin: 12,
      backThrowDamagePercent: 80,
      hitStopHitstunThreshold: 30,
      hitStopFrames: 5,
      lightCancelLimit: 2,
      heavyCancelLimit: 1,
      comboProration: {
        fullDamageHits: 2,
        fullDamagePercent: 100,
        firstReducedHitPercent: 80,
        decayPerHitPercent: 10,
        minimumPercent: 10,
      },
    },
  },
  presentation: {
    maxCatchUpStepsPerRender: 5,
    maxFrameDeltaMs: 250,
    trainingInputHistoryLimit: 8,
    trainingInputElapsedFramesLimit: 99,
    superGaugeBarWidth: 190,
    spriteColorMaskMaxDimension: 768,
    hitStopSoundPath: "data/sounds/slap-1.mp3",
    fireworks: {
      count: 3,
      cleanupDelayMs: 8000,
      hueLayers: [
        { min: 320, max: 350 },
        { min: 270, max: 300 },
        { min: 25, max: 48 },
      ],
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
    },
  },
  cpu: {
    levels: {
      one: {
        approachDistance: 118,
        attackInterval: 54,
      },
      two: {
        approachDistance: 164,
        retreatDistance: 72,
        retreatCycleFrames: 42,
        retreatInputFrames: 14,
        heavyRange: 140,
        heavyInterval: 78,
        lightRange: 118,
        lightInterval: 34,
      },
      three: {
        approachMargin: 22,
        retreatCycleFrames: 32,
        retreatInputFrames: 20,
        minimumLightInterval: 14,
        lightIntervalOffset: 6,
      },
    },
    training: {
      randomMoveInterval: 75,
      randomJumpInterval: 90,
      alwaysJumpInterval: 12,
      randomJumpChanceDivisor: 3,
      attackInterval: 42,
    },
    characters: {
      default: {
        preferredDistance: 142,
        retreatDistance: 72,
        heavyRange: 136,
        specialDistance: 280,
        specialInterval: 180,
        attackInterval: 28,
      },
      blender_hero: {
        preferredDistance: 166,
        retreatDistance: 76,
        heavyRange: 152,
        specialDistance: 250,
        specialInterval: 132,
        attackInterval: 24,
        specialMoveId: "gowasu",
      },
      stickMan: {
        preferredDistance: 124,
        retreatDistance: 62,
        heavyRange: 142,
        specialDistance: 310,
        specialInterval: 196,
        attackInterval: 20,
        specialMoveId: "fire",
      },
      crocodile_soldier: {
        preferredDistance: 150,
        retreatDistance: 76,
        heavyRange: 144,
        specialDistance: 270,
        specialInterval: 150,
        attackInterval: 25,
        specialMoveId: "takenoko",
      },
    },
  },
  input: {
    keyboardDefaults: {
      0: {
        left: "KeyA",
        right: "KeyD",
        up: "KeyW",
        down: "KeyS",
        light: "KeyF",
        heavy: "KeyG",
        special: "KeyH",
        throw: "Space",
      },
      1: {
        left: "ArrowLeft",
        right: "ArrowRight",
        up: "ArrowUp",
        down: "ArrowDown",
        light: "Numpad1",
        heavy: "Numpad2",
        special: "Numpad3",
        throw: "Numpad0",
      },
    },
    gamepadDefaults: {
      0: DEFAULT_GAMEPAD_PLAYER_BINDINGS,
      1: DEFAULT_GAMEPAD_PLAYER_BINDINGS,
    },
    gamepad: {
      buttonThreshold: 0.5,
      axisThreshold: 0.45,
      captureAxisThreshold: 0.7,
    },
  },
};

/** 将来設定項目が増えてもNaN/Infinityを見逃さないよう、数値を再帰検査する。 */
function findNonFiniteNumber(value: unknown, path: string): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? null : path;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const invalidPath = findNonFiniteNumber(
        value[index],
        `${path}[${index}]`,
      );
      if (invalidPath) return invalidPath;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const invalidPath = findNonFiniteNumber(child, `${path}.${key}`);
    if (invalidPath) return invalidPath;
  }
  return null;
}

/** 起動前に設定間の不整合を検出し、決定論が崩れた状態で対戦を始めない。 */
export function validateFightingGameConfig(config: FightingGameConfig): void {
  const nonFinitePath = findNonFiniteNumber(config, "gameConfig");
  if (nonFinitePath) {
    throw new Error(`${nonFinitePath} は有限の数値にしてください`);
  }
  if (config.engine.fixedFps !== 60) {
    throw new Error("engine.fixedFps は決定論的同期のため60に固定してください");
  }
  if (
    config.engine.resize.minWidth < 1 ||
    config.engine.resize.minHeight < 1 ||
    config.characterSelect.matchupDurationMs < 0
  ) {
    throw new Error("engine.resize と characterSelect の表示設定が不正です");
  }
  if (
    !Number.isInteger(config.characterSelect.maxCharacters) ||
    config.characterSelect.maxCharacters < 2 ||
    config.characterSelect.maxCharacters > MAX_SUPPORTED_CHARACTERS
  ) {
    throw new Error(
      `characterSelect.maxCharacters は2〜${MAX_SUPPORTED_CHARACTERS}にしてください`,
    );
  }
  if (
    config.match.stage.width <= 0 ||
    config.match.stage.height <= 0 ||
    config.match.stage.groundY <= 0 ||
    config.match.stage.groundY >= config.match.stage.height ||
    config.match.stage.wallPadding < 0 ||
    config.match.stage.startX.some(
      (x) =>
        x <= config.match.stage.wallPadding ||
        x >= config.match.stage.width - config.match.stage.wallPadding,
    ) ||
    config.match.stage.startX[0] >= config.match.stage.startX[1]
  ) {
    throw new Error(
      "match.stage の幅・高さ・地面・壁・開始位置を有効な範囲にしてください",
    );
  }
  const physics = config.match.physics;
  if (
    physics.gravityPerFrame < 0 ||
    physics.passThroughHeight < 0 ||
    physics.airControlPercent < 0 ||
    physics.airControlPercent > 100 ||
    physics.airMovementSpeedPercent < 0 ||
    physics.airDragPercent < 0 ||
    physics.airDragPercent > 100 ||
    physics.groundDragPercent < 0 ||
    physics.groundDragPercent > 100 ||
    physics.backwardWalkRatio < 0 ||
    physics.backwardWalkRatio > 1 ||
    physics.pushboxPadding < 0
  ) {
    throw new Error("match.physics の速度・比率・判定余白が不正です");
  }
  if (
    !Number.isInteger(config.match.input.bufferFrames) ||
    config.match.input.bufferFrames < 0 ||
    !Number.isInteger(config.match.input.commandButtonGraceFrames) ||
    config.match.input.commandButtonGraceFrames < 0 ||
    !Number.isInteger(config.match.input.chargeInputGapFrames) ||
    config.match.input.chargeInputGapFrames < 0
  ) {
    throw new Error("match.input の各フレーム数は0以上にしてください");
  }
  if (
    !Number.isInteger(config.match.gauges.specialMax) ||
    config.match.gauges.specialMax < 1 ||
    !Number.isInteger(config.match.gauges.superMax) ||
    config.match.gauges.superMax < 1 ||
    !Number.isInteger(config.match.gauges.specialRecoveryFrames) ||
    config.match.gauges.specialRecoveryFrames < 1
  ) {
    throw new Error("match.gauges の最大値・回復間隔が不正です");
  }
  if (
    !Number.isInteger(config.match.rounds.winsRequired) ||
    config.match.rounds.winsRequired < 1 ||
    !Number.isInteger(config.match.rounds.timeSeconds) ||
    config.match.rounds.timeSeconds < 1 ||
    !Number.isInteger(config.match.rounds.introFrames) ||
    config.match.rounds.introFrames < 0 ||
    !Number.isInteger(config.match.rounds.resultFrames) ||
    config.match.rounds.resultFrames < 0
  ) {
    throw new Error("match.rounds の勝利数・時間・演出フレームが不正です");
  }
  if (!config.cpu.characters.default) {
    throw new Error("cpu.characters.default を定義してください");
  }
  const cpuIntervals = [
    config.cpu.levels.one.attackInterval,
    config.cpu.levels.two.retreatCycleFrames,
    config.cpu.levels.two.retreatInputFrames,
    config.cpu.levels.two.heavyInterval,
    config.cpu.levels.two.lightInterval,
    config.cpu.levels.three.retreatCycleFrames,
    config.cpu.levels.three.retreatInputFrames,
    config.cpu.levels.three.minimumLightInterval,
    config.cpu.training.randomMoveInterval,
    config.cpu.training.randomJumpInterval,
    config.cpu.training.alwaysJumpInterval,
    config.cpu.training.randomJumpChanceDivisor,
    config.cpu.training.attackInterval,
  ];
  if (cpuIntervals.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error("cpu の判断間隔・周期は1以上の整数にしてください");
  }
  const cpuDistances = [
    config.cpu.levels.one.approachDistance,
    config.cpu.levels.two.approachDistance,
    config.cpu.levels.two.retreatDistance,
    config.cpu.levels.two.heavyRange,
    config.cpu.levels.two.lightRange,
    config.cpu.levels.three.approachMargin,
  ];
  if (
    cpuDistances.some((value) => value < 0) ||
    config.cpu.levels.two.retreatInputFrames >
      config.cpu.levels.two.retreatCycleFrames ||
    config.cpu.levels.three.retreatInputFrames >
      config.cpu.levels.three.retreatCycleFrames ||
    !Number.isInteger(config.cpu.levels.three.lightIntervalOffset) ||
    config.cpu.levels.three.lightIntervalOffset < 0
  ) {
    throw new Error("cpu.levels の距離・入力期間・間隔補正が不正です");
  }
  const proration = config.match.combat.comboProration;
  if (
    !Number.isInteger(proration.fullDamageHits) ||
    proration.fullDamageHits < 1 ||
    proration.fullDamagePercent < proration.firstReducedHitPercent ||
    proration.firstReducedHitPercent < proration.minimumPercent ||
    proration.minimumPercent < 1 ||
    proration.decayPerHitPercent < 0
  ) {
    throw new Error("match.combat.comboProration の補正率設定が不正です");
  }
  if (
    config.match.combat.projectileHitboxRadius <= 0 ||
    config.match.combat.throwTechKnockbackDistance < 0 ||
    config.match.combat.throwTechKnockbackSpeed < 0 ||
    config.match.combat.backThrowHeavyRangeMargin < 0 ||
    config.match.combat.backThrowDamagePercent < 0 ||
    config.match.combat.backThrowDamagePercent > 100 ||
    !Number.isInteger(config.match.combat.hitStopHitstunThreshold) ||
    config.match.combat.hitStopHitstunThreshold < 0 ||
    !Number.isInteger(config.match.combat.hitStopFrames) ||
    config.match.combat.hitStopFrames < 0 ||
    !Number.isInteger(config.match.combat.lightCancelLimit) ||
    config.match.combat.lightCancelLimit < 0 ||
    !Number.isInteger(config.match.combat.heavyCancelLimit) ||
    config.match.combat.heavyCancelLimit < 0
  ) {
    throw new Error("match.combat のダメージ比率・フレーム・回数が不正です");
  }
  for (const [characterId, settings] of Object.entries(config.cpu.characters)) {
    if (
      settings.preferredDistance < 0 ||
      settings.retreatDistance < 0 ||
      settings.heavyRange < 0 ||
      settings.specialDistance < 0 ||
      !Number.isInteger(settings.specialInterval) ||
      settings.specialInterval < 1 ||
      !Number.isInteger(settings.attackInterval) ||
      settings.attackInterval < 1
    ) {
      throw new Error(
        `cpu.characters.${characterId} の距離・間隔設定が不正です`,
      );
    }
  }
  if (
    config.onlineRoom.minPassphraseLength < 1 ||
    config.onlineRoom.minPassphraseLength >
      config.onlineRoom.maxPassphraseLength
  ) {
    throw new Error(
      "合言葉の最小文字数は1以上かつ最大文字数以下にしてください",
    );
  }
  if (
    !Number.isInteger(config.onlineSync.minFrames) ||
    !Number.isInteger(config.onlineSync.initialFrames) ||
    !Number.isInteger(config.onlineSync.maxFrames) ||
    !Number.isInteger(config.onlineSync.decreaseAfterStableFrames) ||
    !Number.isInteger(config.onlineSync.maxFutureFrameLead) ||
    config.onlineSync.minFrames < 1 ||
    config.onlineSync.initialFrames < config.onlineSync.minFrames ||
    config.onlineSync.initialFrames > config.onlineSync.maxFrames ||
    config.onlineSync.decreaseAfterStableFrames < 1 ||
    config.onlineSync.maxFutureFrameLead < config.onlineSync.maxFrames
  ) {
    throw new Error(
      "onlineSync は 1 <= minFrames <= initialFrames <= maxFrames <= maxFutureFrameLead にしてください",
    );
  }
  const gamepad = config.input.gamepad;
  if (
    gamepad.buttonThreshold < 0 ||
    gamepad.buttonThreshold > 1 ||
    gamepad.axisThreshold <= 0 ||
    gamepad.axisThreshold > 1 ||
    gamepad.captureAxisThreshold <= 0 ||
    gamepad.captureAxisThreshold > 1
  ) {
    throw new Error("input.gamepad のしきい値は0〜1の範囲にしてください");
  }
  const fireworks = config.presentation.fireworks;
  if (
    !Number.isInteger(config.presentation.maxCatchUpStepsPerRender) ||
    config.presentation.maxCatchUpStepsPerRender < 1 ||
    config.presentation.maxFrameDeltaMs <= 0 ||
    !Number.isInteger(config.presentation.trainingInputHistoryLimit) ||
    config.presentation.trainingInputHistoryLimit < 1 ||
    !Number.isInteger(config.presentation.trainingInputElapsedFramesLimit) ||
    config.presentation.trainingInputElapsedFramesLimit < 1 ||
    config.presentation.superGaugeBarWidth <= 0 ||
    !Number.isInteger(config.presentation.spriteColorMaskMaxDimension) ||
    config.presentation.spriteColorMaskMaxDimension < 64 ||
    !Number.isInteger(fireworks.count) ||
    fireworks.count < 1 ||
    fireworks.cleanupDelayMs < 0 ||
    fireworks.hueLayers.length < 1 ||
    fireworks.particles < 1 ||
    fireworks.explosion < 1 ||
    fireworks.opacity < 0 ||
    fireworks.opacity > 1
  ) {
    throw new Error("presentation の更新上限・表示・花火設定が不正です");
  }
}
