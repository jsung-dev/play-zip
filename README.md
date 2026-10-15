# PLAY ZIP Games — 게임 개발 전용

이 저장소(`jsung-dev/play-zip`)는 모바일 3D 배달게임과 게임 개발 도구를 관리합니다.
플랫폼은 별도 저장소 `jsung-dev/play-zip-app`에서 개발합니다. 아직 게임을 플랫폼에 연결하지 않았습니다.
GitHub/Vercel 프로젝트 이름과 기존 공개 주소는 유지합니다.

## 실행

```sh
pnpm install --frozen-lockfile
pnpm dev
```

- `/`: 게임 개발실 진입 화면
- `/games/delivery`: 기존 배달게임
- 공개 게임: https://play-zip.vercel.app/games/delivery
- 게임은 DB, 광고 SDK, 영상 편집 API 키 없이 실행됩니다.

## 파일 위치

- `app/games/delivery/`: 게임 페이지
- `components/delivery/`: 조작, 주행, 배달 및 3D 렌더링
- `data/delivery-*.ts`: 게임 규칙·맵·브랜드·광고 설정
- `public/games/delivery/`: 상품/브랜드 에셋
- `public/fonts/`, `licenses/`: 공용 한글 폰트와 라이선스
- `scripts/`: 게임 검증 도구 (산출물은 Git/배포 제외)

[광고 교체](docs/delivery-outdoor-ads.md) · [조작](docs/delivery-joystick.md) · [정리 범위와 복구](docs/repository-separation.md)

## 확인과 배포

```sh
pnpm check:boundary
pnpm test:delivery
pnpm build
pnpm start
# 별도 터미널, 로컬 서버가 실행 중일 때
pnpm qa:delivery
```

`main`은 기존 Vercel `play-zip` 프로젝트에 연결됩니다. Git 커밋/푸시로 같은 소스를 보존하고 배포합니다.
수동 배포 전에는 `.vercel/project.json`이 `play-zip`인지 확인합니다.

## 분리 원칙

- 플랫폼 홈, 영상 편집 API/렌더러, 팩트체커를 이 저장소에 다시 포함하지 않습니다.
- `katalk-fact-checker`, `game-ad-motion-studio`는 별도 저장소이며 변경하지 않습니다.
- 폴더명이 과거 작업명(`supabase-test-app`)이어도 `git remote -v`를 기준으로 판단합니다.
- 로컬 비밀 파일과 제외된 별도 프로젝트 폴더는 커밋·업로드하지 않습니다.
