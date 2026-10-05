// Todo 52 (user request 2026-10-05): the game's one-letter commands, in Korean,
// for players who have never played Ultima IV. Each entry is a button that
// sends its key to the game (src/ui/command-panel.ts). The keys are the ones
// vendor/xu4/src/game.cpp's main key handler switches on (a unit test checks
// every listed key against that source).

export interface CommandEntry {
  /** The engine key (lower-case letter). */
  readonly key: string
  /** The Korean name shown on the button. */
  readonly label: string
  /** One short line: when to use it / what follows. */
  readonly hint: string
}

export interface CommandGroup {
  readonly title: string
  readonly commands: readonly CommandEntry[]
}

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  {
    title: "자주 쓰는 것",
    commands: [
      { key: "t", label: "대화", hint: "사람 옆에서 누르고 방향을 고릅니다. 그다음 키워드를 말합니다." },
      { key: "o", label: "문 열기", hint: "열 문이 있는 방향을 고릅니다." },
      { key: "s", label: "수색", hint: "발밑에 숨은 물건이 있는지 찾습니다." },
      { key: "e", label: "들어가기", hint: "마을, 성, 던전 입구 위에서 누릅니다." },
      { key: "z", label: "능력치", hint: "파티원의 상태와 장비를 봅니다. 화면을 넘기려면 숫자 키." },
      { key: "q", label: "저장하고 끝내기", hint: "월드맵이나 던전에서만 저장됩니다." }
    ]
  },
  {
    title: "행동",
    commands: [
      { key: "a", label: "공격", hint: "공격할 방향을 고릅니다." },
      { key: "g", label: "상자 얻기", hint: "상자 위에서 누릅니다." },
      { key: "j", label: "자물쇠 따기", hint: "열쇠가 필요합니다. 방향을 고릅니다." },
      { key: "k", label: "올라가기", hint: "사다리나 던전에서 위층으로." },
      { key: "d", label: "내려가기", hint: "사다리나 던전에서 아래층으로." },
      { key: "y", label: "외치기", hint: "말이나 풍선을 타고 있을 때 속도·고도를 바꿉니다." }
    ]
  },
  {
    title: "파티와 장비",
    commands: [
      { key: "c", label: "주문 시전", hint: "파티원 번호를 고른 뒤 주문 글자를 고릅니다." },
      { key: "m", label: "재료 섞기", hint: "주문 재료를 섞어 주문을 준비합니다." },
      { key: "r", label: "무기 장착", hint: "파티원과 무기를 고릅니다." },
      { key: "w", label: "갑옷 입기", hint: "파티원과 갑옷을 고릅니다." },
      { key: "u", label: "물건 사용", hint: "가지고 있는 물건(석상, 책, 종 등)을 고릅니다." },
      { key: "n", label: "순서 바꾸기", hint: "파티원의 전투 순서를 바꿉니다." },
      { key: "i", label: "횃불 켜기", hint: "던전에서 앞을 밝힙니다." },
      { key: "h", label: "야영", hint: "쉬어서 체력을 회복합니다." }
    ]
  },
  {
    title: "탈것과 탐험",
    commands: [
      { key: "b", label: "타기", hint: "배, 말, 풍선 위에서 누릅니다." },
      { key: "x", label: "내리기", hint: "탈것에서 내립니다." },
      { key: "f", label: "대포 발사", hint: "배에서 대포를 쏩니다. 방향을 고릅니다." },
      { key: "l", label: "위치 확인", hint: "육분의로 현재 위치를 확인합니다." },
      { key: "p", label: "보석으로 보기", hint: "보석으로 주변 지도를 봅니다." },
      { key: "v", label: "소리 켜기/끄기", hint: "음악과 효과음을 켜거나 끕니다." }
    ]
  }
]

export function allCommands(): readonly CommandEntry[] {
  return COMMAND_GROUPS.flatMap((group) => group.commands)
}

export interface CommandAvailabilityState {
  readonly playing: boolean
  /** A native text/choice prompt is open: a letter would be typed into it, not run as a command. */
  readonly promptOpen: boolean
  /** A top-menu modal (ESC pause) is open. */
  readonly modal: boolean
}

export function commandAvailable(state: CommandAvailabilityState): boolean {
  return state.playing && !state.promptOpen && !state.modal
}
