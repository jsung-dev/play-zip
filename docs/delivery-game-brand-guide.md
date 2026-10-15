# 3D 자전거 배달 게임 설정·브랜드 교체

게임 경로는 `/games/delivery`입니다. 배달 브랜드/주행 설정은 `data/delivery-game.ts`, 옥외 광고는 `data/delivery-outdoor-ads.ts`에서 독립 관리합니다. 이미지 교체는 [옥외 광고 가이드](delivery-outdoor-ads.md)를 참고하세요.

## 브랜드 선택 · 퀴즈 · 마지막 구매 광고

- 출발 전 **몽글우유 / 서울우유 / 맛있는우유** 중 하나를 반드시 선택합니다. 몽글우유의 기존 그림은 유지했고, 나머지 두 브랜드의 SVG는 공식 패키지가 아닌 테스트용 디자인입니다.
- `data/delivery-campaign.ts`의 `DELIVERY_BRAND_CHOICES`가 선택지, `DELIVERY_QUIZ_QUESTIONS`가 각 집의 질문, `PURCHASE_AD`가 마지막 광고 문구입니다. 정답은 항상 이번 배달에서 선택한 브랜드이며 거리 간판·버스 브랜드와는 독립적입니다.
- 각 집의 진입로 안쪽에 정차하면 게임이 멈추고 퀴즈를 표시합니다. 오답은 다시 고를 수 있으며 진행되지 않습니다. 정답 후 기존 1.6초 전달과 완료 연출이 이어집니다. 집마다 한 번만 통과하고 재시작 시 초기화됩니다.
- 선택 브랜드의 색·로고·상품 그림은 앞바구니, 뒤 배달 상자, 전달 장면, 퀴즈, 마지막 광고가 공유합니다. 주행 중 상단은 길안내만 남겨 중복 상품 설명을 표시하지 않습니다.
- 최종 101동에서는 추가 퀴즈 없이 배달 완료와 구매 전환형 광고 예시를 표시합니다. `구매하러 가기`는 **로컬 구매 페이지 미리보기**만 열며 외부 이동·실제 주문·결제·광고 측정은 없습니다. 광고 클릭 없이도 `다시 배달하기`로 돌아갈 수 있습니다.
- 화면 컴포넌트는 `components/delivery/DeliveryCampaign.tsx`입니다. 실제 구매 연결은 이번 구현 범위에 포함하지 않습니다.
- 검증 스크립트는 `DELIVERY_QA_BRAND=seoul` 등으로 선택 브랜드를 지정할 수 있습니다. 퀴즈 오답/정답/입력 정지/중복 정답, 최종 광고/구매 미리보기, 브랜드 재선택과 모바일 카드 크기를 검사합니다.

## 배달 경로와 경유지

- `data/delivery-map.ts`의 `DELIVERY_STOPS`에서 집 주소, 큰길 입구의 경로상 거리, 집이 놓일 방향을 바꿉니다. 집 쪽 차선을 고르고 전진하면 짧은 집 앞 길로 들어가며, 안쪽 정차 구역에서 멈추면 순서대로 배달 처리됩니다. 배달 후 후진해서 같은 입구로 돌아와야 다음 집으로 갈 수 있습니다.
- `ROAD_CLOSURE`에서 공사 차단 위치와 갈림길, 좌·우 우회로의 분기·합류 거리와 곡선 길이를 조정합니다. 별도 선택 버튼은 없으며 조이스틱의 좌우 제스처 또는 PC 좌우 화살표로 차선을 골라 갈림길에 진입합니다. 가운데 차선으로 막힌 길에 도착했다면 후진해 갈림길로 돌아와 왼쪽이나 오른쪽 차선으로 옮깁니다.
- 같은 파일의 경로 곡선은 `getRouteFrame`으로 월드의 도로, 집, 간판, 장애물 배치와 카메라가 공유합니다. 경로상 거리를 기준으로 배치를 유지하므로 왕복해도 위치가 바뀌지 않습니다.

## 이동과 카메라 설정

`DELIVERY_GAME_CONFIG`에서 다음 값을 조정합니다.

- `deliveryBrandId`: 선택 전 배경 장면에 쓰는 기본 브랜드 ID (실제 배달은 시작 화면에서 선택)
- `destinationName`, `totalDistance`: 목적지와 전체 거리
- `forwardSpeedPerSecond`, `reverseSpeedPerSecond`: 전진·후진 최고 속도(m/s)
- `accelerationPerSecond`, `decelerationPerSecond`: 가속·입력 해제 후 감속
- `directionChangeDecelerationPerSecond`: 반대 방향 전환 시 감속
- `roadWidth`, `cameraFovDegrees`, `cameraHeight`, `cameraFollowDistance`: 도로와 후방 추적 카메라
- `laneSpacing`, `laneChangeSeconds`: 세 차선 사이 거리와 차선 변경 시간
- `collisionHalfWidth`, `collisionHalfLength`: 장애물 충돌 판정 범위
- `collisionSlowdownSeconds`, `obstaclePassThroughSeconds`: 충돌 감속과 장애물 임시 통과 시간
- `deliveryStopDwellSeconds`: 배달 처리에 필요한 정차 시간
- `deliverySuccessSeconds`: 각 집의 ‘배달 완료!’ 표시 시간
- `drivewayWidth`: 집 앞 길의 폭
- `drivewaySideOffset`, `drivewayForwardOffset`: 큰길 입구에서 집 앞 정차점까지의 옆·앞 방향 거리
- `drivewaySpeed`, `drivewayReverseSpeed`: 집 앞 길의 전진·후진 속도 제한
- `drivewayDeliveryDepth`: 진입로 끝에서 몇 m 전부터 배달할 수 있는지 지정

### 배달 구역의 진행과 완료

큰길에서 멈추는 것만으로는 배달되지 않습니다. 집이 있는 쪽 차선으로 전진하면 약 24m 길이의 짧은 진입로에 들어갑니다. 진입로 끝 4m가 실제 배달 범위이며, 정차 후 브랜드 퀴즈를 맞히고 그 안에서 1.6초간 머무르면 전달됩니다. 끝에서는 자동으로 감속·정지하므로 집을 뚫고 지나가지 않습니다. 전달 중에는 진행 막대와 상품 이동을 보여주며, 다시 움직이거나 구역을 벗어나면 미완료 진행이 초기화됩니다. 이미 맞힌 퀴즈는 같은 집에서 반복하지 않습니다. 완료 시 집 주소와 ‘배달 완료!’를 3초간 표시하고, 해당 구역과 간판을 초록색 완료 상태로 유지합니다. 이후 후진 안내는 큰길에 복귀할 때까지 유지됩니다. 퀴즈 정답 후에는 별도 완료 확인 버튼이 없습니다.

진입로에서는 조이스틱 위치를 유지하되 좌우 방향 표시를 흐리게 하고 차선 변경을 잠시 막습니다. 후진해도 카메라는 전방을 유지합니다. 진입로 주행은 큰길 진행 거리에 더하지 않으며, 큰길에 복귀하면 원래 입구 위치에서 이어갑니다. `getDrivewayFrame`의 같은 곡선을 도로·자전거·카메라가 공유하고, 입구의 작은 위치 차이는 부드럽게 연결합니다. 겹치는 거리 광고는 삭제하지 않고 길 건너편으로 옮깁니다.

일시정지와 탭 전환 중에는 전달 진행과 완료 표시 시간이 함께 멈춥니다. 뒤로 돌아와도 이미 완료한 집은 중복 배달되지 않으며, 다시 시작하면 모든 구역이 초기화됩니다. 안내 문구는 `delivery-navigation.ts`, 상단 표시는 `DeliveryGame.tsx`, 3D 구역은 `scene-builders.ts`의 `createDeliveryStop`에서 수정합니다. 별도 안내 카드는 표시하지 않으며 움직임 줄이기 설정에서는 상품 비행을 생략합니다.

검증: `pnpm exec tsx scripts/test-delivery-driveways.ts`로 경로 연결·진행 판정을 확인하고, 로컬 서버를 켠 뒤 `node scripts/qa-delivery-game.mjs`로 모바일·PC 조작, 세 집 진입/후진 복귀, 우회로, 완료와 재시작을 확인합니다.

`OBSTACLE_PLACEMENTS`에서 장애물 ID, 거리(m), 차선(0 왼쪽 / 1 가운데 / 2 오른쪽), 종류(`cones`, `barrier`, `box`)를 변경합니다. 첫 100m는 비우고 목적지 직전에는 추가하지 않습니다. 장애물은 도로 광고와 버스 정류장 앞의 시야를 가리지 않도록 배치합니다.

## 브랜드와 이미지 교체

1. `public/games/delivery/brands/<브랜드 폴더>/`에 배달용 로고, 상품, 패키지 이미지를 넣습니다.
2. `data/delivery-game.ts`의 `BrandId`와 `DELIVERY_BRANDS`에 브랜드를 추가하거나 기존 이미지 경로를 바꿉니다.
3. 배달 상품 선택지는 `data/delivery-campaign.ts`의 `DELIVERY_BRAND_CHOICES`에서 선택합니다. 옥외/버스 광고 이미지는 `data/delivery-outdoor-ads.ts`의 항목별 `image`로 지정합니다. `BUS_PLACEMENTS.brandId`는 기존 버스 차체 색에만 사용되며 광고 이미지를 선택하지 않습니다.

SVG, PNG, WebP 등을 사용할 수 있습니다. 배달 상품은 기존 브랜드 그림을 유지합니다. 옥외 광고는 네 규격의 독립 텍스처로 표시하며 로드 실패 시 ‘광고주 구함’으로 대체합니다.

## 3D 오브젝트 교체

- 월드와 모델 조립: `components/delivery/three/scene-builders.ts`
- 카메라·가시 범위·이동 버스: `components/delivery/DeliveryScene3D.tsx`
- 임시 배달원: `createTemporaryRider`
- 자전거·상품·배달 상자: `createBicycle`
- 공사 콘·보수 펜스·상자 장애물: `createObstacle`

공식 캐릭터 모델을 적용할 때는 `createTemporaryRider`가 반환하는 그룹의 기준점과 크기를 유지하면 카메라와 이동 로직을 바꾸지 않아도 됩니다.

## 광고와 버스 배치

옥외 광고 설정은 `data/delivery-outdoor-ads.ts`로 이전했습니다. `OUTDOOR_ADS`는 고정 광고, `BUS_AD_PANELS`는 버스 좌우 광고면입니다. 기존 브랜드 게이트 대신 건물 전면·옥상·돌출·정류장 광고를 사용합니다. 배달 브랜드와 독립적이며 현재 이미지는 모두 비어 있어 ‘광고주 구함’을 표시합니다.

`BUS_PLACEMENTS`의 이동/정차 여부·차로·속도와 중복 생성 방지는 그대로 유지합니다. [네 규격과 이미지 교체·배포 방법](delivery-outdoor-ads.md)을 참고하세요.
