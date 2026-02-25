import { Processor, ProcessorHealth } from './types';

/**
 * SmartRouter selects the best available processor for each transaction.
 *
 * Scoring formula (0–1 scale):
 *   score = (successRate * 0.7) - (avgResponseTimeMs / 10000 * 0.3)
 *
 * Status weights:
 *   healthy  → full score
 *   degraded → score * 0.4  (still usable but penalised)
 *   down     → excluded entirely
 *   disabled → excluded unless manually overridden
 *
 * Selection strategy: weighted-random based on score.
 * Processors with higher scores receive proportionally more traffic,
 * which distributes load while still biasing toward the healthiest processor.
 * This is strictly better than round-robin (ignores health) or always-best
 * (concentrates all load, no load balancing across equally-healthy processors).
 *
 * Cost-aware: feePercent is baked into the score via a small bonus so that
 * among processors with similar health, cheaper ones are slightly preferred.
 */
export class SmartRouter {
  private manualOverrides = new Map<string, boolean>(); // processorId → forced enabled/disabled

  /** Choose a processor via weighted-random selection based on health scores. */
  selectProcessor(
    processors: Processor[],
    healthMap: Map<string, ProcessorHealth>
  ): Processor | null {
    const candidates = this.filterCandidates(processors, healthMap);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].processor;
    return this.weightedRandomSelect(candidates);
  }

  /** Keep candidates that are not down (or are force-enabled via override). */
  private filterCandidates(
    processors: Processor[],
    healthMap: Map<string, ProcessorHealth>,
  ): Array<{ processor: Processor; score: number }> {
    return processors
      .filter((p) => {
        const override = this.manualOverrides.get(p.id);
        if (override === false) return false;           // force-disabled
        if (!p.enabled && override !== true) return false; // disabled without override
        const health = healthMap.get(p.id);
        if (!health) return true;                       // no data yet — optimistic
        return health.status !== 'down' || override === true;
      })
      .map((p) => ({ processor: p, score: this.computeScore(p, healthMap.get(p.id)) }));
  }

  /**
   * Weighted-random selection: each candidate's probability of being chosen
   * is proportional to its score. This distributes load according to health
   * rather than always routing to the single "best" processor.
   */
  private weightedRandomSelect(
    candidates: Array<{ processor: Processor; score: number }>,
  ): Processor {
    const totalWeight = candidates.reduce((sum, c) => sum + Math.max(0, c.score), 0);

    if (totalWeight === 0) {
      // All scores are non-positive — pick uniformly at random
      return candidates[Math.floor(Math.random() * candidates.length)].processor;
    }

    let cursor = Math.random() * totalWeight;
    for (const candidate of candidates) {
      cursor -= Math.max(0, candidate.score);
      if (cursor <= 0) return candidate.processor;
    }
    // Floating-point safety fallback
    return candidates[candidates.length - 1].processor;
  }

  /** Manually override a processor's availability. Pass null to clear override. */
  setOverride(processorId: string, enabled: boolean | null): void {
    if (enabled === null) {
      this.manualOverrides.delete(processorId);
    } else {
      this.manualOverrides.set(processorId, enabled);
    }
  }

  getOverride(processorId: string): boolean | null {
    return this.manualOverrides.get(processorId) ?? null;
  }

  getAllOverrides(): Record<string, boolean> {
    return Object.fromEntries(this.manualOverrides);
  }

  private computeScore(processor: Processor, health?: ProcessorHealth): number {
    if (!health) {
      // No data yet — neutral score, slightly adjusted for cost
      return 0.5 - processor.feePercent * 0.01;
    }

    // Health score: success rate weighted 70%, latency weighted 30%
    const healthScore =
      health.successRate * 0.7 -
      (health.avgResponseTimeMs / 10_000) * 0.3;

    // Cost bonus: lower fee gets a small score bump (max ~0.05 for 5% fee spread)
    const costBonus = (3.0 - processor.feePercent) * 0.01;

    const rawScore = healthScore + costBonus;

    // Penalise degraded processors heavily so they only receive traffic
    // when healthier alternatives are not available or also degraded.
    const statusMultiplier = health.status === 'degraded' ? 0.4 : 1.0;
    return rawScore * statusMultiplier;
  }
}
