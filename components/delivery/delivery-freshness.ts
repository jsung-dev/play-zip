// Milk freshness: the run's clock. Every second of riding uses some up, hits and
// falls cost extra, and what is left at the apartment decides the stars.
// In-game only — not points, currency or a reward outside this run.
export const FRESHNESS = { seconds: 160, hitPenalty: 3, fallPenalty: 6 } as const;
export const STAR_THRESHOLDS = { three: .5, two: .25 } as const;

export const freshnessLeft = (usedSeconds: number) => Math.max(0, Math.min(1, 1 - usedSeconds / FRESHNESS.seconds));

/** 3★ needs fresh milk and every delivery; 2★ fairly fresh; otherwise 1★ for finishing. */
export function starsFor(freshness: number, deliveries: number, totalDeliveries: number): 1 | 2 | 3 {
  if (freshness >= STAR_THRESHOLDS.three && deliveries >= totalDeliveries) return 3;
  if (freshness >= STAR_THRESHOLDS.two) return 2;
  return 1;
}

// Named stretches give the ride a shape: warm-up, a first gap, lane work,
// the fork, moving hazards, then the finale. A banner shows on entry.
export const SECTIONS = [
  { from: 95, name: "1구간 · 점프 연습" },
  { from: 215, name: "2구간 · 무너진 도로" },
  { from: 400, name: "3구간 · 갈림길 앞 직선" },
  { from: 505, name: "4구간 · 우회로 질주" },
  { from: 690, name: "5구간 · 움직이는 장애물" },
  { from: 850, name: "마지막 구간 · 아파트까지" },
] as const;

export function sectionEntered(previous: number, position: number) {
  return SECTIONS.find(section => previous < section.from && position >= section.from) ?? null;
}
