import { ExtensionType } from "pixi.js";
import type { Application, ExtensionMetadata } from "pixi.js";

import type { CreationEngine } from "../engine";

import { Navigation } from "./navigation";

/** PixiJSアプリケーションへ画面遷移管理を追加する拡張。 */
export class CreationNavigationPlugin {
  /** @ignore */
  public static extension: ExtensionMetadata = ExtensionType.Application;

  private static _onResize: (() => void) | null;

  /** アプリケーション単位の画面遷移管理を初期化する。 */
  public static init(): void {
    const app = this as unknown as CreationEngine;

    app.navigation = new Navigation();
    app.navigation.init(app);
    this._onResize = () =>
      app.navigation.resize(app.renderer.width, app.renderer.height);
    app.renderer.on("resize", this._onResize);
    app.resize();
    // リサイズイベントの発火順に依存せず、初期Canvasサイズを画面遷移側へ渡す。
    app.navigation.resize(app.renderer.width, app.renderer.height);
  }

  /** リサイズ監視を解除して画面遷移管理への参照を外す。 */
  public static destroy(): void {
    const app = this as unknown as Application;
    if (this._onResize) app.renderer.off("resize", this._onResize);
    this._onResize = null;
    app.navigation.destroy();
    app.navigation = null as unknown as Navigation;
  }
}
