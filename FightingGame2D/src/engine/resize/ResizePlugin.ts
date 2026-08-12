import { ExtensionType } from "pixi.js";
import type {
  Application,
  ApplicationOptions,
  ExtensionMetadata,
  ResizePluginOptions,
} from "pixi.js";

import { resize } from "./resize";

// ネストした設定項目も必須扱いにするユーティリティ型。
export type DeepRequired<T> = Required<{
  [K in keyof T]: DeepRequired<T[K]>;
}>;

/** 独自リサイズ拡張で使用するアプリケーション設定。 */
export interface CreationResizePluginOptions extends ResizePluginOptions {
  /** Canvasリサイズを制御する設定。 */
  resizeOptions?: {
    /** 描画領域の最小幅。 */
    minWidth?: number;
    /** 描画領域の最小高さ。 */
    minHeight?: number;
    /** アスペクト比維持時にレターボックスを付けるか。 */
    letterbox?: boolean;
  };
}

/** PixiJSのリサイズ処理をゲーム画面向けに拡張する。 */
export class CreationResizePlugin {
  /** @ignore */
  public static extension: ExtensionMetadata = ExtensionType.Application;

  private static _resizeId: number | null;
  private static _resizeTo: Window | HTMLElement | null;
  private static _cancelResize: (() => void) | null;

  /** Canvasと論理解像度のリサイズ処理を初期化する。 */
  public static init(options: ApplicationOptions): void {
    const app = this as unknown as Application;

    Object.defineProperty(
      app,
      "resizeTo",
      /** 監視対象のサイズへCanvasを自動追従させる。 */
      {
        set(dom: Window | HTMLElement) {
          globalThis.removeEventListener("resize", app.queueResize);
          // PixiJSがinitをアプリ本体のコンテキストで呼ぶため、
          // 監視対象は拡張クラスではなくアプリ本体へ保持する。
          this._resizeTo = dom;
          if (dom) {
            globalThis.addEventListener("resize", app.queueResize);
            app.resize();
          }
        },
        get() {
          return this._resizeTo;
        },
      },
    );

    /** 連続したリサイズ要求を1フレームにまとめる。 */
    app.queueResize = (): void => {
      if (!this._resizeTo) {
        return;
      }

      this._cancelResize!();

      // requestAnimationFrame単位でリサイズ回数を抑制する。
      this._resizeId = requestAnimationFrame(() => app.resize!());
    };

    /** 監視対象のサイズを直ちにCanvasと論理解像度へ反映する。 */
    app.resize = (): void => {
      if (!this._resizeTo) {
        return;
      }

      // 予約済みのリサイズを取り消して二重実行を防ぐ。
      this._cancelResize!();

      let canvasWidth: number;
      let canvasHeight: number;

      // Windowを監視している場合はビューポートサイズを使う。
      if (this._resizeTo === globalThis.window) {
        canvasWidth = globalThis.innerWidth;
        canvasHeight = globalThis.innerHeight;
      }
      // 要素を監視している場合はそのクライアントサイズを使う。
      else {
        const { clientWidth, clientHeight } = this._resizeTo as HTMLElement;

        canvasWidth = clientWidth;
        canvasHeight = clientHeight;
      }

      const { width, height } = resize(
        canvasWidth,
        canvasHeight,
        app.resizeOptions.minWidth,
        app.resizeOptions.minHeight,
        app.resizeOptions.letterbox,
      );

      app.renderer.canvas.style.width = `${canvasWidth}px`;
      app.renderer.canvas.style.height = `${canvasHeight}px`;
      window.scrollTo(0, 0);

      app.renderer.resize(width, height);
    };

    this._cancelResize = (): void => {
      if (this._resizeId) {
        cancelAnimationFrame(this._resizeId);
        this._resizeId = null;
      }
    };
    this._resizeId = null;
    this._resizeTo = null;
    app.resizeOptions = {
      minWidth: 768,
      minHeight: 1024,
      letterbox: true,
      ...options.resizeOptions,
    };
    app.resizeTo =
      options.resizeTo || (null as unknown as Window | HTMLElement);
  }

  /** リサイズ監視と予約済みコールバックを解除する。 */
  public static destroy(): void {
    const app = this as unknown as Application;

    globalThis.removeEventListener("resize", app.queueResize);
    this._cancelResize!();
    this._cancelResize = null;
    app.queueResize = null as unknown as () => void;
    app.resizeTo = null as unknown as Window | HTMLElement;
    app.resize = null as unknown as () => void;
  }
}
