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
  kind: "cones" | "barrier" | "box";
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
  drivewaySpeed: 6,
  drivewayReverseSpeed: 4,
  drivewayDeliveryDepth: 4,
} as const;

// 장애물은 첫 100m 연습 구간 이후에만 두고, 목적지 전 구간은 비워 둡니다.
export const OBSTACLE_PLACEMENTS: ObstaclePlacement[] = [
  { id: "obstacle-145", distance: 145, lane: 0, kind: "cones" },
  { id: "obstacle-245", distance: 245, lane: 2, kind: "barrier" },
  { id: "obstacle-350", distance: 350, lane: 1, kind: "box" },
  { id: "obstacle-455", distance: 455, lane: 0, kind: "cones" },
  { id: "obstacle-560", distance: 560, lane: 2, kind: "box" },
  { id: "obstacle-665", distance: 665, lane: 1, kind: "barrier" },
  { id: "obstacle-770", distance: 770, lane: 0, kind: "cones" },
  { id: "obstacle-855", distance: 855, lane: 2, kind: "box" },
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
