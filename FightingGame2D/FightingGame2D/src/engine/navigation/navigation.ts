import type { Ticker } from "pixi.js";
import { Container } from "pixi.js";

import type { CreationEngine } from "../engine";

/** 現在のゲームで必要な画面ライフサイクル。 */
interface AppScreen extends Container {
  /** 画面が切り替わるときにDOMイベントなどを後始末する。 */
  reset?(): void;
  /** 描画フレームごとに呼び出す更新処理。 */
  update?(time: Ticker): void;
  /** Canvasサイズに合わせて画面を再配置する。 */
  resize?(width: number, height: number): void;
  /** ブラウザが非アクティブになったときの処理。 */
  blur?(): void;
  /** ブラウザが再びアクティブになったときの処理。 */
  focus?(): void;
}

/** 表示できる画面クラスのコンストラクター。 */
interface AppScreenConstructor {
  new (): AppScreen;
}

/** PixiJS上のゲーム画面を1枚だけ管理する。 */
export class Navigation {
  /** 親となるゲームエンジン。 */
  public app!: CreationEngine;

  /** 表示中の画面を載せるコンテナ。 */
  public readonly container = new Container();

  /** 現在の描画幅。 */
  public width = 0;

  /** 現在の描画高さ。 */
  public height = 0;

  /** 現在表示中の画面。 */
  public currentScreen?: AppScreen;

  /** エンジン初期化時に親アプリケーションを記録する。 */
  public init(app: CreationEngine): void {
    this.app = app;
  }

  /** 現在の画面を破棄して、新しい画面へ切り替える。 */
  public showScreen(ctor: AppScreenConstructor): void {
    this.clearScreen();

    const screen = new ctor();
    this.currentScreen = screen;

    if (!this.container.parent) this.app.stage.addChild(this.container);
    this.container.addChild(screen);
    // 初期化直後はresizeイベントより先に画面を開く可能性があるため、
    // 未記録のサイズはレンダラーの現在値で補う。
    screen.resize?.(
      this.width || this.app.renderer.width,
      this.height || this.app.renderer.height,
    );
    if (screen.update) this.app.ticker.add(screen.update, screen);
  }

  /** 更新登録・DOMイベント・ステージ上の参照を解除する。 */
  private removeScreen(screen: AppScreen): void {
    if (screen.update) this.app.ticker.remove(screen.update, screen);
    screen.parent?.removeChild(screen);
    screen.reset?.();
    screen.destroy({ children: true });
  }

  /** 現在の画面を閉じ、メニューなどDOM側の画面へ戻れる状態にする。 */
  public clearScreen(): void {
    if (!this.currentScreen) return;
    const screen = this.currentScreen;
    this.currentScreen = undefined;
    this.removeScreen(screen);
  }

  /** 現在の画面へリサイズを通知する。 */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.currentScreen?.resize?.(width, height);
  }

  /** フォーカス喪失を現在の画面へ通知する。 */
  public blur(): void {
    this.currentScreen?.blur?.();
  }

  /** フォーカス復帰を現在の画面へ通知する。 */
  public focus(): void {
    this.currentScreen?.focus?.();
  }

  /** エンジン破棄時に画面とTicker登録を後始末する。 */
  public destroy(): void {
    this.clearScreen();
    this.container.destroy({ children: true });
  }
}
