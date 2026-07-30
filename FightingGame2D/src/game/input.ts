import { type FrameInput, InputButton, type PlayerId } from "./types";

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
  0: {
    KeyA: InputButton.Left,
    KeyD: InputButton.Right,
    KeyW: InputButton.Up,
    KeyS: InputButton.Down,
    KeyF: InputButton.Light,
    KeyG: InputButton.Heavy,
    KeyH: InputButton.Special,
    KeyQ: InputButton.Block,
  },
  1: {
    ArrowLeft: InputButton.Left,
    ArrowRight: InputButton.Right,
    ArrowUp: InputButton.Up,
    ArrowDown: InputButton.Down,
    Numpad1: InputButton.Light,
    Numpad2: InputButton.Heavy,
    Numpad3: InputButton.Special,
    Numpad0: InputButton.Block,
  },
};

/**
 * ゲームパッドのボタン押下判定
 *
 * ボタンが押されている、またはアナログ値が一定以上ならtrueを返す。
 */
function buttonDown(gamepad: Gamepad, index: number): boolean {
  return Boolean(
    gamepad.buttons[index]?.pressed ||
      (gamepad.buttons[index]?.value ?? 0) > 0.5,
  );
}

/**
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

    return { buttons };
  }

  //====================================================
  // イベント解除
  //====================================================
  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
  }

  //====================================================
  // キー押下処理
  //====================================================
  private onKeyDown = (event: KeyboardEvent): void => {
    // ゲームで使用するキーはブラウザ既定動作を無効化
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.add(event.code);
  };

  //====================================================
  // キー離し処理
  //====================================================
  private onKeyUp = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    this.heldKeys.delete(event.code);
  };

  //====================================================
  // 入力状態初期化
  //====================================================
  private clear = (): void => {
    this.heldKeys.clear();
  };

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
  private sampleXboxGamepad(gamepad: Gamepad): number {
    let buttons = 0;

    // アナログスティック
    const horizontal = gamepad.axes[0] ?? 0;
    const vertical = gamepad.axes[1] ?? 0;

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

    if (vertical > 0.45 || buttonDown(gamepad, 13)) {
      buttons |= InputButton.Down;
    }

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

    return buttons;
  }
}
