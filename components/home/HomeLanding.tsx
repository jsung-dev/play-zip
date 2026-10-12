"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BrainCircuit, Check, Gamepad2, Heart, Home, MapPin, Play, Scale, Sparkles, Star, Timer, Trophy, UserRound, Users, X } from "lucide-react";
import { categories, getCategory, playContents } from "@/data/play-content";
import type { CategoryIcon, PlayContent } from "@/types/play-content";
import styles from "./HomeLanding.module.css";

const categoryIcons: Record<CategoryIcon, typeof BrainCircuit> = { mind: BrainCircuit, heart: Heart, balance: Scale, quiz: Trophy, game: Gamepad2 };

function formatParticipants(value: number) {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

function Artwork({ content }: { content: PlayContent }) {
  const artworkStyle = { "--art-gradient": content.thumbnail_gradient, "--art-accent": content.thumbnail_accent } as CSSProperties;
  return <div className={styles.artwork} style={artworkStyle} aria-hidden="true"><span className={styles.artSky} /><span className={`${styles.motif} ${styles[`motif_${content.thumbnail_motif}`]}`} /><span className={styles.artPath} /><span className={styles.artFlower}>✿</span></div>;
}

export function HomeLanding() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const featured = playContents[0];
  const visibleContents = useMemo(() => activeCategory === "all" ? playContents.slice(0, 6) : playContents.filter((item) => item.category_id === activeCategory), [activeCategory]);

  const chooseCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    window.setTimeout(() => document.querySelector("#plays")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const launch = (title: string) => {
    setNotice(`${title}은(는) 지금 만들고 있어요. 조금만 기다려 주세요!`);
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <main className={styles.page} id="top">
      <section className={styles.world} aria-labelledby="hero-title">
        <div className={styles.checker} aria-hidden="true" />
        <header className={styles.header}>
          <a className={styles.brand} href="#top" aria-label="PLAY ZIP 홈"><strong>play</strong><span>zip!</span></a>
          <nav className={styles.topNav} aria-label="카테고리 바로가기">{categories.map((category) => <button key={category.id} onClick={() => chooseCategory(category.id)} type="button">{category.name}</button>)}</nav>
          <button className={styles.myButton} onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 만나요!")} type="button"><UserRound size={18} /><span>MY</span></button>
        </header>

        <div className={styles.heroCopy}>
          <span className={styles.heroKicker}><Sparkles size={15} /> 오늘의 놀이터가 열렸어요</span>
          <h1 id="hero-title">어서 와!<br /><em>오늘은 어디서 놀까?</em></h1>
          <p>마음이 가는 길을 골라봐.<br />짧고 재미있는 놀이가 기다리고 있어!</p>
          <button className={styles.heroButton} onClick={() => launch(featured.title)} type="button"><span><Play size={17} fill="currentColor" /></span>바로 놀러 가기<ArrowRight size={18} /></button>
        </div>

        <div className={styles.worldGuide}><MapPin size={16} fill="currentColor" /><span><small>지금 여기는</small><strong>플레이집 중앙광장</strong></span></div>

        <div className={styles.categoryDock} aria-label="놀이터 선택">
          {categories.map((category, index) => {
            const Icon = categoryIcons[category.icon];
            return <button className={activeCategory === category.id ? styles.categoryActive : ""} key={category.id} onClick={() => chooseCategory(category.id)} type="button"><span className={styles.categoryIcon}><Icon size={25} strokeWidth={2.2} /></span><span><small>ZONE 0{index + 1}</small><strong>{category.name}</strong></span></button>;
          })}
        </div>
      </section>

      <section className={styles.playground}>
        <div className={styles.paperEdge} aria-hidden="true" />
        <div className={styles.shell}>
          <section className={styles.welcomeStrip} aria-label="오늘의 플레이">
            <div className={styles.mascotSeal}><Star size={24} fill="currentColor" /></div>
            <div><span>TODAY&apos;S PICK</span><h2>{featured.title}</h2><p>{featured.summary}</p></div>
            <div className={styles.pickMeta}><span><Users size={15} /> {formatParticipants(featured.participant_count)}명</span><span><Timer size={15} /> {featured.duration_minutes}분</span></div>
            <button onClick={() => launch(featured.title)} type="button">시작하기 <ArrowRight size={17} /></button>
          </section>

          <section className={styles.questPath} aria-label="오늘의 스탬프">
            <div className={styles.questTitle}><span>오늘의 산책</span><strong>세 곳을 방문하면 선물이 와요</strong></div>
            <div className={styles.questLine}><i /><span className={styles.done}><Check /></span><b /><span className={styles.done}><Check /></span><b /><span><Star /></span></div>
            <div className={styles.reward}><Trophy size={20} /><span><small>완성 보상</small><strong>+40 XP</strong></span><i>DEMO</i></div>
          </section>

          <section className={styles.playSection} id="plays" aria-labelledby="play-title">
            <div className={styles.playHeader}>
              <div><span className={styles.handLabel}>동네 소식</span><h2 id="play-title">{activeCategory === "all" ? "요즘 친구들이 자주 가는 곳" : `${getCategory(activeCategory)?.name} 놀이터`}</h2><p>하나를 골라 가볍게 시작해 봐요.</p></div>
              <div className={styles.filters}><button className={activeCategory === "all" ? styles.filterActive : ""} onClick={() => setActiveCategory("all")} type="button">전체</button>{categories.map((category) => <button className={activeCategory === category.id ? styles.filterActive : ""} key={category.id} onClick={() => setActiveCategory(category.id)} type="button">{category.name}</button>)}</div>
            </div>

            <div className={styles.playGrid}>
              {visibleContents.map((content, index) => (
                <article className={styles.playCard} key={content.id}>
                  <div className={styles.tape} aria-hidden="true" />
                  <div className={styles.cardVisual}><Artwork content={content} /><span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span></div>
                  <div className={styles.cardBody}><span className={styles.cardCategory}>{getCategory(content.category_id)?.name}</span><h3>{content.title}</h3><p>{content.summary}</p><div className={styles.cardFooter}><span><Users size={14} /> {formatParticipants(content.participant_count)}명</span><span><Timer size={14} /> {content.duration_minutes}분</span><button onClick={() => launch(content.title)} type="button" aria-label={`${content.title} 시작`}><Play size={15} fill="currentColor" /></button></div></div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <footer className={styles.footer}><div className={styles.brand}><strong>play</strong><span>zip!</span></div><p>심심한 순간, 마을에서 만나요.</p><span>© 2026 PLAY ZIP</span></footer>
      <nav className={styles.bottomNav} aria-label="하단 메뉴"><button className={styles.navActive} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button"><Home /><span>마을</span></button><button onClick={() => document.querySelector("#plays")?.scrollIntoView({ behavior: "smooth" })} type="button"><Gamepad2 /><span>놀기</span></button><button onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 만나요!")} type="button"><UserRound /><span>MY</span></button></nav>
      {notice && <div className={styles.notice} role="status"><Star size={18} fill="currentColor" /><span>{notice}</span><button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X size={17} /></button></div>}
    </main>
  );
}
