/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_TG?: string;
  readonly VITE_FORCE_TG_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
