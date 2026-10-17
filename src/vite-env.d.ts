/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_AGENT_BASE: string
  readonly VITE_AGENT_API_BASE: string
  readonly VITE_LOGIN_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
