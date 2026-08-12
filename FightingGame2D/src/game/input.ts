import { type FrameInput, InputButton, type PlayerId } from "./types";

<<<<<<< HEAD
/** Escは常にキャンセルに使うため、キーコンフィグの対象外とする。 */
export const FIXED_CANCEL_KEY_CODE = "Escape";

/** キーコンフィグで変更できるキーボード操作の識別子。 */
export type KeyboardAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "light"
  | "heavy"
  | "special"
  | "turn";

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
  // 向き反転は左右移動キーとの同時入力時だけ、InputButton.Turnへ変換する。
  { action: "turn", label: "向き反転", button: InputButton.Turn },
] as const;

/** キー割り当ての対象となるプレイヤーと操作項目。 */
export interface KeyBindingTarget {
  readonly player: PlayerId;
  readonly action: KeyboardAction;
}

/** キーの重複・予約キーなど、割り当て不可の理由。 */
export type KeyBindingFailure = "reserved" | "modifier" | "duplicate";

/** キー割り当て処理の結果。 */
export type KeyBindingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: KeyBindingFailure;
      readonly conflictingTarget?: KeyBindingTarget;
    };

type KeyboardBindings = Record<PlayerId, Record<KeyboardAction, string>>;

/** ブラウザに保存するキーコンフィグのキー。 */
const KEYBOARD_CONFIG_STORAGE_KEY = "fighting-game-2d.keyboard-config.v2";

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
const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
=======
/**
 * キーボード操作割り当て
 *
 * Player0
 *  A D W S : 移動
 *  F G H   : 攻撃
 *  Q       : ガード
 *
 * Player1
 *  矢印キー : 移動
 *  テンキー1,2,3 : 攻撃
 *  テンキー0     : ガード
 */
const keyboardBindings: Record<PlayerId, Record<string, InputButton>> = {
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  0: {
    left: "KeyA",
    right: "KeyD",
    up: "KeyW",
    down: "KeyS",
    light: "KeyF",
    heavy: "KeyG",
    special: "KeyH",
    turn: "ShiftLeft",
  },
  1: {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    light: "Numpad1",
    heavy: "Numpad2",
    special: "Numpad3",
    turn: "ShiftRight",
  },
};

<<<<<<< HEAD
/** 初期値を参照渡しせずに使うため、キー配置を複製する。 */
function cloneKeyboardBindings(): KeyboardBindings {
  return {
    0: { ...DEFAULT_KEYBOARD_BINDINGS[0] },
    1: { ...DEFAULT_KEYBOARD_BINDINGS[1] },
  };
}

/** JSONとして復元した値がオブジェクトかを確認する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 保存済みデータが、重複のない完全なキー配置かを検証する。 */
function isValidKeyboardBindings(value: unknown): value is KeyboardBindings {
  if (!isRecord(value)) return false;

  const assignedCodes = new Set<string>();
  for (const player of PLAYERS) {
    const playerBindings = value[String(player)];
    if (!isRecord(playerBindings)) return false;

    for (const { action } of KEYBOARD_ACTIONS) {
      const code = playerBindings[action];
      // 旧バージョンで保存された設定には向き反転キーがないため、
      // その項目だけ初期値を補完して既存のキー配置を維持する。
      const resolvedCode =
        action === "turn" && typeof code === "undefined"
          ? DEFAULT_KEYBOARD_BINDINGS[player].turn
          : code;
      if (
        typeof resolvedCode !== "string" ||
        !isConfigurableKeyboardCode(resolvedCode, action) ||
        assignedCodes.has(resolvedCode)
      ) {
        return false;
      }
      assignedCodes.add(resolvedCode);
    }
  }

  return true;
}

/** localStorageからキー配置を復元し、壊れたデータは標準配置へ戻す。 */
function loadKeyboardBindings(): KeyboardBindings {
  try {
    if (typeof window === "undefined") return cloneKeyboardBindings();
    const stored = window.localStorage.getItem(KEYBOARD_CONFIG_STORAGE_KEY);
    if (!stored) return cloneKeyboardBindings();

    const parsed: unknown = JSON.parse(stored);
    if (isValidKeyboardBindings(parsed)) {
      return {
        0: {
          ...DEFAULT_KEYBOARD_BINDINGS[0],
          ...parsed[0],
        },
        1: {
          ...DEFAULT_KEYBOARD_BINDINGS[1],
          ...parsed[1],
        },
      };
    }
  } catch {
    // プライベートモードなどで保存領域を利用できない場合も標準配置で続行する。
  }

  return cloneKeyboardBindings();
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
export function isConfigurableKeyboardCode(
  code: string,
  action: KeyboardAction,
): boolean {
  const isTurnModifier =
    action === "turn" && (code === "ShiftLeft" || code === "ShiftRight");
  return (
    code.length > 0 &&
    code !== "Unidentified" &&
    code !== FIXED_CANCEL_KEY_CODE &&
    (isTurnModifier || !MODIFIER_KEY_CODES.has(code))
  );
}

/** KeyboardEvent.codeを、設定画面で読みやすい表記へ変換する。 */
export function formatKeyboardCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `テンキー ${code.slice(6)}`;

  const displayNames: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    ShiftLeft: "左Shift",
    ShiftRight: "右Shift",
  };
  return displayNames[code] ?? code;
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

  /** キーを操作へ割り当て、成功時はブラウザへ保存する。 */
  public assign(target: KeyBindingTarget, code: string): KeyBindingResult {
    if (code === FIXED_CANCEL_KEY_CODE) {
      return { ok: false, reason: "reserved" };
    }
    if (!isConfigurableKeyboardCode(code, target.action)) {
      return { ok: false, reason: "modifier" };
    }

    const existing = this.findBinding(code);
    if (
      existing &&
      (existing.player !== target.player || existing.action !== target.action)
    ) {
      return { ok: false, reason: "duplicate", conflictingTarget: existing };
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

/** Xboxのボタン状態を押下・アナログ入力の両方から判定する。 */
=======
/**
 * ゲームパッドのボタン押下判定
 *
 * ボタンが押されている、またはアナログ値が一定以上ならtrueを返す。
 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
function buttonDown(gamepad: Gamepad, index: number): boolean {
  return Boolean(
    gamepad.buttons[index]?.pressed ||
      (gamepad.buttons[index]?.value ?? 0) > 0.5,
  );
}

/**
<<<<<<< HEAD
 * キーボードとXboxゲームパッドの状態を、シミュレーション用入力へ変換する。
 * 後ろ入力は対戦ロジック側で立ち・しゃがみガードへ解釈する。
 * 向き反転キーと左右移動キーの同時入力は、設定済みのキー配置でも向き反転として扱う。
 */
export class InputManager {
  /** 現在押されているキーボードキー。 */
=======
 * 入力管理クラス
 *
 * キーボード・ゲームパッドの入力を取得し、
 * シミュレーションで使用する入力データ(FrameInput)へ変換する。
 *
 * シミュレーション中は直接デバイスを参照せず、
 * 毎フレーム取得した入力のみを利用する。
 */
export class InputManager {
  /** 現在押されているキー一覧 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private readonly heldKeys = new Set<string>();

  public constructor() {
    //====================================================
    // キーボードイベント登録
    //====================================================
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // ウィンドウ非アクティブ時は入力をリセット
    window.addEventListener("blur", this.clear);
  }

<<<<<<< HEAD
  /** 指定プレイヤーの現在の入力をフレーム入力へ変換する。 */
  public sample(player: PlayerId): FrameInput {
    let buttons = 0;
    const leftKey = keyboardConfig.getBinding(player, "left");
    const rightKey = keyboardConfig.getBinding(player, "right");
    const turnKey = keyboardConfig.getBinding(player, "turn");
    const turnRequested =
      this.heldKeys.has(turnKey) &&
      (this.heldKeys.has(leftKey) || this.heldKeys.has(rightKey));

    for (const { action, button } of KEYBOARD_ACTIONS) {
      // 向き反転キー単体では操作にせず、左右キーとの同時入力だけで扱う。
      if (action === "turn") continue;
      if (turnRequested && (action === "left" || action === "right")) continue;
      if (this.heldKeys.has(keyboardConfig.getBinding(player, action))) {
        buttons |= button;
      }
    }

    if (turnRequested) buttons |= InputButton.Turn;

    const gamepad = navigator.getGamepads()[player];
    if (gamepad?.connected) buttons |= this.sampleXboxGamepad(gamepad);
=======
  //====================================================
  // 指定プレイヤーの入力取得
  //====================================================
  public sample(player: PlayerId): FrameInput {
    let buttons = 0;

    //====================================================
    // キーボード入力取得
    //====================================================
    for (const [key, bit] of Object.entries(keyboardBindings[player])) {
      if (this.heldKeys.has(key)) {
        buttons |= bit;
      }
    }

    //====================================================
    // ゲームパッド入力取得
    //====================================================
    const gamepad = navigator.getGamepads()[player];

    if (gamepad?.connected) {
      buttons |= this.sampleXboxGamepad(gamepad);
    }
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c

    return { buttons };
  }

<<<<<<< HEAD
  /** 登録したブラウザイベントを解除する。 */
=======
  //====================================================
  // イベント解除
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
  }

<<<<<<< HEAD
  /** ゲーム操作キーを記録し、ブラウザ標準操作を抑止する。 */
=======
  //====================================================
  // キー押下処理
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private onKeyDown = (event: KeyboardEvent): void => {
    // ゲームで使用するキーはブラウザ既定動作を無効化
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.add(event.code);
  };

<<<<<<< HEAD
  /** 離されたゲーム操作キーを記録から外す。 */
=======
  //====================================================
  // キー離し処理
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private onKeyUp = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.delete(event.code);
  };

<<<<<<< HEAD
  /** ウィンドウが非アクティブになった時に押下状態をリセットする。 */
=======
  //====================================================
  // 入力状態初期化
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private clear = (): void => {
    this.heldKeys.clear();
  };

<<<<<<< HEAD
  /** 現在のキーコンフィグに含まれる操作キーかを判定する。 */
  private isGameKey(code: string): boolean {
    return PLAYERS.some((player) =>
      KEYBOARD_ACTIONS.some(
        ({ action }) => keyboardConfig.getBinding(player, action) === code,
      ),
    );
  }

  /** Xboxゲームパッドをゲーム内ボタンへ変換する。 */
=======
  //====================================================
  // ゲーム用キーか判定
  //====================================================
  private isGameKey(code: string): boolean {
    return Object.values(keyboardBindings).some(
      (bindings) => code in bindings,
    );
  }

  //====================================================
  // Xboxゲームパッド入力取得
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private sampleXboxGamepad(gamepad: Gamepad): number {
    let buttons = 0;

    // アナログスティック
    const horizontal = gamepad.axes[0] ?? 0;
    const vertical = gamepad.axes[1] ?? 0;

<<<<<<< HEAD
    if (horizontal < -0.45 || buttonDown(gamepad, 14)) {
      buttons |= InputButton.Left;
    }
    if (horizontal > 0.45 || buttonDown(gamepad, 15)) {
      buttons |= InputButton.Right;
    }
    if (vertical < -0.45 || buttonDown(gamepad, 12)) {
      buttons |= InputButton.Up;
    }
=======
    //====================================================
    // 移動入力
    // スティックまたは十字キーに対応
    //====================================================
    if (horizontal < -0.45 || buttonDown(gamepad, 14)) {
      buttons |= InputButton.Left;
    }

    if (horizontal > 0.45 || buttonDown(gamepad, 15)) {
      buttons |= InputButton.Right;
    }

    if (vertical < -0.45 || buttonDown(gamepad, 12)) {
      buttons |= InputButton.Up;
    }

>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    if (vertical > 0.45 || buttonDown(gamepad, 13)) {
      buttons |= InputButton.Down;
    }

<<<<<<< HEAD
    if (buttonDown(gamepad, 0)) buttons |= InputButton.Light;
    if (buttonDown(gamepad, 2)) buttons |= InputButton.Heavy;
    if (buttonDown(gamepad, 1)) buttons |= InputButton.Special;
=======
    //====================================================
    // 攻撃・ガード入力
    //
    // Xbox標準配置
    // A : 弱攻撃
    // X : 強攻撃
    // B : 必殺技
    // RB: ガード
    //====================================================
    if (buttonDown(gamepad, 0)) {
      buttons |= InputButton.Light;
    }

    if (buttonDown(gamepad, 2)) {
      buttons |= InputButton.Heavy;
    }

    if (buttonDown(gamepad, 1)) {
      buttons |= InputButton.Special;
    }

    if (buttonDown(gamepad, 5)) {
      buttons |= InputButton.Block;
    }
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c

    return buttons;
  }
}
