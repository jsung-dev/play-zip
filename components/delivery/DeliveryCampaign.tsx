"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, PackageCheck, RotateCcw, ShoppingBag } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, type DeliveryBrand } from "@/data/delivery-game";
import { DELIVERY_BRAND_CHOICES, DELIVERY_QUIZ_QUESTIONS, PURCHASE_AD, type DeliveryChoiceId } from "@/data/delivery-campaign";
import { BrandImage } from "./DeliveryArt";
import styles from "./DeliveryGame.module.css";

const brandStyle = (brand: DeliveryBrand) => ({
  "--campaign-color": brand.primaryColor,
  "--campaign-paper": brand.secondaryColor,
  "--campaign-ink": brand.inkColor,
}) as CSSProperties;

function useDialogFocus() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    dialog.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), [tabindex='0']")];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => { dialog.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}

export function DeliveryBrandSelector({ selected, onSelect }: {
  selected: DeliveryChoiceId | null;
  onSelect: (id: DeliveryChoiceId) => void;
}) {
  return (
    <fieldset className={styles.brandSelector}>
      <legend>오늘 배달할 브랜드를 골라 주세요</legend>
      <div className={styles.brandChoices}>
        {DELIVERY_BRAND_CHOICES.map((id) => {
          const brand = DELIVERY_BRANDS[id];
          return <label key={id} className={styles.brandChoice} style={brandStyle(brand)} data-selected={selected === id}>
            <input type="radio" name="delivery-brand" value={id} checked={selected === id} onChange={() => onSelect(id)} />
            <span className={styles.choiceCheck} aria-hidden="true">{selected === id && <Check />}</span>
            <BrandImage brand={brand} kind="product" alt={`${brand.name} 테스트 상품`} />
            <strong>{brand.name}</strong>
            <small>{id === "mongle" ? "딸기우유" : id === "seoul" ? "데일리 우유" : "우유 한 잔"}</small>
          </label>;
        })}
      </div>
    </fieldset>
  );
}

export function DeliveryBrandQuiz({ brand, stopIndex, address, onCorrect }: {
  brand: DeliveryBrand;
  stopIndex: number;
  address: string;
  onCorrect: () => void;
}) {
  const [wrongAnswer, setWrongAnswer] = useState<DeliveryChoiceId | null>(null);
  const answered = useRef(false);
  const ref = useDialogFocus();
  const answer = (id: DeliveryChoiceId) => {
    if (answered.current) return;
    if (id !== brand.id) { setWrongAnswer(id); return; }
    answered.current = true;
    onCorrect();
  };
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={styles.campaignCard} style={brandStyle(brand)} role="dialog" aria-modal="true" aria-labelledby="delivery-quiz-title" data-brand-quiz={stopIndex}>
      <span className={styles.campaignEyebrow}>DELIVERY QUIZ · {stopIndex + 1} / 3</span>
      <p className={styles.quizAddress}><MapPin aria-hidden="true" />{address} 도착</p>
      <div className={styles.quizProduct}><BrandImage brand={brand} kind="product" alt={`${brand.name} ${brand.productName}`} /></div>
      <h2 id="delivery-quiz-title">{DELIVERY_QUIZ_QUESTIONS[stopIndex] ?? DELIVERY_QUIZ_QUESTIONS[0]}</h2>
      <p className={styles.campaignHint}>처음 고른 브랜드를 찾아 주세요.<br />정답을 맞히면 상품을 전달해요.</p>
      <div className={styles.quizAnswers}>
        {DELIVERY_BRAND_CHOICES.map((id, index) => <button key={id} type="button" data-quiz-answer={id} data-wrong={wrongAnswer === id} onClick={() => answer(id)}>
          <span>{String(index + 1).padStart(2, "0")}</span>{DELIVERY_BRANDS[id].name}<ArrowRight aria-hidden="true" />
        </button>)}
      </div>
      <p className={styles.quizFeedback} role="status" aria-live="polite">{wrongAnswer ? "다시 골라 볼까요? 배달 상자의 브랜드를 떠올려 보세요." : "천천히 골라도 괜찮아요. 자전거는 멈춰 있어요."}</p>
    </article>
  </div>;
}

export function DeliveryPurchaseAd({ brand, onRestart }: { brand: DeliveryBrand; onRestart: () => void }) {
  const [preview, setPreview] = useState(false);
  const ref = useDialogFocus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openPreview = () => { setPreview(true); };
  useEffect(() => { if (preview) headingRef.current?.focus(); }, [preview]);
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.purchaseCard}`} style={brandStyle(brand)} role="dialog" aria-modal="true" aria-labelledby="purchase-title" data-purchase-ad={brand.id} data-purchase-preview={preview}>
      <span className={styles.deliveryReceipt}><PackageCheck aria-hidden="true" /> 배달 완료!</span>
      <p className={styles.purchaseDestination}>{DELIVERY_GAME_CONFIG.destinationName}<br />세 집 경유 완료 · {DELIVERY_GAME_CONFIG.totalDistance.toLocaleString("ko-KR")}m 도착</p>
      <div className={styles.purchaseCreative}>
        <span className={styles.adBadge}>AD · 구매 광고 예시</span>
        <BrandImage brand={brand} kind="logo" alt={brand.name} className={styles.purchaseLogo} />
        <h2 ref={headingRef} tabIndex={-1} id="purchase-title">{preview ? "구매 페이지 미리보기" : PURCHASE_AD.headline}</h2>
        <div className={styles.purchaseProduct}><BrandImage brand={brand} kind="product" alt={`${brand.name} ${brand.productName}`} /></div>
        <strong>{brand.productName}</strong>
        <p>{brand.slogan}</p>
      </div>
      {preview ? <div className={styles.purchasePreview} role="status">
        <ShoppingBag aria-hidden="true" /><div><strong>이곳에 브랜드 구매 페이지가 연결돼요.</strong><p>지금은 체험 화면이에요.<br />실제 주문·결제·외부 이동은 없습니다.</p></div>
      </div> : <button type="button" className={styles.purchaseCta} onClick={openPreview} data-purchase-cta><ShoppingBag aria-hidden="true" />{PURCHASE_AD.buttonLabel}<ArrowRight aria-hidden="true" /></button>}
      <small className={styles.purchaseNotice}>{preview ? "공식 브랜드 광고가 아닌 테스트용 디자인입니다." : PURCHASE_AD.notice}</small>
      {preview && <button type="button" className={styles.textButton} onClick={() => { setPreview(false); ref.current?.focus(); }}><ArrowLeft aria-hidden="true" /> 광고로 돌아가기</button>}
      <button type="button" className={styles.restartCampaign} onClick={onRestart}><RotateCcw aria-hidden="true" />다시 배달하기</button>
    </article>
  </div>;
}
