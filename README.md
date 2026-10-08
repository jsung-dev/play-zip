# PLAY ZIP

심리테스트와 가벼운 미니게임을 한곳에서 둘러볼 수 있는 반응형 웹앱 프로토타입입니다.

현재는 실제 테스트와 게임을 제작하기 전 단계로, 카테고리 구성과 콘텐츠 탐색 화면에 집중되어 있습니다.

## 카테고리

- 심리테스트
- 연애
- 밸런스 게임
- 퀴즈
- 미니게임

각 카테고리에는 화면 구성을 확인할 수 있는 임시 콘텐츠가 3개씩 들어 있습니다.

## 주요 특징

- 모바일 앱처럼 사용할 수 있는 반응형 화면
- 카테고리별 콘텐츠 필터링
- 이미지 파일 없이 도형과 그라데이션으로 구성한 썸네일
- 콘텐츠 데이터와 화면 코드 분리
- Supabase 테이블로 옮기기 쉬운 데이터 구조

## 실행 방법

Node.js와 pnpm이 설치된 환경에서 다음 명령어를 실행합니다.

```bash
pnpm install
pnpm dev
```

브라우저에서 <http://localhost:3000>을 열면 됩니다.

## 데이터 관리

카테고리와 콘텐츠는 다음 파일에서 관리합니다.

- `data/play-content.ts`: 카테고리와 콘텐츠 데이터
- `types/play-content.ts`: 데이터 타입 및 Supabase 테이블 형태

새 콘텐츠를 추가할 때 화면 컴포넌트를 수정할 필요 없이 `playContents` 배열에 항목을 추가하면 됩니다.

## 주요 화면 파일

- `components/home/HomeLanding.tsx`: 홈 화면과 카테고리 필터 동작
- `components/home/HomeLanding.module.css`: 반응형 레이아웃과 시각 디자인
- `app/page.tsx`: 홈 페이지 진입점

## 기술 구성

- Next.js 15
- React 19
- TypeScript
- CSS Modules
- Lucide React

## 배포

GitHub의 `main` 브랜치는 Vercel의 `play-zip` 프로젝트와 연결되어 있습니다.
