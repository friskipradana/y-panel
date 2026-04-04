/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_BASE: string
  readonly VITE_AGENT_API_BASE: string
  readonly VITE_PORTAINER_BASE: string
  readonly VITE_LOGIN_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
