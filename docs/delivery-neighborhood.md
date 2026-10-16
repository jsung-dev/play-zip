# 동네 건물·바닥·최종 배너

## 건물

`components/delivery/three/street-architecture.ts`에서 참고 시트의 A~E 다섯 유형을 실제 3D 도형으로 생성합니다.

| 유형 | 층수 | 형태 |
| --- | --- | --- |
| A / apricot-shop | 2 | 낮고 넓은 살구 상가, 긴 상층 창, 크림 차양, 낮은 옥탑 |
| B / mint-villa | 4 | 왼쪽 큰 창 + 오른쪽 1.05 깊이의 실제 발코니, 층별 크림 띠, 측면 창 두 개, 옥상 4면 난간 |
| C / cream-tower | 5 | 좁고 높은 크림 빌딩, 연속된 세로 계단실 유리, 오른쪽 작은 창·난간 |
| D / lavender-house | 3 | 라벤더 주택, 넓은 창과 2층 돌출 발코니, 실외기, 옥탑·난간 |
| E / yellow-shop | 2 | 넓은 연노랑 상가, 분리된 상층 창 3개, 민트 차양, 낮은 옥탑 |

창문 자체를 세로로 늘리지 않고 층별로 배치합니다. `building-facade.ts`에서 다섯 외벽색, 청색 유리, 두께가 있는 크림 창틀, 발코니, 차양, 옥상 화단을 공유합니다. 특히 주행 방향에서 크게 보이는 양쪽 끝면도 유형별로 다릅니다. 새 로고·상호는 없습니다.

`scene-art.ts`의 `buildingBox()`는 기존 재질과 분리된 건물 전용 Lambert 재질을 공유합니다. `emissiveIntensity: .42`의 색상 기반 보조광과 `toneMapped: false`로 어두운 면의 탁함을 줄입니다. 추가 실시간 조명·그림자 맵·반사·후처리는 없습니다. 기존 태양·환경광·카메라, 광고면과 배달함 재질은 변경하지 않았습니다. 발코니 안쪽 면에 차분한 명암색을 사용해 실제 빈 공간의 깊이를 보여줍니다.

`street-layout.ts`의 `buildingProfile(item, true)`는 **기존 부지의 예약 외곽**입니다. 203개 부지와 광고 시야를 유지하기 위해 바꾸지 않았습니다. 실제 새 모델은 이 외곽 안에서만 만들어집니다. 배달 대상 집과 실제 출입구는 기존 모델을 사용합니다.

광고 설치 건물은 `advertisement-building.ts`에서 별도로 생성합니다. 기존 큰 광고면의 위치·크기·텍스처·프레임은 그대로 두고 그 뒤의 건물만 낮은 유리 상가와 옥상 구조로 변경했습니다. `outdoor-ad-model.ts`는 이 건물만 연결합니다.

10개 조합의 템플릿과 재질을 공유하고, 기존 36m 구역별 병합·거리별 숨김을 유지합니다. 일반 건물 전체의 삼각형 합은 449,542 → 430,990개(약 4.1% 감소), 구역 병합 전 메시는 2,206 → 2,243개입니다. 이는 전체 배치 모델 측정값이며 한 프레임의 드로콜이나 실기기 FPS 측정값이 아닙니다.

## 바닥

`road-surface.ts`의 주행 아스팔트는 `#929A9C`, 버스 전용 측면 공간과 공사 차단 구간은 `#C7BCAB`, 보도는 `#F5F0E5`입니다. 잔디와 흰색 차선은 유지합니다.

`scene-builders.ts`에서 추가 차선 끝단의 아스팔트 경계를 부드럽게 좁혀 큰길에 연결합니다. 골목 입출구의 장식용 7.6m 벌어짐은 추가 차선과 같은 3m 입구에서 4.4m 골목 폭으로 이어지는 마감으로 바꿨습니다. 실제 경로 좌표·조작·충돌·출입 판정은 바꾸지 않았습니다.

## 최종 목적지 배너

`data/delivery-outdoor-ads.ts`의 `DESTINATION_OVERHEAD_AD`: 975m, 가로 14, 세로 3.5(4:1), 중심 높이 9.2. 지주는 주행로와 버스 측면 차로 밖에 있습니다. 광고 아래는 비어 있어 주행·카메라·목적지 입구를 막지 않습니다.

`image: null`이면 ‘광고주 구함’입니다. 기존 옥외 광고와 같은 로딩·실패 대체·비율 유지 구조를 공유하며, 이미지 교체는 [옥외 광고 문서](delivery-outdoor-ads.md)를 따릅니다. 배달함 브랜드 설정과는 독립적입니다.

## 집중 확인

- `npx tsx scripts/test-delivery-street.ts`: 실제 외곽, A~E, 2~5층, 민트 발코니 깊이 레이 검사, 부지·광고·골목 간섭, 모델·재질 공유/예산.
- `node scripts/preview-delivery-architecture.mjs`: 게임과 동일한 모델·조명으로 검증용 A~E 및 민트 3면도 HTML 생성. 게임에 별도 화면이나 디버그 경로를 추가하지 않습니다.
- `node scripts/qa-delivery-street.mjs`: 같은 위치·카메라의 모바일 전후 캡처, 게임/도로/카메라/UI/브랜드 소스 보호 해시 확인. `STREET_QA_MODELS=1`이면 위 HTML의 모델 캡처도 저장합니다.
- `npx tsx scripts/test-delivery-road.ts`: 주행/통행 불가 재질 구분, 입출구 마감, 흰색 차선.
- `npx tsx scripts/test-delivery-outdoor-model.ts`: 기존 13개 광고와 새 배너의 비율, 대체 표시, 지주/주행 여유.
- `GUIDANCE_QA_NEIGHBORHOOD=1 node --import tsx scripts/qa-delivery-guidance.mjs`: 335·390·430px 캡처, 실제 터치로 골목 통과, 배너 아래 주행, 최종 광고·재시작. Windows에서는 PowerShell의 `$env:`로 환경 변수를 설정합니다.
