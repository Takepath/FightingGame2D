import type { FrameInput } from "./types";

export interface DeterministicSimulation {
  step(inputs: readonly [FrameInput, FrameInput]): void;
  checksum(): number;
}

/**
 * Frame-indexed input history is the boundary between real-time devices and deterministic logic.
 * It is usable for replay, rollback, or network input exchange without changing MatchSimulation.
 */
export class FrameSynchronizer {
  public frame = 0;
  public lastChecksum = 0;
  private readonly inputHistory = new Map<
    number,
    readonly [FrameInput, FrameInput]
  >();

  public advance(
    simulation: DeterministicSimulation,
    inputs: readonly [FrameInput, FrameInput],
  ): void {
    const frozen: readonly [FrameInput, FrameInput] = [
      { buttons: inputs[0].buttons },
      { buttons: inputs[1].buttons },
    ];
    this.inputHistory.set(this.frame, frozen);
    simulation.step(frozen);
    this.lastChecksum = simulation.checksum();
    this.frame += 1;

    // Keep ten seconds of exact input snapshots. A networked version can use these for rollback.
    const oldestFrame = this.frame - 600;
    if (oldestFrame > 0) this.inputHistory.delete(oldestFrame - 1);
  }

  public reset(): void {
    this.frame = 0;
    this.lastChecksum = 0;
    this.inputHistory.clear();
  }
}
