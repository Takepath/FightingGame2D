import type {
  ApplicationOptions,
  DestroyOptions,
  RendererDestroyOptions,
} from "pixi.js";
import { Application, extensions, ResizePlugin } from "pixi.js";
import "pixi.js/app";

import { CreationNavigationPlugin } from "./navigation/NavigationPlugin";
import { CreationResizePlugin } from "./resize/ResizePlugin";
import { getResolution } from "./utils/getResolution";

extensions.remove(ResizePlugin);
extensions.add(CreationResizePlugin);
extensions.add(CreationNavigationPlugin);

/**
 * PixiJSの初期化、画面遷移、リサイズをまとめるゲーム用エンジン。
 */
export class CreationEngine extends Application {
  /** アプリケーションと画面遷移機構を初期化する。 */
  public async init(opts: Partial<ApplicationOptions>): Promise<void> {
    opts.resizeTo ??= window;
    opts.resolution ??= getResolution();

    await super.init(opts);

    // 描画用CanvasをDOMへ追加する。
    document.getElementById("pixi-container")!.appendChild(this.canvas);
    // タブの非表示・復帰時に対戦画面を一時停止・再開する。
    document.addEventListener("visibilitychange", this.visibilityChange);
  }

  public override destroy(
    rendererDestroyOptions: RendererDestroyOptions = false,
    options: DestroyOptions = false,
  ): void {
    document.removeEventListener("visibilitychange", this.visibilityChange);
    super.destroy(rendererDestroyOptions, options);
  }

  /** タブの表示状態に応じて現在の画面へフォーカス状態を通知する。 */
  protected visibilityChange = () => {
    if (document.hidden) {
      this.navigation.blur();
    } else {
      this.navigation.focus();
    }
  };
}
