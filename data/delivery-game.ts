export type BrandId = "mongle" | "seoul" | "delicious" | "crispy" | "green";

export type DeliveryBrand = {
  id: BrandId;
  name: string;
  logoImage: string;
  primaryColor: string;
  secondaryColor: string;
  inkColor: string;
  productName: string;
  productImage: string;
  deliveryPackageImage: string;
  slogan: string;
  signImage: string;
  busSideImage: string;
};

export type BusPlacement = {
  id: string;
  distance: number;
  brandId: BrandId;
  mode: "moving" | "parked";
  side: "left" | "right";
  speed: number;
};

export type SceneryItem = {
  id: string;
  distance: number;
  type: "house" | "shop" | "tree" | "lamp" | "bus-stop";
  side: "left" | "right";
  variant: number;
};

export type ObstaclePlacement = {
  id: string;
  distance: number;
  lane: 0 | 1 | 2;
  kind: "cones" | "barrier" | "box" | "plank" | "crates" | "overhead" | "signbeam";
  // Lanes covered to the right of `lane`; 3 blocks the whole road (jump only).
  span?: 1 | 2 | 3;
  // Placed on a detour branch instead of the main road.
  branch?: "left" | "right";
};

export const DELIVERY_BRANDS: Record<BrandId, DeliveryBrand> = {
  mongle: {
    id: "mongle",
    name: "몽글우유",
    logoImage: "/games/delivery/brands/mongle/logo.svg",
    primaryColor: "#f39bb2",
    secondaryColor: "#fff4dc",
    inkColor: "#7c4556",
    productName: "딸기우유 세트",
    productImage: "/games/delivery/brands/mongle/product.svg",
    deliveryPackageImage: "/games/delivery/brands/mongle/package.svg",
    slogan: "오늘도 몽글하게",
    signImage: "/games/delivery/brands/mongle/sign.svg",
    busSideImage: "/games/delivery/brands/mongle/bus-side.svg",
  },
  seoul: {
    id: "seoul",
    name: "서울우유",
    logoImage: "/games/delivery/brands/seoul/logo.svg",
    primaryColor: "#92bed9",
    secondaryColor: "#f5f8f3",
    inkColor: "#345d78",
    productName: "데일리 우유 세트",
    productImage: "/games/delivery/brands/seoul/product.svg",
    deliveryPackageImage: "/games/delivery/brands/seoul/product.svg",
    slogan: "기분 좋은 하루의 한 모금",
    signImage: "/games/delivery/brands/seoul/sign.svg",
    busSideImage: "/games/delivery/brands/seoul/sign.svg",
  },
  delicious: {
    id: "delicious",
    name: "맛있는우유",
    logoImage: "/games/delivery/brands/delicious/logo.svg",
    primaryColor: "#b7a8d4",
    secondaryColor: "#faf5e9",
    inkColor: "#615379",
    productName: "우유 한 잔 세트",
    productImage: "/games/delivery/brands/delicious/product.svg",
    deliveryPackageImage: "/games/delivery/brands/delicious/product.svg",
    slogan: "우리 집에 도착한 작은 행복",
    signImage: "/games/delivery/brands/delicious/sign.svg",
    busSideImage: "/games/delivery/brands/delicious/sign.svg",
  },
  crispy: {
    id: "crispy",
    name: "바삭상점",
    logoImage: "/games/delivery/brands/crispy/logo.svg",
    primaryColor: "#f5a623",
    secondaryColor: "#fff1a8",
    inkColor: "#704615",
    productName: "버터 쿠키",
    productImage: "/games/delivery/brands/crispy/product.svg",
    deliveryPackageImage: "/games/delivery/brands/crispy/product.svg",
    slogan: "한 입의 바삭한 행복",
    signImage: "/games/delivery/brands/crispy/sign.svg",
    busSideImage: "/games/delivery/brands/crispy/bus-side.svg",
  },
  green: {
    id: "green",
    name: "초록쉼표",
    logoImage: "/games/delivery/brands/green/logo.svg",
    primaryColor: "#65aa78",
    secondaryColor: "#f7f1d8",
    inkColor: "#315c43",
    productName: "그린 티 에이드",
    productImage: "/games/delivery/brands/green/product.svg",
    deliveryPackageImage: "/games/delivery/brands/green/product.svg",
    slogan: "잠깐 쉬어가도 괜찮아",
    signImage: "/games/delivery/brands/green/sign.svg",
    busSideImage: "/games/delivery/brands/green/bus-side.svg",
  },
};

export const DELIVERY_GAME_CONFIG = {
  deliveryBrandId: "mongle" as BrandId,
  destinationName: "햇살 아파트 101동",
  totalDistance: 1_000,
  forwardSpeedPerSecond: 20,
  reverseSpeedPerSecond: 8,
  accelerationPerSecond: 8,
  decelerationPerSecond: 13,
  directionChangeDecelerationPerSecond: 17,
  roadWidth: 8.4,
  busLaneOffset: 6.1,
  cameraFovDegrees: 55,
  cameraHeight: 5.7,
  cameraFollowDistance: 9.4,
  laneSpacing: 2.5,
  laneChangeSeconds: 0.26,
  collisionHalfWidth: 1.18,
  collisionHalfLength: 1.25,
  collisionSlowdownSeconds: 1.0,
  obstaclePassThroughSeconds: 2.3,
  deliveryStopDwellSeconds: 1.6,
  deliverySuccessSeconds: 3,
  drivewayWidth: 4.4,
  drivewaySideOffset: 18,
  drivewayForwardOffset: 17,
  drivewayDeliveryDepth: 8,
  deliveryAutoBrakePerSecond: 9,
} as const;

export const OBSTACLE_PLACEMENTS: ObstaclePlacement[] = [
  // 2026-10 재설계 2차: 구간마다 한 가지 패턴, 패턴끼리는 10m 이상 간격(같은 패턴은 같은 거리).
  // 하늘에서 떨어지는 것·움직이는 장애물은 components/delivery/delivery-movers.ts에 있습니다.
  // 배달 존 앞 30m~뒤 30m(멈춤·출발 구간), 갈림길, 붕괴 도로 비행 구간, 목적지 직전은 비워 둡니다. 같은 위치 겹침 없이 20m 안팎 간격으로 한 번에 하나씩.
  // 숙이기: 도로 전체를 가로지르는 낮은 가로대(span 3). 점프로는 못 넘고 아래로 스와이프해 숙여야 지나갑니다.
  { id: "duck-overhead-314", distance: 314, lane: 0, kind: "overhead", span: 3 },
  { id: "duck-overhead-880", distance: 880, lane: 0, kind: "overhead", span: 3 },
  // 1구간 점프 연습: 전 차선 판자 → 두 차선 상자 → (하늘 택배) → 양쪽 콘 → (수박 소나기) → 두 차선 상자.
  { id: "s1-plank-80", distance: 80, lane: 0, kind: "plank", span: 3 },
  { id: "s1-crates-112", distance: 112, lane: 1, kind: "crates", span: 2 },
  { id: "s1-cones-144-0", distance: 144, lane: 0, kind: "cones" },
  { id: "s1-cones-144-2", distance: 144, lane: 2, kind: "cones" },
  // 2구간 지그재그: 왼쪽 차단 펜스 + 가운데 상자. (첫 배달 존 뒤 40m)
  { id: "s2-barrier-240", distance: 240, lane: 0, kind: "barrier" },
  { id: "s2-crates-240", distance: 240, lane: 1, kind: "crates" },
  // 3구간: 차단기(움직임) 뒤 양쪽 콘이 가운데 점프대로 몰아 줌.
  { id: "s3-cones-272-0", distance: 272, lane: 0, kind: "cones" },
  { id: "s3-cones-272-2", distance: 272, lane: 2, kind: "cones" },
  // 6구간 우회로. 왼쪽(공사장 길): 콘 → 우유통 → 점프대 → 상자 → 콘 → 바리케이드.
  // 가운데 길(세 갈래 중 본길): 상자 → 판자 → 표지판 빔. 우회로와 달리 점프대는 없지만 장애물이 이어집니다.
  { id: "s6-mid-crates-580", distance: 580, lane: 0, kind: "crates", span: 2 },
  { id: "s6-mid-plank-603", distance: 603, lane: 0, kind: "plank", span: 3 },
  { id: "s6-mid-signbeam-612", distance: 612, lane: 0, kind: "signbeam", span: 3 },
  { id: "s6-left-cones-574-0", distance: 574, lane: 0, kind: "cones", branch: "left" },
  { id: "s6-left-cones-574-2", distance: 574, lane: 2, kind: "cones", branch: "left" },
  { id: "s6-left-crates-623", distance: 623, lane: 0, kind: "crates", span: 2, branch: "left" },
  { id: "s6-left-cones-634", distance: 634, lane: 2, kind: "cones", branch: "left" },
  // 7구간 버스: 버스가 3차선을 막는 동안 1·2차선 상자와 1차선 콘.
  { id: "s7-crates-700", distance: 700, lane: 0, kind: "crates", span: 2 },
  { id: "s7-cones-748", distance: 748, lane: 0, kind: "cones" },
  // 5구간 허들: 두 번째 배달 존(~430m)을 벗어나자마자 한 번.
  { id: "s5-plank-432", distance: 432, lane: 0, kind: "plank", span: 3 },
  // 7구간 급하강 연습: 판자를 점프로 넘은 직후 낮은 표지판 빔. 공중에 있으면 표지판 빔에 걸리니 착지 직전 아래로 스와이프.
  { id: "s7-plank-766", distance: 766, lane: 0, kind: "plank", span: 3 },
  { id: "s7-signbeam-775", distance: 775, lane: 0, kind: "signbeam", span: 3 },
  // 마지막: 착지한 뒤 바로 두 차선 상자.
  // 마지막 급하강: 판자 직후 표지판 빔.
  { id: "s9-plank-928", distance: 928, lane: 0, kind: "plank", span: 3 },
  { id: "s9-signbeam-937", distance: 937, lane: 0, kind: "signbeam", span: 3 },
];

// 광고 브랜드/옥외 광고 설정은 data/delivery-outdoor-ads.ts에서 독립 관리합니다.
export const BUS_PLACEMENTS: BusPlacement[] = [
  { id: "bus-moving-170", distance: 170, brandId: "mongle", mode: "moving", side: "right", speed: 11 },
  { id: "bus-parked-330", distance: 330, brandId: "crispy", mode: "parked", side: "left", speed: 0 },
  { id: "bus-moving-540", distance: 540, brandId: "green", mode: "moving", side: "left", speed: 10 },
  { id: "bus-parked-710", distance: 710, brandId: "mongle", mode: "parked", side: "right", speed: 0 },
  { id: "bus-moving-835", distance: 835, brandId: "crispy", mode: "moving", side: "right", speed: 11 },
];

export const SCENERY_ITEMS: SceneryItem[] = Array.from({ length: 30 }, (_, index) => (
  ["left", "right"] as const
).flatMap((side, sideIndex): SceneryItem[] => {
  const distance = 18 + index * 32 + sideIndex * 11;
  return [
    { id: `building-${index}-${side}`, distance, type: index % 3 === 1 ? "shop" : "house", side, variant: (index + sideIndex * 2) % 5 },
    { id: `tree-${index}-${side}`, distance: distance + 13, type: "tree", side, variant: (index + sideIndex) % 3 },
    ...(index % 2 === 0 ? [{ id: `lamp-${index}-${side}`, distance: distance - 5, type: "lamp" as const, side, variant: 0 }] : []),
  ];
})).flat();
