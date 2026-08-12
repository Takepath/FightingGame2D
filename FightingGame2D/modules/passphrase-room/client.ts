/** 合言葉ルームの作成・参加モード。 */
export type PassphraseRoomMode = "create" | "join";

/** ルーム通信のライフサイクル通知。アプリ側で表示文言や画面遷移を自由に決められる。 */
export type PassphraseRoomState =
  | { type: "connecting"; endpoint: string }
  | { type: "created" }
  | { type: "joined" }
  | { type: "ready"; slot: number }
  | { type: "opponent_left" }
  | { type: "closed" }
  | { type: "error"; code: string };

/** ブラウザ側クライアントの接続先設定。 */
export interface PassphraseRoomClientOptions {
  /** WebSocket接続先。省略時は現在のホスト名のポート8787を使う。 */
  endpoint?: string;
  /** 既定接続先で使うポート番号。endpoint指定時は使われない。 */
  port?: number;
}

type StateHandler = (state: PassphraseRoomState) => void;
type EventHandler = (payload: unknown) => void;

/** JSON受信値がオブジェクト形式かを検証する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 現在表示しているWebページと同じホスト名へ接続する既定URLを作る。 */
export function browserRoomEndpoint(port = 8787): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${port}`;
}

/**
 * 合言葉で2人用ルームを作成し、任意イベントを相手へ中継する汎用クライアント。
 * ゲーム、共同編集、チャットなどのアプリ固有データは sendEvent / onEvent で扱う。
 */
export class PassphraseRoomClient {
  /** サーバーから割り当てられた参加順。未接続時はnull。 */
  public slot: number | null = null;

  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private readonly stateHandlers = new Set<StateHandler>();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();

  public constructor(
    private readonly options: PassphraseRoomClientOptions = {},
  ) {}

  /** 接続先URLを設定値から解決する。 */
  public get endpoint(): string {
    return this.options.endpoint ?? browserRoomEndpoint(this.options.port);
  }

  /** 新規作成または既存ルームへの参加を開始する。 */
  public connect(mode: PassphraseRoomMode, passphrase: string): void {
    this.close();
    this.intentionalClose = false;
    this.slot = null;

    const endpoint = this.endpoint;
    this.emitState({ type: "connecting", endpoint });
    const socket = new WebSocket(endpoint);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.send({ type: mode, passphrase });
    });
    socket.addEventListener("message", (event) => this.receive(event));
    socket.addEventListener("error", () => {
      this.emitState({ type: "error", code: "network_error" });
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.intentionalClose) this.emitState({ type: "closed" });
    });
  }

  /** アプリ固有のイベント名とJSON互換ペイロードを相手へ送る。 */
  public sendEvent(eventName: string, payload: unknown): void {
    if (!eventName || eventName.length > 64) return;
    this.send({ type: "event", event: eventName, payload });
  }

  /** ルームの接続状態を監視する。戻り値を呼ぶと購読を解除できる。 */
  public onState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /** 指定したアプリ固有イベントを受信する。戻り値を呼ぶと購読を解除できる。 */
  public onEvent(eventName: string, handler: EventHandler): () => void {
    const handlers =
      this.eventHandlers.get(eventName) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.eventHandlers.set(eventName, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.eventHandlers.delete(eventName);
    };
  }

  /** 明示的に接続を閉じる。明示切断ではclosed通知を発行しない。 */
  public close(): void {
    this.intentionalClose = true;
    this.socket?.close();
    this.socket = null;
    this.slot = null;
  }

  /** サーバー制御メッセージとアプリ固有イベントを安全に振り分ける。 */
  private receive(event: MessageEvent): void {
    if (typeof event.data !== "string") return;

    let message: unknown;
    try {
      message = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }
    if (!isRecord(message) || typeof message.type !== "string") return;

    if (message.type === "created") {
      this.emitState({ type: "created" });
    } else if (message.type === "joined") {
      this.emitState({ type: "joined" });
    } else if (message.type === "ready" && Number.isInteger(message.slot)) {
      this.slot = message.slot as number;
      this.emitState({ type: "ready", slot: this.slot });
    } else if (message.type === "opponent_left") {
      this.emitState({ type: "opponent_left" });
    } else if (message.type === "error" && typeof message.code === "string") {
      this.emitState({ type: "error", code: message.code });
    } else if (message.type === "event" && typeof message.event === "string") {
      this.eventHandlers
        .get(message.event)
        ?.forEach((handler) => handler(message.payload));
    }
  }

  /** WebSocketが接続済みの場合だけJSONメッセージを送信する。 */
  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** 登録済みの状態監視へ通知する。 */
  private emitState(state: PassphraseRoomState): void {
    this.stateHandlers.forEach((handler) => handler(state));
  }
}
