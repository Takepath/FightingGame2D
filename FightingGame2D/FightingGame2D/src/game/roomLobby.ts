import { RoomClient } from "./online";

/** 2人が揃い、キャラクター選択画面へ進めるようになった時の通知。 */
type RoomReadyCallback = (client: RoomClient) => void;

/** 接続キャンセル・相手退出・通信切断時にTop画面へ戻す通知。 */
type RoomEndedCallback = () => void;

/** ロビーの見た目を変えずに接続先・合言葉制約を差し替える設定。 */
export interface RoomLobbyOptions {
  endpoint?: string;
  minPassphraseLength: number;
  maxPassphraseLength: number;
}

/** 合言葉入力と部屋作成・参加を担当するオンライン待ち受け用DOMロビー。 */
export class RoomLobby {
  // ネットワーク設定パネル要素
  private readonly panel = document.getElementById("network-panel")!;

  // 部屋合言葉入力欄
  private readonly phrase = document.getElementById(
    "room-phrase",
  ) as HTMLInputElement;

  // 接続状態表示エリア
  private readonly status = document.getElementById("room-status")!;

  // 現在使用中のRoomClient
  // 未接続時はnull
  private client: RoomClient | null = null;

  /** ロビーのボタン操作と、接続完了・切断の画面遷移を結び付ける。 */
  public constructor(
    private readonly onRoomReady: RoomReadyCallback,
    private readonly onRoomEnded: RoomEndedCallback,
    private readonly options: RoomLobbyOptions,
  ) {
    this.phrase.minLength = options.minPassphraseLength;
    this.phrase.maxLength = options.maxPassphraseLength;
    this.phrase.placeholder = `合言葉（${options.minPassphraseLength}〜${options.maxPassphraseLength}文字）`;
    document
      .getElementById("network-close")!
      .addEventListener("click", () => this.cancel());
    document
      .getElementById("room-create")!
      .addEventListener("click", () => this.start("create"));

    // 部屋参加ボタン
    document
      .getElementById("room-join")!
      .addEventListener("click", () => this.start("join"));

    // オフライン対戦へ戻るボタン
    document
      .getElementById("room-offline")!
      .addEventListener("click", () => this.cancel());
  }

  /** オンライン待ち受け画面からロビーを表示し、合言葉欄へフォーカスする。 */
  public show(message?: string): void {
    this.status.textContent =
      message ??
      `同じ合言葉（${this.options.minPassphraseLength}〜${this.options.maxPassphraseLength}文字）を入力して、2人用の部屋を作成または参加してください。`;
    this.panel.classList.remove("is-hidden");

    // 合言葉入力欄へフォーカスを移動
    this.phrase.focus();
  }

  /** 対戦開始時に合言葉入力パネルを非表示にする。 */
  public hide(): void {
    this.panel.classList.add("is-hidden");
  }

  /** 待機中の接続を閉じ、ロビー表示を終了する。 */
  public disconnect(): void {
    this.client?.close();
    this.client = null;
    this.hide();
  }

  /** 合言葉を検証し、部屋作成または既存部屋への参加を開始する。 */
  private start(mode: "create" | "join"): void {
    // 入力された合言葉を取得
    const phrase = this.phrase.value.trim();
    if (
      phrase.length < this.options.minPassphraseLength ||
      phrase.length > this.options.maxPassphraseLength
    ) {
      this.status.textContent = `合言葉は${this.options.minPassphraseLength}〜${this.options.maxPassphraseLength}文字で入力してください。`;
      return;
    }

    this.client?.close();
    const client = new RoomClient({ endpoint: this.options.endpoint });
    this.client = client;

    // サーバー状態通知をUIへ反映
    client.onStatus((message) => {
      // 古いクライアントからの通知は無視する
      if (this.client === client) {
        this.status.textContent = message;
      }
    });

    // 対戦準備完了時の処理
    client.onReady(() => {
      // 別の接続へ切り替わっていた場合は無視
      if (this.client !== client) return;

      // ロビーを閉じてゲーム開始通知
      this.hide();
      this.onRoomReady(client);
    });

    // 対戦相手退出時の処理
    client.onOpponentLeft(() => {
      // 現在の接続でなければ無視
      if (this.client !== client) return;
      this.client = null;
      client.close();
      this.onRoomEnded();
    });

    // サーバー接続切断時の処理
    client.onClose(() => {
      // 現在の接続でなければ無視
      if (this.client !== client) return;
      this.client = null;
      this.onRoomEnded();
    });

    // WebSocket接続開始
    client.connect(mode, phrase);
  }

  /** ルーム接続を閉じ、Top画面へ戻す。 */
  private cancel(): void {
    this.disconnect();
    this.onRoomEnded();
  }
}
