"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Heart, House, MapPin, RotateCcw, ShoppingBag, Trophy, X } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, type DeliveryBrand } from "@/data/delivery-game";
import { DELIVERY_BRAND_CHOICES, DELIVERY_QUIZ_QUESTIONS, PURCHASE_AD, type DeliveryChoiceId } from "@/data/delivery-campaign";
import { DELIVERY_STOPS } from "@/data/delivery-map";
import { BrandImage } from "./DeliveryArt";
import { ApartmentArt, DeliveryHero, HouseArt, Spark } from "./DeliveryArtUi";
import { PlatformReturnLink } from "./PlatformReturnLink";
import { CHALLENGE, type GameMode } from "./delivery-challenge";
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

export function DeliveryBrandStart({ onStart, mode, onMode, best }: { onStart: (id: DeliveryChoiceId) => void; mode: GameMode; onMode: (mode: GameMode) => void; best: number }) {
  const ref = useDialogFocus();
  const challenge = mode === "challenge";
  // Two steps: pick the game first (two big cards), then the milk.
  const [picked, setPicked] = useState(false);
  if (!picked) return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.startCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-mode-title" data-campaign-screen="mode">
      <DeliveryHero className={styles.hero} />
      <h1 id="delivery-mode-title" className={styles.sparkTitle}><Spark />어떤 게임을 할까요?<Spark flip /></h1>
      <div className={styles.modeChoices}>
        <button type="button" className={`${styles.brandChoice} ${styles.modeChoice}`} data-mode-choice="brand" onClick={() => { onMode("brand"); setPicked(true); }}>
          <HouseArt />
          <strong>동네 배달</strong>
          <span>{stopCountLabel} 배달하고<br />퀴즈 풀기</span>
        </button>
        <button type="button" className={`${styles.brandChoice} ${styles.modeChoice}`} data-mode-choice="challenge" onClick={() => { onMode("challenge"); setPicked(true); }}>
          <Trophy aria-hidden="true" />
          <strong>챌린지</strong>
          <span>하트 {CHALLENGE.hearts}개로<br />끝없이 달리기</span>
          <small>최고 {best.toLocaleString("ko-KR")}m</small>
        </button>
      </div>
      <div className={styles.actions}><PlatformReturnLink /></div>
      <small className={styles.notice}>테스트용 디자인 · 공식 광고가 아니며 실제 구매로 연결되지 않아요</small>
    </article>
  </div>;
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.startCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-start-title" data-campaign-screen="start">
      <DeliveryHero className={styles.hero} />
      <p className={styles.eyebrow}>{challenge ? "챌린지 · 끝없이 달리기" : "동네 배달"}</p>
      <h1 id="delivery-start-title" className={styles.sparkTitle}><Spark />우유를 골라 주세요<Spark flip /></h1>
      <p className={styles.startHint}>{challenge ? `하트 ${CHALLENGE.hearts}개가 다 떨어질 때까지 멀리 달려요!` : "고르면 바로 출발해요!"}</p>
      <div className={styles.brandChoices}>
        {DELIVERY_BRAND_CHOICES.map(id => <button key={id} type="button" className={styles.brandChoice} style={brandStyle(DELIVERY_BRANDS[id])} data-brand-choice={id} onClick={() => onStart(id)}>
          <MilkCard id={id} />
        </button>)}
      </div>
      {challenge
        ? <dl className={styles.missionCard}>
          <div><Heart aria-hidden="true" /><dt>목숨</dt><dd>하트 {CHALLENGE.hearts}개</dd></div>
          <div><Trophy aria-hidden="true" /><dt>최고 기록</dt><dd>{best.toLocaleString("ko-KR")}m</dd></div>
        </dl>
        : <dl className={styles.missionCard}>
          <div><HouseArt /><dt>경유 배달</dt><dd>동네 {stopCountLabel}</dd></div>
          <div><ApartmentArt /><dt>마지막 목적지</dt><dd>{DELIVERY_GAME_CONFIG.destinationName}</dd></div>
        </dl>}
      <div className={styles.actions}><button type="button" className={styles.secondaryButton} onClick={() => setPicked(false)}><ArrowLeft aria-hidden="true" />게임 다시 고르기</button></div>
      <small className={styles.notice}>테스트용 디자인 · 공식 광고가 아니며 실제 구매로 연결되지 않아요</small>
    </article>
  </div>;
}

/** One milk carton card; a start button on the first screen, an answer button in the quiz. */
function MilkCard({ id, wrong }: { id: DeliveryChoiceId; wrong?: boolean }) {
  const brand = DELIVERY_BRANDS[id];
  return <>
    {wrong && <span className={styles.choiceCheck} aria-hidden="true"><X /></span>}
    <BrandImage className={styles.choiceProduct} brand={brand} kind="product" alt="" />
    <strong>{brand.name}</strong>
  </>;
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
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.quizCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-quiz-title" data-brand-quiz={stopIndex} data-campaign-screen="quiz">
      <DeliveryHero badge="question" className={styles.hero} />
      <p className={styles.eyebrow}>배달 퀴즈 {stopIndex + 1} / {DELIVERY_STOPS.length}</p>
      <div className={styles.quizProgress} role="progressbar" aria-label="현재 배달 퀴즈" aria-valuemin={0} aria-valuemax={DELIVERY_STOPS.length} aria-valuenow={stopIndex + 1}>
        {DELIVERY_STOPS.map((stop, index) => <span key={stop.id} data-reached={index <= stopIndex} />)}
      </div>
      <h2 id="delivery-quiz-title" className={styles.quizTitle}>{DELIVERY_QUIZ_QUESTIONS[stopIndex] ?? DELIVERY_QUIZ_QUESTIONS[0]}</h2>
      <p className={styles.quizAddress}><MapPin aria-hidden="true" />{address} 도착 · 정답을 맞히면 배달 완료!</p>
      <div className={styles.brandChoices}>
        {DELIVERY_BRAND_CHOICES.map(id => <button key={wrongAnswer === id ? `${id}-wrong` : id} type="button" className={styles.brandChoice} data-quiz-answer={id} data-wrong={wrongAnswer === id} onClick={() => answer(id)}>
          <MilkCard id={id} wrong={wrongAnswer === id} />
        </button>)}
      </div>
      <div className={styles.quizFeedback} role="status" aria-live="polite">
        {wrongAnswer ? <strong>앗, 아니에요! 다시 골라 볼까요?</strong> : <span>천천히 골라도 괜찮아요</span>}
      </div>
    </article>
  </div>;
}

export function DeliveryPurchaseAd({ brand, completedDeliveries, hits, stars, onRestart }: { brand: DeliveryBrand; completedDeliveries: number; hits: number; stars: 1 | 2 | 3; onRestart: () => void }) {
  const [preview, setPreview] = useState(false);
  const ref = useDialogFocus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (preview) headingRef.current?.focus(); }, [preview]);
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={`${styles.campaignCard} ${styles.purchaseCard}`} style={brandStyle(brand)} role="dialog" aria-modal="true" aria-labelledby="delivery-complete-title" data-purchase-ad={brand.id} data-purchase-preview={preview} data-campaign-screen="complete">
      <DeliveryHero badge="check" className={styles.hero} />
      <p className={styles.eyebrow}>{DELIVERY_GAME_CONFIG.destinationName}</p>
      <h2 id="delivery-complete-title" className={styles.sparkTitle}><Spark />배달 완료!<Spark flip /></h2>
      <div className={styles.runStars} data-stars={stars} aria-label={`별 ${stars}개, 부딪힘 ${hits}번`}>
        {[1, 2, 3].map(n => <svg key={n} data-on={n <= stars} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" /></svg>)}
      </div>
      <div className={styles.completionStats}>
        <span data-completion-count><House aria-hidden="true" />배달 {completedDeliveries} / {DELIVERY_STOPS.length + 1}</span>
        <span>부딪힘 {hits}번</span>
      </div>
      <p className={styles.starHint}>{stars < 3 ? "덜 부딪히고 모두 배달하면 별 3개!" : "완벽한 배달이에요!"}</p>
      <div className={styles.purchaseCreative}>
        <div className={styles.purchaseProduct}><BrandImage brand={brand} kind="product" alt={`${brand.name} ${brand.productName}`} /></div>
        <div>
          <span className={styles.adBadge}>AD · 광고 예시</span>
          <h3 ref={headingRef} tabIndex={-1} id="purchase-title">{preview ? "구매 페이지 미리보기" : PURCHASE_AD.headline}</h3>
          <p>{preview ? "실제 주문·결제·외부 이동은 없어요." : `${brand.name} ${brand.productName}`}</p>
        </div>
      </div>
      <div className={styles.actions}>
        {preview
          ? <button type="button" className={styles.textButton} onClick={() => { setPreview(false); ref.current?.focus(); }}><ArrowLeft aria-hidden="true" />광고로 돌아가기</button>
          : <button type="button" className={styles.primaryButton} onClick={() => setPreview(true)} data-purchase-cta><ShoppingBag aria-hidden="true" />{PURCHASE_AD.buttonLabel}</button>}
        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondaryButton} onClick={onRestart}><RotateCcw aria-hidden="true" />다시 하기</button>
          <PlatformReturnLink />
        </div>
      </div>
      <small className={styles.notice}>{PURCHASE_AD.notice}</small>
    </article>
  </div>;
}

/** Challenge result: distance this run and the device record. */
export function DeliveryChallengeOver({ meters, best, onRetry, onHome }: { meters: number; best: number; onRetry: () => void; onHome: () => void }) {
  const ref = useDialogFocus();
  const record = meters >= best && meters > 0;
  return <div className={styles.overlay}>
    <article ref={ref} tabIndex={-1} className={styles.campaignCard} role="dialog" aria-modal="true" aria-labelledby="challenge-over-title" data-campaign-screen="challenge-over">
      <DeliveryHero className={styles.hero} />
      <p className={styles.eyebrow}>{record ? "새 기록!" : "챌린지 종료"}</p>
      <h2 id="challenge-over-title" className={styles.sparkTitle}><Spark />{Math.floor(meters).toLocaleString("ko-KR")}m 달렸어요<Spark flip /></h2>
      <div className={styles.completionStats}>
        <span><Trophy aria-hidden="true" />최고 기록 {best.toLocaleString("ko-KR")}m</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={onRetry} data-challenge-retry><RotateCcw aria-hidden="true" />다시 달리기</button>
        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondaryButton} onClick={onHome}><ArrowLeft aria-hidden="true" />처음으로</button>
          <PlatformReturnLink />
        </div>
      </div>
    </article>
  </div>;
}
