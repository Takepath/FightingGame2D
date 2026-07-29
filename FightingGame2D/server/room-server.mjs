import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.ROOM_PORT ?? 8787);
const rooms = new Map();

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

class Peer {
  constructor(socket, initialData) {
    this.socket = socket;
    this.buffer = initialData;
    this.room = null;
    this.role = null;
    socket.on("data", (data) => this.receive(data));
    socket.on("close", () => this.close());
    socket.on("error", () => this.close());
    if (initialData.length) this.parseFrames();
  }

  send(message) {
    if (!this.socket.destroyed)
      this.socket.write(encodeFrame(JSON.stringify(message)));
  }

  receive(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.parseFrames();
  }

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
      } else if (length === 127) {
        this.socket.end();
        return;
      }
      if (!masked || this.buffer.length < offset + 4 + length) return;
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
        handleMessage(this, JSON.parse(payload.toString("utf8")));
      } catch {
        this.send({ type: "error", message: "無効なメッセージです。" });
      }
    }
  }

  close() {
    leaveRoom(this);
  }
}

function phraseOf(message) {
  if (typeof message.phrase !== "string") return null;
  const phrase = message.phrase.trim();
  return phrase.length >= 4 && phrase.length <= 32 ? phrase : null;
}

function leaveRoom(peer) {
  const room = peer.room;
  if (!room) return;
  peer.room = null;
  if (peer.role === 0) {
    rooms.delete(room.phrase);
    if (room.guest) {
      room.guest.room = null;
      room.guest.send({ type: "opponent_left" });
    }
  } else if (room.guest === peer) {
    room.guest = null;
    room.host.send({ type: "opponent_left" });
  }
  peer.role = null;
}

function beginRoom(peer, message, mode) {
  const phrase = phraseOf(message);
  if (!phrase) {
    peer.send({
      type: "error",
      message: "合言葉は4〜32文字で入力してください。",
    });
    return;
  }
  leaveRoom(peer);
  const existing = rooms.get(phrase);
  if (mode === "create") {
    if (existing) {
      peer.send({
        type: "error",
        message: "その合言葉の部屋は既にあります。参加を選んでください。",
      });
      return;
    }
    const room = { phrase, host: peer, guest: null };
    rooms.set(phrase, room);
    peer.room = room;
    peer.role = 0;
    peer.send({ type: "created" });
    return;
  }
  if (!existing) {
    peer.send({
      type: "error",
      message: "部屋が見つかりません。先に部屋を作成してください。",
    });
    return;
  }
  if (existing.guest) {
    peer.send({ type: "error", message: "この部屋は満員です。" });
    return;
  }
  existing.guest = peer;
  peer.room = existing;
  peer.role = 1;
  peer.send({ type: "joined" });
  existing.host.send({ type: "ready", player: 0 });
  peer.send({ type: "ready", player: 1 });
}

function handleMessage(peer, message) {
  if (!message || typeof message.type !== "string") {
    peer.send({ type: "error", message: "無効なメッセージです。" });
    return;
  }
  if (message.type === "create" || message.type === "join") {
    beginRoom(peer, message, message.type);
    return;
  }
  if (
    message.type === "input" &&
    Number.isInteger(message.frame) &&
    Number.isInteger(message.buttons) &&
    message.frame >= 0 &&
    peer.room
  ) {
    const opponent = peer.role === 0 ? peer.room.guest : peer.room.host;
    opponent?.send({
      type: "input",
      frame: message.frame,
      buttons: message.buttons,
    });
  }
}

const server = createServer((_, response) => {
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Frame Fighters room server\n");
});

server.on("upgrade", (request, socket, head) => {
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  new Peer(socket, head);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Frame Fighters room server: ws://0.0.0.0:${port}`);
});
