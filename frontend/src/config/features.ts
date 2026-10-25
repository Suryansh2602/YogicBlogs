// Feature switches set at build time. Each must match the API's own setting.

/**
 * Email features: confirm email, forgot/reset password. Off until an email provider is set up
 * (VITE_FEATURE_EMAIL=true here and EMAIL_ENABLED=true on the API turn them on). While off, sign-up
 * signs people in straight away and the email pages and links are hidden.
 */
export const emailEnabled = () => import.meta.env.VITE_FEATURE_EMAIL === 'true';
