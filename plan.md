# Ultima IV 웹 한글판 — 진행 계획
기준 시각: 2026-09-24 KST · 기준 main: `ada0a6d`

## 목표
원본 `ultima4.zip`을 사용자가 브라우저에서 직접 선택해 플레이하는, 한국어 UI/대화/NPC 키워드 alias와
실제 음악·효과음을 갖춘 Ultima IV(xu4 엔진)를 GitHub Pages(`https://taejinkim7-dev.github.io/ultima/`)
정적 사이트로 배포한다. 원본 게임 데이터는 절대 배포/커밋하지 않는다.

## 진행률 계산법
- 전체 24단계 = 구현 1~20 + 최종 검증 F1~F4. 단계마다 가중치 동일.
- 진행률 = 완료(✅) 단계 수 ÷ 24. 부분 진행(🟡)은 0으로 계산한다(완료 기준을 통과해야만 1).
- 완료 기준 = 해당 단계의 acceptance criteria 통과 + `main` merge 전 로컬 검증 게이트 통과(AGENTS.md).
- 세부 정의(References/Acceptance/QA)는 `.omo/plans/ultima-web.md`의 같은 번호 항목이 원본이다.

## 현재 진행률: 6 / 24 = 25.0%
(Step 6 완료 2026-09-24, `todo-06-wasm-build`)

## 단계 목록

### Wave 1 — 기반 (1~5)
| # | 단계 | 상태 | 비고 |
|---|---|---|---|
| 1 | 소스 동결 + 웹 test harness | ✅ | main `36a128e` |
| 2 | host Boron 빌드 + xu4 모듈 패키징 | ✅ | main `f84b5f5` |
| 3 | native GLFW 기준선(원본 데이터로 실제 플레이) | ✅ | main merge 예정 |
| 4 | 영어 원문 inventory + 한국어 스키마 | ✅ | main `ada0a6d` (4411 entries, 4402 pending) |
| 5 | 브라우저 셸 + bridge ABI v1 + Pages 자산 계약 | ✅ | main `0a1408a` |

Step 3 완료 (2026-09-24):
- 3.1 ✅ native 빌드, missing/corrupt ZIP CTest, 잘못된 ZIP hash 차단, 새 게임→이동→save→재시작/load 자동 QA
- 3.2 ✅ NPC 접근: 매 스텝 4방향 talk sweep + Backspace 16회 clear 가드, 6×Right→Calabrini 대화 완주
- 3.3 ✅ `e` 직후·talk sweep 직후 CHECKPOINT(Enter towne!/You meet) 로그, greeting 없으면 실행 폐기
- 3.4 ✅ name/health/bye 키워드 응답 스크린샷 확보, save+reload 검증
- 3.5 ✅ main(Todo 4/5 4커밋) 병합 + 충돌 해결(pacakge.json/handoff.md/계획서)
- 3.6 ✅ clean 전체 게이트 재실행(rm -rf build 후 전체 파이프라인) + handoff 기록 + 체크박스 동기화

### Wave 2 — WASM 이식 (6~10)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 6 | 단일 스레드 wasm Boron + xu4 core 빌드 (Emscripten 4.0.23, Asyncify) | ✅ | todo-06-wasm-build (merge 대기) |
| 7 | OpenGL → WebGL2 (glMapBufferRange 제거, CPU staging + glBufferSubData) | ⬜ | 6 |
| 8 | blocking event loop / 키 입력 → 브라우저 안전 queue (IME, request ID) | ⬜ | 6 |
| 9 | 브라우저 시작 시퀀스 + 원본 ZIP 검증 + 가상 FS, main 1회 실행 | ⬜ | 5,7,8 |
| 10 | IDBFS 세이브/설정 영속 + export/import | ⬜ | 9 |

### Wave 3 — 한국어화 (11~15)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 11 | 긴 메시지 → 하단 HTML 대화 패널 (textContent만) | ⬜ | 5,9 |
| 12 | status/menu → DOM overlay (DPR/letterbox) | ⬜ | 5,9,11 |
| 13 | 한국어 NPC alias + prompt별 입력 규칙 | ⬜ | 8,9,11 |
| 14 | C++/Boron/TLK/binary/JS 번역 lookup 런타임 연결 | ⬜ | 4,11,12,13 |
| 15 | 전체 한국어 번역 corpus + glossary 일관성 (`i18n:check --strict`) | ⬜ | 4,14 |

### Wave 4 — 완성/배포 (16~20)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 16 | Web Audio 음악/효과음 + RFX 생성 | ⬜ | 6,9 |
| 17 | 브라우저 통합 게임 진행 e2e (새 게임부터) | ⬜ | 10,12,13,15,16 |
| 18 | 실패/보안/개인정보/회귀 경계 강화 (`audit:dist`) | ⬜ | 17 |
| 19 | GitHub Actions Pages workflow + `/ultima/` release artifact | ⬜ | 15,16,18 |
| 20 | README/사용자 가이드/증거 인덱스/handoff | ⬜ | 19 |

### Final — 독립 검증 (F1~F4 = 진행률 21~24번째)
| # | 단계 | 상태 |
|---|---|---|
| F1 | 계획 준수 감사 | ⬜ |
| F2 | 코드 품질 리뷰 | ⬜ |
| F3 | 실제 브라우저 수동 QA (Chromium/Firefox/WebKit) | ⬜ |
| F4 | 범위 충실도 (정적 호스팅, 원본 데이터 미포함) | ⬜ |

## 바로 다음 순서
1. Step 7(OpenGL→WebGL2)와 Step 8(blocking event loop→브라우저 queue) — 둘 다 6 완료로 선행 해제, 병렬 가능. 재사용 조사: exp-1(glMapBufferRange 3곳), lib-1(CPU staging+GLSL 300 es).
2. Step 9(브라우저 시작 시퀀스 + ZIP 검증) → 10(IDBFS). 11~13 → 14 → 15(번역 4402건). 16은 9 이후 언제든 병렬 가능.
3. 17 → 18 → 19 → 20 → F1~F4.

## 목적 달성 가능성 판단
- **가능하다고 본다.** 근거: 엔진(xu4)이 원본 데이터로 native에서 실제 새 게임·이동·save/load까지 동작함을 확인했고(3.1),
  모듈 패키징·번역 inventory·웹 셸/브릿지 계약이 이미 main에 있다. 남은 일은 계획서에 기술 설계가 이미 확정돼 있다.
- 주요 위험 (확인 필요):
  - Asyncify로 blocking loop를 옮길 때 stack/성능 문제 (Step 8) — wasm 빌드 자체는 Step 6에서 최초 성공, 브라운징 인터랙션 미검증.
  - WebGL2 버퍼 경로 수정 범위 (Step 7) — 소스 분석만 있고 실측 없음.
  - 번역 corpus 4402건의 분량·품질 (Step 15).
  - Web Audio + RFX 동기 `soundDuration` 계약 (Step 16).
  - 환경: host Node 20.20.2(요구 ≥22, 경고만); wasm release 빌드는 main stub이라 DCE로 작아짐(acceptance는 --debug).

## 공통 규칙 (AGENTS.md 요약)
- 브랜치 `todo-<n>-<topic>`, PR 없이 main 직접 merge. merge 전 `npm ci`, `npm run test:unit`, `npm run verify:repo-sources`,
  `npm run typecheck`, `npm run build`, `git diff --check` + 해당 단계 추가 명령 전부 통과 후 `handoff.md`에 기록.
- TDD: RED 로그 → GREEN. 테스트 삭제/약화 금지.
- 원본 ZIP/EXE/TLK/MAP/EGA/SAV, 추출 원문 corpus, 사용자 save, secret 커밋 금지.
- 단계 완료 시 이 파일의 상태·진행률을 갱신한다.
