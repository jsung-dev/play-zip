"use client";

import { MapPin, Pause, Play, RotateCcw, Route, Volume2, VolumeX } from "lucide-react";
import { DELIVERY_STOPS } from "@/data/delivery-map";
import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { useDialogFocus } from "./DeliveryCampaign";
import { PlatformReturnLink } from "./PlatformReturnLink";
import shared from "./DeliveryCampaign.module.css";
import styles from "./DeliveryNavigation.module.css";

export function DeliveryPauseMenu({ stopIndex, soundOn, onToggleSound, onResume, onReplay, onRestart }: {
  stopIndex: number; soundOn: boolean; onToggleSound: () => void; onResume: () => void; onReplay: () => void; onRestart: () => void;
}) {
  const ref = useDialogFocus();
  const next = DELIVERY_STOPS[stopIndex];
  return <div className={shared.overlay}>
    <article ref={ref} tabIndex={-1} className={`${shared.campaignCard} ${styles.pauseCard}`} role="dialog" aria-modal="true" aria-labelledby="delivery-pause-title" aria-label="게임 일시정지">
      <div className={styles.pauseHead}><span className={styles.pauseSymbol}><Pause aria-hidden="true" /></span><h2 id="delivery-pause-title">잠시 멈췄어요</h2></div>
      <p className={styles.pauseDestination}><MapPin aria-hidden="true" /><span>{next ? `다음 배달 ${stopIndex + 1}/${DELIVERY_STOPS.length}` : "마지막 배달"}</span><strong>{next?.address ?? DELIVERY_GAME_CONFIG.destinationName}</strong></p>
      <div className={styles.settings}>
        <p className={styles.settingHint}>좌우로 밀면 차선 이동 · 위로 밀거나 탭하면 점프 · 아래로 밀면 숙이기</p>
        <button type="button" className={styles.settingRow} aria-pressed={soundOn} data-sound-toggle onClick={onToggleSound}>
          <span className={styles.settingLabel}>{soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}소리·진동</span>
          <span className={styles.switch} aria-hidden="true"><i /></span>
        </button>
      </div>
      <div className={shared.actions}>
        <button className={shared.primaryButton} type="button" onClick={onResume}><Play aria-hidden="true" />계속 배달하기</button>
        <div className={shared.buttonRow}>
          <button className={shared.secondaryButton} type="button" onClick={onReplay} data-guidance-replay><Route aria-hidden="true" />길 안내</button>
          <button className={shared.secondaryButton} type="button" onClick={onRestart}><RotateCcw aria-hidden="true" />처음으로</button>
        </div>
        <PlatformReturnLink confirmLeave label="게임 나가기" />
      </div>
    </article>
  </div>;
}
