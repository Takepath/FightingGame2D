// vite.config.mts
import type { AssetPackConfig } from "@assetpack/core";
import { AssetPack } from "@assetpack/core";
import { pixiPipes } from "@assetpack/core/pixi";
import type { Plugin, ResolvedConfig } from "vite";

export function assetpackPlugin() {
  /** raw-assetsをPixiJS用アセットとmanifestへ変換し、開発中は変更監視する。 */
  const apConfig = {
    entry: "./raw-assets",
    pipes: [
      ...pixiPipes({
        cacheBust: false,
        manifest: {
          output: "./src/manifest.json",
        },
      }),
    ],
  } as AssetPackConfig;
  let mode: ResolvedConfig["command"];
  let ap: AssetPack | undefined;

  return {
    name: "vite-plugin-assetpack",
    configResolved(resolvedConfig) {
      // Viteの実行モードと公開ディレクトリから、変換済みアセットの出力先を決める。
      mode = resolvedConfig.command;
      if (!resolvedConfig.publicDir) return;
      if (apConfig.output) return;
      // remove the root from the public dir
      const publicDir = resolvedConfig.publicDir.replace(process.cwd(), "");

      if (process.platform === "win32") {
        apConfig.output = `${publicDir}/assets/`;
      } else {
        apConfig.output = `.${publicDir}/assets/`;
      }
    },
    buildStart: async () => {
      // 開発時は初回変換後に監視を継続し、本番ビルド時は一度だけ変換する。
      if (mode === "serve") {
        if (ap) return;
        ap = new AssetPack(apConfig);
        // 初回変換だけ待ち、監視処理はViteの起動を妨げないよう非同期で継続する。
        await ap.run();
        void ap.watch();
      } else {
        await new AssetPack(apConfig).run();
      }
    },
    buildEnd: async () => {
      // 開発サーバー終了時にファイル監視を停止してハンドルを解放する。
      if (ap) {
        await ap.stop();
        ap = undefined;
      }
    },
  } as Plugin;
}
