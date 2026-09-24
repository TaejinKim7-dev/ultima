# HANDOFF
작성 시각: 2026-09-24 13:35 KST

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 전체 진행은 `/home/taejin/ultima/plan.md`의 24단계 기준으로 관리한다.
- 이번 세션: **Step 6 완료 + 사용자 승인 후 `main` merge(`c836ecc`)까지 완료**. 다음은 Step 7·8 병렬.

## 2. 현재 상태 (Current state)

### 2-1. Step 6 → main merge 완료 (branch `todo-06-wasm-build`, merge `c836ecc`, push 대기)
- 구현 커밋 `26f7164`, 문서 `db512d9`, merge commit `c836ecc`. `main`은 `origin/main` 대비 ahead 8.
- merge 직전 게이트 전부 재실행 exit 0: `npm ci` / `test:unit`(9/57) / `verify:repo-sources` / `typecheck` / `build` / `git diff --check` / `deps:wasm` / `build:wasm -- --debug` / `wasm-symbols` 8/8 / `cmp` 계획서.
- QA: `.omo/evidence/ultima-web/task-6/wasm-instantiate.json` (pass:true), `missing-fs.log` (failure 재현).
- 계획서 Todo 6 `[x]`, `plan.md` **6/24 = 25.0%**, 상세 `handoff.md` "Todo 6 완료 기록".
- **push 미실시** — 사용자 확인 후 `git push origin main` 필요.

### 2-2. 병렬 레인 수렴 (코드 미포함)
- exp-1 Step 7 recon / lib-1 WebGL2 패턴 / exp-3 Step 6 acceptance 추출 — 결과 위·계획서에 반영.
- fix-1 wasm 스크립트 수정, fix-2 QA evidence 생성 — reconcile 완료.

### 2-3. 이전 세션 유지
- Todo 1~5 main 완료 (5/24였음), emsdk 4.0.23 `.emsdk` 설치, Todo 3 native+NPC 대화 merge `13a3969`.

## 3. 변경한 파일 (Files changed, commit `26f7164` on `todo-06-wasm-build`)
- 신규: `scripts/deps-wasm.mjs`, `scripts/build-wasm.mjs`, `scripts/qa-wasm-instantiate.mjs`, `scripts/web-main.cpp`, `scripts/web-stub.cpp`, `tests/unit/wasm-symbols.test.ts`, `HANDOFF.md`, `plan.md`
- 수정: `package.json` (`deps:wasm`/`build:wasm`), `.omo/plans/ultima-web.md`·`docs/ULTIMA_WEB_PLAN.md` (Todo 3/6 `[x]`), `AGENTS.md` (진행 관리), `handoff.md`·`docs/NEXT_FIVE_STEPS.md`
- vendor/ 무수정. evidence는 git-ignored.

## 4. 주요 결정 (Key decisions)
- Boron은 PATH-wrapper configure/make(진정한 upstream 경로) + ELF 감지 시 hand-listed fallback.
- release log에서 `GL` substring 금지 — unit test가 `not.toContain("GL")` 검사하므로 `-sUSE_GLFW=3` argv는 evidence로 분리.
- placeholder main은 DCE로 release wasm이 작아질 수 있으므로 acceptance는 `--debug`.

## 5. 다음 할 일 (Next steps)
- [x] Step 6 커밋: `26f7164` + 문서 `db512d9`.
- [x] `main` merge (사용자 승인): `c836ecc Merge todo-06-wasm-build: single-thread wasm Boron + xu4 core`.
- [ ] **user decision**: `git push origin main` (ahead 8, push는 사용자 확인 제).
- [ ] Step 7·8 병렬 착수 (exp-1/lib-1 조사 재사용) → 9 → 10.

## 6. 주의사항 (Blockers & gotchas)
- 원본 데이터 커밋 금지 / evidence에 원문 금지 — 유지.
- `qa:native-baseline` E2E 2회차 재현성은 여전히 사용자 허가제(미실시).
- 병렬로 `build:wasm`과 `test:unit` 동시에 돌리면 wasm 디렉터리 재생성 충돌 가능 — 순차 권장.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima && git status -sb && git log --oneline -5
source .emsdk/emsdk_env.sh && npm run build:wasm -- --debug && npm run test:unit -- tests/unit/wasm-symbols.test.ts
# 공식 인계: handoff.md "Todo 6 완료 기록"
# 다음: plan.md Wave 2 — Step 7·8 병렬
```
- 운영 규칙: `AGENTS.md`, 진행률: `plan.md`.
