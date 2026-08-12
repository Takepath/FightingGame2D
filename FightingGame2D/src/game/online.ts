import {
  PassphraseRoomClient,
  type PassphraseRoomMode,
  type PassphraseRoomState,
} from "../../modules/passphrase-room/client";
import { COLOR_VARIANTS } from "./colors";
import type { ColorVariant, FrameInput, PlayerId } from "./types";

<<<<<<< HEAD
/** 格闘ゲーム用クライアントの接続先設定。 */
export interface RoomClientOptions {
  /** 合言葉ルームサーバーのWebSocket URL。省略時は既定の8787番ポートを使う。 */
  endpoint?: string;
}

/** ステータス表示用コールバック型。 */
type StatusHandler = (message: string) => void;
/** 2人が揃った時のコールバック型。 */
type ReadyHandler = (client: RoomClient) => void;
/** フレーム入力受信用コールバック型。 */
type InputHandler = (frame: number, buttons: number) => void;
/** キャラクター・カラー選択受信用コールバック型。 */
type SelectionHandler = (characterId: string, color: ColorVariant) => void;
/** 引数なし通知用コールバック型。 */
type VoidHandler = () => void;

/** 汎用モジュール上で格闘ゲームが使うイベント名。 */
const GAME_ROOM_EVENT = {
  input: "fight-input",
  selection: "fight-selection",
} as const;

/** オンライン通信で許可するカラーID一覧。 */
const COLOR_VARIANT_IDS = new Set<ColorVariant>(COLOR_VARIANTS);

/** 受信ペイロードがオブジェクトかを検証する。 */
=======
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

<<<<<<< HEAD
/** 汎用モジュールのエラーコードを、現在のゲーム画面向けの文言へ変換する。 */
function roomErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_passphrase: "合言葉は指定された文字数で入力してください。",
    room_already_exists:
      "その合言葉の部屋は既にあります。部屋に参加を選んでください。",
    room_not_found: "部屋が見つかりません。先に部屋を作成してください。",
    room_full: "この部屋は満員です。",
    network_error:
      "ルームサーバーに接続できません。npm run multiplayer を起動してください。",
    invalid_message: "通信データが無効です。",
  };
  return messages[code] ?? "ルーム通信でエラーが発生しました。";
}

/**
 * 汎用合言葉ルームを、格闘ゲームの入力同期・キャラクター選択へ接続するアダプター。
 * 他プロジェクトでは modules/passphrase-room を直接利用し、このクラスは持ち込まない。
 */
export class RoomClient {
  private readonly room: PassphraseRoomClient;
=======
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly readyHandlers = new Set<ReadyHandler>();
  private readonly inputHandlers = new Set<InputHandler>();
  private readonly selectionHandlers = new Set<SelectionHandler>();
  private readonly closeHandlers = new Set<VoidHandler>();
  private readonly opponentLeftHandlers = new Set<VoidHandler>();

<<<<<<< HEAD
  public constructor(options: RoomClientOptions = {}) {
    this.room = new PassphraseRoomClient(options);
    this.room.onState((state) => this.handleRoomState(state));
    this.room.onEvent(GAME_ROOM_EVENT.input, (payload) =>
      this.receiveInput(payload),
    );
    this.room.onEvent(GAME_ROOM_EVENT.selection, (payload) =>
      this.receiveSelection(payload),
    );
  }

  /** 自分のプレイヤー番号。汎用モジュールの参加順を格闘ゲーム用の型へ絞る。 */
  public get player(): PlayerId | null {
    return this.room.slot === 0 || this.room.slot === 1 ? this.room.slot : null;
  }

  /** 合言葉ルームの作成または参加を開始する。 */
  public connect(mode: PassphraseRoomMode, phrase: string): void {
    this.room.connect(mode, phrase);
  }

  /** 決定論的同期に使う入力ビットを相手へ送る。 */
=======

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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public sendInput(frame: number, buttons: number): void {
    this.room.sendEvent(GAME_ROOM_EVENT.input, { frame, buttons });
  }

<<<<<<< HEAD
  /** キャラクター選択で決定したIDとカラーを相手へ送る。 */
  public sendSelection(characterId: string, color: ColorVariant): void {
    this.room.sendEvent(GAME_ROOM_EVENT.selection, { characterId, color });
  }

  /** ロビー表示用の通信状態を登録する。 */
=======
  // ステータス通知イベントを登録する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

<<<<<<< HEAD
  /** 2人が揃った時の処理を登録する。 */
=======
  // 接続完了イベントを登録する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public onReady(handler: ReadyHandler): void {
    this.readyHandlers.add(handler);
  }

<<<<<<< HEAD
  /** 相手のフレーム入力受信処理を登録する。 */
=======
  // 相手入力受信イベントを登録する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public onInput(handler: InputHandler): void {
    this.inputHandlers.add(handler);
  }

<<<<<<< HEAD
  /** 相手のキャラクター・カラー選択受信処理を登録する。 */
  public onSelection(handler: SelectionHandler): void {
    this.selectionHandlers.add(handler);
  }

  /** 予期しない通信切断処理を登録する。 */
=======
  // 接続終了イベントを登録する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public onClose(handler: VoidHandler): void {
    this.closeHandlers.add(handler);
  }

<<<<<<< HEAD
  /** 相手が退出した時の処理を登録する。 */
=======
  // 相手退出イベントを登録する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public onOpponentLeft(handler: VoidHandler): void {
    this.opponentLeftHandlers.add(handler);
  }

<<<<<<< HEAD
  /** 通信を明示的に閉じる。 */
=======
  // WebSocket接続を閉じる
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public close(): void {
    this.room.close();
  }

<<<<<<< HEAD
  /** 汎用モジュールの状態通知をゲームのUIイベントへ翻訳する。 */
  private handleRoomState(state: PassphraseRoomState): void {
    if (state.type === "connecting") {
      this.status(`サーバーへ接続しています… (${state.endpoint})`);
    } else if (state.type === "created") {
      this.status(
        "部屋を作成しました。相手が同じ合言葉で参加するのを待っています。",
      );
    } else if (state.type === "joined") {
      this.status("部屋に参加しました。対戦を開始します…");
    } else if (state.type === "ready") {
      const player = this.player;
      if (player === null) return;
      this.status(`ルーム接続完了: Player ${player + 1}`);
      this.readyHandlers.forEach((handler) => handler(this));
    } else if (state.type === "opponent_left") {
=======
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
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
      this.status("対戦相手が退出しました。新しい参加者を待てます。");

      this.opponentLeftHandlers.forEach((handler) => handler());
<<<<<<< HEAD
    } else if (state.type === "closed") {
      this.status("接続が切断されました。");
      this.closeHandlers.forEach((handler) => handler());
    } else if (state.type === "error") {
      this.status(roomErrorMessage(state.code));
    }
  }

  /** 任意イベントから格闘ゲーム用フレーム入力だけを取り出す。 */
  private receiveInput(payload: unknown): void {
    if (!isRecord(payload)) return;
    const frame = payload.frame;
    const buttons = payload.buttons;
    if (
      typeof frame !== "number" ||
      typeof buttons !== "number" ||
      !Number.isInteger(frame) ||
      !Number.isInteger(buttons) ||
      frame < 0
    ) {
      return;
=======


    // サーバーエラー通知
    } else if (message.type === "error" && typeof message.message === "string") {
      this.status(message.message);
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    }
    this.inputHandlers.forEach((handler) => handler(frame, buttons));
  }

<<<<<<< HEAD
  /** 任意イベントからキャラクターIDとカラーIDを取り出す。 */
  private receiveSelection(payload: unknown): void {
    if (!isRecord(payload)) return;
    const characterId = payload.characterId;
    const color = payload.color;
    if (
      typeof characterId !== "string" ||
      characterId.length > 64 ||
      typeof color !== "string" ||
      !COLOR_VARIANT_IDS.has(color as ColorVariant)
    ) {
      return;
=======
  // サーバーへJSONメッセージを送信する
  private send(message: Record<string, unknown>): void {
    // WebSocketが接続中の場合のみ送信する
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    }
    this.selectionHandlers.forEach((handler) =>
      handler(characterId, color as ColorVariant),
    );
  }

<<<<<<< HEAD
  /** 登録済みのステータス表示へ通知する。 */
=======
  // 登録されたステータス通知イベントを実行する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private status(message: string): void {
    this.statusHandlers.forEach((handler) => handler(message));
  }
}

/**
<<<<<<< HEAD
 * フレーム単位でオンライン対戦用入力同期を行うクラス。
 * 両プレイヤーの同一フレーム入力が揃うまでシミュレーションへ渡さない。
=======
 * フレーム単位でオンライン対戦用入力同期を行うクラス
 *
 * 両プレイヤーが同じフレーム番号の入力を取得するまで
 * ゲームシミュレーションへ入力を渡さない。
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
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

<<<<<<< HEAD
  /** 指定フレームの両者入力が揃った時だけ、プレイヤー番号順で返す。 */
=======
  // 指定フレームで使用する両プレイヤー入力を取得する
  // 両者の入力が揃っていない場合はundefinedを返し、
  // ゲーム更新処理を一時停止させる
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public inputsForFrame(
    frame: number,
    localInput: FrameInput,
  ): readonly [FrameInput, FrameInput] | undefined {

    // プレイヤー番号が未確定なら処理不可
    if (this.client.player === null) return undefined;

<<<<<<< HEAD
=======
    // 初回のみ自分の入力を保存し、相手へ送信する
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
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

<<<<<<< HEAD
=======
    // 使用済みフレームの入力データを削除
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    this.localInputs.delete(frame);
    this.remoteInputs.delete(frame);

    // プレイヤー番号順に入力を返す
    // Player0なら自分→相手
    // Player1なら相手→自分
    return this.client.player === 0 ? [own, remote] : [remote, own];
  }
}
