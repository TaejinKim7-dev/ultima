# HANDOFF
작성 시각: 2026-09-26 22:55 KST — Todo 15 거의 완료 (tlk.json 15/16 마을, YEW만 남음), 16/25 유지

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 사용자 지시: "tlk.json 계속 번역해줘" → 이어서 "지금까지 작업한거 plan.md, handoff.md에 저장해" (중단 지시, 번역 계속이 아니라 저장을 요청).

## 2. 현재 상태 (Current state)
- **승인 기준 16/25 = 64.0%** (변화 없음, Todo 15는 아직 미완료라 🟡).
- main: `368bfd0`까지 push 완료.
- **Todo 15 거의 완료**: `locales/ko/*.json` pending 4402건 중 **4242건 완료, 160건만 남음**(전부 `tlk.json`의 YEW 마을).
  - `glossary.json` 18/18 ✅, `ui.json` 369/369 ✅, `binary.json` 214/214 ✅, `module.json` 729/729 ✅.
  - `tlk.json` **2912/3072** (topic1/topic2 pass-through 512건 + 15/16 마을: BRITAIN·COVE·DEN·EMPATH·JHELOM·LCB·LYCAEUM·MAGINCIA·MINOC·MOONGLOW·PAWS·SERPENT·SKARA·TRINSIC·VESPER).
  - **YEW(정의 테마, 160건)만 남음 — 번역은 이미 끝났고 `.omo/drafts/tlk-yew-translation-draft.json`에 저장돼 있음. 적용만 하면 됨.**
- `npm run i18n:check`(비엄격): 4411 entries, **160 pending**. `--strict`는 아직 실패(YEW 적용 전까지 의도됨).
- 최종 게이트 전부 exit 0(매 마을 커밋 전): unit 21/259 · typecheck · build · diff-check.

## 3. 다음 할 일 — 정확히 이렇게 하면 됨 (Next steps, 재개 시 최우선)
1. **YEW 적용** (번역 다 되어 있음, 새로 번역할 필요 없음):
   ```bash
   cd /home/taejin/ultima
   cat > /tmp/apply-translations.mjs <<'EOF'
   import { resolve } from "node:path"
   import { readFileSync } from "node:fs"
   import { loadSchemaFile, saveSchemaFile } from "/home/taejin/ultima/scripts/lib/schema-io.mjs"
   const [fileId, translationsPath] = process.argv.slice(2)
   const repoRoot = "/home/taejin/ultima"
   const schemaPath = resolve(repoRoot, "locales/ko", `${fileId}.json`)
   const data = loadSchemaFile(schemaPath, fileId)
   const translations = JSON.parse(readFileSync(resolve(translationsPath), "utf8"))
   let applied = 0
   for (const [key, translation] of Object.entries(translations)) {
     if (!(key in data.entries)) continue
     data.entries[key].translation = translation
     data.entries[key].status = "ready"
     applied++
   }
   saveSchemaFile(schemaPath, data)
   console.log(`applied ${applied} translations to ${fileId}.json`)
   EOF
   node /tmp/apply-translations.mjs tlk .omo/drafts/tlk-yew-translation-draft.json
   npm run i18n:check   # 반드시 "0 still pending" 확인
   ```
2. `npm run i18n:check -- --strict` → GREEN 확인 (Todo 15 승인 기준의 절반).
3. `npm run test:unit`(259/259 무회귀)·`typecheck`·`build`·`git diff --check` 확인 후 커밋+push.
4. `.omo/drafts/tlk-yew-translation-draft.json`은 이제 쓸모없어졌으니 삭제하는 게 깔끔함(선택).
5. **Todo 15의 나머지 승인 기준**: `tests/e2e/korean-progression.spec.ts`(아직 미작성) — intro 화면·마을 NPC 1곳과의 대화·로드 브리티시/호크윈드·신단 또는 코덱스 답변 샘플 1개·저장/로드 UI, 전부 실제 한국어 표시로 커버해야 함. 이걸 다 통과해야 `plan.md`/계획서 2벌의 Todo 15 체크박스를 `[x]`로 바꾸고 17/25.
6. Todo 15 완료 후: Todo 17(QA 갭 분석 있음, wasm 재진입 버그 클래스 주의) → 18 → 19 완료 → 20 → F1~F4.

## 4. 이번 웨이브에서 배운 것 (Key decisions & gotchas)
- **`tlk.json` 구조**: `TOWN:NPC번호:필드` 키, 16마을×16NPC×12필드=3072건 정확히. `topic1`/`topic2`(512건)는 discourse 4글자 키워드 코드라 번역 불가 — pass-through.
- **일부 필드가 단일 문자 `"A"`**: 여러 NPC의 question/yes/no가 실제로 의미 없는 자리채움값(원문 자체가 그러함) — 번역하지 않고 그대로 둠. 새로 발견해도 놀라지 말 것.
- **고유명사 표기 통일**: 마을/던전/미덕 이름은 이미 binary.json·module.json에서 확정한 한국어를 그대로 재사용해야 함(새로 짓지 말 것) — 목록은 `handoff.md`의 이번 절 참고.
- **사투리 캐릭터는 사투리로**: PAWS의 스벤("그려"), VESPER의 Guard("우그, 나 힘세!") 등 원문 말투를 재현했음 — 다른 필드 번역 시에도 톤 일관성 유지.
- **키:번역 JSON은 반드시 "명시적 키" 방식**(배열-순서 zip 방식 아님) — 이전에 배열 순서 방식에서 항목 하나를 빠뜨린 적 있음. `Object.keys(번역).length`를 스키마의 pending 키 목록과 직접 대조하는 검증을 매번 거쳤음.
- **번역 스크립트(`/tmp/apply-translations.mjs`)는 세션 종료 시 사라짐** — 재개 시 위 "다음 할 일" #1의 heredoc으로 다시 만들면 됨(40줄 안팎, 아주 간단).

## 5. 막힌 부분 / 주의사항 (Blockers & gotchas, 이전 웨이브에서 이어짐)
- e2e는 `--workers=1`로 긴 스펙(save-reload, korean-npc-alias) 분리 실행 필수.
- `build/wasm-release`는 git-ignored, 새 worktree엔 `build/host/{boron,modules}`도 순서대로(`deps:host`→`build:modules`→`build:wasm`) 복사/재빌드해야 함.
- F3 수동 QA·`qa:native-baseline` 2회차(승인제) 미실시.
- GLFW 입력 재진입 버그(Todo 13에서 발견·수정)는 다른 in-game 흐름에도 잠재했을 수 있으니 Todo 17 통합 e2e에서 특히 주의.

## 6. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run i18n:check   # 160 pending (YEW) 확인부터 시작
```
- 공식 인계: `handoff.md`의 "Todo 15 계속 — tlk.json 15/16 마을 완료" 절(가장 최근). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
