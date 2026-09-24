# Step 11-13 설계 메모: 대화 패널 / 오버레이 / 한글 입력

읽기 전용 조사. 코드/설정 변경 없음. 소스: `.omo/plans/ultima-web.md`(Todo 11/12/13,
설계 계약 8/9/10/12), `src/bridge/types.ts`, `src/shell.ts`, `index.html`,
`src/shell.css`, `src/bridge/input-queue.ts`, `vendor/xu4/src/discourse_tlk.cpp`,
`vendor/xu4/src/savegame.h`, `locales/ko/aliases.json`,
`.omo/drafts/ultima-web-source-analysis.md`.

주의: 계획서가 인용하는 `engine/src/event.cpp`, `engine/src/config_boron.cpp`는
현재 저장소에 없다(빈 `engine/src/`만 존재). 실제 경로는 `vendor/xu4/src/event.cpp`,
`vendor/xu4/src/script_boron.cpp`다 — **확인 필요(계획서 경로 오기 가능성)**.

## 1) Step 11 — 메시지 토큰화 + 패널 렌더링

원본 `screenMessage`는 `printf` 스타일 텍스트를 그대로 흘려보낸다
(`vendor/xu4/src/event.cpp:787-795`, `camp.cpp` 등). 제어는 리터럴
`\n`(줄바꿈), `\b`(backspace, 확인 필요 — 코드에서 직접 못 찾음), 그리고
`screen.cpp:436 screenMessageCenter`의 길이-무제한 복사 경로뿐이다. `color`/
`right`/`pause` 토큰은 설계 계약 문구에는 있으나 이번 조사에서 원문 소스의
정확한 opcode를 못 찾았다 — **확인 필요**.

설계:
- 순수 함수 `tokenizeMessage(raw: string): MessageToken[]` — DOM 비의존,
  단위테스트 가능. 토큰 종류: `text`, `newline`, `clear`, `backspace`,
  `right`, `color(code)`, `prompt`, `pause`.
- 순수 리듀서 `applyToken(state, token): PanelState` — 라인 배열, 커서 위치,
  pause-pending 플래그를 갱신. DOM 렌더러는 이 상태를 `textContent`/`Text
  node`로만 반영(계약 8: innerHTML 금지 유지).
- 계약 갭: `MessageBridgeEvent`는 현재 `{ text: string }`뿐이라 토큰이 없다.
  옵션 A: `tokens?: MessageToken[]`를 추가(ABI v1 유지, additive). 옵션 B:
  ABI v2로 올림. `isBridgeEvent`의 message 케이스 테스트가 이미 있으므로
  어느 쪽이든 RED 먼저.
- `shell.ts`의 `appendDialogueLine`은 현재 `<p>` + 통 문자열 append뿐이다.
  clear 토큰에 대응하는 라인 단위 replace, backspace의 마지막 문자 제거,
  pause의 "다음 키 대기" 상태(입력 큐와 연결 필요, Step 13과 접점)가 없다.

## 2) Step 12 — 오버레이 레지스트리

설계 계약 9번: status는 원래 `x=192,y=8,width=120,height=64` logical rect,
15×8칸(120/8 × 64/8). 현재 `index.html`은 `#status-overlay` 하나만 있고
`src/shell.css`의 `.status-overlay { inset: 0 }`는 전체 뷰포트를 덮는다 —
목표 rect로 아직 축소되지 않았고, menu/textview 오버레이 요소는 DOM에 아예
없다.

설계:
- `toCssRect(logicalRect, contentRect, dpr): DomRect` 순수 함수. `contentRect`는
  canvas의 실제 letterbox/scale을 담은 값(2× 기본, DPR 별도).
- `OverlayRegistry`: `register(role: "status"|"menu"|"textview", rect)`,
  `clear(role)`, `resetStage()`(스테이지 전환 시 전체 제거), `cursor`/`selection`
  상태는 textview 역할에 한정.
- `ViewBridgeEvent`는 현재 `{ region, text }`뿐이고 계약 8이 말하는 "위치와
  tokens"가 없다 — rect/좌표를 실을 필드가 없다. 좁은 뷰포트는 page scroll로
  대응(계약 9), fixed-space 정렬을 한국어에 그대로 쓰지 않는다(구조화된 필드
  + 짧은 번역).

## 3) Step 13 — 한글 alias/prompt 규칙과 입력 큐 연결

원문 키워드 매칭은 `discourse_tlk.cpp`의 `inputEq(K) = strncasecmp(K, in, 4)`
(4바이트 prefix; `job`/`bye`는 3바이트로 별도 호출)이며, `yes`/`no`는 이
prefix 매칭이 아니라 `talkYNResponse`에서 첫 글자 `y/Y`, `n/N`만 비교하는
완전히 별도 경로다(`discourse_tlk.cpp:44-63`). `topic1`/`topic2`는 NPC별
TLK 레코드 필드로 전역이 아니다. avatar 이름은 `savegame.h:181 char
name[16]`로 16바이트 확인됨.

`locales/ko/aliases.json`은 9개 전역 키워드(`bye/look/name/give/join/job/
health/yes/no`) 스캐폴딩이며 **모든 `alias` 필드가 빈 문자열, `status:
"pending"`이다** — 실제 한글 단어가 아직 없다. Step 13이 채워야 할 몫.

설계:
- 순수 함수 `resolveInput(kind: PromptKind, raw: string, ctx): Resolved`.
  NFC 정규화 + trim 우선, ASCII는 그대로 통과(prefix 매칭 유지), 한글은
  정확히 매칭(원문의 4바이트 prefix 규칙을 한글 자모 단위로 흉내내지 않음).
  `yesno`는 예/아니오 → yes/no 매핑, `number`/`direction`/`command`/
  `avatar-name`은 한글을 거부.
- 계약 갭(블로커): `PromptBridgeEvent.promptId: string` vs
  `input-queue.ts`의 `beginPrompt(requestId: number)` — 타입 불일치. 브리지가
  숫자 requestId를 문자열로 실어야 하는지, 큐 쪽을 string으로 바꿀지 결정
  필요. 또한 계약 8이 말하는 prompt의 `allowed keys/maxBytes`가 현재
  `PromptBridgeEvent`엔 없다. `TEXT_MAX_BYTES=256`은 전역 상수라 avatar-name의
  12 ASCII bytes 제한을 큐가 알지 못한다 — kind별 한도를 `beginPrompt`에
  넘기거나 shell 쪽에서 `submitText` 전에 `resolveInput`으로 선검증해야 함.
- `PROMPT_KINDS`에 `command`(단일키)가 없다 — 계획 문구의 "단일키" prompt와
  대응 안 됨, 추가 필요.
- "context-aware" 매핑은 NPC별 topic1/topic2까지 포함해야 하는데, 현재
  어떤 브리지 이벤트도 활성 NPC/토픽 컨텍스트를 실어보내지 않는다 —
  **확인 필요**.

## 4) 첫 RED 테스트 (컴포넌트별 1개 이상)

- Step 11: `tokenizeMessage("a\nb")` → `[text("a"), newline, text("b")]`;
  `<script>foo</script>`가 포함된 문자열이 토큰화 후에도 리터럴 텍스트로
  남아 렌더러가 `textContent`로만 쓰는지(신뢰 실패 시나리오).
- Step 12: 2× 스케일에서 status logical rect(192,8,120,64) →
  css rect(384,16,240,128); letterbox 오프셋이 있는 contentRect에서 오프셋이
  더해지는지; `resetStage()` 후 레지스트리가 비는지.
- Step 13: 실제 `aliases.json`은 비어 있으므로 테스트 전용 fixture 사용.
  ASCII `"JOB"`은 그대로 통과, avatar-name prompt에 한글 입력 시 거부,
  분해형(자모) 입력이 NFC 후 완성형과 동일 alias로 매칭되는지.

## 5) 리스크 / 확인 필요

- `color`/`right`/`pause` 정확 opcode/바이트 표현 — 이번 조사에서 원문 소스
  라인 특정 못함.
- 계획서의 `engine/src/event.cpp`, `engine/src/config_boron.cpp` 라인 인용은
  실제로는 `vendor/xu4/src/event.cpp`, `vendor/xu4/src/script_boron.cpp`로
  보이나 라인 번호까지는 미검증.
- Step 11/12/13이 공유해야 하는 브리지 계약 확장(message.tokens,
  view.rect/tokens, prompt.requestId 타입/allowedKeys/maxBytes)을 어느 Todo가
  먼저 ABI를 바꿀지 순서 미정 — 세 Todo가 서로 다른 필드를 요구하므로 실제
  구현 순서에서 충돌 가능.
- NPC/토픽 컨텍스트를 브리지가 아직 전달하지 않아 "context-aware" 별칭
  해석의 정확한 트리거 지점(입력 큐 앞? 브리지 이벤트에 컨텍스트 추가?)이
  미정.
