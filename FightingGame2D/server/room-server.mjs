import { startPassphraseRoomServer } from "../modules/passphrase-room/server.mjs";
import { loadEnv } from "vite";

// Viteと同じ優先順で .env / .env.local / モード別ファイルを読み、プロキシ設定とのずれを防ぐ。
const mode = process.env.FIGHTING_GAME_ENV_MODE?.trim() || "development";
const environment = loadEnv(mode, process.cwd(), "");

/** 環境変数の正整数を検証し、不正なサーバー設定で起動しない。 */
function positiveIntegerEnvironment(
  name,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const raw = process.env[name] ?? environment[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} は1〜${maximum}の整数で指定してください`);
  }
  return value;
}

/** Viteプロキシと同じ環境変数から、ルームサーバー設定を読み込む。 */
const port = positiveIntegerEnvironment("ROOM_PORT", 8787, 65_535);
const minPassphraseLength = positiveIntegerEnvironment(
  "ROOM_MIN_PASSPHRASE_LENGTH",
  4,
);
const maxPassphraseLength = positiveIntegerEnvironment(
  "ROOM_MAX_PASSPHRASE_LENGTH",
  32,
);
if (minPassphraseLength > maxPassphraseLength) {
  throw new Error(
    "ROOM_MIN_PASSPHRASE_LENGTH は ROOM_MAX_PASSPHRASE_LENGTH 以下にしてください",
  );
}

/** 汎用合言葉ルームを、このゲームの起動スクリプトから使える形で開始する。 */
const roomServer = await startPassphraseRoomServer({
  // ブラウザーはViteの同一オリジンプロキシへ接続するため、ルームポートは外部公開しない。
  host: "127.0.0.1",
  port,
  minPassphraseLength,
  maxPassphraseLength,
});
console.log(
  `Frame Fighters room server: ws://${roomServer.config.host}:${roomServer.config.port}`,
);
