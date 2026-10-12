"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Check, Gamepad2, Gift, Heart, Home, Map, Play, Scale, Settings, Sparkles, Star, Timer, Trophy, UserRound, Users, X } from "lucide-react";
import { categories, getCategory, playContents } from "@/data/play-content";
import type { CategoryIcon } from "@/types/play-content";
import styles from "./HomeLanding.module.css";

const categoryIcons: Record<CategoryIcon, typeof BrainCircuit> = { mind: BrainCircuit, heart: Heart, balance: Scale, quiz: Trophy, game: Gamepad2 };
const zoneNames: Record<string, string> = {
  psychology: "마음 관측소",
  romance: "두근두근 정원",
  balance: "갈림길 다리",
  quiz: "척척 도서관",
  minigame: "조이스틱 공방",
};

function formatParticipants(value: number) {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

export function HomeLanding() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.scrollLeft = (map.scrollWidth - map.clientWidth) / 2;
  }, []);

  const activeContents = useMemo(
    () => activeCategory ? playContents.filter((item) => item.category_id === activeCategory) : [],
    [activeCategory],
  );
  const activeCategoryData = activeCategory ? getCategory(activeCategory) : null;

  const openZone = (categoryId: string) => {
    setActiveCategory(categoryId);
    setPanelOpen(true);
  };

  const launch = (title: string) => {
    setNotice(`${title}은(는) 지금 준비 중이에요!`);
    window.setTimeout(() => setNotice(null), 3000);
  };

  return (
    <main className={styles.lobby}>
      <div className={styles.mapViewport} ref={mapRef}>
        <div className={styles.mapCanvas}>
          <span className={`${styles.cloud} ${styles.cloudOne}`} aria-hidden="true" />
          <span className={`${styles.cloud} ${styles.cloudTwo}`} aria-hidden="true" />

          <div className={styles.zoneLayer} aria-label="플레이집 마을 지도">
            {categories.map((category) => {
              const Icon = categoryIcons[category.icon];
              return (
                <button
                  className={`${styles.zone} ${styles[`zone_${category.id}`]} ${activeCategory === category.id ? styles.zoneActive : ""}`}
                  key={category.id}
                  onClick={() => openZone(category.id)}
                  type="button"
                  aria-label={`${category.name}, ${zoneNames[category.id]} 열기`}
                >
                  <span className={styles.zonePulse} />
                  <span className={styles.zoneIcon}><Icon /></span>
                  <span className={styles.zoneLabel}><small>{zoneNames[category.id]}</small><strong>{category.name}</strong></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <header className={styles.hud}>
        <a className={styles.brand} href="#" aria-label="PLAY ZIP 홈"><strong>play</strong><span>zip!</span></a>
        <div className={styles.playerCard}>
          <span className={styles.avatar}><UserRound /></span>
          <span className={styles.playerInfo}><small>PLAYER 01</small><strong>마을 새내기</strong><i><b /></i></span>
          <em>LV.1</em>
        </div>
        <div className={styles.hudRight}>
          <div className={styles.currency}><Star fill="currentColor" /><strong>120</strong></div>
          <button onClick={() => setNotice("설정 메뉴는 다음 업데이트에서 열려요!")} type="button" aria-label="설정"><Settings /></button>
        </div>
      </header>

      <div className={styles.questChip}>
        <span><Gift /></span>
        <div><small>오늘의 미션</small><strong>마을 3곳 둘러보기</strong></div>
        <div className={styles.questDots}><i className={styles.complete}><Check /></i><i className={styles.complete}><Check /></i><i><Star /></i></div>
      </div>

      <div className={`${styles.npcCallout} ${panelOpen ? styles.npcHidden : ""}`}>
        <div className={styles.npcFace}><span>●</span><span>●</span><b>⌣</b></div>
        <div className={styles.speech}>
          <small>안내 친구 · 모리</small>
          <strong>어서 와! 반짝이는 건물을 눌러봐.</strong>
          <p>심리테스트부터 미니게임까지, 하고 싶은 놀이를 골라 시작하면 돼!</p>
          <button onClick={() => openZone("psychology")} type="button"><Sparkles /> 오늘의 추천 보기</button>
        </div>
      </div>

      {panelOpen && activeCategoryData && (
        <aside className={styles.zonePanel} aria-label={`${activeCategoryData.name} 콘텐츠`}>
          <div className={styles.panelHandle} />
          <header className={styles.panelHeader}>
            <span className={styles.panelIcon}>{(() => { const Icon = categoryIcons[activeCategoryData.icon]; return <Icon />; })()}</span>
            <div><small>{zoneNames[activeCategoryData.id]}</small><h1>{activeCategoryData.name}</h1><p>{activeCategoryData.description}</p></div>
            <button className={styles.closeButton} onClick={() => setPanelOpen(false)} type="button" aria-label="창 닫기"><X /></button>
          </header>
          <div className={styles.gameList}>
            {activeContents.map((content, index) => (
              <button className={styles.gameItem} key={content.id} onClick={() => launch(content.title)} type="button">
                <span className={styles.gameThumb} style={{ background: content.thumbnail_gradient }}><i style={{ background: content.thumbnail_accent }} /><b>{String(index + 1).padStart(2, "0")}</b></span>
                <span className={styles.gameCopy}><small>{activeCategoryData.name}</small><strong>{content.title}</strong><span><i><Users /> {formatParticipants(content.participant_count)}명</i><i><Timer /> {content.duration_minutes}분</i></span></span>
                <span className={styles.playIcon}><Play fill="currentColor" /></span>
              </button>
            ))}
          </div>
          <p className={styles.panelTip}><Star fill="currentColor" /> 플레이하면 오늘의 미션 도장이 찍혀요.</p>
        </aside>
      )}

      <div className={styles.dragHint}><Map /> 좌우로 움직여 마을을 둘러보세요</div>

      <nav className={styles.gameDock} aria-label="게임 메뉴">
        <button className={styles.dockActive} onClick={() => setPanelOpen(false)} type="button"><Home /><span>마을</span></button>
        <button onClick={() => openZone("minigame")} type="button"><Gamepad2 /><span>게임</span></button>
        <button onClick={() => setNotice("오늘의 미션은 2/3까지 완료했어요!")} type="button"><Trophy /><span>미션</span><i>2</i></button>
        <button onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 열려요!")} type="button"><UserRound /><span>MY</span></button>
      </nav>

      {notice && <div className={styles.notice} role="status"><Star fill="currentColor" /><span>{notice}</span><button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X /></button></div>}
    </main>
  );
}
