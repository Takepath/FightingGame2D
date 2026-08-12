import { RoomClient } from "./online";

<<<<<<< HEAD
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
=======
// 対戦準備完了時に呼ばれるコールバック型
type MatchCallback = (client: RoomClient) => void;

// 対戦終了時に呼ばれるコールバック型
type EndCallback = () => void;

/**
 * オンライン対戦用ロビー管理クラス
 * Pixiゲーム画面とは分離したDOMベースのUIを管理する。
 * 対戦開始前でも部屋作成・参加操作ができるようにする。
 */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
export class RoomLobby {
  // ネットワーク設定パネル要素
  private readonly panel = document.getElementById("network-panel")!;

  // 部屋合言葉入力欄
  private readonly phrase = document.getElementById("room-phrase") as HTMLInputElement;

  // 接続状態表示エリア
  private readonly status = document.getElementById("room-status")!;

  // 現在使用中のRoomClient
  // 未接続時はnull
  private client: RoomClient | null = null;

<<<<<<< HEAD
  /** ロビーのボタン操作と、接続完了・切断の画面遷移を結び付ける。 */
=======
  /**
   * ロビーUIイベントを初期化する
   * @param onMatchReady オンライン対戦開始可能時の処理
   * @param onMatchEnded オンライン対戦終了時の処理
   */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public constructor(
    private readonly onRoomReady: RoomReadyCallback,
    private readonly onRoomEnded: RoomEndedCallback,
    private readonly options: RoomLobbyOptions,
  ) {
<<<<<<< HEAD
    this.phrase.minLength = options.minPassphraseLength;
    this.phrase.maxLength = options.maxPassphraseLength;
    this.phrase.placeholder = `合言葉（${options.minPassphraseLength}〜${options.maxPassphraseLength}文字）`;
    document
      .getElementById("network-close")!
      .addEventListener("click", () => this.cancel());
=======
    // ネットワークメニュー表示ボタン
    document
      .getElementById("network-open")!
      .addEventListener("click", () => this.show());

    // ネットワークメニュー非表示ボタン
    document
      .getElementById("network-close")!
      .addEventListener("click", () => this.hide());

    // 部屋作成ボタン
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
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

<<<<<<< HEAD
  /** オンライン待ち受け画面からロビーを表示し、合言葉欄へフォーカスする。 */
  public show(message?: string): void {
    this.status.textContent =
      message ??
      `同じ合言葉（${this.options.minPassphraseLength}〜${this.options.maxPassphraseLength}文字）を入力して、2人用の部屋を作成または参加してください。`;
=======
  /**
   * ロビー画面を表示する
   * @param message 表示する初期メッセージ（任意）
   */
  public show(message?: string): void {
    // メッセージ指定がある場合は状態表示を更新
    if (message) {
      this.status.textContent = message;
    }

    // 非表示クラスを解除して表示
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    this.panel.classList.remove("is-hidden");

    // 合言葉入力欄へフォーカスを移動
    this.phrase.focus();
  }

<<<<<<< HEAD
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
=======
  /**
   * ロビー画面を非表示にする
   */
  private hide(): void {
    // CSSクラスで表示状態を切り替える
    this.panel.classList.add("is-hidden");
  }

  /**
   * オンライン対戦開始処理
   * 部屋作成または既存部屋への参加を行う。
   */
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  private start(mode: "create" | "join"): void {
    // 入力された合言葉を取得
    const phrase = this.phrase.value.trim();
<<<<<<< HEAD
    if (
      phrase.length < this.options.minPassphraseLength ||
      phrase.length > this.options.maxPassphraseLength
    ) {
      this.status.textContent = `合言葉は${this.options.minPassphraseLength}〜${this.options.maxPassphraseLength}文字で入力してください。`;
      return;
    }

    this.client?.close();
    const client = new RoomClient({ endpoint: this.options.endpoint });
=======

    // 合言葉の長さチェック
    if (phrase.length < 4 || phrase.length > 32) {
      this.status.textContent = "合言葉は4〜32文字で入力してください。";
      return;
    }

    // 既存のオンライン接続がある場合は終了する
    if (this.client) {
      this.client.close();
      this.onMatchEnded();
    }

    // 新しいRoomClientを生成
    const client = new RoomClient();

    // 現在利用中のクライアントとして保存
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
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
<<<<<<< HEAD
      this.client = null;
      client.close();
      this.onRoomEnded();
=======

      // ゲーム側へ終了通知
      this.onMatchEnded();

      // ロビーを再表示して待機状態へ戻す
      this.show("対戦相手が退出しました。同じ部屋で待機中です。");
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    });

    // サーバー接続切断時の処理
    client.onClose(() => {
      // 現在の接続でなければ無視
      if (this.client !== client) return;
<<<<<<< HEAD
      this.client = null;
      this.onRoomEnded();
=======

      // ゲーム終了処理を実行
      this.onMatchEnded();

      // 接続切断メッセージを表示
      this.show("ルームサーバーとの接続が切れました。");
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    });

    // WebSocket接続開始
    client.connect(mode, phrase);
  }

<<<<<<< HEAD
  /** ルーム接続を閉じ、Top画面へ戻す。 */
  private cancel(): void {
    this.disconnect();
    this.onRoomEnded();
=======
  /**
   * オンライン対戦を終了してローカル対戦へ戻る
   */
  private leave(): void {
    // 接続中ならWebSocketを閉じる
    this.client?.close();

    // 現在のクライアントを破棄
    this.client = null;

    // ゲーム側へ対戦終了通知
    this.onMatchEnded();

    // 状態表示を更新
    this.status.textContent = "ローカル対戦に戻りました。";

    // ロビーを閉じる
    this.hide();
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  }
}
