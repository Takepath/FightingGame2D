import type { FrameInput, PlayerId } from "./types";

// ルーム操作モード（部屋作成 / 既存部屋への参加）
type RoomMode = "create" | "join";

// ステータス通知用コールバック型
type StatusHandler = (message: string) => void;

// 接続準備完了通知用コールバック型
type ReadyHandler = (client: RoomClient) => void;

// 入力同期通知用コールバック型
type InputHandler = (frame: number, buttons: number) => void;

// 引数なし通知用コールバック型
type VoidHandler = () => void;


// 値がオブジェクト形式か判定する型ガード
// WebSocket経由のJSONデータ検証で利用する
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// WebSocket接続先URLを生成する
// 現在のページがHTTPSならWSS、それ以外ならWSを利用する
function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8787`;
}

/**
 * パスワード付き一時ルーム通信を管理するブラウザ側クライアント
 */
export class RoomClient {
  // 自分のプレイヤー番号（0または1）
  // 未接続時はnull
  public player: PlayerId | null = null;

  // WebSocket接続オブジェクト
  private socket: WebSocket | null = null;

  // ユーザー操作による切断かどうかを判定するフラグ
  private intentionalClose = false;

  // 各種イベント通知用ハンドラー管理
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly readyHandlers = new Set<ReadyHandler>();
  private readonly inputHandlers = new Set<InputHandler>();
  private readonly closeHandlers = new Set<VoidHandler>();
  private readonly opponentLeftHandlers = new Set<VoidHandler>();


  // サーバーへ接続し、部屋作成または参加処理を開始する
  public connect(mode: RoomMode, phrase: string): void {
    // 既存接続があれば閉じる
    this.close();

    // 接続状態を初期化
    this.intentionalClose = false;
    this.player = null;

    // 接続開始状態を通知
    this.status(`サーバーへ接続しています… (${socketUrl()})`);

    // WebSocket接続を生成
    const socket = new WebSocket(socketUrl());
    this.socket = socket;


    // 接続成功時にルーム操作要求を送信
    socket.addEventListener("open", () => {this.send({ type: mode, phrase });});

    // サーバーからのメッセージ受信処理を登録
    socket.addEventListener("message", (event) => this.receive(event));

    // 接続エラー発生時の通知
    socket.addEventListener("error", () => {
      this.status(
        "ルームサーバーに接続できません。npm run multiplayer を起動してください。",
      );
    });


    // WebSocket切断時の処理
    socket.addEventListener("close", () => {
      // 古いSocketからのイベントなら無視する
      if (this.socket !== socket) return;

      this.socket = null;

      // 意図しない切断の場合のみ通知する
      if (!this.intentionalClose) {
        this.status("接続が切断されました。");
        this.closeHandlers.forEach((handler) => handler());
      }
    });
  }

  // 自分の入力情報をサーバーへ送信する
  public sendInput(frame: number, buttons: number): void {
    this.send({ type: "input", frame, buttons });
  }

  // ステータス通知イベントを登録する
  public onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

  // 接続完了イベントを登録する
  public onReady(handler: ReadyHandler): void {
    this.readyHandlers.add(handler);
  }

  // 相手入力受信イベントを登録する
  public onInput(handler: InputHandler): void {
    this.inputHandlers.add(handler);
  }

  // 接続終了イベントを登録する
  public onClose(handler: VoidHandler): void {
    this.closeHandlers.add(handler);
  }

  // 相手退出イベントを登録する
  public onOpponentLeft(handler: VoidHandler): void {
    this.opponentLeftHandlers.add(handler);
  }

  // WebSocket接続を閉じる
  public close(): void {
    this.intentionalClose = true;
    this.socket?.close();
    this.socket = null;
  }

  // サーバーから受信したメッセージを解析・処理する
  private receive(event: MessageEvent): void {
    // 文字列データ以外は処理しない
    if (typeof event.data !== "string") return;

    let message: unknown;

    // JSON形式へ変換する
    try {
      message = JSON.parse(event.data) as unknown;
    } catch {return}

    // 想定したオブジェクト形式でなければ破棄する
    if (!isRecord(message) || typeof message.type !== "string") return;

    // 接続準備完了通知
    if (message.type === "ready" &&(message.player === 0 || message.player === 1)) {
      this.player = message.player;
      this.status(`ルーム接続完了: Player ${this.player + 1}`);

      // ゲーム開始可能状態を通知
      this.readyHandlers.forEach((handler) => handler(this));
      // 相手プレイヤーの入力データ受信
    } else if (
      message.type === "input" &&
      typeof message.frame === "number" &&
      typeof message.buttons === "number"
    ) {
      const frame = message.frame;
      const buttons = message.buttons;

      // 入力同期処理へ通知
      this.inputHandlers.forEach((handler) => handler(frame, buttons));

    // 部屋作成成功通知
    } else if (message.type === "created") {
      this.status(
        "部屋を作成しました。相手が同じ合言葉で参加するのを待っています。",
      );
    // 部屋参加成功通知
    } else if (message.type === "joined") {
      this.status("部屋に参加しました。対戦を開始します…");

    // 相手退出通知
    } else if (message.type === "opponent_left") {
      this.status("対戦相手が退出しました。新しい参加者を待てます。");

      this.opponentLeftHandlers.forEach((handler) => handler());


    // サーバーエラー通知
    } else if (message.type === "error" && typeof message.message === "string") {
      this.status(message.message);
    }
  }

  // サーバーへJSONメッセージを送信する
  private send(message: Record<string, unknown>): void {
    // WebSocketが接続中の場合のみ送信する
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  // 登録されたステータス通知イベントを実行する
  private status(message: string): void {
    this.statusHandlers.forEach((handler) => handler(message));
  }
}

/**
 * フレーム単位でオンライン対戦用入力同期を行うクラス
 *
 * 両プレイヤーが同じフレーム番号の入力を取得するまで
 * ゲームシミュレーションへ入力を渡さない。
 */
export class OnlineFrameBridge {
  // 自分側の入力履歴
  private readonly localInputs = new Map<number, FrameInput>();

  // 相手側の入力履歴
  private readonly remoteInputs = new Map<number, FrameInput>();

  // RoomClientから相手入力通知を受け取る
  public constructor(private readonly client: RoomClient) {
    client.onInput((frame, buttons) => {
      this.remoteInputs.set(frame, { buttons });
    });
  }

  // 指定フレームで使用する両プレイヤー入力を取得する
  // 両者の入力が揃っていない場合はundefinedを返し、
  // ゲーム更新処理を一時停止させる
  public inputsForFrame(
    frame: number,
    localInput: FrameInput,
  ): readonly [FrameInput, FrameInput] | undefined {

    // プレイヤー番号が未確定なら処理不可
    if (this.client.player === null) return undefined;

    // 初回のみ自分の入力を保存し、相手へ送信する
    if (!this.localInputs.has(frame)) {
      const snapshot = { buttons: localInput.buttons };
      this.localInputs.set(frame, snapshot);
      this.client.sendInput(frame, snapshot.buttons);
    }

    // 指定フレームの双方入力を取得
    const own = this.localInputs.get(frame);
    const remote = this.remoteInputs.get(frame);

    // どちらか片方でも未到着なら待機
    if (!own || !remote) return undefined;

    // 使用済みフレームの入力データを削除
    this.localInputs.delete(frame);
    this.remoteInputs.delete(frame);

    // プレイヤー番号順に入力を返す
    // Player0なら自分→相手
    // Player1なら相手→自分
    return this.client.player === 0 ? [own, remote] : [remote, own];
  }
}
