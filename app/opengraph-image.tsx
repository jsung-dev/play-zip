import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PLAY ZIP Games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#f5f5ec", color: "#214d40", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 6 }}>PLAY ZIP · GAMES</div>
      <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 35 }}>Delivery Game</div>
      <div style={{ display: "flex", fontSize: 28, marginTop: 25 }}>Mobile 3D cycling · Independent game development</div>
    </div>, size,
  );
}
