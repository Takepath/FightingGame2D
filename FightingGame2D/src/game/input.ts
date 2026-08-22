import { type FrameInput, InputButton, type PlayerId } from "./types";
import {
  type ConfigurableInputAction,
  type ConfiguredGamepadBinding,
  FIGHTING_GAME_CONFIG,
} from "./gameConfig";

/** Escは常にキャンセルに使うため、キーコンフィグの対象外とする。 */
export const FIXED_CANCEL_KEY_CODE = "Escape";

/** Standard Gamepad APIのHome相当ボタンはEscと同じキャンセル操作に固定する。 */
export const FIXED_CANCEL_GAMEPAD_BUTTON_INDEX = 16;

/** キーコンフィグで変更できるキーボード操作の識別子。 */
export type KeyboardAction = ConfigurableInputAction;

/** キーコンフィグ画面と入力処理で共有する、操作項目の定義。 */
export interface KeyboardActionDefinition {
  /** 設定値として保存する操作ID。 */
  readonly action: KeyboardAction;
  /** 画面に表示する日本語名。 */
  readonly label: string;
  /** シミュレーションへ渡す入力ビット。 */
  readonly button: InputButton;
}

/** キーコンフィグの一覧に表示する操作項目。 */
export const KEYBOARD_ACTIONS: readonly KeyboardActionDefinition[] = [
  { action: "left", label: "左移動", button: InputButton.Left },
  { action: "right", label: "右移動", button: InputButton.Right },
  { action: "up", label: "ジャンプ", button: InputButton.Up },
  { action: "down", label: "しゃがみ", button: InputButton.Down },
  { action: "light", label: "弱攻撃", button: InputButton.Light },
  { action: "heavy", label: "強攻撃", button: InputButton.Heavy },
  { action: "special", label: "必殺技", button: InputButton.Special },
  { action: "throw", label: "投げ", button: InputButton.Throw },
] as const;

/** キー割り当ての対象となるプレイヤーと操作項目。 */
export interface KeyBindingTarget {
  readonly player: PlayerId;
  readonly action: KeyboardAction;
}

/**
 * Gamepad API の入力を保存する識別子。
 * button はボタン番号、axis はスティック軸番号と入力方向を表す。
 */
export type GamepadBinding = ConfiguredGamepadBinding;

/** キーの予約・修飾キーなど、割り当て不可の理由。 */
export type KeyBindingFailure = "reserved" | "modifier";

/** キー割り当て処理の結果。 */
export type KeyBindingResult =
  | { readonly ok: true; readonly swappedTarget?: KeyBindingTarget }
  | {
      readonly ok: false;
      readonly reason: KeyBindingFailure;
    };

type KeyboardBindings = Record<PlayerId, Record<KeyboardAction, string>>;

/** 1 つの操作へ複数のゲームパッド入力を割り当てるための内部形式。 */
type GamepadBindings = Record<
  PlayerId,
  Record<KeyboardAction, GamepadBinding[]>
>;

/** 文字列設定を毎フレーム正規表現解析しないための実行時形式。 */
type ParsedGamepadBinding =
  | { readonly kind: "button"; readonly index: number }
  | {
      readonly kind: "axis";
      readonly index: number;
      readonly direction: -1 | 1;
    };

/** 保存文字列ごとの解析結果。割り当て変更後も同じ文字列なら再利用できる。 */
const parsedGamepadBindingCache = new Map<
  GamepadBinding,
  ParsedGamepadBinding
>();

/** ブラウザに保存するキーコンフィグのキー。 */
const KEYBOARD_CONFIG_STORAGE_KEY = "fighting-game-2d.keyboard-config.v2";

/** ブラウザーに保存する汎用コントローラー設定のキー。 */
const GAMEPAD_CONFIG_STORAGE_KEY = "fighting-game-2d.gamepad-config.v1";

/** プレイヤー番号を安全に走査するための定数。 */
const PLAYERS: readonly PlayerId[] = [0, 1];

/** 向き反転専用として扱い、単独では割り当てない修飾キー。 */
const MODIFIER_KEY_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** 初回起動時・リセット時に用いる標準キー配置。 */
const DEFAULT_KEYBOARD_BINDINGS = FIGHTING_GAME_CONFIG.input.keyboardDefaults;

/**
 * Standard Gamepad API向けの初期配置。
 * 十字キーと左スティックを両方使えるよう、移動には二つの入力を登録する。
 */
const DEFAULT_GAMEPAD_BINDINGS = FIGHTING_GAME_CONFIG.input.gamepadDefaults;

/** 初期値を参照渡しせずに使うため、キー配置を複製する。 */
function cloneKeyboardBindings(): KeyboardBindings {
  return {
    0: { ...DEFAULT_KEYBOARD_BINDINGS[0] },
    1: { ...DEFAULT_KEYBOARD_BINDINGS[1] },
  };
}

/** 初期ゲームパッド配置を参照共有せずに複製する。 */
function cloneGamepadBindings(): GamepadBindings {
  const clonePlayerBindings = (player: PlayerId) =>
    Object.fromEntries(
      KEYBOARD_ACTIONS.map(({ action }) => [
        action,
        [...DEFAULT_GAMEPAD_BINDINGS[player][action]],
      ]),
    ) as Record<KeyboardAction, GamepadBinding[]>;

  return {
    0: clonePlayerBindings(0),
    1: clonePlayerBindings(1),
  };
}

/** JSONとして復元した値がオブジェクトかを確認する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 保存データまたは入力取得結果が有効なゲームパッド識別子かを確認する。 */
function isGamepadBinding(value: unknown): value is GamepadBinding {
  if (typeof value !== "string") return false;
  if (/^button:\d+$/.test(value)) return true;
  return /^axis:\d+:(-1|1)$/.test(value);
}

/**
 * 保存済みキー設定を現在の項目へ移行する。
 * 投げ追加前の設定では既存キーを維持し、未設定の投げだけを空きキーへ割り当てる。
 */
function migrateKeyboardBindings(value: unknown): KeyboardBindings | null {
  if (!isRecord(value)) return null;

  const bindings = cloneKeyboardBindings();
  const assignedCodes = new Set<string>();
  const storedThrow: Record<PlayerId, boolean> = { 0: false, 1: false };
  for (const player of PLAYERS) {
    const playerBindings = value[String(player)];
    if (!isRecord(playerBindings)) return null;

    for (const { action } of KEYBOARD_ACTIONS) {
      const code = playerBindings[action];
      // 旧バージョンには投げ項目がないため、この項目だけは後段で既定値を補う。
      if (action === "throw" && typeof code === "undefined") continue;
      if (
        typeof code !== "string" ||
        !isConfigurableKeyboardCode(code) ||
        assignedCodes.has(code)
      ) {
        return null;
      }
      assignedCodes.add(code);
      bindings[player][action] = code;
      if (action === "throw") storedThrow[player] = true;
    }
  }

  for (const player of PLAYERS) {
    // すでに保存済みの投げキーは、そのまま利用する。
    if (storedThrow[player]) continue;
    const defaultThrowCode = bindings[player].throw;
    if (!assignedCodes.has(defaultThrowCode)) {
      assignedCodes.add(defaultThrowCode);
      continue;
    }

    // 既存設定が標準の投げキーを使っていた場合も、競合しない代替キーを選ぶ。
    const alternatives =
      player === 0
        ? ["KeyR", "KeyT", "KeyY", "KeyU"]
        : ["Numpad0", "NumpadDecimal", "NumpadEnter"];
    const alternative = alternatives.find((code) => !assignedCodes.has(code));
    if (!alternative) return null;
    bindings[player].throw = alternative;
    assignedCodes.add(alternative);
  }

  return bindings;
}

/** localStorageからキー配置を復元し、壊れたデータは標準配置へ戻す。 */
function loadKeyboardBindings(): KeyboardBindings {
  try {
    if (typeof window === "undefined") return cloneKeyboardBindings();
    const stored = window.localStorage.getItem(KEYBOARD_CONFIG_STORAGE_KEY);
    if (!stored) return cloneKeyboardBindings();

    const parsed: unknown = JSON.parse(stored);
    const migrated = migrateKeyboardBindings(parsed);
    if (migrated) return migrated;
  } catch {
    // プライベートモードなどで保存領域を利用できない場合も標準配置で続行する。
  }

  return cloneKeyboardBindings();
}

/** localStorage に保存されたゲームパッド設定を現在の形式へ検証・復元する。 */
function migrateGamepadBindings(value: unknown): GamepadBindings | null {
  if (!isRecord(value)) return null;

  const bindings = cloneGamepadBindings();
  for (const player of PLAYERS) {
    const playerBindings = value[String(player)];
    if (!isRecord(playerBindings)) return null;

    const assignedBindings = new Set<GamepadBinding>();
    for (const { action } of KEYBOARD_ACTIONS) {
      const storedBindings = playerBindings[action];
      if (!Array.isArray(storedBindings) || storedBindings.length === 0) {
        return null;
      }
      const validBindings: GamepadBinding[] = [];
      for (const binding of storedBindings) {
        if (!isGamepadBinding(binding) || assignedBindings.has(binding)) {
          return null;
        }
        validBindings.push(binding);
        assignedBindings.add(binding);
      }

      bindings[player][action] = validBindings;
    }
  }

  return bindings;
}

/** localStorage からゲームパッド設定を安全に読み込む。 */
function loadGamepadBindings(): GamepadBindings {
  try {
    if (typeof window === "undefined") return cloneGamepadBindings();
    const stored = window.localStorage.getItem(GAMEPAD_CONFIG_STORAGE_KEY);
    if (!stored) return cloneGamepadBindings();

    const migrated = migrateGamepadBindings(JSON.parse(stored) as unknown);
    if (migrated) return migrated;
  } catch {
    // 保存値が壊れている場合は初期配置で安全に続行する。
  }

  return cloneGamepadBindings();
}

/** 操作ボタン名から定義を取り出す。 */
export function getKeyboardActionDefinition(
  action: KeyboardAction,
): KeyboardActionDefinition {
  const definition = KEYBOARD_ACTIONS.find((item) => item.action === action);
  if (!definition) throw new Error(`未定義のキー操作です: ${action}`);
  return definition;
}

/** Esc・修飾キー・未識別キーをキーコンフィグ対象から除外する。 */
export function isConfigurableKeyboardCode(code: string): boolean {
  return (
    code.length > 0 &&
    code !== "Unidentified" &&
    code !== FIXED_CANCEL_KEY_CODE &&
    !MODIFIER_KEY_CODES.has(code)
  );
}

/**
 * キーコンフィグの状態を管理する。
 * 設定変更は同じブラウザのlocalStorageへ即時保存され、次回起動後も引き継がれる。
 */
export class KeyboardConfig {
  /** 現在有効なキー配置。 */
  private bindings = loadKeyboardBindings();

  /** 指定プレイヤー・操作の現在のキーコードを返す。 */
  public getBinding(player: PlayerId, action: KeyboardAction): string {
    return this.bindings[player][action];
  }

  /** あるキーがすでに割り当てられている操作を返す。 */
  public findBinding(code: string): KeyBindingTarget | null {
    for (const player of PLAYERS) {
      for (const { action } of KEYBOARD_ACTIONS) {
        if (this.bindings[player][action] === code) return { player, action };
      }
    }
    return null;
  }

  /**
   * キーを操作へ割り当て、既存の割り当てなら両操作のキーを交換して保存する。
   * キーボードは1台を共有するため、P1・P2をまたいで交換する。
   */
  public assign(target: KeyBindingTarget, code: string): KeyBindingResult {
    if (code === FIXED_CANCEL_KEY_CODE) {
      return { ok: false, reason: "reserved" };
    }
    if (!isConfigurableKeyboardCode(code)) {
      return { ok: false, reason: "modifier" };
    }

    const previousCode = this.bindings[target.player][target.action];
    const existing = this.findBinding(code);
    if (
      existing &&
      (existing.player !== target.player || existing.action !== target.action)
    ) {
      this.bindings[existing.player][existing.action] = previousCode;
      this.bindings[target.player][target.action] = code;
      this.save();
      return { ok: true, swappedTarget: existing };
    }
    this.bindings[target.player][target.action] = code;
    this.save();
    return { ok: true };
  }

  /** すべてのキーボード操作を標準配置へ戻す。 */
  public reset(): void {
    this.bindings = cloneKeyboardBindings();
    this.save();
  }

  /** localStorageを利用可能な場合だけ、現在の配置を保存する。 */
  private save(): void {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          KEYBOARD_CONFIG_STORAGE_KEY,
          JSON.stringify(this.bindings),
        );
      }
    } catch {
      // 保存に失敗しても、この対戦中はメモリ上の設定をそのまま利用する。
    }
  }
}

/** アプリ全体で共有するキーコンフィグ。 */
export const keyboardConfig = new KeyboardConfig();

/** コントローラー割り当ての変更結果。 */
export interface GamepadBindingResult {
  readonly ok: true;
  /** すでに使われていた入力を、指定操作の従来入力と交換した相手。 */
  readonly swappedTarget?: KeyBindingTarget;
}

/**
 * Gamepad APIで取得できる、機種非依存のコントローラー入力配置を管理する。
 * コントローラーはP1・P2で別々の端末を使うため、交換対象は同一プレイヤー内だけにする。
 */
export class GamepadConfig {
  /** 現在有効なゲームパッド割り当て。 */
  private bindings = loadGamepadBindings();

  /** 指定した操作に割り当てられた全ゲームパッド入力を返す。 */
  public getBindings(
    player: PlayerId,
    action: KeyboardAction,
  ): readonly GamepadBinding[] {
    return this.bindings[player][action];
  }

  /** 同一プレイヤーで指定のゲームパッド入力を使う操作を検索する。 */
  public findBinding(
    player: PlayerId,
    binding: GamepadBinding,
  ): KeyBindingTarget | null {
    for (const { action } of KEYBOARD_ACTIONS) {
      if (this.bindings[player][action].includes(binding)) {
        return { player, action };
      }
    }
    return null;
  }

  /**
   * 操作へコントローラー入力を割り当てる。
   * 既存入力を選んだ場合は、同種（button/axis）の従来入力と交換して別操作を重複させない。
   * 未使用入力を選んだ場合は、明示的な再設定としてその操作を単一入力へ置き換える。
   */
  public assign(
    target: KeyBindingTarget,
    binding: GamepadBinding,
  ): GamepadBindingResult {
    const existing = this.findBinding(target.player, binding);
    if (existing && existing.action !== target.action) {
      const targetBindings = this.bindings[target.player][target.action];
      const targetBindingIndex = this.bindingToExchange(
        targetBindings,
        binding,
      );
      const previousBinding = targetBindings[targetBindingIndex];
      const existingBindings = this.bindings[existing.player][existing.action];
      const existingBindingIndex = existingBindings.indexOf(binding);
      if (!previousBinding || existingBindingIndex < 0) {
        throw new Error("コントローラー入力の交換対象が見つかりません");
      }

      targetBindings[targetBindingIndex] = binding;
      existingBindings[existingBindingIndex] = previousBinding;
      this.save();
      return { ok: true, swappedTarget: existing };
    }

    this.bindings[target.player][target.action] = [binding];
    this.save();
    return { ok: true };
  }

  /** すべてのゲームパッド配置を初期状態へ戻す。 */
  public reset(): void {
    this.bindings = cloneGamepadBindings();
    this.save();
  }

  /** 指定のゲームパッド状態から、操作に対応するボタンビットを生成する。 */
  public sample(player: PlayerId, gamepad: Gamepad): number {
    let buttons = 0;
    for (const { action, button } of KEYBOARD_ACTIONS) {
      if (
        this.bindings[player][action].some((binding) =>
          gamepadBindingDown(gamepad, binding),
        )
      ) {
        buttons |= button;
      }
    }
    return buttons;
  }

  /** 同じ種類の既存入力を優先し、移動のスティック／十字キー併用を保ったまま交換する。 */
  private bindingToExchange(
    bindings: readonly GamepadBinding[],
    incoming: GamepadBinding,
  ): number {
    const incomingKind = incoming.startsWith("button:") ? "button" : "axis";
    const sameKindIndex = bindings.findIndex((binding) =>
      binding.startsWith(`${incomingKind}:`),
    );
    return sameKindIndex >= 0 ? sameKindIndex : 0;
  }

  /** ゲームパッド配置をブラウザーへ保存する。 */
  private save(): void {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          GAMEPAD_CONFIG_STORAGE_KEY,
          JSON.stringify(this.bindings),
        );
      }
    } catch {
      // 保存に失敗しても、現在の対戦中は変更後の配置を使い続ける。
    }
  }
}

/** アプリ全体で共有する汎用コントローラー設定。 */
export const gamepadConfig = new GamepadConfig();

/** 機種固有のボタン名へ変換せず、Gamepad APIの入力値をそのまま表示する。 */
export function formatGamepadBinding(binding: GamepadBinding): string {
  return binding;
}

/** コントローラーのボタン状態を、押下・アナログ入力の両方から判定する。 */
function buttonDown(gamepad: Gamepad, index: number): boolean {
  return Boolean(
    gamepad.buttons[index]?.pressed ||
    (gamepad.buttons[index]?.value ?? 0) >
      FIGHTING_GAME_CONFIG.input.gamepad.buttonThreshold,
  );
}

/** 保存済みゲームパッド入力が現在押されているかを判定する。 */
function gamepadBindingDown(
  gamepad: Gamepad,
  binding: GamepadBinding,
): boolean {
  let parsed = parsedGamepadBindingCache.get(binding);
  if (!parsed) {
    const [kind, indexText, directionText] = binding.split(":");
    parsed =
      kind === "button"
        ? { kind, index: Number(indexText) }
        : {
            kind: "axis",
            index: Number(indexText),
            direction: directionText === "-1" ? -1 : 1,
          };
    parsedGamepadBindingCache.set(binding, parsed);
  }
  if (parsed.kind === "button") return buttonDown(gamepad, parsed.index);

  const value = gamepad.axes[parsed.index] ?? 0;
  const direction = parsed.direction;
  const threshold = FIGHTING_GAME_CONFIG.input.gamepad.axisThreshold;
  return direction < 0 ? value < -threshold : value > threshold;
}

/**
 * キーボードとGamepad API対応コントローラーの状態を、シミュレーション用入力へ変換する。
 * 後ろ入力は対戦ロジック側で立ち・しゃがみガードへ解釈する。
 * 向き反転キーと左右移動キーの同時入力は、設定済みのキー配置でも向き反転として扱う。
 */
export class InputManager {
  /** 現在押されているキーボードキー。 */
  private readonly heldKeys = new Set<string>();

  /** キーコンフィグでゲームパッド入力を待機しているプレイヤー。 */
  private gamepadCapturePlayer: PlayerId | null = null;

  /** 割り当て待機を始めた時点から押し続けられているゲームパッド入力。 */
  private gamepadCaptureHeld = new Set<GamepadBinding>();

  /** Home ボタンの前フレームの押下状態。押しっぱなしで連続キャンセルしないために使う。 */
  private gamepadHomeHeld = new Set<number>();

  /** Home押下の今回分を格納し、前回Setとの交換で毎フレーム割り当てを避ける。 */
  private gamepadHomeActive = new Set<number>();

  /** 接続順に並べたコントローラースナップショット。Gamepad APIの列挙を1回にまとめる。 */
  private readonly gamepadSnapshot: (Gamepad | null)[] = [];

  public constructor() {
    //====================================================
    // キーボードイベント登録
    //====================================================
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // ウィンドウ非アクティブ時は入力をリセット
    window.addEventListener("blur", this.clear);
    this.pollGamepads();
  }

  /** 描画更新の先頭でGamepad APIを一度だけ取得し、以降の入力処理で共有する。 */
  public pollGamepads(): void {
    this.gamepadSnapshot.length = 0;
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    for (const gamepad of navigator.getGamepads()) {
      // 接続済みだけを詰め、OSが空いたindexを残してもP1操作が不能にならないようにする。
      if (gamepad?.connected) this.gamepadSnapshot.push(gamepad);
    }
  }

  /** 指定プレイヤーの現在の入力をフレーム入力へ変換する。 */
  public sample(player: PlayerId): FrameInput {
    let buttons = 0;

    for (const { action, button } of KEYBOARD_ACTIONS) {
      // 向き反転キー単体では操作にせず、左右キーとの同時入力だけで扱う。
      if (this.heldKeys.has(keyboardConfig.getBinding(player, action))) {
        buttons |= button;
      }
    }

    const gamepad = this.gamepadForPlayer(player);
    if (gamepad?.connected) buttons |= this.sampleGamepad(player, gamepad);

    return { buttons };
  }

  /** 登録したブラウザイベントを解除する。 */
  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    this.gamepadCapturePlayer = null;
    this.gamepadCaptureHeld.clear();
    this.gamepadHomeHeld.clear();
    this.gamepadHomeActive.clear();
    this.gamepadSnapshot.length = 0;
  }

  /** 指定プレイヤーのゲームパッド入力を次回のキーコンフィグ変更として受け付ける。 */
  public beginGamepadBindingCapture(player: PlayerId): void {
    this.gamepadCapturePlayer = player;
    this.gamepadCaptureHeld = new Set(
      this.pressedGamepadBindings(
        player,
        FIGHTING_GAME_CONFIG.input.gamepad.captureAxisThreshold,
      ),
    );
  }

  /** ゲームパッド入力の割り当て待機を終了する。 */
  public endGamepadBindingCapture(): void {
    this.gamepadCapturePlayer = null;
    this.gamepadCaptureHeld.clear();
  }

  /**
   * 割り当て待機中に新しく押されたゲームパッド入力を一つ取得する。
   * Standard mappingのHomeはEscと同じ固定操作なので、ここでは割り当て対象にしない。
   * 非standard機器は各ボタン番号をそのまま登録できる。
   */
  public consumeGamepadBindingCapture(): GamepadBinding | null {
    const player = this.gamepadCapturePlayer;
    if (player === null) return null;

    const pressedBindings = this.pressedGamepadBindings(
      player,
      FIGHTING_GAME_CONFIG.input.gamepad.captureAxisThreshold,
    );
    const nextBinding = pressedBindings.find(
      (binding) =>
        !this.gamepadCaptureHeld.has(binding) &&
        !this.isFixedCancelGamepadBinding(player, binding),
    );
    this.gamepadCaptureHeld = new Set(pressedBindings);
    return nextBinding ?? null;
  }

  /**
   * Standard mappingのHome相当ボタンを立ち上がり時だけ返す。
   * 非standard機器のbutton:16を通常ボタンとして登録できるよう、mappingも確認する。
   */
  public consumeGamepadHomePress(): boolean {
    const activeHomeButtons = this.gamepadHomeActive;
    activeHomeButtons.clear();
    let pressedThisFrame = false;

    for (const gamepad of this.gamepadSnapshot) {
      if (!gamepad?.connected) continue;
      if (gamepad.mapping !== "standard") continue;
      if (!buttonDown(gamepad, FIXED_CANCEL_GAMEPAD_BUTTON_INDEX)) continue;
      activeHomeButtons.add(gamepad.index);
      if (!this.gamepadHomeHeld.has(gamepad.index)) pressedThisFrame = true;
    }

    this.gamepadHomeActive = this.gamepadHomeHeld;
    this.gamepadHomeHeld = activeHomeButtons;
    return pressedThisFrame;
  }

  /** ゲーム操作キーを記録し、ブラウザ標準操作を抑止する。 */
  private onKeyDown = (event: KeyboardEvent): void => {
    // ゲームで使用するキーはブラウザ既定動作を無効化
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.add(event.code);
  };

  /** 離されたゲーム操作キーを記録から外す。 */
  private onKeyUp = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.delete(event.code);
  };

  /** ウィンドウが非アクティブになった時に押下状態をリセットする。 */
  private clear = (): void => {
    this.heldKeys.clear();
  };

  /** 現在のキーコンフィグに含まれる操作キーかを判定する。 */
  private isGameKey(code: string): boolean {
    return PLAYERS.some((player) =>
      KEYBOARD_ACTIONS.some(
        ({ action }) => keyboardConfig.getBinding(player, action) === code,
      ),
    );
  }

  /** 指定プレイヤーに紐付くゲームパッドを安全に取得する。 */
  private gamepadForPlayer(player: PlayerId): Gamepad | null {
    return this.gamepadSnapshot[player] ?? null;
  }

  /** Standard mappingのbutton:16だけを固定キャンセル入力として扱う。 */
  private isFixedCancelGamepadBinding(
    player: PlayerId,
    binding: GamepadBinding,
  ): boolean {
    return (
      binding === `button:${FIXED_CANCEL_GAMEPAD_BUTTON_INDEX}` &&
      this.gamepadForPlayer(player)?.mapping === "standard"
    );
  }

  /** 指定プレイヤーのゲームパッドから、しきい値を超えた全入力を取り出す。 */
  private pressedGamepadBindings(
    player: PlayerId,
    axisThreshold: number,
  ): GamepadBinding[] {
    const gamepad = this.gamepadForPlayer(player);
    if (!gamepad?.connected) return [];

    const bindings: GamepadBinding[] = [];
    gamepad.buttons.forEach((button, index) => {
      if (
        button.pressed ||
        button.value > FIGHTING_GAME_CONFIG.input.gamepad.buttonThreshold
      ) {
        bindings.push(`button:${index}`);
      }
    });
    gamepad.axes.forEach((axis, index) => {
      if (axis < -axisThreshold) bindings.push(`axis:${index}:-1`);
      if (axis > axisThreshold) bindings.push(`axis:${index}:1`);
    });
    return bindings;
  }

  /** 機種を問わず、登録済みのGamepad API入力をゲーム内ボタンへ変換する。 */
  private sampleGamepad(player: PlayerId, gamepad: Gamepad): number {
    return gamepadConfig.sample(player, gamepad);
  }
}
