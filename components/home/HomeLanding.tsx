"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronRight,
  Flame,
  Gamepad2,
  Heart,
  Home,
  Play,
  Scale,
  Sparkles,
  Target,
  Timer,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
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

function Artwork({ content, feature = false }: { content: PlayContent; feature?: boolean }) {
  const artworkStyle = {
    "--art-gradient": content.thumbnail_gradient,
    "--art-accent": content.thumbnail_accent,
  } as CSSProperties;

  return (
    <div className={`${styles.artwork} ${feature ? styles.featureArtwork : ""}`} style={artworkStyle} aria-hidden="true">
      <div className={styles.artGrid} />
      <span className={`${styles.motif} ${styles[`motif_${content.thumbnail_motif}`]}`} />
      <span className={styles.artStage}>STAGE {content.id.slice(-2)}</span>
      <span className={styles.artCategory}>{content.category_id.toUpperCase()}</span>
      <span className={styles.artGlint} />
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
    window.setTimeout(() => document.querySelector("#stages")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const launch = (title: string) => {
    setNotice(`${title}은(는) 준비 중이에요. 곧 열립니다!`);
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true"><span /><span /><span /></div>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="PLAY ZIP 홈">
          <span className={styles.brandIcon}><Zap size={21} fill="currentColor" /></span>
          <span><strong>PLAY</strong><b>ZIP</b></span>
        </a>
        <div className={styles.season}><span>SEASON 01</span><i /><b>ONLINE</b></div>
        <div className={styles.playerChip}>
          <div className={styles.avatar}><UserRound size={19} /></div>
          <div><span>PLAYER</span><strong>Lv.03</strong></div>
          <div className={styles.streak}><Flame size={16} fill="currentColor" /><b>7</b><span>일</span></div>
        </div>
      </header>

      <div className={styles.shell} id="top">
        <section className={styles.lobbyHero} aria-labelledby="hero-title">
          <article className={styles.spotlight}>
            <div className={styles.spotlightCopy}>
              <div className={styles.eyebrow}><span>DAILY PICK</span><i>+20 XP</i></div>
              <p className={styles.welcome}>오늘 뭐 하고 놀지?</p>
              <h1 id="hero-title">지루할 틈 없이<br /><em>바로 플레이.</em></h1>
              <p className={styles.heroText}>심리테스트부터 미니게임까지,<br />3분이면 새로운 재미를 발견할 수 있어요.</p>
              <div className={styles.featureMeta}><span><Users size={15} /> {formatParticipants(featured.participant_count)}명</span><span><Timer size={15} /> {featured.duration_minutes}분</span></div>
              <button className={styles.playButton} onClick={() => launch(featured.title)} type="button"><span><Play size={18} fill="currentColor" /></span>오늘의 추천 시작<ArrowRight size={18} /></button>
            </div>
            <div className={styles.featureVisual}>
              <div className={styles.pickBadge}><Sparkles size={14} /> TODAY&apos;S PICK</div>
              <Artwork content={featured} feature />
              <div className={styles.featureTitle}><span>{getCategory(featured.category_id)?.name}</span><strong>{featured.title}</strong></div>
            </div>
          </article>

          <aside className={styles.missionPanel} aria-labelledby="mission-title">
            <div className={styles.panelHeader}><div><span>DAILY QUEST</span><h2 id="mission-title">오늘의 미션</h2></div><div className={styles.progressRing}><strong>2</strong><span>/3</span></div></div>
            <div className={styles.progressTrack}><span /></div>
            <ul className={styles.missionList}>
              <li className={styles.missionDone}><span><Check size={15} /></span><div><strong>오늘의 추천 확인</strong><small>추천 콘텐츠를 둘러봤어요</small></div><b>+10</b></li>
              <li className={styles.missionDone}><span><Check size={15} /></span><div><strong>카테고리 탐험</strong><small>새 카테고리를 골라봤어요</small></div><b>+10</b></li>
              <li><span><Target size={16} /></span><div><strong>친구와 한 판</strong><small>콘텐츠 결과를 공유해요</small></div><b>+20</b></li>
            </ul>
            <div className={styles.reward}><span><Trophy size={20} /></span><div><small>오늘의 보상</small><strong>40 XP</strong></div><i>DEMO</i></div>
          </aside>
        </section>

        <section className={styles.categorySection} aria-labelledby="category-title">
          <div className={styles.sectionHeading}><div><span>SELECT MODE</span><h2 id="category-title">어떤 플레이가 끌려?</h2></div><p>기분에 맞는 모드를 선택하세요.</p></div>
          <div className={styles.categoryGrid}>
            {categories.map((category, index) => {
              const Icon = categoryIcons[category.icon];
              return (
                <button className={`${styles.categoryButton} ${activeCategory === category.id ? styles.categoryActive : ""}`} key={category.id} onClick={() => chooseCategory(category.id)} type="button">
                  <span className={styles.categoryCode}>0{index + 1}</span>
                  <span className={styles.categoryIcon}><Icon size={26} /></span>
                  <strong>{category.name}</strong>
                  <small>{category.description}</small>
                  <ChevronRight className={styles.categoryChevron} size={19} />
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.stageSection} id="stages" aria-labelledby="stage-title">
          <div className={styles.stageHeader}>
            <div className={styles.sectionHeading}><div><span>PLAY LIST</span><h2 id="stage-title">{activeCategory === "all" ? "인기 플레이" : getCategory(activeCategory)?.name}</h2></div></div>
            <div className={styles.filterRow}>
              <button className={activeCategory === "all" ? styles.filterActive : ""} onClick={() => setActiveCategory("all")} type="button">전체</button>
              {categories.map((category) => <button className={activeCategory === category.id ? styles.filterActive : ""} key={category.id} onClick={() => setActiveCategory(category.id)} type="button">{category.name}</button>)}
            </div>
          </div>

          <div className={styles.stageGrid}>
            {visibleContents.map((content, index) => (
              <article className={styles.stageCard} key={content.id}>
                <div className={styles.stageVisual}><Artwork content={content} /><span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span></div>
                <div className={styles.stageBody}>
                  <div className={styles.stageType}><span>{getCategory(content.category_id)?.name}</span><i>OPEN</i></div>
                  <h3>{content.title}</h3>
                  <p>{content.summary}</p>
                  <div className={styles.stageFooter}><div><span><Users size={13} /> {formatParticipants(content.participant_count)}</span><span><Timer size={13} /> {content.duration_minutes}분</span></div><button onClick={() => launch(content.title)} type="button" aria-label={`${content.title} 시작`}><Play size={15} fill="currentColor" /></button></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className={styles.footer}><div className={styles.brand}><span className={styles.brandIcon}><Zap size={19} fill="currentColor" /></span><span><strong>PLAY</strong><b>ZIP</b></span></div><p>심심한 순간을 위한 작은 게임 로비</p><span>© 2026 PLAY ZIP</span></footer>

      <nav className={styles.bottomNav} aria-label="하단 메뉴"><button className={styles.navActive} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button"><Home /><span>로비</span></button><button onClick={() => document.querySelector("#stages")?.scrollIntoView({ behavior: "smooth" })} type="button"><Gamepad2 /><span>플레이</span></button><button onClick={() => setNotice("플레이어 기록은 다음 업데이트에서 열려요!")} type="button"><UserRound /><span>MY</span></button></nav>

      {notice && <div className={styles.notice} role="status"><Gamepad2 size={19} /><span>{notice}</span><button onClick={() => setNotice(null)} type="button" aria-label="안내 닫기"><X size={17} /></button></div>}
    </main>
  );
}
