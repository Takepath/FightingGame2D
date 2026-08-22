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

  /** 読み取り専用の入力をそのまま渡し、固定フレームごとの不要な複製を避ける。 */
  public advance(
    simulation: DeterministicSimulation,
    inputs: readonly [FrameInput, FrameInput],
  ): void {
    simulation.step(inputs);
    this.frame += 1;
  }

  /** 新しい試合用にフレーム番号を初期化する。 */
  public reset(): void {
    // フレーム番号初期化
    this.frame = 0;
  }
}
