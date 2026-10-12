"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Gamepad2,
  Heart,
  Home,
  Play,
  Scale,
  Sparkles,
  Star,
  Timer,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { categories, getCategory, playContents } from "@/data/play-content";
import type { CategoryIcon, PlayContent } from "@/types/play-content";
import styles from "./HomeLanding.module.css";

const categoryIcons = {
  mind: BrainCircuit,
  heart: Heart,
  balance: Scale,
  quiz: Trophy,
  game: Gamepad2,
} satisfies Record<CategoryIcon, typeof BrainCircuit>;

function formatParticipants(value: number) {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

function Artwork({ content }: { content: PlayContent }) {
  const artworkStyle = {
    "--art-gradient": content.thumbnail_gradient,
    "--art-accent": content.thumbnail_accent,
  } as CSSProperties;

  return (
    <div className={styles.artwork} style={artworkStyle} aria-hidden="true">
      <span className={styles.artSun} />
      <span className={`${styles.motif} ${styles[`motif_${content.thumbnail_motif}`]}`} />
      <span className={styles.artCloud} />
      <span className={styles.artStage}>PLAY {content.id.slice(-2)}</span>
    </div>
  );
}

export function HomeLanding() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const featured = playContents.find((content) => content.is_featured) ?? playContents[0];
  const visibleContents = useMemo(
    () => activeCategory === "all" ? playContents.slice(0, 6) : playContents.filter((content) => content.category_id === activeCategory),
    [activeCategory],
  );

  const chooseCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    window.setTimeout(() => document.querySelector("#plays")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const launch = (title: string) => {
    setNotice(`${title}은(는) 지금 만들고 있어요. 조금만 기다려 주세요!`);
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <main className={styles.page}>
      <div className={styles.checker} aria-hidden="true" />

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="PLAY ZIP 홈">
          <strong>play</strong><span>zip!</span>
        </a>
        <nav className={styles.topNav} aria-label="카테고리 바로가기">
          {categories.map((category) => <button key={category.id} onClick={() => chooseCategory(category.id)} type="button">{category.name}</button>)}
        </nav>
        <button className={styles.myButton} onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 만나요!")} type="button"><UserRound size={18} /><span>MY</span></button>
      </header>

      <div className={styles.shell} id="top">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroScene} />
          <div className={styles.heroCopy}>
            <span className={styles.heroSticker}><Sparkles size={15} /> 오늘 뭐 하고 놀지?</span>
            <h1 id="hero-title">재미있는 건<br /><em>여기 다 모였어!</em></h1>
            <p>테스트도 하고, 퀴즈도 풀고,<br />친구와 가볍게 한 판 놀아봐요.</p>
            <button className={styles.heroButton} onClick={() => launch(featured.title)} type="button"><span><Play size={17} fill="currentColor" /></span>오늘의 추천 시작<ArrowRight size={18} /></button>
          </div>
          <div className={styles.featureTicket}>
            <span className={styles.ticketStar}><Star size={16} fill="currentColor" /></span>
            <div><small>TODAY&apos;S PICK</small><strong>{featured.title}</strong></div>
            <p><Users size={13} /> {formatParticipants(featured.participant_count)}명 <i /> <Timer size={13} /> {featured.duration_minutes}분</p>
          </div>
        </section>

        <section className={styles.categorySection} aria-labelledby="category-title">
          <div className={styles.sectionHeading}><div><span>골라 골라!</span><h2 id="category-title">오늘은 뭐가 끌려?</h2></div><p>다섯 가지 놀이터가 기다리고 있어요.</p></div>
          <div className={styles.categoryGrid}>
            {categories.map((category, index) => {
              const Icon = categoryIcons[category.icon];
              return (
                <button className={`${styles.categoryButton} ${activeCategory === category.id ? styles.categoryActive : ""}`} key={category.id} onClick={() => chooseCategory(category.id)} type="button">
                  <span className={styles.categoryIcon}><Icon size={26} strokeWidth={2.4} /></span>
                  <span className={styles.categoryNumber}>0{index + 1}</span>
                  <strong>{category.name}</strong>
                  <small>{category.description}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.stampSection} aria-label="오늘의 스탬프">
          <div className={styles.stampTitle}><span><Star size={20} fill="currentColor" /></span><div><small>오늘의 스탬프</small><strong>한 번만 더 놀면 선물!</strong></div></div>
          <div className={styles.stamps}><span className={styles.stampDone}><Check /></span><span className={styles.stampDone}><Check /></span><span><Star /></span></div>
          <div className={styles.stampReward}><small>완성 보상</small><strong>+40 XP</strong><i>DEMO</i></div>
        </section>

        <section className={styles.playSection} id="plays" aria-labelledby="play-title">
          <div className={styles.playHeader}>
            <div className={styles.sectionHeading}><div><span>지금 인기!</span><h2 id="play-title">{activeCategory === "all" ? "친구들이 많이 놀고 있어요" : getCategory(activeCategory)?.name}</h2></div></div>
            <div className={styles.filters}><button className={activeCategory === "all" ? styles.filterActive : ""} onClick={() => setActiveCategory("all")} type="button">전체</button>{categories.map((category) => <button className={activeCategory === category.id ? styles.filterActive : ""} key={category.id} onClick={() => setActiveCategory(category.id)} type="button">{category.name}</button>)}</div>
          </div>
          <div className={styles.playGrid}>
            {visibleContents.map((content, index) => (
              <article className={styles.playCard} key={content.id}>
                <div className={styles.cardVisual}><Artwork content={content} /><span className={styles.cardRank}>{index + 1}</span></div>
                <div className={styles.cardBody}>
                  <span className={styles.cardCategory}>{getCategory(content.category_id)?.name}</span>
                  <h3>{content.title}</h3>
                  <p>{content.summary}</p>
                  <div className={styles.cardFooter}><span><Users size={14} /> {formatParticipants(content.participant_count)}명</span><span><Timer size={14} /> {content.duration_minutes}분</span><button onClick={() => launch(content.title)} type="button" aria-label={`${content.title} 시작`}><Play size={15} fill="currentColor" /></button></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className={styles.footer}><div className={styles.brand}><strong>play</strong><span>zip!</span></div><p>심심한 순간, 우리 놀이터에서 만나요.</p><span>© 2026 PLAY ZIP</span></footer>
      <nav className={styles.bottomNav} aria-label="하단 메뉴"><button className={styles.navActive} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button"><Home /><span>홈</span></button><button onClick={() => document.querySelector("#plays")?.scrollIntoView({ behavior: "smooth" })} type="button"><Gamepad2 /><span>놀기</span></button><button onClick={() => setNotice("내 기록 기능은 다음 업데이트에서 만나요!")} type="button"><UserRound /><span>MY</span></button></nav>
      {notice && <div className={styles.notice} role="status"><Star size={18} fill="currentColor" /><span>{notice}</span><button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X size={17} /></button></div>}
    </main>
  );
}
