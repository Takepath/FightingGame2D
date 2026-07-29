import { RoomClient } from "./online";

type MatchCallback = (client: RoomClient) => void;
type EndCallback = () => void;

/** DOM lobby kept outside Pixi so its room controls work before a match starts. */
export class RoomLobby {
  private readonly panel = document.getElementById("network-panel")!;
  private readonly phrase = document.getElementById(
    "room-phrase",
  ) as HTMLInputElement;
  private readonly status = document.getElementById("room-status")!;
  private client: RoomClient | null = null;

  public constructor(
    private readonly onMatchReady: MatchCallback,
    private readonly onMatchEnded: EndCallback,
  ) {
    document
      .getElementById("network-open")!
      .addEventListener("click", () => this.show());
    document
      .getElementById("network-close")!
      .addEventListener("click", () => this.hide());
    document
      .getElementById("room-create")!
      .addEventListener("click", () => this.start("create"));
    document
      .getElementById("room-join")!
      .addEventListener("click", () => this.start("join"));
    document
      .getElementById("room-offline")!
      .addEventListener("click", () => this.leave());
  }

  public show(message?: string): void {
    if (message) this.status.textContent = message;
    this.panel.classList.remove("is-hidden");
    this.phrase.focus();
  }

  private hide(): void {
    this.panel.classList.add("is-hidden");
  }

  private start(mode: "create" | "join"): void {
    const phrase = this.phrase.value.trim();
    if (phrase.length < 4 || phrase.length > 32) {
      this.status.textContent = "合言葉は4〜32文字で入力してください。";
      return;
    }

    if (this.client) {
      this.client.close();
      this.onMatchEnded();
    }
    const client = new RoomClient();
    this.client = client;
    client.onStatus((message) => {
      if (this.client === client) this.status.textContent = message;
    });
    client.onReady(() => {
      if (this.client !== client) return;
      this.hide();
      this.onMatchReady(client);
    });
    client.onOpponentLeft(() => {
      if (this.client !== client) return;
      this.onMatchEnded();
      this.show("対戦相手が退出しました。同じ部屋で待機中です。");
    });
    client.onClose(() => {
      if (this.client !== client) return;
      this.onMatchEnded();
      this.show("ルームサーバーとの接続が切れました。");
    });
    client.connect(mode, phrase);
  }

  private leave(): void {
    this.client?.close();
    this.client = null;
    this.onMatchEnded();
    this.status.textContent = "ローカル対戦に戻りました。";
    this.hide();
  }
}
