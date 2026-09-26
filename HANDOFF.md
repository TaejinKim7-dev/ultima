# HANDOFF
작성 시각: 2026-09-26 22:30 KST — Todo 15 진행 중 (glossary/ui/binary/module 완료, tlk 남음), 16/25 유지

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 사용자 지시: "남은 작업 계속 진행해" — Todo 13 완료 후 바로 다음 순서인 Todo 15(전체 한국어 번역 corpus)를 시작, 세션 내에서 갈 수 있는 데까지 진행.

## 2. 현재 상태 (Current state)
- **승인 기준 16/25 = 64.0%** (Step 1~14, 16, 21 ✅ — 변화 없음. Todo 15는 아직 미완료라 🟡).
- main: `cd061b4`까지 push 완료.
- **Todo 15 진행 중, 🟡**: `locales/ko/*.json`의 pending 4402건 중 **1330건 완료, 3072건(tlk.json 전체) 남음**.
  - `glossary.json` 18/18 ✅, `ui.json` 369/369 ✅, `binary.json` 214/214 ✅, `module.json` 729/729 ✅.
  - `tlk.json` 0/3072 — **다음 세션 첫 작업**.
- `npm run i18n:check`(비엄격) 통과: 4411 entries, 3072 pending. `npm run i18n:check -- --strict`는 아직 실패(의도됨, tlk 전까지).
- 최종 게이트 전부 exit 0: unit 21/259 · verify:repo-sources · typecheck · build · diff-check · i18n:check.

## 3. 변경한 파일 (이번 웨이브)
- `locales/ko/glossary.json`·`ui.json`·`binary.json`·`module.json`: 번역 채움(각각 완료).
- `scripts/i18n-check.mjs`: `category: "passthrough"` 예외 추가(순수 공백 소스 문구 대응, RED→GREEN 테스트 포함 — `tests/unit/i18n-check.test.ts`).
- 스키마 데이터 수정: `module.json`의 vendors:* 26건 `placeholders` 배열을 거짓 양성(`"% s"` 등)에서 `[]`로 교정.
- `plan.md`: Todo 15를 🟡로, 상세 진행 내역 기록.
- `handoff.md`: "Todo 15 진행 중" 절 신규(각 파일 번역 방침·발견한 스키마 결함 상세).
- 브랜치: `todo-15-i18n-corpus` (main에 fast-forward merge됨, 브랜치 자체는 보관).

## 4. 주요 결정과 근거 (Key decisions)
- 파일 크기 작은 순으로 번역(glossary→ui→binary→module→tlk) — 이후 파일이 앞선 용어(8미덕/3원칙/던전·마을 고유명사)와 일관되게.
- 영어 원문은 `.local/i18n-inventory/*.json`(gitignored)에서만 조회, `locales/ko/*.json`(커밋됨)에는 절대 넣지 않음 — AGENTS.md 금지사항 준수.
- `avatar.exe:lordBritishKeyword:*`(24건)와 `module:Ultima-IV:vendors:29/84`(letter-menu 단축키)는 의도적으로 영어 그대로 둠 — discourse/파서가 정확한 ASCII로 매치하는 실제 키워드/단축키라 번역하면 게임 로직이 깨짐.
- 상인 대화의 `%`/`@`/`#`/`=`/`+`/`$gp` 치환 토큰은 checker가 추적 안 하지만(printf 스타일이 아님) 런타임엔 필수라 수작업으로 리터럴 보존.
- 파일 하나 끝날 때마다 즉시 커밋(작은 단위 체크포인트) — 하나의 거대 커밋으로 몰지 않음.

## 5. 다음 할 일 (Next steps, 재개 시 순서)
- [ ] **`tlk.json`(3072건) 번역** — NPC 이름·인사말·`job`/`health`/`name`/`bye` 등 키워드별 응답. 파일이 매우 크므로 여러 세션에 걸쳐 분할 진행 권장(예: 마을별로 나누기 — `node -e "..."`로 `.local/i18n-inventory/tlk.json`을 town별 prefix로 그룹핑해 서브셋 크기 파악부터).
  - 재사용할 스크립트: `/tmp/claude-1000/.../scratchpad/apply-translations.mjs`(키:번역 JSON을 받아 스키마에 병합)는 세션 종료 시 사라짐 — 재개 시 동일 패턴으로 다시 작성(간단함, `scripts/lib/schema-io.mjs`의 `loadSchemaFile`/`saveSchemaFile` 사용).
  - 번역 전 반드시 `node -e "..."`로 `locales/ko/tlk.json`(공개) + `.local/i18n-inventory/tlk.json`(원문, gitignored) 양쪽을 대조해 키별 원문 확인 — 원문을 절대 새 커밋에 포함하지 말 것.
  - placeholder 배열에 공백을 포함한 항목이 있는지 미리 스캔(`/ /.test(p)`) — module.json에서처럼 거짓 양성이 있으면 먼저 `[]`로 교정.
- [ ] tlk 완료 후 `npm run i18n:check -- --strict` GREEN 확인.
- [ ] `tests/e2e/korean-progression.spec.ts`(Todo 15 승인 기준, 아직 미작성) — intro·마을 NPC 1곳·로드 브리티시/호크윈드·신단/코덱스 답변 1개·저장/로드 UI 커버.
- [ ] Todo 15 완료 → `[x]` → 17/25 → Todo 17(QA 갭 분석 있음, wasm 재진입 버그 클래스 주의) → 18 → 19 완료 → 20 → F1~F4.
- [ ] Pages Source = "GitHub Actions" 설정은 사용자만 가능.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- `tlk.json`은 이 프로젝트에서 가장 큰 번역 대상(3072건, 전체의 70%) — 한 세션에 다 끝내려 하지 말고 town/npc 단위로 쪼개서 체크포인트 커밋할 것.
- i18n-check.mjs의 placeholder 추출 정규식은 printf `%` 뒤에 공백(플래그로 유효)+영문자가 오면 오탐한다("% says" 같은 평범한 영어 산문에서). tlk.json 번역 전 미리 스캔해서 거짓 placeholder를 `[]`로 교정해두면 나중에 헤매지 않는다.
- e2e는 `--workers=1`로 긴 스펙(save-reload, korean-npc-alias) 분리 실행 필수.
- `build/wasm-release`는 git-ignored, 새 worktree엔 `build/host/{boron,modules}`도 순서대로(`deps:host`→`build:modules`→`build:wasm`) 복사/재빌드해야 함.
- F3 수동 QA·`qa:native-baseline` 2회차(승인제) 미실시.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run i18n:check   # 4411 entries, 3072 pending 확인 (tlk.json 전부)
node -e "console.log(Object.keys(require('./locales/ko/tlk.json').entries).length)"  # 3072
```
- 공식 인계: `handoff.md`의 "Todo 15 진행 중" 절(가장 최근). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
