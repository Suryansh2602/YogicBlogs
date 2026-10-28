const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "15m" → 900000. Only the formats accepted by config/env.js (`\d+[smhd]`). */
export function durationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

export const durationToSeconds = (value) => Math.floor(durationToMs(value) / 1000);
