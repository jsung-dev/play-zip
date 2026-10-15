"use client";

import { useState } from "react";
import type { DeliveryBrand } from "@/data/delivery-game";
import styles from "./DeliveryGame.module.css";

type BrandImageKind = "logo" | "product" | "package" | "sign" | "bus";

const sourceFor = (brand: DeliveryBrand, kind: BrandImageKind) => {
  if (kind === "logo") return brand.logoImage;
  if (kind === "product") return brand.productImage;
  if (kind === "package") return brand.deliveryPackageImage;
  if (kind === "sign") return brand.signImage;
  return brand.busSideImage;
};

export function BrandImage({
  brand,
  kind,
  className,
  alt,
}: {
  brand: DeliveryBrand;
  kind: BrandImageKind;
  className?: string;
  alt: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = sourceFor(brand, kind);

  if (failedSource === source) {
    return (
      <span
        className={`${styles.assetFallback} ${className ?? ""}`}
        style={{ background: brand.secondaryColor, color: brand.inkColor }}
        role="img"
        aria-label={alt}
      >
        <b>{brand.name}</b>
        {kind !== "logo" && <small>{kind === "product" || kind === "package" ? brand.productName : brand.slogan}</small>}
      </span>
    );
  }

  return <img className={className} src={source} alt={alt} onError={() => setFailedSource(source)} draggable={false} />;
}

function Bicycle() {
  return (
    <g className={styles.bicycle}>
      <g className={styles.wheel} style={{ transformOrigin: "54px 164px" }}>
        <circle cx="54" cy="164" r="31" fill="#fffdf4" stroke="#42655f" strokeWidth="5" />
        <path d="M54 135v58M25 164h58M34 144l40 40M34 184l40-40" stroke="#9bc7ba" strokeWidth="2" />
        <circle cx="54" cy="164" r="5" fill="#f6ae56" stroke="#42655f" strokeWidth="3" />
      </g>
      <g className={styles.wheel} style={{ transformOrigin: "169px 164px" }}>
        <circle cx="169" cy="164" r="31" fill="#fffdf4" stroke="#42655f" strokeWidth="5" />
        <path d="M169 135v58M140 164h58M149 144l40 40M149 184l40-40" stroke="#9bc7ba" strokeWidth="2" />
        <circle cx="169" cy="164" r="5" fill="#f6ae56" stroke="#42655f" strokeWidth="3" />
      </g>
      <path d="M54 164l35-48 28 48H54l22-58h43l50 58M113 104l16-9M73 106H59" fill="none" stroke="#e77769" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
      <path d="M158 101l11 63" stroke="#42655f" strokeLinecap="round" strokeWidth="5" />
      <path d="M148 100h25" stroke="#42655f" strokeLinecap="round" strokeWidth="5" />
      <path d="M72 105H56" stroke="#42655f" strokeLinecap="round" strokeWidth="6" />
      <circle cx="113" cy="164" r="9" fill="#ffd36f" stroke="#42655f" strokeWidth="3" />
    </g>
  );
}

function RearDeliveryBox({ brand }: { brand: DeliveryBrand }) {
  return (
    <g className={styles.rearBox}>
      <path d="M34 93h45v32H34z" fill={brand.secondaryColor} stroke="#6c574c" strokeLinejoin="round" strokeWidth="3" />
      <path d="M34 93l8-10h45l-8 10z" fill={brand.primaryColor} stroke="#6c574c" strokeLinejoin="round" strokeWidth="3" />
      <rect x="42" y="101" width="29" height="15" rx="4" fill="#fff" opacity=".92" />
      <image href={brand.logoImage} x="44" y="103" width="25" height="11" preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}

function BasketProduct({ brand }: { brand: DeliveryBrand }) {
  return (
    <g className={styles.basketProduct}>
      <rect x="156" y="79" width="33" height="45" rx="5" fill={brand.secondaryColor} stroke="#745953" strokeWidth="3" />
      <path d="M160 79l5-8h16l5 8" fill={brand.primaryColor} stroke="#745953" strokeLinejoin="round" strokeWidth="3" />
      <circle cx="172" cy="96" r="8" fill={brand.primaryColor} opacity=".85" />
      <path d="M166 103h13" stroke={brand.inkColor} strokeLinecap="round" strokeWidth="3" />
      <image href={brand.productImage} x="154" y="70" width="37" height="53" preserveAspectRatio="xMidYMid meet" />
      <path d="M148 99h50l-6 37h-39z" fill="none" stroke="#8a6d58" strokeLinejoin="round" strokeWidth="4" />
      <path d="M153 109h40M151 120h43M163 100l-2 35M178 100l2 35" stroke="#bd9576" strokeWidth="2" />
    </g>
  );
}

function TemporaryRider() {
  return (
    <g className={styles.rider}>
      <g className={styles.riderBody}>
        <path d="M95 72c-13 2-20 13-19 30l4 32h39l5-38c1-14-8-24-29-24z" fill="#91c985" stroke="#496156" strokeLinejoin="round" strokeWidth="4" />
        <path d="M90 78c4 12 16 17 29 12" fill="none" stroke="#fff0bb" strokeLinecap="round" strokeWidth="7" />
        <path d="M112 91l30 26" stroke="#496156" strokeLinecap="round" strokeWidth="9" />
        <path d="M141 116l19-13" stroke="#496156" strokeLinecap="round" strokeWidth="7" />
        <circle cx="162" cy="101" r="5" fill="#f4b6a8" stroke="#496156" strokeWidth="2" />
      </g>
      <g className={styles.riderHead}>
        <path d="M76 53c0-21 13-34 34-31 18 3 27 18 22 37-4 16-15 25-29 24-16-1-27-12-27-30z" fill="#f4b6a8" stroke="#496156" strokeWidth="4" />
        <path d="M77 50c-2-19 10-36 30-38 16-2 30 6 36 22-16 0-41 6-66 16z" fill="#a6d7e5" stroke="#496156" strokeLinejoin="round" strokeWidth="4" />
        <path d="M80 47c12-7 34-12 57-12" fill="none" stroke="#fff6d5" strokeLinecap="round" strokeWidth="5" />
        <path d="M84 45c-2-14 5-26 15-32" fill="none" stroke="#496156" strokeLinecap="round" strokeWidth="3" />
        <circle cx="96" cy="55" r="3" fill="#3f514a" />
        <circle cx="119" cy="53" r="3" fill="#3f514a" />
        <path d="M102 66c6 5 12 4 16-2" fill="none" stroke="#9c5e60" strokeLinecap="round" strokeWidth="3" />
        <circle cx="87" cy="64" r="6" fill="#ef8f96" opacity=".55" />
        <path d="M126 50c7 2 10 8 8 15" fill="none" stroke="#496156" strokeLinecap="round" strokeWidth="3" />
      </g>
      <g className={styles.legBack}>
        <path d="M107 130l26 20 30 11" fill="none" stroke="#587c70" strokeLinecap="round" strokeLinejoin="round" strokeWidth="11" />
        <path d="M158 160l13 3" stroke="#ef7b6c" strokeLinecap="round" strokeWidth="9" />
      </g>
      <g className={styles.legFront}>
        <path d="M91 131l13 26-8 28" fill="none" stroke="#6b9384" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
        <path d="M90 185h15" stroke="#ef7b6c" strokeLinecap="round" strokeWidth="9" />
      </g>
    </g>
  );
}

export function DeliveryRider({ brand, moving }: { brand: DeliveryBrand; moving: boolean }) {
  return (
    <div className={`${styles.riderWrap} ${moving ? styles.riderMoving : ""}`} aria-label="안전모를 쓰고 배달 자전거를 타는 임시 배달원">
      <svg viewBox="0 0 225 205" role="img" aria-hidden="true">
        <RearDeliveryBox brand={brand} />
        <Bicycle />
        <TemporaryRider />
        <BasketProduct brand={brand} />
      </svg>
      <span className={styles.tempCharacterLabel}>임시 배달원</span>
    </div>
  );
}

