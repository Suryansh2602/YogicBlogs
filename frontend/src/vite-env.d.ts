// Public build-time settings. Every VITE_ value ends up in the JS bundle, so never put secrets here.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
