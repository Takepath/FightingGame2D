# Passphrase Room

依存パッケージを使わず、合言葉による2人用WebSocketルームを提供する再利用モジュールです。ゲーム固有の処理は持たず、ルーム成立後の任意イベントを相手へ中継します。

## 同梱物

- `client.ts`: ViteなどのTypeScriptブラウザプロジェクトで使うクライアント
- `server.mjs`: Node.jsで使うサーバー

## サーバー

```js
import { startPassphraseRoomServer } from "./server.mjs";

const roomServer = await startPassphraseRoomServer({
  port: 8787,
  minPassphraseLength: 4,
  maxPassphraseLength: 32,
});

console.log(`Room server started on ${roomServer.config.host}:${roomServer.config.port}`);
```

## ブラウザ

```ts
import { PassphraseRoomClient } from "./client";

const room = new PassphraseRoomClient({ endpoint: "ws://192.168.0.10:8787" });

room.onState((state) => {
  if (state.type === "ready") console.log(`参加順: ${state.slot}`);
});
room.onEvent("chat", (payload) => console.log(payload));

room.connect("create", "sample-room");
room.sendEvent("chat", { text: "hello" });
```

参加側は `room.connect("join", "sample-room")` を使います。`sendEvent` のイベント名とペイロードはアプリ側で自由に決められます。サーバーは `create`、`join`、`event` だけを解釈し、`event` は相手へそのまま中継します。

`onState` の `error.code` は `invalid_passphrase`、`room_already_exists`、`room_not_found`、`room_full`、`network_error`、`invalid_message` を返します。表示文言・画面遷移は利用プロジェクト側で実装してください。
