import type { FrameInput } from "./types";

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
  public advance(
    simulation: DeterministicSimulation,
    inputs: readonly [FrameInput, FrameInput],
  ): void {
    const snapshot: readonly [FrameInput, FrameInput] = [
      { buttons: inputs[0].buttons },
      { buttons: inputs[1].buttons },
    ];
    simulation.step(snapshot);
    this.frame += 1;
  }

  /** 新しい試合用にフレーム番号を初期化する。 */
  public reset(): void {
    this.frame = 0;
  }
}
