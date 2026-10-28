// Public build-time settings. Every VITE_ value ends up in the JS bundle, so never put secrets here.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** reCAPTCHA v3 site key (public by design). Unset locally. */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** "true" turns on email features (confirm email, password reset). Must match the API's EMAIL_ENABLED. */
  readonly VITE_FEATURE_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
