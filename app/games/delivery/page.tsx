import type { Metadata } from "next";
import { DeliveryGame } from "@/components/delivery/DeliveryGame";

export const metadata: Metadata = {
  title: "몽글몽글 3D 자전거 배달",
  description: "전진과 후진으로 햇살 아파트까지 상품을 배달하는 모바일 3D 미니게임",
};

export default function DeliveryGamePage() {
  return <DeliveryGame />;
}
