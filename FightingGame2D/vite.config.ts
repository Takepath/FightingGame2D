import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** ブラウザー用に状態別PNGの一覧を提供する仮想モジュールID。 */
const CHARACTER_FRAME_MANIFEST_ID = "virtual:fighting-game-character-frames";

/** Vite内部だけで使う、衝突しない仮想モジュールID。 */
const RESOLVED_CHARACTER_FRAME_MANIFEST_ID =
  "\0virtual:fighting-game-character-frames";

/** PNG連番を入れる、public配下の固定ルート。 */
const CHARACTER_FRAME_DIRECTORY = ["data", "characters"] as const;

/** PNGファイル名を自然順で比較し、000.png → 001.png → 010.png の順にする。 */
function compareFrameFileNames(left: string, right: string): number {
  return left.localeCompare(right, "en", {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * public/data/characters/<character-id>/<state>/*.png を走査する。
 * 静的Web配信ではブラウザーがフォルダ一覧を読めないため、ここでビルド時・起動時に一覧化する。
 */
function characterFrameManifest(
  projectRoot: string,
): Record<string, Record<string, string[]>> {
  const publicDirectory = resolve(projectRoot, "public");
  const charactersDirectory = resolve(
    publicDirectory,
    ...CHARACTER_FRAME_DIRECTORY,
  );
  if (!existsSync(charactersDirectory)) return {};

  const manifest: Record<string, Record<string, string[]>> = {};
  for (const character of readdirSync(charactersDirectory, {
    withFileTypes: true,
  })) {
    if (!character.isDirectory()) continue;

    const characterDirectory = join(charactersDirectory, character.name);
    const animations: Record<string, string[]> = {};
    for (const state of readdirSync(characterDirectory, {
      withFileTypes: true,
    })) {
      if (!state.isDirectory()) continue;

      const stateDirectory = join(characterDirectory, state.name);
      const frames = readdirSync(stateDirectory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() && entry.name.toLowerCase().endsWith(".png"),
        )
        .map((entry) => entry.name)
        .sort(compareFrameFileNames)
        .map((fileName) =>
          // URLはpublicからの相対パスかつ/区切りで保持する。
          relative(publicDirectory, join(stateDirectory, fileName))
            .split(sep)
            .join("/"),
        );

      // 空フォルダ・PNG以外だけのフォルダは登録しないため、ランタイムはJSONへフォールバックできる。
      if (frames.length > 0) animations[state.name] = frames;
    }
    if (Object.keys(animations).length > 0) {
      manifest[character.name] = animations;
    }
  }
  return manifest;
}

/**
 * 状態別PNG一覧をJSへ埋め込み、開発中にファイルを追加・削除した時は画面を再読込する。
 * 新しい素材を置くだけでマニフェスト編集を不要にするためのViteプラグイン。
 */
function characterFrameManifestPlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: "fighting-game-character-frame-manifest",
    configResolved(config) {
      projectRoot = config.root;
    },
    resolveId(id) {
      return id === CHARACTER_FRAME_MANIFEST_ID
        ? RESOLVED_CHARACTER_FRAME_MANIFEST_ID
        : undefined;
    },
    load(id) {
      if (id !== RESOLVED_CHARACTER_FRAME_MANIFEST_ID) return undefined;
      return `export default ${JSON.stringify(characterFrameManifest(projectRoot))};`;
    },
    configureServer(server) {
      const charactersDirectory = resolve(
        server.config.publicDir,
        ...CHARACTER_FRAME_DIRECTORY,
      );
      // 親ディレクトリを監視し、まだcharactersフォルダがない新規プロジェクトにも対応する。
      server.watcher.add(resolve(server.config.publicDir, "data"));

      const refreshManifest = (filePath: string): void => {
        const resolvedPath = resolve(filePath);
        const isCharacterAsset =
          resolvedPath === charactersDirectory ||
          resolvedPath.startsWith(`${charactersDirectory}${sep}`);
        if (!isCharacterAsset) return;

        const module = server.moduleGraph.getModuleById(
          RESOLVED_CHARACTER_FRAME_MANIFEST_ID,
        );
        if (module) server.moduleGraph.invalidateModule(module);
        // public配下の画像はHMR変換対象外なので、一覧とTextureを確実に同期するため全画面更新する。
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", refreshManifest);
      server.watcher.on("addDir", refreshManifest);
      server.watcher.on("unlink", refreshManifest);
      server.watcher.on("unlinkDir", refreshManifest);
    },
  };
}

/** 環境変数の正整数を読み、不正値を片側だけ既定値へ戻さず起動時に検出する。 */
function positiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} は1〜${maximum}の整数で指定してください`);
  }
  return parsed;
}

// 公開ホスト・ルームサーバー設定をコードから分離し、ngrok URL変更時の編集を不要にする。
export default defineConfig(({ mode }) => {
  const environmentMode = process.env.FIGHTING_GAME_ENV_MODE?.trim() || mode;
  const env = loadEnv(environmentMode, process.cwd(), "");
  const roomPort = positiveInteger("ROOM_PORT", env.ROOM_PORT, 8787, 65_535);
  const minPassphraseLength = positiveInteger(
    "ROOM_MIN_PASSPHRASE_LENGTH",
    env.ROOM_MIN_PASSPHRASE_LENGTH,
    4,
  );
  const maxPassphraseLength = positiveInteger(
    "ROOM_MAX_PASSPHRASE_LENGTH",
    env.ROOM_MAX_PASSPHRASE_LENGTH,
    32,
  );
  if (minPassphraseLength > maxPassphraseLength) {
    throw new Error(
      "ROOM_MIN_PASSPHRASE_LENGTH は ROOM_MAX_PASSPHRASE_LENGTH 以下にしてください",
    );
  }
  const allowedHosts = (
    env.FIGHTING_GAME_ALLOWED_HOSTS ?? ".ngrok-free.dev,.ngrok-free.app"
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [characterFrameManifestPlugin()],
    define: {
      __ROOM_MIN_PASSPHRASE_LENGTH__: JSON.stringify(minPassphraseLength),
      __ROOM_MAX_PASSPHRASE_LENGTH__: JSON.stringify(maxPassphraseLength),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      open: false,
      allowedHosts,
      // ngrokでは画面とWebSocketを同じ公開URLへ集約する。
      proxy: {
        "/room": {
          target: `ws://127.0.0.1:${roomPort}`,
          ws: true,
        },
      },
    },
  };
});
