import type { FrameInput } from "./types";

<<<<<<< HEAD
/** 60Hz固定フレームで進行できるゲームシミュレーションの契約。 */
export interface DeterministicSimulation {
  /** 2人分の同一フレーム入力でシミュレーションを1回進める。 */
  step(inputs: readonly [FrameInput, FrameInput]): void;
}

/**
 * ローカル・オンラインの両方で同じ入力スナップショットを使って
 * 決定論的シミュレーションを1フレームずつ進める。
 */
export class FrameSynchronizer {
  /** 現在のシミュレーションフレーム番号。 */
  public frame = 0;

  /** 入力を複製してからシミュレーションを1フレーム進める。 */
=======
/**
 * 決定論シミュレーションのインターフェース
 *
 * ・1フレーム分のシミュレーション実行
 * ・現在状態のチェックサム取得
 *
 * を実装するクラスが利用する。
 */
export interface DeterministicSimulation {
  /** 1フレーム分シミュレーションを進める */
  step(inputs: readonly [FrameInput, FrameInput]): void;

  /** 現在状態のチェックサムを取得する */
  checksum(): number;
}

/**
 * フレーム同期管理クラス
 *
 * 入力履歴をフレーム単位で保持し、
 * リプレイ・ロールバック・ネットワーク同期などに利用できる。
 */
export class FrameSynchronizer {
  /** 現在フレーム番号 */
  public frame = 0;

  /** 最新チェックサム */
  public lastChecksum = 0;

  /**
   * フレームごとの入力履歴
   *
   * Key   : フレーム番号
   * Value : プレイヤー1・2の入力情報
   */
  private readonly inputHistory = new Map<
    number,
    readonly [FrameInput, FrameInput]
  >();

  //====================================================
  // シミュレーションを1フレーム進める
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public advance(
    simulation: DeterministicSimulation,
    inputs: readonly [FrameInput, FrameInput],
  ): void {
<<<<<<< HEAD
    const snapshot: readonly [FrameInput, FrameInput] = [
      { buttons: inputs[0].buttons },
      { buttons: inputs[1].buttons },
    ];
    simulation.step(snapshot);
    this.frame += 1;
  }

  /** 新しい試合用にフレーム番号を初期化する。 */
=======

    //====================================================
    // 入力情報をコピーして保存
    // （後から変更されないようにスナップショット化）
    //====================================================
    const frozen: readonly [FrameInput, FrameInput] = [
      {
        buttons: inputs[0].buttons,
      },
      {
        buttons: inputs[1].buttons,
      },
    ];

    // 入力履歴へ保存
    this.inputHistory.set(this.frame, frozen);

    //====================================================
    // シミュレーション実行
    //====================================================
    simulation.step(frozen);

    // 最新状態のチェックサム取得
    this.lastChecksum = simulation.checksum();

    // 次フレームへ
    this.frame += 1;

    //====================================================
    // 古い入力履歴を削除
    //
    // 約10秒分（600フレーム）だけ保持する。
    // ネットワーク対戦ではロールバック処理などで利用できる。
    //====================================================
    const oldestFrame = this.frame - 600;

    if (oldestFrame > 0) {
      this.inputHistory.delete(oldestFrame - 1);
    }
  }

  //====================================================
  // 同期情報を初期状態へ戻す
  //====================================================
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  public reset(): void {

    // フレーム番号初期化
    this.frame = 0;
<<<<<<< HEAD
=======

    // チェックサム初期化
    this.lastChecksum = 0;

    // 入力履歴を全削除
    this.inputHistory.clear();
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
  }
}
