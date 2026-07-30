import { RoomClient } from "./online";

// 対戦準備完了時に呼ばれるコールバック型
type MatchCallback = (client: RoomClient) => void;

// 対戦終了時に呼ばれるコールバック型
type EndCallback = () => void;

/**
 * オンライン対戦用ロビー管理クラス
 * Pixiゲーム画面とは分離したDOMベースのUIを管理する。
 * 対戦開始前でも部屋作成・参加操作ができるようにする。
 */
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

  /**
   * ロビーUIイベントを初期化する
   * @param onMatchReady オンライン対戦開始可能時の処理
   * @param onMatchEnded オンライン対戦終了時の処理
   */
  public constructor(
    private readonly onMatchReady: MatchCallback,
    private readonly onMatchEnded: EndCallback,
  ) {
    // ネットワークメニュー表示ボタン
    document
      .getElementById("network-open")!
      .addEventListener("click", () => this.show());

    // ネットワークメニュー非表示ボタン
    document
      .getElementById("network-close")!
      .addEventListener("click", () => this.hide());

    // 部屋作成ボタン
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
      .addEventListener("click", () => this.leave());
  }

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
    this.panel.classList.remove("is-hidden");

    // 合言葉入力欄へフォーカスを移動
    this.phrase.focus();
  }

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
  private start(mode: "create" | "join"): void {
    // 入力された合言葉を取得
    const phrase = this.phrase.value.trim();

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
      this.onMatchReady(client);
    });

    // 対戦相手退出時の処理
    client.onOpponentLeft(() => {
      // 現在の接続でなければ無視
      if (this.client !== client) return;

      // ゲーム側へ終了通知
      this.onMatchEnded();

      // ロビーを再表示して待機状態へ戻す
      this.show("対戦相手が退出しました。同じ部屋で待機中です。");
    });

    // サーバー接続切断時の処理
    client.onClose(() => {
      // 現在の接続でなければ無視
      if (this.client !== client) return;

      // ゲーム終了処理を実行
      this.onMatchEnded();

      // 接続切断メッセージを表示
      this.show("ルームサーバーとの接続が切れました。");
    });

    // WebSocket接続開始
    client.connect(mode, phrase);
  }

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
  }
}
