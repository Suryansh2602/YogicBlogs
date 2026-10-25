// Public build-time settings. Every VITE_ value ends up in the JS bundle, so never put secrets here.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** reCAPTCHA v3 site key (public by design). Unset locally. */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
