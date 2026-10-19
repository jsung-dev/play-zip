// 옥외 광고 전용 설정. 배달 브랜드/자전거 광고와는 연결하지 않습니다.
// image만 파일 경로 또는 HTTPS URL로 교체하세요. null/빈 경로/로딩 실패 = 광고주 구함.
export const OUTDOOR_AD_FORMATS = {
  square: { ratio: 1, source: [1080, 1080], texture: [1024, 1024] },
  portrait: { ratio: 9 / 16, source: [1080, 1920], texture: [576, 1024] },
  landscape: { ratio: 16 / 9, source: [1920, 1080], texture: [1024, 576] },
  banner: { ratio: 4, source: [1600, 400], texture: [1024, 256] },
} as const;
export type OutdoorAdFormat = keyof typeof OUTDOOR_AD_FORMATS;
export type OutdoorCreative = { id: string; format: OutdoorAdFormat; image: string | null };
export type OutdoorAdPlacement = OutdoorCreative & {
  type: "corner-store" | "rooftop" | "projecting" | "bus-stop" | "billboard";
  distance: number; // 경로상의 위치(m), 버스/주행 경로와 독립
  route: "main" | "left" | "right";
  side: "left" | "right";
  lateralOffset: number; // 경로 중심에서 좌/우로 떨어진 게임 공간 거리
  height: number; // 광고면 중심 높이
  width: number; // 광고면의 실제 가로 크기. 세로는 규격으로 자동 계산
  rotation: { approach: number; yawDegrees: number }; // approach=0이면 도로 기준 회전
};

export const OUTDOOR_AD_STYLE = { background: "#fffbed", ink: "#164f40", frame: "#427b60", fallback: "광고주 구함" } as const;

// 가로형/정사각형 중심으로 간격을 둡니다. 같은 format도 image를 각각 지정할 수 있습니다.
export const OUTDOOR_ADS: OutdoorAdPlacement[] = [
  { id: "outdoor-075", format: "landscape", image: null, type: "corner-store", distance: 75, route: "main", side: "left", lateralOffset: 18.2, height: 13.9, width: 13.5, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-110", format: "square", image: null, type: "corner-store", distance: 110, route: "main", side: "right", lateralOffset: 15.1, height: 10.3, width: 7, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-180", format: "portrait", image: null, type: "projecting", distance: 180, route: "main", side: "right", lateralOffset: 13.5, height: 9.5, width: 5.4, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-280", format: "landscape", image: null, type: "corner-store", distance: 280, route: "main", side: "left", lateralOffset: 18.2, height: 13.9, width: 13.5, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-295", format: "square", image: null, type: "corner-store", distance: 295, route: "main", side: "right", lateralOffset: 15.1, height: 10.3, width: 7, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-435", format: "portrait", image: null, type: "bus-stop", distance: 435, route: "main", side: "right", lateralOffset: 12.8, height: 5.1, width: 4.5, rotation: { approach: 45, yawDegrees: 0 } },
  { id: "outdoor-490", format: "square", image: null, type: "corner-store", distance: 490, route: "main", side: "right", lateralOffset: 20, height: 11.2, width: 8, rotation: { approach: 48, yawDegrees: 0 } },
  { id: "outdoor-left-600", format: "landscape", image: null, type: "billboard", distance: 600, route: "left", side: "left", lateralOffset: 15.6, height: 10, width: 12, rotation: { approach: 48, yawDegrees: 0 } },
  { id: "outdoor-right-600", format: "square", image: null, type: "billboard", distance: 600, route: "right", side: "right", lateralOffset: 13.8, height: 10, width: 8, rotation: { approach: 48, yawDegrees: 0 } },
  { id: "outdoor-715", format: "banner", image: null, type: "rooftop", distance: 715, route: "main", side: "right", lateralOffset: 19.4, height: 14.7, width: 16, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-790", format: "square", image: null, type: "bus-stop", distance: 790, route: "main", side: "left", lateralOffset: 13.8, height: 4.4, width: 6, rotation: { approach: 45, yawDegrees: 0 } },
  { id: "outdoor-890", format: "landscape", image: null, type: "corner-store", distance: 890, route: "main", side: "left", lateralOffset: 18.2, height: 13.9, width: 13.5, rotation: { approach: 42, yawDegrees: 0 } },
  { id: "outdoor-915", format: "square", image: null, type: "corner-store", distance: 915, route: "main", side: "right", lateralOffset: 15.1, height: 10.3, width: 7, rotation: { approach: 42, yawDegrees: 0 } },
];

// Overhead placement is separate from ground-mounted boards: its open span must
// not reserve a solid lot across the street or move the existing 13 billboards.
export type OverheadAdPlacement = OutdoorCreative & {
  format: "banner"; distance: number; width: number; height: number; supportSpan: number;
  route?: "main" | "left" | "right"; // 생략 = 큰길. 우회로 위에 세울 때만 지정
};
export const DESTINATION_OVERHEAD_AD: OverheadAdPlacement = {
  id: "outdoor-final-overhead", format: "banner", image: null,
  distance: 975, width: 14, height: 9.2, supportSpan: 18.5,
};
// 우회로는 큰길보다 좁아(버스 전용 측면 공간 없음) 지주 간격을 12m로 줄여 옆 건물 부지를 피합니다.
const overhead = (distance: number, width: number, height: number, route?: "left" | "right"): OverheadAdPlacement => ({
  id: `outdoor-overhead-${route ? `${route}-` : ""}${distance}`, format: "banner", image: null, distance, width, height, supportSpan: route ? 12 : 18.5, ...(route ? { route } : {}),
});
// 골목 입구·출구, 갈림길 갈라짐(495~570m) 구간은 피해 도로 위에 일정 간격으로 둡니다.
export const OVERHEAD_ADS: OverheadAdPlacement[] = [
  overhead(40, 12, 9),
  overhead(318, 12, 9),
  overhead(604, 11, 9, "left"),
  overhead(630, 11, 9, "right"),
  overhead(748, 13, 9.2),
  DESTINATION_OVERHEAD_AD,
];

export type BusAdPanel = OutdoorCreative & {
  busId: string;
  width: number;
  position: [number, number, number]; // 버스 내부 로컬 좌표
  rotationDegrees: [number, number, number];
};
const busPanel = (busId: string, side: "left" | "right", image: string | null = null): BusAdPanel => ({
  id: `${busId}-${side}`, busId, format: "banner", image, width: 4.8,
  position: [side === "left" ? -1.318 : 1.318, 1.12, 0], rotationDegrees: [0, side === "left" ? -90 : 90, 0],
});
// 버스 본체·주행 위치는 기존 그대로. 좌우별로 세 번째 인수에 이미지를 지정합니다.
export const BUS_AD_PANELS: BusAdPanel[] = [
  busPanel("bus-moving-170", "left"), busPanel("bus-moving-170", "right"),
  busPanel("bus-parked-330", "left"), busPanel("bus-parked-330", "right"),
  busPanel("bus-moving-540", "left"), busPanel("bus-moving-540", "right"),
  busPanel("bus-parked-710", "left"), busPanel("bus-parked-710", "right"),
  busPanel("bus-moving-835", "left"), busPanel("bus-moving-835", "right"),
];
