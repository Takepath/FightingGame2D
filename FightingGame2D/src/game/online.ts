import type { FrameInput, PlayerId } from "./types";

type RoomMode = "create" | "join";
type StatusHandler = (message: string) => void;
type ReadyHandler = (client: RoomClient) => void;
type InputHandler = (frame: number, buttons: number) => void;
type VoidHandler = () => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8787`;
}

/** Browser side of the password-protected, ephemeral room protocol. */
export class RoomClient {
  public player: PlayerId | null = null;
  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly readyHandlers = new Set<ReadyHandler>();
  private readonly inputHandlers = new Set<InputHandler>();
  private readonly closeHandlers = new Set<VoidHandler>();
  private readonly opponentLeftHandlers = new Set<VoidHandler>();

  public connect(mode: RoomMode, phrase: string): void {
    this.close();
    this.intentionalClose = false;
    this.player = null;
    this.status(`サーバーへ接続しています… (${socketUrl()})`);

    const socket = new WebSocket(socketUrl());
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.send({ type: mode, phrase });
    });
    socket.addEventListener("message", (event) => this.receive(event));
    socket.addEventListener("error", () => {
      this.status(
        "ルームサーバーに接続できません。npm run multiplayer を起動してください。",
      );
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.intentionalClose) {
        this.status("接続が切断されました。");
        this.closeHandlers.forEach((handler) => handler());
      }
    });
  }

  public sendInput(frame: number, buttons: number): void {
    this.send({ type: "input", frame, buttons });
  }

  public onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

  public onReady(handler: ReadyHandler): void {
    this.readyHandlers.add(handler);
  }

  public onInput(handler: InputHandler): void {
    this.inputHandlers.add(handler);
  }

  public onClose(handler: VoidHandler): void {
    this.closeHandlers.add(handler);
  }

  public onOpponentLeft(handler: VoidHandler): void {
    this.opponentLeftHandlers.add(handler);
  }

  public close(): void {
    this.intentionalClose = true;
    this.socket?.close();
    this.socket = null;
  }

  private receive(event: MessageEvent): void {
    if (typeof event.data !== "string") return;
    let message: unknown;
    try {
      message = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }
    if (!isRecord(message) || typeof message.type !== "string") return;

    if (
      message.type === "ready" &&
      (message.player === 0 || message.player === 1)
    ) {
      this.player = message.player;
      this.status(`ルーム接続完了: Player ${this.player + 1}`);
      this.readyHandlers.forEach((handler) => handler(this));
    } else if (
      message.type === "input" &&
      typeof message.frame === "number" &&
      typeof message.buttons === "number"
    ) {
      const frame = message.frame;
      const buttons = message.buttons;
      this.inputHandlers.forEach((handler) => handler(frame, buttons));
    } else if (message.type === "created") {
      this.status(
        "部屋を作成しました。相手が同じ合言葉で参加するのを待っています。",
      );
    } else if (message.type === "joined") {
      this.status("部屋に参加しました。対戦を開始します…");
    } else if (message.type === "opponent_left") {
      this.status("対戦相手が退出しました。新しい参加者を待てます。");
      this.opponentLeftHandlers.forEach((handler) => handler());
    } else if (
      message.type === "error" &&
      typeof message.message === "string"
    ) {
      this.status(message.message);
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private status(message: string): void {
    this.statusHandlers.forEach((handler) => handler(message));
  }
}

/**
 * Provides a pair of inputs only after both browsers have supplied an identical frame.
 * The simulation consumes these snapshots exactly as it does in local mode.
 */
export class OnlineFrameBridge {
  private readonly localInputs = new Map<number, FrameInput>();
  private readonly remoteInputs = new Map<number, FrameInput>();

  public constructor(private readonly client: RoomClient) {
    client.onInput((frame, buttons) => {
      this.remoteInputs.set(frame, { buttons });
    });
  }

  public inputsForFrame(
    frame: number,
    localInput: FrameInput,
  ): readonly [FrameInput, FrameInput] | undefined {
    if (this.client.player === null) return undefined;
    if (!this.localInputs.has(frame)) {
      const snapshot = { buttons: localInput.buttons };
      this.localInputs.set(frame, snapshot);
      this.client.sendInput(frame, snapshot.buttons);
    }

    const own = this.localInputs.get(frame);
    const remote = this.remoteInputs.get(frame);
    if (!own || !remote) return undefined;
    this.localInputs.delete(frame);
    this.remoteInputs.delete(frame);
    return this.client.player === 0 ? [own, remote] : [remote, own];
  }
}
