import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f0e8",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "PLAY ZIP Games | 배달게임 개발실",
    template: "%s | PLAY ZIP Games",
  },
  description: "플랫폼과 독립적으로 개발하는 모바일 3D 배달게임입니다.",
  openGraph: {
    title: "PLAY ZIP Games | 배달게임 개발실",
    description: "모바일 3D 자전거 배달게임 개발실.",
    type: "website",
    locale: "ko_KR",
    siteName: "PLAY ZIP Games",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "PLAY ZIP Games" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PLAY ZIP Games | 배달게임 개발실",
    description: "모바일 3D 자전거 배달게임 개발실.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="/fonts/noto-sans-kr-900.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
