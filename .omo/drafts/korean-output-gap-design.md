# 한국어 출력 gap — 조사 결과와 설계안 (2026-09-27, 읽기 전용 조사)

이 문서는 읽기 전용 조사 결과다. 소스 수정·빌드·e2e 실행은 하지 않았다. 아래 file:line은 전부 직접 열어서 확인했다. 추론은 "확인 필요"로 표시했다.

## 결론 (한 줄)
실제 엔진의 텍스트는 **전부 캔버스 비트맵 폰트로만** 그려진다. 번역 lookup은 wasm에 링크조차 안 돼 있다. 실제 엔진 텍스트가 셸로 나가는 경로(bridge 이벤트)도 없다. 그래서 4411/4411 corpus는 실제 화면에 한 글자도 나타날 수 없다. `korean-progression.spec.ts`는 번역 테이블이 존재하는지만 검사한다.

## 1. i18n lookup은 wasm에 들어 있지 않다
- `scripts/build-wasm.mjs`의 소스 목록에는 `native/i18n/u4_i18n_lookup.c`도 `u4_i18n_table.inc`도 없다. grep 결과 wasm 쪽에서 i18n과 관련된 항목은 0개다. 목록에서 비슷한 것은 `src/web_bridge.cpp`(251행)뿐이다.
- `u4_i18n_lookup`을 호출하는 곳은 `native/tests/localization_boundaries_test.c`(47~62행) 하나다. `vendor/xu4/src` 전체에서 `u4_i18n`이나 `ko-overlay`를 참조하는 코드는 0건이다.
- `screenMessage`(`vendor/xu4/src/screen.cpp:399`)는 `vsnprintf` 다음 `screenMessageN`(449행)을 거쳐 `screenShowChar`로 캔버스에 직접 그린다. 번역을 끼울 지점이 없다.
- `screenMessage`는 `c`가 없으면(인트로) 곧바로 return한다(403행). 인트로 텍스트는 `intro.cpp`의 TextView/menuArea라는 별도 경로로 그려진다.

## 2. 실제 엔진은 bridge 이벤트를 보내지 않는다
- `vendor/xu4/src/web_bridge.{h,cpp}`는 **입력 방향 전용**이다. `u4_web_enqueue_key`, `submit_text`, `drain_keys`, `begin/end_prompt`, `take_text`, `frame_yield`만 있고, JS를 호출하는 EM_JS/EM_ASM은 0개다.
- 엔진→JS 호출은 세 가지뿐이다. `sound_web.cpp`의 EM_JS(`Module.u4Audio`)와 Todo 18에서 추가한 `event.cpp`의 `u4_web_text_prompt_opened/closed`(33~36행, `Module.u4TextPrompt`)다.
- JS 쪽에서 `type:"message"`를 만드는 곳은 `src/engine/startup.ts:162`의 UI 안내문 하나다. 여기에 셸 자체 안내문이 더해질 뿐, 엔진 텍스트는 들어오지 않는다. 그래서 `#dialogue-history`와 오버레이에는 게임 텍스트가 한 번도 들어온 적이 없다. Step 11·12·14의 "실제 게임에서 확인" ⬜와 일치한다.

## 3. `korean-progression.spec.ts`가 실제로 검사하는 것
- 파일 헤더(8~12행)에 스스로 적혀 있다: "real engine text is rasterized directly into the WebGL canvas… this spec does not pretend to read canvas prose".
- 대표 id 6개(17~24행)를 `window.ultimaI18n.resolve`로 조회한다. 결과에 한글이 있고 placeholder가 일치하는지만 본다(86~96행). 이것은 정적 테이블 검사다.
- 실제 엔진 쪽 검사는 다음이 전부다: 부팅, 캐릭터 생성 후 저장, Journey Onward 뒤 캔버스 스크린샷이 달라졌는지(115~121행). 실제 게임 화면이 한국어인지는 전혀 검사하지 않는다.

## 4. corpus 키 구조와 런타임 매핑 가능성
- **TLK**(`locales/ko/tlk.json`, 3072개): 키는 `MAP:npcIndex:field`다(`scripts/lib/tlk-codec.mjs:48`의 `tlkKey`). field는 `name/pronoun/look/job/health/response1/response2/question/yes/no/topic1/topic2`이고, npcIndex는 레코드 번호 0~15다(`i18n-inventory.mjs:193~210`).
  - `sourceHash`는 원본 TLK 필드 **raw bytes**의 sha256이다. 저장소에는 영어 원문이 없다. 올바른 설계이고, 원본 데이터를 커밋하지 말라는 규칙도 지킨다.
  - 런타임에서는 `U4Talk_load`가 문자열을 변형한다(`trimKeyword`, look 재배치, `discourse_tlk.cpp:244~323`). 그래서 **해시로 역매핑하는 방식은 깨질 수 있다.** **구조 id(맵, conv, field)로 매핑하는 방식이 안전하다.**
  - 원본 데이터 경로에서는 `discourse_load`가 `moonglow.tlk` 같은 파일을 받는다(`maps.b:108`의 `tlk_fname`, `discourse.cpp:79~97`). 이때 id의 `MAP` 부분은 리소스 파일명을 대문자로 바꾼 것이다(`moonglow.tlk`→`MOONGLOW`). 다만 파일명을 `Discourse` 구조체에 저장해야 한다(지금은 저장하지 않음). `conv`(= `discourse_run`의 entry)는 레코드 번호와 같다. 단, `U4Talk_load`가 실패하면 로딩이 거기서 멈춘다(`break`, 92~95행). 그래서 쓰이지 않는 레코드가 중간에 끼어 있으면 번호가 어긋날 수 있다. **확인 필요**: 인벤토리의 `isUnusedRecord` 분포.
  - 응답 문자열은 `U4Talk_dialogue`(340~397행)가 field별로 돌려준다. field 정보가 바로 그 자리에 있다.
- **대화 틀 문장은 corpus에 없다.** `discourse_tlk.cpp`의 `"\nYou meet %s\n"`(79행), `"%s says: I am %s\n"`(134행), `"You see %s"`, `"That I cannot\nhelp thee with."`, `"Yes or no!"`가 해당한다. 인벤토리 스캔 목록(`i18n-inventory.mjs:56~69`)에 `discourse_tlk.cpp`, `discourse_castle.cpp`, `shrine.cpp`가 없고, `ui.json`의 sourceFile에도 없다. **4411/4411은 인벤토리 기준의 완성도이고 화면 전체 기준이 아니다.**
- **ui**(`ui.json`, 369개, 키 `ui:<file>:<n>`): `sourceHash`는 unescape한 C 리터럴의 sha256이다(`cpp-strings.mjs`의 `unescapeCLiteral`에서 `sourceHash(literal.text)`까지). 이것은 `screenMessage(fmt, …)`가 받는 **`fmt` 바이트와 같다.**
  - 그래서 `fmt`를 **포맷하기 전에** 해시하면 ui 항목으로 역매핑할 수 있다. 바이트 일치 여부는 **확인 필요**.
  - 이 영어 원문은 vendor 소스이므로 공개되어 있고, 배포해도 개인정보 문제가 없다.
  - 다만 `%s` 인자(NPC 이름 등)도 따로 번역해야 한다. `DSTRING(DS_PRONOUN)`→`MOONGLOW:n:pronoun`처럼 인자별로 따로 매핑해야 해서 조합이 복잡하다.

## 5. 가장 작은 end-to-end 설계
1. **네이티브에서 이벤트 내보내기**(`__EMSCRIPTEN__`만, Todo 18의 `u4TextPrompt` 패턴을 그대로 따름). EM_JS `u4_web_text(kind, id, text)`를 두고 `Module.u4Text && …`로 가드한다.
   - (a) `U4Talk_dialogue`가 반환하는 지점에서 `(mapName, conv, field)` id와 영어 원문을 보낸다.
   - (b) `runTalkDialogue`의 틀 문장은 새 `ui:discourse_tlk:<n>` id로 보낸다. 인자 id 목록도 함께 보낸다.
   - 우선은 NPC 대화만 한다. `screenMessage` 전체를 fmt 해시로 매핑하는 일은 2단계로 미룬다.
2. **JS**: `startup.ts`가 callMain 전에 `module.u4Text`를 붙인다. 셸이 `resolveDisplayText(id, fallback)`로 번역해 `dispatch({type:"message"})`로 `#dialogue-history`에 붙인다. 필요한 것은 이미 다 있다: textContent 전용 렌더, 조각 조합(`PanelState`), 대기(pause).
3. **인벤토리 확장**: `discourse_tlk.cpp`, `discourse_castle.cpp`, `shrine.cpp` 등의 틀 문장을 `i18n-inventory` 대상에 넣고 번역을 추가한다. strict check를 유지한다.
4. **캔버스**: 영어는 계속 캔버스에 그려진다. 한국어는 DOM 패널에 나온다. 이렇게 두 곳에 표시하는 것을 받아들일지, 대화 중 캔버스 메시지 영역을 가릴지는 **제품 결정**이다. 권장: 1차는 두 곳 모두 표시하고, F3 수동 QA에서 판단한다.

### 위험
- EM_JS 호출은 동기이고 Asyncify suspend를 일으키지 않는다. 그래서 Todo 13의 중첩 suspend 문제와 무관하다. 다만 `dispatch`가 절대 네이티브 코드로 다시 들어가지 않는지 확인해야 한다.
- conv와 레코드 번호가 어긋날 수 있다(4절).
- `%s` 인자 조합 번역은 어순이 다르다. placeholder 순서 규칙과 함께 검증해야 한다.
- 성능: NPC 대화는 빈도가 낮아 무시할 수준이다. `screenMessage` 전체로 넓히면 매 조각마다 sha256을 계산하게 되므로 C에서 FNV 같은 가벼운 해시와 생성 테이블이 필요하다(2단계).
- Lord British/Hawkwind(`avatar.exe:*`, `discourse_castle.cpp`), Boron 대화(`DISCOURSE_XU4_TALK`), 인트로 TextView는 경로가 각각 따로라서 별도 작업이다.

## 6. 새 Todo 제안(사용자 결정 필요 — 분모 25→26)
**Todo 22. 실제 엔진 NPC 대화를 한국어로 DOM 패널에 표시**
- 범위: U4 TLK NPC 대화(응답 필드 + 틀 문장). Lord British, 상점, 인트로, 상태창은 후속 작업(22.x 또는 별도 Todo)으로 넘긴다.
- Acceptance:
  - (1) 실제 `ultima4.zip`으로 Moonglow Calabrini와 대화한다. `name`, `health`, 한국어 alias `건강`, `bye` 각각에 대해 `#dialogue-history`에 해당 `MOONGLOW:<n>:*` 번역이 한글로 나타난다.
  - (2) 틀 문장("You meet…", "…says: I am…")도 한국어로 나온다.
  - (3) 영어 게임 로직과 keyword 비교는 변하지 않는다(Todo 13 e2e 회귀 통과).
  - (4) 원본 영어 TLK 텍스트가 dist, 로그, 콘솔에 나오지 않는다(`audit:dist`와 콘솔 노이즈 검사).
  - (5) `npm run i18n:check -- --strict` 통과(틀 문장 포함).
- RED e2e 아이디어: `tests/e2e/korean-npc-output.spec.ts`. `korean-npc-alias`의 `approachNpc()`를 재사용한다. `health` 입력 뒤 `#dialogue-history` 텍스트가 `/\p{Script=Hangul}/u`를 만족하고 `MOONGLOW:<calabrini>:health`의 번역을 포함하는지 확인한다. 현재 코드에서는 패널에 엔진 텍스트가 0이므로 확실히 RED가 된다.
- Unit: id 조립(`mapName`, conv, field), 틀 문장과 인자 번역 조합, `startup.ts`의 `u4Text` 부착을 테스트한다. 네이티브 쪽은 `wasm-symbols` 테스트에 EM_JS 존재 검사를 추가한다.
