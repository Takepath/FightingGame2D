import { startPassphraseRoomServer } from "../modules/passphrase-room/server.mjs";

/** 格闘ゲーム用の既定ポート。環境変数ROOM_PORTでLAN構成に合わせて変更できる。 */
const port = Number(process.env.ROOM_PORT ?? 8787);

/** 汎用合言葉ルームを、このゲームの起動スクリプトから使える形で開始する。 */
const roomServer = await startPassphraseRoomServer({ port });
console.log(
  `Frame Fighters room server: ws://${roomServer.config.host}:${roomServer.config.port}`,
);
