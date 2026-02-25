import { ProcessorHealth } from './types';
import { HealthTracker } from './healthTracker';

export class SmartRouter {
  private readonly overrides = new Map<string, boolean>(); // true=force-on, false=force-off

  constructor(
    private readonly tracker: HealthTracker,
    private readonly processorIds: string[],
  ) {}

  /**
   * Select the healthiest available processor using weighted-random selection.
   * Down processors are skipped unless manually overridden to enabled.
   * Returns null only when all processors are unavailable.
   */
  selectProcessor(): string | null {
    const healthList = this.tracker.getAllHealth(this.processorIds);
    const candidates = this.filterCandidates(healthList);

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].processorId;

    return this.weightedRandomSelect(candidates);
  }

  /**
   * Filter processors according to health status and manual overrides.
   */
  private filterCandidates(healthList: ProcessorHealth[]): ProcessorHealth[] {
    return healthList.filter((h) => {
      const override = this.overrides.get(h.processorId);
      if (override === false) return false; // explicitly disabled
      if (override === true) return true;   // explicitly enabled
      return h.status !== 'down';           // normal: skip down processors
    });
  }

  /**
   * Weighted-random selection: processors with higher scores receive
   * proportionally more traffic. This biases toward healthier processors
   * while still distributing load.
   */
  private weightedRandomSelect(candidates: ProcessorHealth[]): string {
    const totalWeight = candidates.reduce((sum, h) => sum + h.score, 0);

    if (totalWeight === 0) {
      // All scores are zero — pick uniformly at random
      return candidates[Math.floor(Math.random() * candidates.length)].processorId;
    }

    let cursor = Math.random() * totalWeight;
    for (const candidate of candidates) {
      cursor -= candidate.score;
      if (cursor <= 0) return candidate.processorId;
    }
    // Floating-point safety fallback
    return candidates[candidates.length - 1].processorId;
  }

  setOverride(processorId: string, enabled: boolean | null): void {
    if (enabled === null) {
      this.overrides.delete(processorId);
    } else {
      this.overrides.set(processorId, enabled);
    }
  }

  getOverride(processorId: string): boolean | null {
    return this.overrides.get(processorId) ?? null;
  }

  getRoutingInfo(): Array<{ processorId: string; health: ProcessorHealth; override: boolean | null }> {
    return this.processorIds.map((id) => ({
      processorId: id,
      health: this.tracker.getHealth(id),
      override: this.getOverride(id),
    }));
  }
}
