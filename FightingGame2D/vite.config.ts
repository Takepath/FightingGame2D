import { defineConfig, loadEnv } from "vite";

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
