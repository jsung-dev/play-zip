"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Gamepad2, Heart, Play, Scale, Sparkles, Star, Timer, Trophy, Users, X } from "lucide-react";
import { categories, getCategory, playContents } from "@/data/play-content";
import type { CategoryIcon } from "@/types/play-content";
import styles from "./HomeLanding.module.css";

const categoryIcons: Record<CategoryIcon, typeof BrainCircuit> = {
  mind: BrainCircuit,
  heart: Heart,
  balance: Scale,
  quiz: Trophy,
  game: Gamepad2,
};

const roomObjects: Record<string, { place: string; hint: string; action: string }> = {
  psychology: { place: "마음 거울", hint: "내 마음을 비춰볼까요?", action: "거울 속 마음이 살며시 열리고 있어요." },
  romance: { place: "두근 전화기", hint: "누구에게 전화가 왔을까?", action: "두근두근, 전화기가 연결되고 있어요." },
  balance: { place: "갈림 저울", hint: "하나만 고를 수 있어!", action: "어느 쪽으로 기울지 살펴보는 중이에요." },
  quiz: { place: "척척 책장", hint: "오늘의 문제를 펼쳐봐.", action: "비밀 문제가 펼쳐지고 있어요!" },
  minigame: { place: "게임 오락기", hint: "버튼을 눌러 한 판 시작!", action: "게임 화면에 전원이 들어왔어요!" },
};

const objectAssets: Record<string, string> = {
  psychology: "/play-zip/object-mirror-v3.png",
  romance: "/play-zip/object-phone-v3.png",
  balance: "/play-zip/object-scale-v3.png",
  quiz: "/play-zip/object-quiz-v3.png",
  minigame: "/play-zip/object-arcade-v3.png",
};

function formatParticipants(value: number) {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

export function HomeLanding() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const actionTimerRef = useRef<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [enteringTitle, setEnteringTitle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeCategoryData = activeCategory ? getCategory(activeCategory) : null;
  const activeContents = useMemo(
    () => (activeCategory ? playContents.filter((item) => item.category_id === activeCategory) : []),
    [activeCategory],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    return () => {
      if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    };
  }, []);

  const triggerObject = (categoryId: string) => {
    if (activeAction) return;
    setActiveCategory(null);
    setActiveAction(categoryId);
    setVisited((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = window.setTimeout(() => {
      setActiveAction(null);
      setActiveCategory(categoryId);
    }, 1050);
  };

  const enterGame = (title: string) => {
    setEnteringTitle(title);
    window.setTimeout(() => {
      setEnteringTitle(null);
      setNotice(`${title}은(는) 준비 중이에요. 입장 연출까지는 완성!`);
      window.setTimeout(() => setNotice(null), 2600);
    }, 1500);
  };

  return (
    <main className={styles.playroom} data-action={activeAction ?? undefined}>
      <div className={styles.roomViewport} ref={viewportRef}>
        <section className={styles.roomStage} aria-label="PLAY ZIP 카테고리 플레이룸">
          <div className={styles.objectLayer}>
            {categories.map((category) => {
              const object = roomObjects[category.id];
              return (
                <button
                  className={`${styles.roomObject} ${styles[`object_${category.id}`]} ${activeAction === category.id ? styles.objectActing : ""}`}
                  key={category.id}
                  onClick={() => triggerObject(category.id)}
                  type="button"
                  aria-label={`${category.name}, ${object.place} 열기`}
                >
                  <img className={styles.objectSprite} draggable={false} src={objectAssets[category.id]} alt="" />
                  <span className={styles.objectTooltip}>
                    <strong>{category.name}</strong>
                    <small>{object.place}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <header className={styles.hud}>
        <a className={styles.brand} href="#" aria-label="PLAY ZIP 홈">
          <strong>play</strong>
          <span>zip!</span>
        </a>
        <p className={styles.roomBrief}>
          <small>PLAYROOM</small>
          <strong>마음에 드는 장소를 골라 게임을 시작해요</strong>
        </p>
        <div className={styles.hudCounter} aria-label={`발견한 장소 ${visited.length}개`}>
          <Star fill="currentColor" />
          <strong>{visited.length}/5</strong>
          <span>SPOTS</span>
        </div>
      </header>

      {activeAction && (
        <div className={styles.actionCaption}>
          <Sparkles />
          <strong>{roomObjects[activeAction].action}</strong>
        </div>
      )}

      {activeCategoryData && (
        <aside className={styles.gameWindow} aria-label={`${activeCategoryData.name} 게임 선택`}>
          <div className={styles.windowBar}>
            <span><i /><i /><i /></span>
            <strong>{roomObjects[activeCategoryData.id].place}</strong>
            <button onClick={() => setActiveCategory(null)} type="button" aria-label="창 닫기"><X /></button>
          </div>
          <div className={styles.windowIntro}>
            <span>{(() => { const Icon = categoryIcons[activeCategoryData.icon]; return <Icon />; })()}</span>
            <div>
              <small>{roomObjects[activeCategoryData.id].hint}</small>
              <h1>{activeCategoryData.name}</h1>
              <p>{activeCategoryData.description}</p>
            </div>
          </div>
          <div className={styles.gameShelf}>
            {activeContents.map((content, index) => (
              <button className={styles.gameBox} key={content.id} onClick={() => enterGame(content.title)} type="button">
                <span className={styles.boxArt} style={{ background: content.thumbnail_gradient }}>
                  <i style={{ background: content.thumbnail_accent }} />
                  <em>0{index + 1}</em>
                </span>
                <span className={styles.boxCopy}>
                  <small>{activeCategoryData.name}</small>
                  <strong>{content.title}</strong>
                  <span>
                    <i><Users /> {formatParticipants(content.participant_count)}명</i>
                    <i><Timer /> {content.duration_minutes}분</i>
                  </span>
                </span>
                <span className={styles.boxPlay}><Play fill="currentColor" /></span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {enteringTitle && (
        <div className={styles.entering}>
          <div>
            <span className={styles.loadingStar}><Star fill="currentColor" /></span>
            <small>NOW ENTERING</small>
            <strong>{enteringTitle}</strong>
            <i><b /></i>
            <p>플레이룸 문을 여는 중...</p>
          </div>
        </div>
      )}

      {notice && (
        <div className={styles.notice} role="status">
          <Star fill="currentColor" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X /></button>
        </div>
      )}
    </main>
  );
}
