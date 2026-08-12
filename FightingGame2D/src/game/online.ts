import {
  PassphraseRoomClient,
  type PassphraseRoomMode,
  type PassphraseRoomState,
} from "../../modules/passphrase-room/client";
import { COLOR_VARIANTS } from "./colors";
import type { ColorVariant, FrameInput, PlayerId } from "./types";

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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly readyHandlers = new Set<ReadyHandler>();
  private readonly inputHandlers = new Set<InputHandler>();
  private readonly selectionHandlers = new Set<SelectionHandler>();
  private readonly closeHandlers = new Set<VoidHandler>();
  private readonly opponentLeftHandlers = new Set<VoidHandler>();

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
  public sendInput(frame: number, buttons: number): void {
    this.room.sendEvent(GAME_ROOM_EVENT.input, { frame, buttons });
  }

  /** キャラクター選択で決定したIDとカラーを相手へ送る。 */
  public sendSelection(characterId: string, color: ColorVariant): void {
    this.room.sendEvent(GAME_ROOM_EVENT.selection, { characterId, color });
  }

  /** ロビー表示用の通信状態を登録する。 */
  public onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

  /** 2人が揃った時の処理を登録する。 */
  public onReady(handler: ReadyHandler): void {
    this.readyHandlers.add(handler);
  }

  /** 相手のフレーム入力受信処理を登録する。 */
  public onInput(handler: InputHandler): void {
    this.inputHandlers.add(handler);
  }

  /** 相手のキャラクター・カラー選択受信処理を登録する。 */
  public onSelection(handler: SelectionHandler): void {
    this.selectionHandlers.add(handler);
  }

  /** 予期しない通信切断処理を登録する。 */
  public onClose(handler: VoidHandler): void {
    this.closeHandlers.add(handler);
  }

  /** 相手が退出した時の処理を登録する。 */
  public onOpponentLeft(handler: VoidHandler): void {
    this.opponentLeftHandlers.add(handler);
  }

  /** 通信を明示的に閉じる。 */
  public close(): void {
    this.room.close();
  }

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
      this.status("対戦相手が退出しました。新しい参加者を待てます。");
      this.opponentLeftHandlers.forEach((handler) => handler());
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
    }
    this.inputHandlers.forEach((handler) => handler(frame, buttons));
  }

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
    }
    this.selectionHandlers.forEach((handler) =>
      handler(characterId, color as ColorVariant),
    );
  }

  /** 登録済みのステータス表示へ通知する。 */
  private status(message: string): void {
    this.statusHandlers.forEach((handler) => handler(message));
  }
}

/**
 * フレーム単位でオンライン対戦用入力同期を行うクラス。
 * 両プレイヤーの同一フレーム入力が揃うまでシミュレーションへ渡さない。
 */
export class OnlineFrameBridge {
  private readonly localInputs = new Map<number, FrameInput>();
  private readonly remoteInputs = new Map<number, FrameInput>();

  public constructor(private readonly client: RoomClient) {
    client.onInput((frame, buttons) => {
      this.remoteInputs.set(frame, { buttons });
    });
  }

  /** 指定フレームの両者入力が揃った時だけ、プレイヤー番号順で返す。 */
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
