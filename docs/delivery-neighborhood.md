# 동네 건물·바닥·최종 배너

## 건물

`components/delivery/three/street-architecture.ts`에서 여섯 유형을 조합합니다.

| 유형 | 층수 | 형태 |
| --- | --- | --- |
| wide-shop | 2 | 넓은 상가, 큰 쇼윈도, 분리된 차양, 낮은 평지붕 |
| corner-shop | 3~4 | 상층부 후퇴, 코너 창, 옥상 테라스 |
| gable-house | 3 | 박공지붕, 짝창, 작은 현관 |
| balcony-villa | 4 | 좁은 몸체, 층마다 엇갈린 발코니, 옥탑 |
| slim-villa | 5 | 가장 좁은 폭, 세로 계단실 창, 옥탑 |
| terrace-house | 3 | 낮은 날개와 높은 몸체, 옥상 난간 |

창문 자체를 세로로 늘리지 않고 층별로 배치합니다. 크림·민트·살구·연노랑·연보라의 기존 색을 사용하며 새 로고·상호는 없습니다.

`street-layout.ts`의 `buildingProfile(item, true)`는 **기존 부지의 예약 외곽**입니다. 203개 부지와 광고 시야를 유지하기 위해 바꾸지 않았습니다. 실제 새 모델은 이 외곽 안에서만 만들어집니다. 배달 대상 집과 광고 설치 건물은 기존 모델을 사용합니다.

10개 조합의 템플릿과 재질을 공유하고, 기존 36m 구역별 병합·거리별 숨김을 유지합니다. 정적 건물 전체의 삼각형 합은 변경 전 1,299,699개 → 400,726개입니다. 이는 모델 측정값이며 실기기 FPS 측정값이 아닙니다.

## 바닥

`road-surface.ts`의 주행 아스팔트는 `#929A9C`, 버스 전용 측면 공간과 공사 차단 구간은 `#C7BCAB`, 보도는 `#F5F0E5`입니다. 잔디와 흰색 차선은 유지합니다.

`scene-builders.ts`에서 추가 차선 끝단의 아스팔트 경계를 부드럽게 좁혀 큰길에 연결합니다. 골목 입출구의 장식용 7.6m 벌어짐은 추가 차선과 같은 3m 입구에서 4.4m 골목 폭으로 이어지는 마감으로 바꿨습니다. 실제 경로 좌표·조작·충돌·출입 판정은 바꾸지 않았습니다.

## 최종 목적지 배너

`data/delivery-outdoor-ads.ts`의 `DESTINATION_OVERHEAD_AD`: 975m, 가로 14, 세로 3.5(4:1), 중심 높이 9.2. 지주는 주행로와 버스 측면 차로 밖에 있습니다. 광고 아래는 비어 있어 주행·카메라·목적지 입구를 막지 않습니다.

`image: null`이면 ‘광고주 구함’입니다. 기존 옥외 광고와 같은 로딩·실패 대체·비율 유지 구조를 공유하며, 이미지 교체는 [옥외 광고 문서](delivery-outdoor-ads.md)를 따릅니다. 배달함 브랜드 설정과는 독립적입니다.

## 집중 확인

- `npx tsx scripts/test-delivery-street.ts`: 실제 외곽, 여섯 유형, 2~5층, 부지·광고·골목 간섭, 모델 공유/예산.
- `npx tsx scripts/test-delivery-road.ts`: 주행/통행 불가 재질 구분, 입출구 마감, 흰색 차선.
- `npx tsx scripts/test-delivery-outdoor-model.ts`: 기존 13개 광고와 새 배너의 비율, 대체 표시, 지주/주행 여유.
- `GUIDANCE_QA_NEIGHBORHOOD=1 node --import tsx scripts/qa-delivery-guidance.mjs`: 335·390·430px 캡처, 실제 터치로 골목 통과, 배너 아래 주행, 최종 광고·재시작. Windows에서는 PowerShell의 `$env:`로 환경 변수를 설정합니다.
