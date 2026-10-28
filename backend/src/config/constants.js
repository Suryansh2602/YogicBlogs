// Domain constants shared by models, validation and services.
// Stored as VARCHAR (not MySQL ENUM). The database also enforces them with CHECK constraints
// (see migrations), so adding a value means: add it here + a small migration updating the CHECK.

export const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  // Planned: SUBSCRIBER is an entitlement (not a role); PRACTITIONER later (docs/plan.md, "Later").
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
});

export const ARTICLE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

/**
 * Who may read an article's full content.
 * public: anyone; members: signed-in users (default). Subscriptions will add 'subscribers' later.
 * Anonymous visitors always get title, summary and cover so articles stay discoverable.
 */
export const ACCESS_LEVEL = Object.freeze({
  PUBLIC: 'public',
  MEMBERS: 'members',
});

export const MEDIA_KIND = Object.freeze({
  IMAGE: 'image',
  AUDIO: 'audio',
});

/** public: served directly (cover images). protected: only via short-lived signed URLs (member audio). */
export const MEDIA_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  PROTECTED: 'protected',
});

/** processing: being cleaned/converted; failed: rejected after upload (failure_reason has a safe code). */
export const MEDIA_STATUS = Object.freeze({
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
});

/** Where a media file lives. local = the server's disk (UPLOAD_DIR); r2 = Cloudflare R2 (later). */
export const STORAGE_BACKEND = Object.freeze({
  LOCAL: 'local',
  R2: 'r2',
});

/** Image renditions the pipeline produces (WebP widths, px). */
export const IMAGE_WIDTHS = Object.freeze([480, 960, 1600]);

export const OAUTH_PROVIDERS = Object.freeze({
  GOOGLE: 'google',
});

export const AUTH_TOKEN_PURPOSE = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  EMAIL_CHANGE: 'email_change',
});

/** Consents recorded with the document version accepted (DPDP Act 2023). */
export const CONSENT_KIND = Object.freeze({
  TERMS: 'terms',
  PRIVACY: 'privacy',
  MARKETING: 'marketing',
});

// Anchored, no nested quantifiers: linear-time, not vulnerable to ReDoS.
// eslint-disable-next-line security/detect-unsafe-regex
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
