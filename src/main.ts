class MissingApplicationRootError extends Error {
  constructor() {
    super("The Vite application root is missing.")
    this.name = "MissingApplicationRootError"
  }
}

const applicationRoot = document.querySelector("#app")

if (applicationRoot === null) {
  throw new MissingApplicationRootError()
}

applicationRoot.textContent = "Ultima IV 웹 포트 기반을 준비했습니다."
