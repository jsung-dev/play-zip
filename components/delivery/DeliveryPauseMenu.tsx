"use client";

import { MapPin, Pause, Play, RotateCcw, Route } from "lucide-react";
import { DELIVERY_STOPS } from "@/data/delivery-map";
import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { useDialogFocus } from "./DeliveryCampaign";
import { PlatformReturnLink } from "./PlatformReturnLink";
import shared from "./DeliveryCampaign.module.css";
import styles from "./DeliveryNavigation.module.css";

export function DeliveryPauseMenu({ stopIndex, onResume, onReplay, onRestart }: {
  stopIndex: number; onResume: () => void; onReplay: () => void; onRestart: () => void;
}) {
  const ref = useDialogFocus();
  const next = DELIVERY_STOPS[stopIndex];
  return <div className={shared.overlay}>
    <article ref={ref} tabIndex={-1} className={`${shared.campaignCard} ${styles.pauseCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-pause-title" aria-label="게임 일시정지">
      <span className={styles.pauseSymbol}><Pause aria-hidden="true" /></span>
      <h2 id="delivery-pause-title">잠시 멈췄어요</h2>
      <p className={styles.pauseHint}>준비되면 배달을 이어가세요.</p>
      <div className={styles.pauseDestination}><MapPin aria-hidden="true" /><div><span>{next ? `배달 ${stopIndex + 1} / ${DELIVERY_STOPS.length}` : "마지막 배달"}</span><strong>{next?.address ?? DELIVERY_GAME_CONFIG.destinationName}</strong></div></div>
      <div className={shared.actions}>
        <button className={shared.primaryButton} type="button" onClick={onResume}><Play aria-hidden="true" />계속 배달하기</button>
        <button className={shared.secondaryButton} type="button" onClick={onReplay} data-guidance-replay><Route aria-hidden="true" />길 안내 다시 보기</button>
        <button className={shared.textButton} type="button" onClick={onRestart}><RotateCcw aria-hidden="true" />처음으로</button>
        <PlatformReturnLink confirmLeave />
      </div>
    </article>
  </div>;
}
