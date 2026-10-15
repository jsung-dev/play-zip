// 배달 브랜드 선택지는 거리 광고 브랜드와 별도로 관리합니다.
export const DELIVERY_BRAND_CHOICES = ["mongle", "seoul", "delicious"] as const;
export type DeliveryChoiceId = (typeof DELIVERY_BRAND_CHOICES)[number];

export const DELIVERY_QUIZ_QUESTIONS = [
  "오늘 내가 배달하는 우유는?",
  "이 집에 전해 줄 우유 브랜드는?",
  "내 배달 상자에 적힌 브랜드는?",
] as const;

export const PURCHASE_AD = {
  headline: "오늘 배달한 우유,\n우리 집에서도 만나보세요.",
  buttonLabel: "구매하러 가기",
  notice: "구매 전환형 광고 예시 · 실제 주문·결제는 되지 않습니다.",
} as const;
