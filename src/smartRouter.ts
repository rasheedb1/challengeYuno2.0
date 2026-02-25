import { ProcessorHealth, ProcessorConfig } from './types';
import { HealthTracker } from './healthTracker';
import { PROCESSOR_CONFIGS, MAX_COST } from './processors';

/**
 * Cost-aware score: take the raw health score and add a bonus for cheaper processors.
 * A processor that costs 20% less than the most expensive gets up to +5 score points.
 * This means equally-healthy processors will be preferred in order of lowest fee.
 */
function applyCostBonus(baseScore: number, config: ProcessorConfig): number {
  const costFraction = (MAX_COST - config.costPerTransaction) / MAX_COST;
  return baseScore + Math.round(costFraction * 5);
}

export class SmartRouter {
  private readonly overrides = new Map<string, boolean>(); // true=force-on, false=force-off

  constructor(
    private readonly tracker: HealthTracker,
    private readonly processorIds: string[],
  ) {}

  /**
   * Select the healthiest available processor using cost-aware weighted-random selection.
   * Down processors are skipped unless manually overridden to enabled.
   * Among processors with similar health, cheaper ones receive proportionally more traffic.
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
   * proportionally more traffic. Health (success rate + latency) dominates
   * the score; cost provides a small tiebreaker for equally-healthy processors.
   */
  private weightedRandomSelect(candidates: ProcessorHealth[]): string {
    const weights = candidates.map((h) => {
      const config = PROCESSOR_CONFIGS.find((c) => c.id === h.processorId);
      return config ? applyCostBonus(h.score, config) : h.score;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    if (totalWeight === 0) {
      return candidates[Math.floor(Math.random() * candidates.length)].processorId;
    }

    let cursor = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) return candidates[i].processorId;
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
