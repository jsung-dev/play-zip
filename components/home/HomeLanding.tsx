"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Gamepad2, Gift, Heart, Home, Play, Scale, Settings, Sparkles, Star, Timer, Trophy, UserRound, Users, X } from "lucide-react";
import { categories, getCategory, playContents } from "@/data/play-content";
import type { CategoryIcon } from "@/types/play-content";
import styles from "./HomeLanding.module.css";

const categoryIcons: Record<CategoryIcon, typeof BrainCircuit> = { mind: BrainCircuit, heart: Heart, balance: Scale, quiz: Trophy, game: Gamepad2 };
const roomObjects: Record<string, { place: string; hint: string; action: string }> = {
  psychology: { place: "반짝 거울", hint: "내 마음을 비춰볼까?", action: "거울 속 마음을 들여다보는 중..." },
  romance: { place: "두근 전화기", hint: "누구에게 전화가 왔을까?", action: "두근두근 전화가 연결됐어요!" },
  balance: { place: "갈림 저울", hint: "하나만 고를 수 있어!", action: "어느 쪽으로 기울지 살펴보는 중..." },
  quiz: { place: "척척 책상", hint: "오늘의 문제를 펼쳐봐.", action: "비밀 문제가 펼쳐지고 있어요!" },
  minigame: { place: "게임 오락기", hint: "버튼을 눌러 한 판 시작!", action: "게임 화면에 전원이 들어왔어요!" },
};
const objectAssets: Record<string, string> = {
  psychology: "/play-zip/object-mirror-v3.png",
  romance: "/play-zip/object-phone-v3.png",
  balance: "/play-zip/object-scale-v3.png",
  quiz: "/play-zip/object-quiz-v3.png",
  minigame: "/play-zip/object-arcade-v3.png",
};
const characters = [
  { name: "핑키", category: "romance", message: "전화기가 아까부터 울리고 있어. 같이 받아볼래?" },
  { name: "몽글", category: "quiz", message: "책상 위에 재미있는 문제가 잔뜩 펼쳐져 있어!" },
  { name: "모리", category: "psychology", message: "어서 와! 방 안에서 반짝이는 물건을 직접 눌러봐." },
  { name: "해나", category: "balance", message: "나는 벌써 골랐는데! 너라면 어느 쪽을 선택할래?" },
  { name: "새싹", category: "minigame", message: "오락기 최고 점수는 내 거야. 도전해 볼래?" },
];

function formatParticipants(value: number) {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

export function HomeLanding() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const actionTimerRef = useRef<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState(2);
  const [visited, setVisited] = useState<string[]>([]);
  const [enteringTitle, setEnteringTitle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeCategoryData = activeCategory ? getCategory(activeCategory) : null;
  const activeContents = useMemo(() => activeCategory ? playContents.filter((item) => item.category_id === activeCategory) : [], [activeCategory]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    return () => { if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current); };
  }, []);

  const triggerObject = (categoryId: string) => {
    if (activeAction) return;
    const characterIndex = characters.findIndex((character) => character.category === categoryId);
    setSelectedCharacter(characterIndex);
    setActiveCategory(null);
    setActiveAction(categoryId);
    setVisited((current) => current.includes(categoryId) ? current : [...current, categoryId]);
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = window.setTimeout(() => {
      setActiveAction(null);
      setActiveCategory(categoryId);
    }, 1050);
  };

  const chooseCharacter = (index: number) => {
    if (activeAction) return;
    setSelectedCharacter(index);
    setActiveCategory(null);
  };

  const enterGame = (title: string) => {
    setEnteringTitle(title);
    window.setTimeout(() => {
      setEnteringTitle(null);
      setNotice(`${title}은(는) 준비 중이에요. 입장 연출까지 완성!`);
      window.setTimeout(() => setNotice(null), 2600);
    }, 1500);
  };

  return (
    <main className={styles.playroom} data-action={activeAction ?? undefined}>
      <div className={styles.roomViewport} ref={viewportRef}>
        <div className={styles.roomStage} aria-label="플레이집 놀이방">
          <span className={styles.sunGlow} aria-hidden="true" />
          <span className={`${styles.floatSparkle} ${styles.sparkleOne}`} aria-hidden="true">✦</span>
          <span className={`${styles.floatSparkle} ${styles.sparkleTwo}`} aria-hidden="true">✦</span>

          <div className={styles.objectLayer}>
            {categories.map((category) => {
              const object = roomObjects[category.id];
              return (
                <button className={`${styles.roomObject} ${styles[`object_${category.id}`]} ${activeAction === category.id ? styles.objectActing : ""}`} key={category.id} onClick={() => triggerObject(category.id)} type="button" aria-label={`${category.name}, ${object.place} 열기`}>
                  <img className={styles.objectSprite} src={objectAssets[category.id]} alt="" />
                  <span className={styles.objectMagic} aria-hidden="true"><i /><i /><i /><b /></span>
                  <span className={styles.objectTooltip}>{object.place}<strong>{category.name}</strong></span>
                </button>
              );
            })}
          </div>

          <div className={styles.characterLayer} aria-label="플레이집 친구들">
            {characters.map((character, index) => (
              <button className={`${styles.character} ${styles[`character_${index}`]} ${selectedCharacter === index ? styles.characterActive : ""}`} key={character.name} onClick={() => chooseCharacter(index)} type="button" aria-label={`${character.name}와 대화하기`}>
                <span className={`${styles.characterSprite} ${styles[`sprite_${index}`]}`} />
                <span className={styles.characterName}>{character.name}</span>
                {selectedCharacter === index && <span className={styles.characterHeart}>♥</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <header className={styles.hud}>
        <a className={styles.brand} href="#" aria-label="PLAY ZIP 홈"><strong>play</strong><span>zip!</span></a>
        <div className={styles.playerCard}><span className={styles.avatar}><UserRound /></span><span><small>PLAYER 01</small><strong>마을 새내기</strong><i><b /></i></span><em>LV.1</em></div>
        <div className={styles.hudActions}><div><Star fill="currentColor" /><strong>120</strong></div><button onClick={() => setNotice("설정 메뉴는 다음 업데이트에서 열려요!")} type="button" aria-label="설정"><Settings /></button></div>
      </header>

      <div className={styles.missionHud}><span><Gift /></span><div><small>오늘의 미션</small><strong>놀이방 물건 3개 살펴보기</strong><i><b style={{ width: `${Math.min(visited.length / 3, 1) * 100}%` }} /></i></div><em>{Math.min(visited.length, 3)}/3</em></div>

      {!activeCategory && !activeAction && (
        <section className={styles.dialogue} aria-live="polite">
          <div className={`${styles.dialoguePortrait} ${styles[`portrait_${selectedCharacter}`]}`}><span /></div>
          <div><small>{characters[selectedCharacter].name}</small><strong>{characters[selectedCharacter].message}</strong><p>반짝이는 물건 전체가 버튼이에요. 직접 눌러보세요.</p></div>
          <button onClick={() => triggerObject(characters[selectedCharacter].category)} type="button"><Sparkles /> 같이 가기</button>
        </section>
      )}

      {activeAction && <div className={styles.actionCaption}><Sparkles /><strong>{roomObjects[activeAction].action}</strong></div>}

      {activeCategoryData && (
        <aside className={styles.gameWindow} aria-label={`${activeCategoryData.name} 게임 선택`}>
          <div className={styles.windowBar}><span><i /><i /><i /></span><strong>{roomObjects[activeCategoryData.id].place}</strong><button onClick={() => setActiveCategory(null)} type="button" aria-label="창 닫기"><X /></button></div>
          <div className={styles.windowIntro}><span>{(() => { const Icon = categoryIcons[activeCategoryData.icon]; return <Icon />; })()}</span><div><small>{roomObjects[activeCategoryData.id].hint}</small><h1>{activeCategoryData.name}</h1><p>{activeCategoryData.description}</p></div></div>
          <div className={styles.gameShelf}>
            {activeContents.map((content, index) => (
              <button className={styles.gameBox} key={content.id} onClick={() => enterGame(content.title)} type="button">
                <span className={styles.boxArt} style={{ background: content.thumbnail_gradient }}><i style={{ background: content.thumbnail_accent }} /><em>0{index + 1}</em></span>
                <span className={styles.boxCopy}><small>{activeCategoryData.name}</small><strong>{content.title}</strong><span><i><Users /> {formatParticipants(content.participant_count)}명</i><i><Timer /> {content.duration_minutes}분</i></span></span>
                <span className={styles.boxPlay}><Play fill="currentColor" /></span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <nav className={styles.bottomDock} aria-label="게임 메뉴">
        <button className={!activeCategory ? styles.dockActive : ""} onClick={() => setActiveCategory(null)} type="button"><Home /><span>놀이방</span></button>
        <button onClick={() => triggerObject("minigame")} type="button"><Gamepad2 /><span>게임</span></button>
        <button onClick={() => setNotice(`오늘은 물건 ${visited.length}개를 살펴봤어요!`)} type="button"><Trophy /><span>미션</span>{visited.length > 0 && <i>{Math.min(visited.length, 3)}</i>}</button>
        <button onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 열려요!")} type="button"><UserRound /><span>MY</span></button>
      </nav>

      {enteringTitle && <div className={styles.entering}><div><span className={styles.loadingStar}><Star fill="currentColor" /></span><small>NOW ENTERING</small><strong>{enteringTitle}</strong><i><b /></i><p>놀이방 문을 여는 중...</p></div></div>}
      {notice && <div className={styles.notice} role="status"><Star fill="currentColor" /><span>{notice}</span><button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X /></button></div>}
    </main>
  );
}
