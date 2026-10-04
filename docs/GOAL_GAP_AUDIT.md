# goal.md 목표 대비 갭 감사 (2026-10-03)

- **목적**: 사용자 제공 `goal.md`(루트, 14,458B, 2026-10-03 갱신본) 기준 현재 main `6ee20fd` 상태의 충족/미충족 항목 정리
- **근거 데이터**: 5개 병렬 검증 agent의 종합 결과 + 직전 agent들이 인용한 plan.md/F1/F4/handoff.md/WEB_PORT.md 원문
- **결론 요약**: 큰 구조(우선순위 1·2·3·5, Phase 0·1·3·5, §8 Must NOT) 모두 충족. **Phase 4(번역) 완성도에 사용자 체감 갭 9건** 잔존

---

## 1. 우선순위 1~5 (goal.md §1)

| # | 목표 | 상태 | 비고 |
|---|---|---|---|
| 1 | 브라우저에서 원본 그대로 실행 | ✅ PASS | Todo 21로 실제 xu4 엔진 wasm 링크, 타이틀 화면 렌더 + 키 입력으로 IntroController 상태 전이 확인 |
| 2 | 한글 렌더링 | ✅ PASS | **DOM 오버레이**(HTML 패널/오버레이). goal.md §6의 `hangul.c`+`hangul16.bin` PoC는 미사용 — §7 Phase 3 권고(웹은 Plan A)에 따라 의도적 채택 |
| 3 | 텍스트 레이아웃 재설계 | ✅ PASS | **8×8 비트맵 → HTML 대화 패널(#dialogue-panel) 분리**. §7 Phase 3 ★핵심 결정과 일치 — "웹 기반이라면 A안이 유력" 그대로 채택 |
| 4 | 텍스트 번역 | ⚠️ PARTIAL | §5 3경로 모두 연결됨, 일부 surface에서 영어 노출(아래 §4) |
| 5 | 입맛대로 개조 | N/A | 후순위 |

---

## 2. Phase 0~5 (goal.md §7) vs 현재 상태

| Phase | 요구 사항 | 상태 | 비고 |
|---|---|---|---|
| Phase 0 — native build | `xu4-engine/u4` master clone → 빌드 → 데이터로 실행 | ✅ | Todo 3, `qa:native-baseline` exit 0. `build:native` + `cmake:*` + `test:native 4/4` 모두 green |
| Phase 1 — Emscripten build | sound_null.cpp, glad 배제, `#version 300 es`+`precision highp float`, ASYNCIFY, frameSleep→emscripten_sleep, --preload-file | ✅ | Todo 6/7/8/21. 단, sound_null은 **Phase 4에서 Todo 16 Web Audio로 업그레이드**(목표 자체 수정) |
| Phase 2 — 한글 렌더링 통합 | hangul.c 편입 + xu4-hangul-poc.patch | ✅(대안 채택) | **DOM 오버레이 사용**. hangul.c/`hangul16.bin`/`mkhangulfont.py` 모두 부재 — §7 Phase 3 "A안이 유력" 권고 따름 |
| Phase 3 — 텍스트 레이아웃 재설계 ★핵심 | HTML 오버레이로 텍스트 영역 캔버스 밖 분리 | ✅ | **정확히 Plan A로 구현**. 원본 320×200 캔버스 그대로, 대화/메뉴/상태 모두 HTML 오버레이로 분리 |
| Phase 4 — 번역 | §5 3경로(vendors.b → C++ 하드코딩 → .TLK) 순서 | ⚠️ | 연결 완료, **완성도 갭 9건 잔존**(아래 §4) |
| Phase 5 — 오디오 | (Phase 4 이후) | ✅ PASS | Todo 16 Web Audio + RFX. 목표는 Phase 4까지 무음이라고 했지만 자체적으로 업그레이드 |

---

## 3. §8 하지 말 것 (Must NOT) 준수

| 금지 | 준수 | 비고 |
|---|---|---|
| .TLK 바이너리 직접 패치 | ✅ | `discourse_tlk.cpp`의 `map:npcIndex:field` 키 기반 lookup만 사용, 영어 TLK 원문은 엔진 밖 미전송 |
| 게임 데이터(zip/맵/대사) 저장소 커밋 | ✅ | `.gitignore` + `audit:dist --require-engine` + `verify:repo-sources` |
| 번역 결과물 배포 | ✅ **2026-10-03 사용자 결정: 공개 유지** | goal.md §5·§8을 결정에 맞게 고쳤다. 영어 원문은 계속 비공개(hash only). 근거·잔여 금지사항은 `docs/TRANSLATION_POLICY.md`, README에 비공식 팬 번역 고지 |
| 문서 행 번호 그대로 신뢰 | ✅ | 모든 인용 시 `file:line` 직접 grep 확인 |
| Phase 0 건너뛰기 | ✅ | Todo 3 native 게이트가 main merge 전제 |
| 한글 렌더링 없이 번역 먼저 | ✅ | Phase 2 렌더링 후 Phase 4 번역 진행 |

---

## 4. 우선순위 4(번역) — 사용자 체감 갭 9건

> 게임 시작은 되지만, "한국어로 끝까지 플레이"는 막는 항목들. P1 = 핵심 UX/정합성, P2 = 화면 노출 영어, P3 = 검증 부재.

### P1 — 게임플레이 차단 또는 텍스트 정합성

| # | 갭 | 영향 | 추정 LOC | 우선 작업 |
|---|---|---|---|---|
| **1** | **한국어 입력창 포커스 종료 후 화살표/명령키 무시** — `docs/WEB_PORT.md:106`, `handoff.md:1463`, `plan.md:396` 명시. Todo 30 fix 검증 안 됨("`준핸들링전: 재현부터`") | 한국어 IME 사용 직후 데스크톱 키보드 플레이 자체가 멈춤 — **Must 2(데스크톱 키보드) 직접 위반** | <100 (재현 + `text-prompt-gate.ts`/input-queue 검토) | **1순위** |
| **2** | **LB/Hawkwind 미덕 키워드 한국어 alias 부재** — `locales/ko/aliases.json`에 bye/look/name/give/join/job/health + yes/no + choice 4종 = **13개만** 존재. 8 virtue + 3 principle(`truth/love/courage` 등) 미지원 | LB/Hawkwind에게 미덕 주제로 한국어 입력 불가. 영어 필수 | <100 (`aliases.json` 11건 추가 + `korean-castle-output.spec.ts` 확장) | 1순위 |

### P2 — 화면에 그대로 노출되는 영어

| # | 갭 | 영향 | 추정 LOC | 우선 작업 |
|---|---|---|---|---|
| **3** | **`getVirtueAdjective()` 형용사 영어 노출** — `WEB_PORT.md:105` "번역 틀 안에서 영어로 나옵니다". `honest/compassionate` 등 8 미덕 형용사가 상태/대화에 그대로 | 미덕 형용사가 player-visible 영어 | <100 (Todo 32/33 `GENERATED_STATUS_NAMES` 패턴) | 2순위 |
| **4** | **Placeholder 순서 검증 부재(plan.md Must-NOT 위반)** — `placeholders.mjs:6-8` 정렬 multiset + `ui-message-compose.ts:43-50` 순차 치환 = 동일 kind placeholder 재배치 시 args silently swap (예: gold가 이름 슬롯에). 4561-entry corpus 감사 미실행 | 잘못된 번역이 말도 안 되는 문장 출력 (출시 후 정합성 사고 위험) | <100 (`i18n-check.mjs`에 ordered-kind 검사) | 2순위 |
| **5** | **죽음/주문 실패 메시지 영어** — `deathMsgs[]`(`death.cpp:108-110`), `spellErrorMsgs[]`(`spell.cpp:63-71`) assignment-literal 추출기 미지원 → 화면(canvas) 영어, 패널 silent | 가장 극적인 순간(파티 사망)에 영어 | <100 (assignNames extractor 옵션 추가 + ~13 strings 번역) | 2순위 |
| **6** | **"Enter %s!" "towne" 잔존** — `cityTypeStr()` 값(towne/city/village 등) 한국어 glossary 없음. `screen.cpp:573` `screenMessageCenter`(도시/신단/던전 입장) 훅 자체가 없음 | 도시/신단/던전 진입 메시지에 영어 도시 종류명 | <30 glossary + <100 center-hook | 2순위 |
| **7** | **"Giant Rat", 전투 "Mage" 크리처 이름 영어** — name map에 미포함. 한국어 전투 메시지 안에 영어 creature 이름 그대로 | 전투 중 creature 이름 영어 | <30 (i18n name map 2건 추가) | 3순위 |

### P3 — 검증 부재

| # | 갭 | 영향 | 추정 LOC | 우선 작업 |
|---|---|---|---|---|
| **8** | **Codex/엔딩 화면 실제 데이터 미관측** — unit+artifact만 검증, real-session(Abyss 도달 후) 관측 0회. `virtueQuestions 8..10 ↔ codexHandleInfinity` open risk 잔존 | 게임 클라이맥스 한국어 출력이 **단 한 번도 실제 데이터로 관측된 적 없음** | <30 (수동 QA 노트 + final/F3-real-browser-qa/ 보강) | 3순위 |
| **9** | **잔여 영어 surface 전수 계측 부재** — `WEB_PORT.md:104` "화면에 아직 어떤 영어가 남는지 전수 계측한 것은 아닙니다". 런타임 측정 하니스 없음 | 영어 노출 scope 불명. 우선순위 결정 근거 부재 | >500 (런타임 측정 하니스 + per-surface id 채널) | 4순위 — 메타 작업, 다른 갭의 우선순위 결정에 선행 |

---

## 5. §5 3개 번역 경로별 갭

| 경로 | status | 갭 |
|---|---|---|
| C++ 하드코딩(`src/*.cpp`) | ✅ 연결 (Phase 4 우선순위 ≥ 중간) | `deathMsgs[]`, `spellErrorMsgs[]` assignment-literal 미추출 → 갭 #4 |
| 모듈 스크립트(`vendors.b`, `config.b`) | ✅ 연결 (Phase 4 우선순위 ≥ 쉬움) | weapons/armor/reagent/inn 4종 상점 e2e 없음 (healer/food만 검증) |
| .TLK 16 NPC 파일 | ✅ 연결 (Phase 4 우선순위 ≥ 어려움) | LB/Hawkwind 미덕 키워드 alias 부재 → 갭 #2 |

---

## 6. 권장 작업 순서 (사용자 결정 대기)

> **⚠️ 2026-10-03 대체됨**: 실제 진행 순서는 아래 §10과 `plan.md` "🆕 바로 다음 순서"(계획서 Todo 34~44)를 따른다. 이 표는 감사 당시의 제안으로 보존한다.

> AGENTS.md "merge 전 검증 게이트"는 그대로 적용. 각 작업은 `<100 LOC` 단위로 새 branch(`todo-<n>-...`, 번호는 아래 §10)에서 TDD RED → 그린 → main 머지.

| 순서 | 작업 | 의존 | LOC | 목표 |
|---|---|---|---|---|
| 1 | **갭 #1 — 한국어 입력 포커스 blackhole 재현 + 수정** | Todo 30 fix 코드 존재(미검증) | <100 | 핵심 UX(Must 2) 회복 |
| 2 | **갭 #9 — 잔여 영어 surface 전수 측정 하니스** | 신규 | >500 | 다른 갭의 정확한 우선순위 결정 근거 |
| 3 | **갭 #2 — LB 미덕 alias 11건** | 갭 #9 (어떤 virtue가 노출되는지) | <100 | LB/Hawkwind 미덕 대화 한국어 |
| 4 | **갭 #4 — Placeholder 순서 검증 + corpus 수정** | <100 | plan.md Must-NOT 위반 해소 |
| 5 | **갭 #3 — `getVirtueAdjective()` 한국어 번역** | Todo 32/33 패턴 | <100 | 미덕 형용사 한국어 |
| 6 | **갭 #5 — `deathMsgs[]`, `spellErrorMsgs[]` 추출 + 번역** | <100 | 극적 순간 한국어 |
| 7 | **갭 #6 — `cityTypeStr()` glossary + `screenMessageCenter` 훅** | <130 | 도시/던전/신단 입장 한국어 |
| 8 | **갭 #7 — Giant Rat/Mage name map** | <30 | 전투 creature 이름 한국어 |
| 9 | **갭 #8 — Codex/엔딩 실데이터 관측 + F3 노트** | <30 | 클라이맥스 한국어 실측 |

각 작업 후:
- `npm ci` · `npm run test:unit` · `npm run verify:repo-sources` · `npm run typecheck` · `npm run build` · `npm run check:build-fresh` · `git diff --check` 전부 exit 0 확인
- `npm run verify:integration` 단독 실행, 13단계 + e2e 46/46 확인
- main 머지 전 handoff.md에 게이트 결과 기록
- 사용자 push 승인 후 `git push origin main`

---

## 7. 명시적 사용자 결정 필요 사항

| 항목 | 결정 | 비고 |
|---|---|---|
| §8 "번역 결과물 배포"와 plan.md "한국어 표시 텍스트 공개"의 충돌 | ✅ **공개 유지** (2026-10-03) | `docs/TRANSLATION_POLICY.md` |

---

## 8. 참고 자료 (직접 인용)

- 사용자 제공: `/home/taejin/ultima/goal.md` (14,458B, 2026-10-03)
- 자체 계획: `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90/.omo/plans/ultima-web.md` (87KB, 37/37)
- 진행 관리: `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90/plan.md` (97KB)
- F1 감사서: `.omo/evidence/ultima-web/final/F1-plan-compliance.md` (14KB)
- F4 감사서: `.omo/evidence/ultima-web/final/F4-scope-fidelity.md` (13KB)
- 사용자 가이드: `docs/WEB_PORT.md:104-107`(잔여 영어/입력창 이슈)
- 핸드오프: `handoff.md:1463`(갭 #1), `:1607`(Todo 30 미검증)
- 설계안: `.omo/drafts/korean-output-gap-design.md`, `korean-surface-{intro-status,shops-messages,castle-ending}.md` (주의: `korean-surface-*`는 git에 커밋된 적 없는 로컬 초안이다. Codex 관련 미해결 위험은 계획서 Todo 41 본문에 옮겨 적었다)

### 병렬 검증 agent 5건 결과 요약

1. **exp-3 (ses_f00c13fbbffeJZQ19TFOXRdNfp)** — 44개 .md 문서 "확인 필요"/"미구현"/"⬜" 스캔, PRODUCT_GAP 5건 식별
2. **ora-2 (ses_f00c13f90ffe5SW3VczM6Uopr0)** — F4 deviation 분석, "should-have-been-blocking" 3건 도출(갭 #1·3·9)
3. **exp-4 (ses_f00c13f6cffe5ECX103ZPddVml)** — 코드 TODO/FIXME/스텁 스캔, PROD_GAP 4건 식별(dead input queue, placeholder export 등)
4. **lib-2 (ses_f00c13f45ffeqfMskBln456uUv)** — 라이브 사이트 정적 자산 + i18n 테이블 분석, 영어 노출 surface 4건 식별
5. **ora-3 (ses_f00c13f23ffemrKqEgAqoV2Xjy)** — 3개 design draft vs main 비교, "draft가 제안했지만 미구현" 항목 12건 도출

---

## 9. 메타

- **작성 위치**: `docs/GOAL_GAP_AUDIT.md` (2026-10-03 main에 커밋)
- **base commit**: `6ee20fd`(main tip)
- **다음 행동**: §7 결정 완료. 진행은 아래 §10의 계획서 Todo 순서를 따른다.
---

## 10. 계획서 반영 (2026-10-03)

이 감사의 갭 9건과 goal.md 재점검 항목을 `.omo/plans/ultima-web.md` Todo 34~44로 옮겼다(`plan.md` "바로 다음 순서"). 반영하면서 주장을 코드로 확인했다. 갭 #2·#4·#5·#6은 확인됐다. 갭 #7은 `Rat`·`Mage` 번역이 이미 있어 노출 경로 재현이 필요하다.

| 갭 | Todo | 비고 |
|---|---|---|
| #1 입력 포커스 | 35 | 재현 RED부터. prompt 닫힘 + 재오픈 없음일 때만 포커스 반환 |
| #2 LB/Hawkwind alias | 37 | `discourse_castle.cpp` `lbKeyLine` 24개 + 미덕 이름, 4글자 접두 규칙 |
| #3 미덕 형용사 | 39 | Todo 32/33 생성기 패턴 |
| #4 placeholder 순서 | 36 | 순서 일치 강제 또는 `%1$s` 위치 지정 지원 중 택1(코퍼스 감사 후) |
| #5 죽음/주문 실패 | 40 | 추출기를 정적 문자열 배열로 확장 |
| #6 입장 메시지 | 40 | `screenMessageCenter` 웹 훅 + `cityTypeStr()` glossary |
| #7 크리처 이름 | 39 | 노출 경로 재현 후 |
| #8 Codex/엔딩 실관측 | 41 | 상점 4종 e2e(§5)도 함께 |
| #9 전수 계측 | 38 | 감사의 권장 순서(2번째)와 달리 35·36 뒤에 둔다. 계측 결과로 39·40 범위를 확정한다 |
| (추가) 저장소 정리 | 34 | 선행 작업 |
| (추가) wasm 메모리·Safari | 42 | |
| (추가) 개조 범위 | 43 | 제안만, 사용자 결정 |
| (추가) 재검증 | 44 | F1/F4 addendum, 이 문서의 갭 상태 갱신 |

감사의 권장 순서와 다른 점은 두 가지다. 갭 #4(정합성)를 계측보다 앞에 둔다. 틀린 문장은 영어보다 나쁘기 때문이다. 갭 #2는 계측과 무관하게 키워드 목록이 코드에 고정돼 있어 계측을 기다리지 않는다.

---

## 11. 최종 상태 (2026-10-03, Todo 34~46 반영 후 — 코드 main `e1625af`)

감사 §4의 갭 9건이 계획서 Todo로 처리된 결과다. 각 항목의 근거는 `.omo/evidence/ultima-web/task-*`(로컬 증거)와 `handoff.md` 2026-10-03 절에 있다. **검증 수준**을 구분해 적는다.

| 갭 | 처리 | Todo | 검증 수준 |
|---|---|---|---|
| #1 입력 포커스 | **해결**. prompt가 닫히고 재오픈이 없으면 입력창을 벗어남, Esc 즉시 이탈 | 35 | 단위 RED→GREEN, e2e RED(수정 전 실패)→GREEN, 통합 게이트. 실제 IME 감각은 사람이 확인 필요 |
| #2 LB/Hawkwind alias | **해결**. alias 23개 + 글로서리 10개 | 37 | 단위 + e2e(영어 키워드와 한국어 alias가 같은 응답 줄). Hawkwind 미덕 이름 매칭은 단위만 |
| #3 미덕 형용사 | **수정**. 번역 인자 표(`GENERATED_ARGUMENT_NAMES`)로 매핑 | 39 | **단위만**. e2e가 해당 상황에 도달하지 못함 |
| #4 placeholder 순서 | **잠재 위험을 차단**. 실제 영어 순서와 번역을 비교하면 순서가 바뀐 번역은 **0건**(감사 당시 가정과 달리 현재 피해 없음). 검사기가 순서까지 강제 | 36 | 단위 + 바꿔치기 번역이 `i18n:check`에서 exit 1 |
| #5 죽음/주문 실패 | **수정**. 정적 배열 추출기 확장, 15행 번역 | 40 | 주문 실패 문구는 e2e 관측. **죽음 메시지는 단위만** |
| #6 입장 메시지 | **수정**. `screenMessageCenter` 웹 훅, 도시 종류·신단 이름 글로서리 | 40 | e2e 관측(Moonglow 입장 줄) |
| #7 크리처 이름 | **감사 주장이 사실 아님**. 재현해 보니 이미 번역돼 있음 | 39 | 모든 크리처·전투 형식을 단위 테스트로 고정 |
| #8 Codex/엔딩 | **관측됨**. 질문 11개(id 0~10)와 엔딩 11 id가 한국어 패널에 표시, 오답 시 한국어 거절 줄, `virtueQuestions` 8..10 위험 해소. 상점은 6종 e2e | 41 | 실제 `ultima4.zip` e2e. 엔딩이 패널은 문단 단위·캔버스는 페이지 단위인 점은 **사용자 판단 필요** |
| #9 잔여 영어 계측 | **완료**. 계측 하니스 + 보고서. 미확인 해시 `8c19a815`는 엔진 버그가 아니라 방향 입력 뒤 백스페이스 4개(제어 문자)였다 | 38, 45 | 해시를 독립 계산해 일치 확인. 보고서 도구의 `\b` 해석 오류 수정 |

추가로 찾아 고친 것: 시약상점 첫 줄 영어 누출(Todo 41 발견 → 45 해결, 철자 불일치), 세이브 가져오기 파일 선택창이 내보낸 `.dat`을 숨기던 문제(Todo 46).

**아직 남은 것**
- 갭 #3·#5의 죽음 메시지: e2e 관측 없음(단위만).
- 개조 범위(Todo 43): 선택지는 `docs/plans/mod-scope-proposal.md`, 사용자 결정 대기.
- Safari 실기 검증: 이 환경(WSL2)에서 불가. WebKit 자동화는 Safari 증거가 아니다.
- 한국어 입력 감각, 세이브 파일 선택창: 사람이 실제 브라우저에서 확인해야 한다.
