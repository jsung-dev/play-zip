# Codex GLB 제작 의뢰서 (배달집 · 장애물 · 이동 장애물 · 라이더+자전거 · 소품)

참고 이미지는 `ref/` 폴더에 있습니다. 지금 게임 화면을 캡처한 것이고, **현재 모양과 크기 감**을 보여 주는 용도입니다. 새 톤은 이번에 교체한 거리 건물 GLB(v4)에 맞춥니다. 한국 동네 느낌의 파스텔, 로우폴리, 부드러운 모서리입니다. 전체 분위기는 `ref/street-overview.png`를 보세요.

숫자는 모두 **게임 안 최종 크기(m)** 입니다. 지금 코드의 배율을 이미 반영한 값입니다.

---

## 0. 공통 규칙 (모든 프롬프트 앞에 붙여 주세요)

```
Make a single .glb game asset for a cute low-poly Korean neighbourhood bike-delivery game (three.js).
Style: same as our street building GLBs – soft pastel colours, slightly rounded/bevelled low-poly shapes,
flat colours only, friendly toy-like proportions, no realism.
Hard rules:
- Units are metres, at the exact final size given below (no scaling needed in code).
- Origin = centre of the footprint on the ground (y = 0 is the floor). Up = +Y. Front (the side the player sees) = +Z.
- Materials: plain baseColorFactor only. No textures, no vertex colours, no emissive maps, metallic 0, roughness ~0.8.
  Use as few distinct colours as possible (≤ 24).
- Triangle lists only, one mesh per object unless named parts are requested below.
  Node transforms: translation/scale are OK, no rotation on mesh nodes.
- No overlapping or coplanar duplicate faces (they flicker as z-fighting). No hidden interior geometry.
- Every coordinate must stay within ±16 m of the origin.
- Triangle budget per asset is given below; stay under it.
Deliver: <name>.glb plus a one-line note of the final bounding box (w × h × d).
```

---

## 1. 배달집 (3종) — 참고: `ref/delivery-house-a.png`, `ref/delivery-house-b.png`

```
Asset: delivery_house_01, delivery_house_02, delivery_house_03 (three variants, same rules).
A small 2–3 storey Korean villa / dagagu house that the rider delivers to. Each must look clearly
"homier" and more inviting than the surrounding street shops (pastel walls, tiled roof or rooftop garden,
balcony with plants, a visible front door with a small step and a parcel spot beside it).
Variant colours: 01 cream walls + terracotta roof, 02 mint walls + green trim, 03 lavender walls + purple trim.
Size (bounding box, including roof): width 6.7–7.7 m (X), depth ≤ 5.7 m (Z), height 7–11 m (Y).
Front door centred on the +Z face, door about 1.4 m wide × 2.6 m tall, door bottom at y = 0.
Add an empty node named "entrance" at the outside centre of the door, at y = 1.3 m, z = front face + 0.2 m.
Triangle budget: 6,000 each.
```

### 마지막 종착지 — 햇살 아파트 101동 (참고 없음, 코스 끝 1000m 지점)

```
Asset: destination_apartment. The final delivery destination "햇살 아파트 101동": a friendly 4–5 storey Korean
apartment block, wide and symmetric, cream walls with a mint central stair core, rows of windows with small
balconies and plants, a flat roof with a little rooftop structure. It must read as the clear "goal" at the end of the road.
Bounding box: width 17 m (X) × height 11–13 m (Y) × depth ≤ 5.4 m (Z).
Central core about 4.1 m wide on the +Z face with the main entrance: door 3.4 m wide × 2.9 m tall, bottom at y = 0.
Leave a blank flat panel 8 × 1.1 m above the entrance for the name sign (we draw the text in code); name the node "sign".
Add an empty node named "entrance" at the outside centre of the door, y = 1.3 m.
Do not model the ground pad (we draw an 18 × 9 m pad in code). Triangle budget: 10,000.
```

---

## 2. 고정 장애물 (6종)

차선 폭은 2.5m입니다. 한 차선짜리 장애물의 보이는 폭은 **2.2m**입니다. 판정(충돌·점프·숙이기)은 모양과 상관없이 정해진 숫자로 하므로, **아래 크기를 꼭 지켜 주세요**. 높이가 판정과 어긋나면 "닿지 않았는데 부딪힘" 같은 일이 생깁니다.

| 이름 | 피하는 법 | 지켜야 할 크기 |
|---|---|---|
| cones | 점프 | 높이 1.0~1.2m |
| plank | 점프 | 높이 0.35m 이하 |
| crates | 점프 | 높이 0.55m |
| barrier | 옆으로 피하기 | 높이 1.7~2.0m |
| overhead | 숙이기 | 빔 아래 1.55m 이상 |
| signbeam | 땅에 붙어 지나가기 | 빔 아래 2.35m |

### cones — 참고 `ref/cones.png`
```
Asset: obstacle_cones. Three traffic cones in a row across one lane, each on a dark square rubber base,
orange body with two white reflective bands, little rounded tip.
Bounding box: width 2.2 m (X) × height 1.0–1.2 m (Y) × depth 0.8 m (Z). Triangle budget: 1,500.
```

### plank — 참고 `ref/plank.png`
```
Asset: obstacle_plank. A low yellow road plank / speed-board lying across one lane, white chevron arrows on top,
small red reflector blocks at both ends.
Bounding box: width 2.2 m × height ≤ 0.35 m × depth 0.7 m. Must stay low – the player hops over it. Triangle budget: 800.
```

### crates — 참고 `ref/crates.png`
```
Asset: obstacle_crates. A row of 3–4 stackable plastic milk crates in bright blue / pink / green / orange,
white rims and hand slots, lined up across one lane.
Bounding box: width 2.2 m × height 0.55 m × depth 0.75 m. Triangle budget: 1,500.
```

### barrier — 참고 `ref/barrier.png`
```
Asset: obstacle_barrier. A road-works barricade: red panel with white diagonal stripes on two dark legs
with flat feet, a small yellow warning lamp on top of one corner.
Bounding box: width 2.3 m × height 1.7–2.0 m × depth 0.6 m. Solid wall – the player must steer around it.
Triangle budget: 1,200.
```

### overhead (duck-under beam) — 참고 `ref/overhead-beam.png`
```
Asset: obstacle_overhead. A red/white striped horizontal beam across the whole 3-lane road on two dark posts,
small yellow flags hanging under it. The player ducks under it.
Total width 7.8 m (posts at x = ±3.75), beam height 0.6 m with its UNDERSIDE at exactly y = 1.55 m,
total height 2.2 m, depth 0.55 m. Nothing may hang lower than 1.3 m between the posts except thin flags.
Triangle budget: 1,500.
```

### signbeam (height-limit gantry) — 참고 없음 (오버헤드와 비슷하게 생긴 노란 빔)
```
Asset: obstacle_signbeam. A yellow height-limit gantry across the whole 3-lane road on two dark posts,
dark diagonal stripes, a blue plate in the centre reading "높이 제한" in white (model the plate as a flat blue
panel; leave the text off – we draw it in code).
Total width 7.8 m (posts at x = ±3.75), beam height 1.0 m with its UNDERSIDE at exactly y = 2.35 m,
total height 3.4 m, depth 0.55 m. Blue plate 2.6 × 1.0 m centred on the front of the beam. Triangle budget: 1,500.
```

---

## 3. 이동 장애물 (움직이는 부분은 이름 붙인 노드로 나눠 주세요)

| 이름 | 참고 | 크기 (폭 × 높이 × 길이) | 움직이는 부분(노드 이름) |
|---|---|---|---|
| bus | `ref/bus.png` | 2.6 × 3.0 × 6.0m | `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `indicator_left` |
| boom (철도 차단기) | `ref/boom-gate.png` | 기둥 2개 x=±5.1, 막대 길이 9.9m, 회전축 높이 1.0m | `arm` (회전축이 노드 원점) |
| lanegate (차선 차단기) | 차단기와 같은 모양, 작은 것 | 기둥 1.6m, 막대 길이 2.3m | `arm`, `lamp_red`, `lamp_green` |
| slider | `ref/barrier.png`와 비슷 | 2.3 × 1.6 × 0.4m, 바퀴 달린 바리케이드 | 없음 |
| geyser (맨홀 증기) | 없음 | 맨홀 지름 1.56m, 바닥 높이 0.05m | `cover` (뚜껑). 증기는 코드에서 그립니다. |
| dropper (떨어지는 물건 3종) | 없음 | 택배 1.3×0.95×1.1 / 화분 지름 1.1·높이 0.9 / 수박 지름 1.24 | 각각 따로 GLB |
| drum (굴러오는 드럼통) | 없음 | 지름 0.84 × 길이 1.0m, 파란색 | 없음 (통째로 굴림) |
| cart (쇼핑카트) | 없음 | 1.2 × 1.1 × 0.8m, 크레이트 3개 실림 | `wheel_*` 선택 |
| cat (고양이) | 없음 | 길이 1.1 × 높이 0.9m, 주황 줄무늬 | `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`, `tail` |
| duck_mother / duckling | `ref/duck-resident.png` | 엄마 약 0.7m, 새끼 약 0.35m | 없음 |

공통 프롬프트(각 이름·크기만 바꿔서):
```
Asset: mover_<name>. <one-line description from the table>. Bounding box exactly <size>.
Split the moving parts into separate child nodes named exactly <node names>; put each node's origin on its pivot
(wheel centre, hinge, hip). Triangle budget: bus 4,000; others 1,500.
```

---

## 4. 라이더 + 자전거 — 참고 `ref/rider-bike.png`

```
Asset: rider_bike. A cute chibi delivery rider on a city bicycle with a front wicker basket and a big delivery box
on the rear rack. Rider wears a mint-green helmet and green jacket. Same pastel low-poly tone as the street.
THIS ASSET FACES -Z (the camera looks at the rider's back, so the back of the delivery box faces +Z).
Bounding box: length 2.7 m (Z) × height 3.0 m (Y, top of helmet) × width 1.5 m (X, box and handlebar).
Wheels: radius 0.45 m, centres at y = 0.5, z = ±0.9.
Rear delivery box: 1.3 × 0.85 × 0.8 m, centred about (0, 1.35, 0.92); lid slightly wider.
Required separate nodes (origin on each pivot):
  wheel_front, wheel_rear (spin on X), crank (pedals, pivot at bottom bracket ~ (0, 0.71, 0.03)),
  leg_left, leg_right (pivot at the hips ~ (±0.18, 1.39, 0.18)), rider (everything above the saddle).
  brand_label: a flat quad 1.1 × 0.65 m on the BACK face of the delivery box (facing +Z), with UVs 0–1 –
  this is the only textured part; we put the brand image on it in code. Leave it plain white.
  basket_items: two milk cartons in the basket as their own node (we recolour them per brand).
No ground shadow (we add it in code). Triangle budget: 8,000.
```

---

## 5. 소품 (선택)

| 이름 | 크기 | 메모 |
|---|---|---|
| tree | 높이 약 4m, 수관 지름 약 2.5m | 2~3종 |
| street_lamp | 높이 4.8m | 램프 헤드가 도로 쪽(+X)을 향함 |
| booster_milk_bottle | 높이 약 1.2m | 파란 뚜껑과 라벨이 있는 우유병, 둘레 고리는 코드에서 그림 |
| ramp | 길이 3.2 × 폭 2.2 × 높이 0.8m | 쐐기 모양, 오르막이 -Z 방향 |
| road_closed_sign | 3.6 × 1.7m 판 + 기둥 | 참고 `ref/road-closed-sign.png`, 글씨는 빼고 판만 |

삼각형 상한은 각 1,500개입니다.

---

## 6. 받은 뒤 할 일 (Claude Code)

- **변환:** `scripts/convert-buildings.mjs`와 같은 방식으로 코드용 데이터로 바꿉니다. 이름 붙은 노드와 `brand_label` UV를 지원하도록 확장합니다.
- **교체:** 장애물과 이동 장애물의 보이는 모양만 바꿉니다. 판정 값(`delivery-jump.ts`, `delivery-movers.ts`)은 그대로 둡니다.
- **라이더:** 바퀴·페달·다리 회전축과 그림자를 유지합니다.
- **배달집:** `entrance` 노드를 기존 `entranceLocal` 위치로 씁니다.

---

## 7. v6 수정 요청 (2026-10-22)

0번 공통 규칙을 그대로 앞에 붙여 주세요. 노드 이름과 회전축 위치는 v5와 같아야 코드 수정 없이 교체됩니다.

### rider_bike — 품질 상향 + 숙이기 자세

지금 문제는 두 가지입니다.
- **품질:** 너무 단순합니다.
- **숙이기:** 게임은 숙일 때 모델 전체를 위아래로 눌러서(높이 30% 감소) 캐릭터가 뭉개져 보입니다. 이건 코드 쪽 문제라, 새 모델의 `spine` 노드를 받으면 누르지 않고 상체만 숙이도록 코드를 바꾸겠습니다.

```
Asset: rider_bike (v6). Same size, origin, -Z facing and node names as v5
(bicycle_frame, wheel_front, wheel_rear, crank, delivery_box, brand_label, basket_items, rider, leg_left, leg_right).
Raise the quality to a polished, cute chibi character in the style of the street buildings:
- Rider: a proper head (about 1/3 of rider height) with a friendly face (eyes, small smile, rosy cheeks),
  hair showing under a mint helmet with a visor and vents, a delivery jacket with collar, zipper and pocket
  details, gloves, rolled trousers and sneakers. Arms reach the handlebar grips.
- Bike: a real city bicycle silhouette – curved frame tubes, chain guard, chain ring, mudguards,
  spoked wheels (8–12 spokes), saddle, bell, headlight, rear rack holding delivery_box, wicker-look front basket.
- NEW node "spine": a child of "rider" with its origin at the hips (~ (0, 1.55, 0.25)), holding the torso,
  arms and head, so the game can bend the upper body forward to duck without squashing the model.
  Everything above the hips must be under "spine"; legs stay under leg_left / leg_right.
- Keep delivery_box 1.3 x 0.85 x 0.8 m at (0, 1.35, 0.92) and brand_label 1.1 x 0.65 m on its back face
  (the game draws the brand box over it, so the shape just has to sit on the rack).
Triangle budget: 12,000.
```

### destination_apartment — 상자 같은 모양 개선

```
Asset: destination_apartment (v6). Same footprint (width 17 m, depth <= 5.4 m), origin, +Z front and nodes
(apartment_mesh, entrance, sign) as v5. Height 12–15 m.
Make it read as a charming Korean apartment building, not a box:
- Break the mass: stepped roofline (penthouse / rooftop garden in the middle), slightly recessed central
  stair core, projecting balconies with railings and plants on every floor, window frames and sills,
  air-conditioner units and laundry poles on a few balconies.
- Ground floor: a covered main entrance canopy with columns, glass doors, mailboxes, a ramp and two
  steps, planters either side.
- Roof: parapet with cap, water tank, small greenhouse or bench garden.
- Colours: warm cream walls, mint core and trims, terracotta accents (same palette as the delivery houses).
- Keep the blank "sign" panel 8 x 1.1 m above the entrance (we draw the name in code).
Triangle budget: 14,000.
```

### destination_plaza — 종착지 앞마당 (새 에셋)

```
Asset: destination_plaza (new). The forecourt in front of the destination apartment that makes the finish feel
like a celebration. Origin = centre of the forecourt's back edge (where the apartment front wall stands),
forecourt extends toward +Z.
Footprint: width 18 m (X) x depth 9 m (Z), ground pieces at most 0.3 m high, decorations up to 5 m.
Leave a clear 9 m wide x 9 m deep driving lane in the centre (x = -4.5 .. 4.5) – nothing there taller than 0.05 m
except a finish arch.
Contents: paving pattern, low hedges and flower beds on both sides, 2 benches, 2 street lamps, a bike rack with
2 parked bikes, a small playground corner (slide or spring rider) on one side, string lights / bunting between
lamps, and a celebration "finish" arch over the centre lane at z = 7 m
(inner clearance at least 7 m wide x 3.6 m tall) with an empty banner panel 6 x 0.8 m on top (text is drawn in code;
name that node "arch_banner").
Triangle budget: 10,000.
```

### mover_bus — 상자 같은 모양 개선

```
Asset: mover_bus (v6). Same size (2.6 x 3.0 x 6.0 m), origin, +Z front and node names as v5
(bus_body, wheel_fl, wheel_fr, wheel_rl, wheel_rr, indicator_left).
Make it a detailed, cute Korean town bus instead of a box:
- Rounded front and rear corners and roof edges, a slightly curved windscreen with wipers and a destination
  display, side mirrors on arms, bumpers, headlights / tail lights, door with folding glass panels and steps,
  a row of side windows with pillars, roof AC unit, wheel arches.
- Our bus ads are drawn in code as flat panels 4.8 m long x 1.2 m tall on both sides, centred at y = 1.12, z = 0,
  sitting at x = ±1.318. Keep the body side flat at x = ±1.30 over that area (y 0.52–1.72, z -2.4..2.4):
  no mirrors, handles or trims sticking out there.
- Colours: two-tone (cream lower body, mint or green upper band), dark window glass, orange indicators.
Triangle budget: 5,000.
```
