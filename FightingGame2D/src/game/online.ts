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

/** 通信状況に応じて調整する、オンライン入力遅延バッファの設定。 */
export interface OnlineInputDelayOptions {
  /** 対戦開始時に確保する入力遅延フレーム数。 */
  initialFrames: number;
  /** 遅延が安定している時に下げられる最小フレーム数。 */
  minFrames: number;
  /** 受信遅延・揺らぎが大きい時に上げられる最大フレーム数。 */
  maxFrames: number;
  /** 安定後に遅延を1フレーム下げるまでの連続フレーム数。 */
  decreaseAfterStableFrames: number;
}

/** ngrokなどの中継経路でも先読みを確保しやすい既定値。 */
const DEFAULT_INPUT_DELAY_OPTIONS: OnlineInputDelayOptions = {
  initialFrames: 6,
  minFrames: 3,
  maxFrames: 15,
  decreaseAfterStableFrames: 240,
};

/** 初期バッファに使う、両プレイヤー共通のニュートラル入力。 */
const NEUTRAL_INPUT: FrameInput = { buttons: 0 };

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
  // 自分側の入力履歴
  private readonly localInputs = new Map<number, FrameInput>();

  // 相手側の入力履歴
  private readonly remoteInputs = new Map<number, FrameInput>();

  /** 送信済みの自分入力で、最も先のシミュレーションフレーム。 */
  private highestLocalInputFrame: number;

  /** 受信済みの相手入力で、最も先のシミュレーションフレーム。 */
  private highestRemoteInputFrame: number;

  /** 既にシミュレーションへ渡したフレーム。遅延到着した古い入力を捨てる。 */
  private lastConsumedFrame = -1;

  /** 現在適用中の入力遅延フレーム数。 */
  private inputDelayFrames: number;

  /** 遅延を下げる判断に使う、安定して入力を先読みできた連続フレーム数。 */
  private stableFrameCount = 0;

  /** 遅延設定を正規化して保持する。 */
  private readonly delayOptions: OnlineInputDelayOptions;

  // RoomClientから相手入力通知を受け取る
  public constructor(
    private readonly client: RoomClient,
    options: Partial<OnlineInputDelayOptions> = {},
  ) {
    const minFrames = this.validFrameOption(
      options.minFrames,
      DEFAULT_INPUT_DELAY_OPTIONS.minFrames,
    );
    const maxFrames = Math.max(
      minFrames,
      this.validFrameOption(
        options.maxFrames,
        DEFAULT_INPUT_DELAY_OPTIONS.maxFrames,
      ),
    );
    const initialFrames = Math.min(
      maxFrames,
      Math.max(
        minFrames,
        this.validFrameOption(
          options.initialFrames,
          DEFAULT_INPUT_DELAY_OPTIONS.initialFrames,
        ),
      ),
    );
    this.delayOptions = {
      initialFrames,
      minFrames,
      maxFrames,
      decreaseAfterStableFrames: this.validFrameOption(
        options.decreaseAfterStableFrames,
        DEFAULT_INPUT_DELAY_OPTIONS.decreaseAfterStableFrames,
      ),
    };
    this.inputDelayFrames = initialFrames;
    this.highestLocalInputFrame = initialFrames - 1;
    this.highestRemoteInputFrame = initialFrames - 1;

    // 両者が同じ初期ニュートラル区間を使うことで、開始直後の通信待ちを避ける。
    for (let frame = 0; frame < initialFrames; frame += 1) {
      this.localInputs.set(frame, { ...NEUTRAL_INPUT });
      this.remoteInputs.set(frame, { ...NEUTRAL_INPUT });
    }

    client.onInput((frame, buttons) => {
      if (frame <= this.lastConsumedFrame) return;
      this.remoteInputs.set(frame, { buttons });
      this.highestRemoteInputFrame = Math.max(
        this.highestRemoteInputFrame,
        frame,
      );
    });
  }

  /** 現在の通信状況から選ばれた入力遅延フレーム数を返す。 */
  public get delayFrames(): number {
    return this.inputDelayFrames;
  }

  /** 指定フレームの両者入力が揃った時だけ、プレイヤー番号順で返す。 */
  public inputsForFrame(
    frame: number,
    localInput: FrameInput,
  ): readonly [FrameInput, FrameInput] | undefined {
    // プレイヤー番号が未確定なら処理不可
    if (this.client.player === null) return undefined;

    // 現在入力を遅延フレーム数だけ先へ割り当て、ネットワーク到着時間を吸収する。
    this.scheduleLocalInput(frame, localInput.buttons);

    // 指定フレームの双方入力を取得
    const own = this.localInputs.get(frame);
    const remote = this.remoteInputs.get(frame);

    // どちらか片方でも未到着なら待機
    if (!own || !remote) {
      // 実際に待機した場合は、次の入力をさらに先へ送って揺らぎを吸収する。
      this.increaseDelay();
      this.stableFrameCount = 0;
      return undefined;
    }

    this.localInputs.delete(frame);
    this.remoteInputs.delete(frame);
    this.lastConsumedFrame = frame;
    this.refreshHighestRemoteInputFrame();
    this.adjustDelayFromRemoteBuffer(frame);

    // プレイヤー番号順に入力を返す
    // Player0なら自分→相手
    // Player1なら相手→自分
    return this.client.player === 0 ? [own, remote] : [remote, own];
  }

  /** 現在の入力を未来フレームへ連続配置し、遅延増加時のフレーム欠落も防ぐ。 */
  private scheduleLocalInput(frame: number, buttons: number): void {
    const targetFrame = frame + this.inputDelayFrames;
    for (
      let target = this.highestLocalInputFrame + 1;
      target <= targetFrame;
      target += 1
    ) {
      const snapshot = { buttons };
      this.localInputs.set(target, snapshot);
      this.client.sendInput(target, snapshot.buttons);
    }
    this.highestLocalInputFrame = Math.max(
      this.highestLocalInputFrame,
      targetFrame,
    );
  }

  /** 相手入力の先読み量から、遅延を上げる・安定時に下げる判断を行う。 */
  private adjustDelayFromRemoteBuffer(frame: number): void {
    const remoteLead = this.highestRemoteInputFrame - frame;
    const requiredLead = Math.max(2, Math.ceil(this.inputDelayFrames / 2));
    if (remoteLead < requiredLead) {
      this.increaseDelay();
      this.stableFrameCount = 0;
      return;
    }

    this.stableFrameCount += 1;
    if (
      this.stableFrameCount >= this.delayOptions.decreaseAfterStableFrames &&
      this.inputDelayFrames > this.delayOptions.minFrames
    ) {
      // 1回に1フレームだけ下げ、未来フレームに割り当て済みの入力を安全に使い切る。
      this.inputDelayFrames -= 1;
      this.stableFrameCount = 0;
    }
  }

  /** 遅延を上げられる範囲で1フレーム増やす。 */
  private increaseDelay(): void {
    this.inputDelayFrames = Math.min(
      this.delayOptions.maxFrames,
      this.inputDelayFrames + 1,
    );
  }

  /** 消費済み入力を除いた、相手入力の最先端フレームを更新する。 */
  private refreshHighestRemoteInputFrame(): void {
    let highest = this.lastConsumedFrame;
    for (const frame of this.remoteInputs.keys()) {
      if (frame > highest) highest = frame;
    }
    this.highestRemoteInputFrame = highest;
  }

  /** 正の整数フレーム設定だけを採用し、不正値は既定値へ戻す。 */
  private validFrameOption(
    value: number | undefined,
    fallback: number,
  ): number {
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }
}
