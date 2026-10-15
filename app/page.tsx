import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#f5f5ec", color: "#214d40" }}>
      <section style={{ maxWidth: 460, width: "100%", padding: 32, borderRadius: 24, background: "#fffef8", border: "1px solid #dbe6d9" }}>
        <p style={{ fontSize: 12, letterSpacing: 3, fontWeight: 800 }}>PLAY ZIP · GAMES</p>
        <h1 style={{ fontSize: 30, margin: "20px 0 12px" }}>배달게임 개발실</h1>
        <p style={{ lineHeight: 1.8, color: "#596e63" }}>게임을 만들고 테스트하는 공간입니다.<br />플랫폼과는 독립적으로 개발합니다.</p>
        <Link href="/games/delivery" style={{ display: "block", marginTop: 28, padding: 18, borderRadius: 16, textAlign: "center", background: "#36735a", color: "white", textDecoration: "none", fontWeight: 800 }}>배달게임 실행 →</Link>
      </section>
    </main>
  );
}
