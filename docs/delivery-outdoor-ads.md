# 배달 게임 옥외 광고 교체

## 수정할 곳

`data/delivery-outdoor-ads.ts` 한 파일에서 관리합니다.

- `OUTDOOR_ADS`: 건물·옥상·돌출 간판·정류장의 고정 광고 13개.
- `OVERHEAD_ADS`: 오버헤드 배너 6개(본길 3, 갈림길 좌·우 각 1, 목적지 1). `DESTINATION_OVERHEAD_AD`는 975m 최종 목적지 배너. 4:1 규격이며 `image`만 바꾸면 교체됩니다. 기존 광고/건물 부지는 옮기지 않고 지주만 도로 밖에 둡니다.
- `BUS_AD_PANELS`: 기존 버스 5대의 좌우 측면 광고 10개. 버스 주행 경로/속도는 바꾸지 않았습니다.
- `OUTDOOR_AD_FORMATS`: 규격과 캔버스 해상도.
- `OUTDOOR_AD_STYLE`: 크림색 바탕, 진한 초록색 글씨/테두리, 기본 문구.

| format | 광고면 비율 | 원본 이미지 예시 |
| --- | --- | --- |
| `square` | 1:1 | 1080×1080 |
| `portrait` | 9:16 | 1080×1920 |
| `landscape` | 16:9 | 1920×1080 |
| `banner` | 4:1 | 1600×400 |

원본의 픽셀 수는 설치 크기가 아닙니다. `width`는 게임 공간에서의 가로 크기이며 세로는 규격으로 자동 계산됩니다. `width` 하나로 전체를 확대/축소합니다.

## 이미지 하나 바꾸기

1. PNG·WebP·JPG·SVG 파일을 `public/games/delivery/ads/`에 추가합니다. PNG/WebP를 권장하며 외부 폰트·외부 이미지를 참조하는 SVG는 피합니다.
2. 설정 파일에서 원하는 `id`를 찾습니다.
3. 해당 항목의 `image: null`만 아래처럼 바꿉니다.

```ts
// outdoor-280의 다른 값은 그대로 두고 image만 변경
image: "/games/delivery/ads/spring-01.webp",
// 또는 CORS를 허용하는 공개 HTTPS 이미지 주소
// image: "https://cdn.example.com/ads/spring-01.webp",
```

같은 `format`이어도 각 항목의 `image`는 독립적입니다. 이미지 경로는 `/games/...`로 시작하는 웹 경로이며 `public/` 접두사나 PC의 `C:\...` 경로를 넣지 않습니다.

이미지 비율이 다르면 전체 이미지를 가운데에 맞추고 크림색 여백을 둡니다. 잘라내거나 늘리지 않습니다. 이미지가 없거나 빈 문자열이거나, 네트워크·디코딩·CORS 문제로 로딩되지 않으면 ‘광고주 구함’이 유지됩니다. HTTPS 배포에서 HTTP 이미지는 브라우저가 차단할 수 있습니다. 외부 서버는 `Access-Control-Allow-Origin`으로 게임 출처 또는 `*`를 허용해야 합니다. 별도 프록시나 광고 SDK는 사용하지 않습니다.

버스는 같은 파일의 `busPanel("bus-moving-170", "left", "/games/delivery/ads/bus-a.webp")`처럼 세 번째 인수에 경로를 지정합니다. 좌우를 각각 바꿀 수 있습니다. `busPanel` 안의 `width`, `position`, `rotationDegrees`는 공통 설치 값이며, 특정 버스만 바꾸려면 반환값을 펼쳐 해당 필드를 덮어쓸 수 있습니다.

## 위치와 회전

- `id`: 고유 식별자. 중복 금지.
- `type`: `corner-store` 전면 상부 / `rooftop` 옥상 / `projecting` 돌출 / `bus-stop` 정류장 / `billboard` 독립 광고판.
- `distance`: 1,000m 경로상의 위치.
- `route`: `main`, `left`, `right`.
- `side`, `lateralOffset`: 경로의 좌우 방향과 중심에서 떨어진 거리.
- `height`: 광고면의 중심 높이.
- `width`: 가로 크기. 높이는 `format` 비율로 결정.
- `rotation.approach`: 이 값만큼 앞에서 다가오는 지점을 향해 고정 회전. 0이면 도로 방향 기준.
- `rotation.yawDegrees`: 위 방향에서 추가로 돌릴 Y축 각도.

카메라를 따라 광고가 돌아가지 않습니다. 후진해도 고정된 위치에 남습니다. 설치 건물·돌출물의 외곽으로 주변 건물을 배치하고, 주요 광고 시선에 걸리는 나무·가로등은 제외합니다. 새로운 위치/크기로 바꾼 경우 보도·진입로와 광고 가림을 다시 확인해야 합니다. 기본 배치의 일반 주행 시점에서는 읽을 수 있는 고정 광고가 최대 2개입니다(390px 화면, 경로 5m 간격 표본).

## 자전거와 완전히 분리

옥외 설정에는 배달 `brandId`나 상품 이미지를 사용하지 않습니다. 기존 서울우유 자전거 광고, 배달함 형태, 앞바구니, 출발 시 브랜드 선택과 퀴즈·완료/구매 광고는 기존 `data/delivery-game.ts`, `data/delivery-campaign.ts`를 사용합니다. 옥외 문구/이미지를 바꿔도 이 경로는 바뀌지 않습니다. 이전 `AD_PLACEMENTS` 설정은 제거했습니다.

## 반영과 배포

- 로컬 개발 서버에서는 설정/파일을 저장하고 페이지를 새로고침합니다.
- `public/` 파일 또는 TypeScript 설정 변경은 기존 Vercel 프로젝트에 **재배포해야** 공개 주소에 반영됩니다.
- 명령 예시: `vercel deploy --prod --yes --scope jsung-dev` (기존 로그인/프로젝트 연결 필요).
- 이 PC에서 인증서 오류가 나면 현재 세션에 `$env:NODE_OPTIONS='--use-system-ca'`를 설정한 뒤 배포합니다. 인증서 검증은 끄지 않습니다.
- 배포 완료 후 `https://play-zip.vercel.app/games/delivery`를 새로고침합니다. 캐시 혼동을 줄이려면 새 이미지 파일명을 사용하세요.
- 이미 설정된 외부 URL의 파일 내용만 바꾼 경우 게임 재배포는 필요 없지만, 이미지 호스트/CDN 캐시 갱신과 게임 새로고침이 필요합니다. URL 자체를 바꾸면 설정 재배포가 필요합니다.

## 구현과 집중 검증

- `outdoor-ad-material.ts`: 네 규격, 굵은 기본 문구, 비율 유지, 이미지 로딩/실패, 동일 규격+이미지 재질 공유, 늦은 로딩 중 자원 해제 보호.
- `outdoor-ad-model.ts`: 공용 광고 프레임과 건물/옥상/정류장 설치 모델. 광고면은 공유한 1×1 평면을 정확한 규격으로 확대합니다.
- `scene-layout.ts`, `street-layout.ts`: 설정을 월드 위치와 광고 시야에 연결.
- `pnpm exec tsx scripts/test-delivery-art.ts`: 네 비율·고유 ID·모바일 시야·설치 외곽·동시 가독 광고 수.
- `pnpm exec tsx scripts/test-delivery-street.ts`: 변경된 설치물에 따른 건물/보도/진입로/시야 검증.
- `qa-delivery-street.mjs` + `qa-delivery-outdoor.mjs`: 모바일 화면, 실제 전후진/일시정지, 서울우유 유지, 실제 브라우저 이미지 로딩·404·손상 파일·CORS 실패·여백·동일 규격 다른 이미지·자원 공유 테스트. 테스트 이미지는 QA 브라우저에서만 응답하며 서비스 파일에 넣지 않습니다.
- 캔버스는 최대 1024px 변, 정확한 규격 비율, 밉맵/이방성 필터를 사용합니다. 기본 문구 재질은 네 개를 공유합니다. 원본 전체 해상도를 무조건 GPU에 올리지 않습니다.
- 광고 SDK·클릭·추적·외부 구매 이동·자동 성과 수치는 없습니다. 실기기 FPS 측정은 별도입니다.
