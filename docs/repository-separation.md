# 2026-10-15 저장소 역할 분리

| GitHub / Vercel 프로젝트 | 역할 | 공개 주소 |
| --- | --- | --- |
| `jsung-dev/play-zip` / `play-zip` | PLAY ZIP Games: 게임 개발 | `https://play-zip.vercel.app/games/delivery` |
| `jsung-dev/play-zip-app` / `play-zip-app` | PLAY ZIP Platform: 플랫폼 개발 | `https://play-zip-app.vercel.app` |

기존 저장소/프로젝트/도메인 이름은 유지했습니다. `katalk-fact-checker`와 `game-ad-motion-studio` 저장소에는 쓰기/설정 변경을 하지 않았습니다. 배달게임을 플랫폼에 복사하거나 연결하지 않았습니다.

## 복구 지점

- 게임: `delivery-preserved-20261015` 태그 (`aa70aba4680325da0c61f99d4d840a8257ad58c6`). 기존 미커밋 게임 코드, 광고 설정, 에셋과 테스트를 모두 포함합니다.
- 플랫폼: `platform-preserved-20261015` 태그 (`c534eb20f94ce735f9a9cd475636978ca6948a45`). 정리 이전 화면/에셋을 포함합니다.
- 두 태그는 각 GitHub 저장소에 업로드했습니다. 제거된 파일은 이 태그에서 복원할 수 있습니다. 현재 작업을 덮어쓰지 말고 별도 빈 폴더에서 필요한 파일을 확인하세요.

```sh
git clone --branch delivery-preserved-20261015 https://github.com/jsung-dev/play-zip.git delivery-recovery
git clone --branch platform-preserved-20261015 https://github.com/jsung-dev/play-zip-app.git platform-recovery
```

## 정리 범위

- 게임 저장소 안의 영상 편집 페이지/API, Remotion/FFmpeg 렌더러·워커·테스트·의존성, 영상 샘플을 제거했습니다.
- 중복 플랫폼 홈/콘텐츠 데이터/플레이룸 이미지 사본은 제거하고 간단한 게임 개발실 진입 화면으로 교체했습니다.
- 플랫폼은 코드에 참조되지 않는 이전 시안 이미지 10개만 제거하고 현재 홈/장면/카테고리 코드는 유지했습니다.
- 게임의 한글 폰트, 브랜드 에셋, 3D 모델, 맵, 조이스틱, UI CSS, 배달/퀴즈/완료 로직은 변경하지 않았습니다.
- DB/스토리지, 실제 환경변수, 비밀 키와 별도 로컬 프로젝트 폴더는 건드리지 않았습니다. 제외된 파일은 배포하지 않습니다.

## 재혼입 방지 / 보존 확인

`pnpm check:boundary`로 영상/플랫폼 코드·패키지 재혼입을 검사합니다.
`node scripts/check-project-boundary.mjs delivery-preserved-20261015`로 배달게임 소스와 에셋이 복구 태그와 동일한지 확인합니다.
이후 게임을 의도적으로 수정하면 태그와의 차이는 정상이며 기본 경계 검사만 실행하면 됩니다.
