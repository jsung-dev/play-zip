// Run result: stars from how cleanly the ride went. In-game only, not a reward.
export const STAR_RULES = { threeMaxHits: 1, twoMaxHits: 4 } as const;

/** 3★ needs every delivery with at most one bump; 2★ a few bumps; finishing earns 1★. */
export function starsFor(hits: number, deliveries: number, totalDeliveries: number): 1 | 2 | 3 {
  if (hits <= STAR_RULES.threeMaxHits && deliveries >= totalDeliveries) return 3;
  if (hits <= STAR_RULES.twoMaxHits) return 2;
  return 1;
}

// Named stretches give the ride a shape: warm-up, a first gap, lane work,
// the fork, moving hazards, then the finale. A banner shows on entry.
export const SECTIONS = [
  { from: 70, name: "1구간 · 점프 연습" },
  { from: 198, name: "2구간 · 지그재그" },
  { from: 245, name: "3구간 · 차단기와 무너진 도로" },
  { from: 314, name: "4구간 · 바리케이드와 증기" },
  { from: 398, name: "5구간 · 연속 허들" },
  { from: 505, name: "6구간 · 우회로 질주" },
  { from: 692, name: "7구간 · 버스와 수박 소나기" },
  { from: 830, name: "8구간 · 신호 차선" },
  { from: 882, name: "마지막 · 무너진 도로와 고양이·오리 가족" },
] as const;

export function sectionEntered(previous: number, position: number) {
  return SECTIONS.find(section => previous < section.from && position >= section.from) ?? null;
}
