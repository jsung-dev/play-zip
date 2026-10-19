"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, CircleHelp, House, MapPin, PackageCheck, Pause, RotateCcw, ShoppingBag } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, type DeliveryBrand } from "@/data/delivery-game";
import { DELIVERY_BRAND_CHOICES, DELIVERY_QUIZ_QUESTIONS, PURCHASE_AD, type DeliveryChoiceId } from "@/data/delivery-campaign";
import { DELIVERY_STOPS } from "@/data/delivery-map";
import { BrandImage } from "./DeliveryArt";
import { PlatformReturnLink } from "./PlatformReturnLink";
import styles from "./DeliveryCampaign.module.css";

const brandStyle = (brand: DeliveryBrand) => ({
  "--product-tint": brand.primaryColor,
}) as CSSProperties;

const stopCountLabel = DELIVERY_STOPS.length === 3 ? "세 집" : `${DELIVERY_STOPS.length}집`;

export function useDialogFocus() {
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

export function DeliveryBrandStart({ selected, onSelect, onStart }: {
  selected: DeliveryChoiceId | null;
  onSelect: (id: DeliveryChoiceId) => void;
  onStart: () => void;
}) {
  const ref = useDialogFocus();
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.startCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-start-title" data-campaign-screen="start">
      <p className={styles.eyebrow}>작은 동네, 기분 좋은 배달</p>
      <h1 id="delivery-start-title" className={styles.startTitle}><span>몽글몽글</span>자전거 배달</h1>
      <DeliveryBrandSelector selected={selected} onSelect={onSelect} />
      <dl className={styles.missionCard}>
        <div><House aria-hidden="true" /><dt>경유 배달</dt><dd>동네 {stopCountLabel}</dd></div>
        <div><Building2 aria-hidden="true" /><dt>마지막 목적지</dt><dd>{DELIVERY_GAME_CONFIG.destinationName}</dd></div>
      </dl>
      <p className={styles.startGuide}>{stopCountLabel}에 들러 우유를 배달해요.<br />퀴즈를 풀고 마지막 집에서 광고를 만나요.</p>
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="button" disabled={!selected} onClick={onStart}>배달 출발! <ArrowRight aria-hidden="true" /></button>
        <PlatformReturnLink />
      </div>
      <small className={styles.notice}>{DELIVERY_GAME_CONFIG.totalDistance.toLocaleString("ko-KR")}m의 작은 여행 · 테스트용 디자인<br />공식 브랜드 광고가 아니며<br />실제 구매로 연결되지 않습니다.</small>
    </article>
  </div>;
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
            <BrandImage className={styles.choiceProduct} brand={brand} kind="product" alt={`${brand.name} 테스트 상품`} />
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
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.quizCard}`} style={brandStyle(brand)} role="dialog" aria-modal="true" aria-labelledby="delivery-quiz-title" data-brand-quiz={stopIndex} data-campaign-screen="quiz">
      <div className={styles.quizHeading}><span>배달 퀴즈</span><strong>{stopIndex + 1} / {DELIVERY_STOPS.length}</strong></div>
      <div className={styles.quizProgress} role="progressbar" aria-label="현재 배달 퀴즈" aria-valuemin={0} aria-valuemax={DELIVERY_STOPS.length} aria-valuenow={stopIndex + 1}>
        {DELIVERY_STOPS.map((stop, index) => <span key={stop.id} data-reached={index <= stopIndex} />)}
      </div>
      <p className={styles.quizAddress}><MapPin aria-hidden="true" />{address} 도착</p>
      <div className={styles.quizProduct}><BrandImage brand={brand} kind="product" alt={`${brand.name} ${brand.productName}`} /></div>
      <h2 id="delivery-quiz-title">{DELIVERY_QUIZ_QUESTIONS[stopIndex] ?? DELIVERY_QUIZ_QUESTIONS[0]}</h2>
      <p className={styles.campaignHint}>처음 고른 브랜드를 찾아 주세요.<br />정답을 맞히면 상품을 전달해요.</p>
      <div className={styles.quizAnswers}>
        {DELIVERY_BRAND_CHOICES.map((id, index) => <button key={id} type="button" data-quiz-answer={id} data-wrong={wrongAnswer === id} onClick={() => answer(id)}>
          <span className={styles.answerNumber}>{String(index + 1).padStart(2, "0")}</span><strong>{DELIVERY_BRANDS[id].name}</strong><ArrowRight aria-hidden="true" />
        </button>)}
      </div>
      <div className={styles.quizFeedback} role="status" aria-live="polite">
        {wrongAnswer && <p><CircleHelp aria-hidden="true" /><span><strong>다시 골라 볼까요?</strong><br />배달 상자의 브랜드를 떠올려 보세요.</span></p>}
      </div>
      <p className={styles.pauseNote}><Pause aria-hidden="true" /><span>천천히 골라도 괜찮아요.<br />퀴즈 중에는 자전거가 멈춰 있어요.</span></p>
    </article>
  </div>;
}

export function DeliveryPurchaseAd({ brand, completedDeliveries, freshness, stars, onRestart }: { brand: DeliveryBrand; completedDeliveries: number; freshness: number; stars: 1 | 2 | 3; onRestart: () => void }) {
  const [preview, setPreview] = useState(false);
  const ref = useDialogFocus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openPreview = () => { setPreview(true); };
  useEffect(() => { if (preview) headingRef.current?.focus(); }, [preview]);
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.purchaseCard}`} style={brandStyle(brand)} role="dialog" aria-modal="true" aria-labelledby="delivery-complete-title" data-purchase-ad={brand.id} data-purchase-preview={preview} data-campaign-screen="complete">
      <div className={styles.deliveryReceipt}><span><PackageCheck aria-hidden="true" /></span><h2 id="delivery-complete-title">배달 완료!</h2></div>
      <p className={styles.purchaseDestination}>{DELIVERY_GAME_CONFIG.destinationName}</p>
      <div className={styles.runStars} data-stars={stars} aria-label={`별 ${stars}개, 우유 신선도 ${Math.round(freshness * 100)}%`}>
        {[1, 2, 3].map(n => <i key={n} data-on={n <= stars} aria-hidden="true">★</i>)}
        <span>우유 신선도 {Math.round(freshness * 100)}%{stars < 3 ? " · 더 빨리, 덜 부딪히면 별 3개!" : " · 완벽한 배달!"}</span>
      </div>
      <div className={styles.completionStats}><span data-completion-count><House aria-hidden="true" />배달 {completedDeliveries} / {DELIVERY_STOPS.length + 1} 완료</span><span><MapPin aria-hidden="true" />{DELIVERY_GAME_CONFIG.totalDistance.toLocaleString("ko-KR")}m 도착</span></div>
      <div className={styles.purchaseCreative}>
        <span className={styles.adBadge}>AD · 구매 광고 예시</span>
        <BrandImage brand={brand} kind="logo" alt={brand.name} className={styles.purchaseLogo} />
        <h2 ref={headingRef} tabIndex={-1} id="purchase-title">{preview ? "구매 페이지 미리보기" : PURCHASE_AD.headline}</h2>
        <div className={styles.purchaseProduct}><BrandImage brand={brand} kind="product" alt={`${brand.name} ${brand.productName}`} /></div>
        <strong>{brand.productName}</strong>
        <p>{brand.slogan}</p>
      </div>
      <div className={styles.actions}>
        {preview ? <div className={styles.purchasePreview} role="status">
          <ShoppingBag aria-hidden="true" /><div><strong>이곳에 브랜드 구매 페이지가 연결돼요.</strong><p>지금은 체험 화면이에요.<br />실제 주문·결제·외부 이동은 없습니다.</p></div>
        </div> : <button type="button" className={styles.primaryButton} onClick={openPreview} data-purchase-cta><ShoppingBag aria-hidden="true" />{PURCHASE_AD.buttonLabel}<ArrowRight aria-hidden="true" /></button>}
        <small className={styles.notice}>{preview ? "공식 브랜드 광고가 아닌 테스트용 디자인입니다." : PURCHASE_AD.notice}</small>
        {preview && <button type="button" className={styles.textButton} onClick={() => { setPreview(false); ref.current?.focus(); }}><ArrowLeft aria-hidden="true" /> 광고로 돌아가기</button>}
        <button type="button" className={styles.secondaryButton} onClick={onRestart}><RotateCcw aria-hidden="true" />다시 배달하기</button>
        <PlatformReturnLink />
      </div>
    </article>
  </div>;
}
