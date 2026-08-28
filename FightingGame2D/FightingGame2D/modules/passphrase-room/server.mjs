import { createHash } from "node:crypto";
import { createServer } from "node:http";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** サーバー側のルーム運用設定。 */
export const DEFAULT_PASSPHRASE_ROOM_OPTIONS = Object.freeze({
  port: 8787,
  host: "0.0.0.0",
  minPassphraseLength: 4,
  maxPassphraseLength: 32,
  maxMessageBytes: 16 * 1024,
});

/** サーバーからブラウザへ送るテキストWebSocketフレームを作る。 */
function encodeFrame(text, opcode = 0x1) {
  const payload = Buffer.from(text);
  const header =
    payload.length < 126
      ? Buffer.from([0x80 | opcode, payload.length])
      : Buffer.from([
          0x80 | opcode,
          126,
          payload.length >> 8,
          payload.length & 0xff,
        ]);
  return Buffer.concat([header, payload]);
}

/** 1本のWebSocketと、その参加中ルームを表す。 */
class Peer {
  constructor(socket, initialData, handlers, maxMessageBytes) {
    this.socket = socket;
    this.buffer = initialData;
    this.handlers = handlers;
    this.maxMessageBytes = maxMessageBytes;
    this.room = null;
    this.slot = null;
    this.closed = false;
    socket.on("data", (data) => this.receive(data));
    socket.on("close", () => this.close());
    socket.on("error", () => this.close());
    if (initialData.length) this.parseFrames();
  }

  /** JSON互換のサーバーメッセージを安全に送信する。 */
  send(message) {
    if (this.socket.destroyed) return;
    const text = JSON.stringify(message);
    if (Buffer.byteLength(text) > this.maxMessageBytes) return;
    this.socket.write(encodeFrame(text));
  }

  /** 受信チャンクをバッファへ追加してWebSocketフレームを解析する。 */
  receive(data) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, data]);
    if (this.buffer.length > this.maxMessageBytes + 16) {
      this.socket.end();
      return;
    }
    this.parseFrames();
  }

  /** マスク済みクライアントWebSocketフレームを復号してJSONとして処理する。 */
  parseFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127 || !masked || length > this.maxMessageBytes) {
        this.socket.end();
        return;
      }
      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.alloc(length);
      for (let index = 0; index < length; index += 1) {
        payload[index] = this.buffer[offset + index] ^ mask[index % 4];
      }
      this.buffer = this.buffer.subarray(offset + length);

      if (opcode === 0x8) {
        this.socket.end();
        return;
      }
      if (opcode === 0x9) {
        this.socket.write(encodeFrame(payload.toString(), 0xa));
        continue;
      }
      if (opcode !== 0x1) continue;

      try {
        this.handlers.onMessage(this, JSON.parse(payload.toString("utf8")));
      } catch {
        this.send({ type: "error", code: "invalid_message" });
      }
    }
  }

  /** ソケット終了時にルームから一度だけ離脱する。 */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose(this);
  }
}

/**
 * WebSocketだけを使う、2人用の合言葉ルームサーバーを生成する。
 * ルーム成立後は type:event の任意payloadを相手へそのまま中継する。
 */
export function createPassphraseRoomServer(options = {}) {
  const config = { ...DEFAULT_PASSPHRASE_ROOM_OPTIONS, ...options };
  const rooms = new Map();

  /** 合言葉の前後空白と長さを検証する。 */
  function passphraseOf(message) {
    if (!message || typeof message.passphrase !== "string") return null;
    const passphrase = message.passphrase.trim();
    return passphrase.length >= config.minPassphraseLength &&
      passphrase.length <= config.maxPassphraseLength
      ? passphrase
      : null;
  }

  /** 自分以外の参加者を返す。 */
  function opponentOf(peer) {
    if (!peer.room || peer.slot === null) return null;
    return peer.room.peers[peer.slot === 0 ? 1 : 0];
  }

  /** 離脱者を部屋から除き、残った参加者へ通知する。 */
  function leaveRoom(peer) {
    const room = peer.room;
    if (!room || peer.slot === null) return;

    const slot = peer.slot;
    const opponent = opponentOf(peer);
    room.peers[slot] = null;
    peer.room = null;
    peer.slot = null;

    if (slot === 0) rooms.delete(room.passphrase);
    opponent?.send({ type: "opponent_left" });
  }

  /** 合言葉で新規ルームを作るか、待機中のルームへ参加する。 */
  function beginRoom(peer, message, mode) {
    const passphrase = passphraseOf(message);
    if (!passphrase) {
      peer.send({ type: "error", code: "invalid_passphrase" });
      return;
    }

    leaveRoom(peer);
    const existing = rooms.get(passphrase);
    if (mode === "create") {
      if (existing) {
        peer.send({ type: "error", code: "room_already_exists" });
        return;
      }
      const room = { passphrase, peers: [peer, null] };
      rooms.set(passphrase, room);
      peer.room = room;
      peer.slot = 0;
      peer.send({ type: "created" });
      return;
    }

    if (!existing) {
      peer.send({ type: "error", code: "room_not_found" });
      return;
    }
    if (existing.peers[1]) {
      peer.send({ type: "error", code: "room_full" });
      return;
    }

    existing.peers[1] = peer;
    peer.room = existing;
    peer.slot = 1;
    peer.send({ type: "joined" });
    existing.peers[0]?.send({ type: "ready", slot: 0 });
    peer.send({ type: "ready", slot: 1 });
  }

  /** 制御要求と任意イベント中継を振り分ける。 */
  function handleMessage(peer, message) {
    if (!message || typeof message.type !== "string") {
      peer.send({ type: "error", code: "invalid_message" });
      return;
    }
    if (message.type === "create" || message.type === "join") {
      beginRoom(peer, message, message.type);
      return;
    }
    if (
      message.type === "event" &&
      peer.room &&
      typeof message.event === "string" &&
      message.event.length > 0 &&
      message.event.length <= 64
    ) {
      opponentOf(peer)?.send({
        type: "event",
        event: message.event,
        payload: message.payload,
      });
      return;
    }
    peer.send({ type: "error", code: "invalid_message" });
  }

  const server = createServer((_, response) => {
    /** WebSocket以外のアクセスにも稼働確認用の応答を返す。 */
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Passphrase room server\n");
  });

  server.on("upgrade", (request, socket, head) => {
    /** HTTP UpgradeをWebSocket接続へ変換し、Peerとして追跡する。 */
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(`${key}${WEBSOCKET_GUID}`)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    new Peer(socket, head, { onMessage: handleMessage, onClose: leaveRoom }, config.maxMessageBytes);
  });

  /** 指定ポートで待ち受けを開始する。 */
  function listen() {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(config.port, config.host);
    });
  }

  /** 待受中のサーバーを閉じる。 */
  function close() {
    return new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return { config, rooms, server, listen, close };
}

/** サーバーを生成して即時に待ち受けを始める便利関数。 */
export async function startPassphraseRoomServer(options = {}) {
  const roomServer = createPassphraseRoomServer(options);
  await roomServer.listen();
  return roomServer;
}
