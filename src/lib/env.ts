/**
 * Central place for reading configuration.
 *
 * Every secret lives in a Vercel environment variable. Nothing here holds a
 * default value for a credential: a missing credential must surface as a clear
 * error at the point of use, never as a silent fallback.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Platforms the app knows how to adapt text for and publish to. */
export const PLATFORMS = ["facebook", "instagram", "linkedin", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * A platform is enabled only when it is listed in ENABLED_PLATFORMS.
 * This is what lets you go live with Facebook alone and switch the others on
 * later, without touching code.
 *
 * Example: ENABLED_PLATFORMS="facebook,instagram"
 */
export function enabledPlatforms(): Platform[] {
  const raw = process.env.ENABLED_PLATFORMS;
  if (!raw) return ["facebook"];
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return PLATFORMS.filter((p) => wanted.includes(p));
}

export function isPlatformEnabled(platform: Platform): boolean {
  return enabledPlatforms().includes(platform);
}

/** Graph API version used for both Facebook and Instagram calls. */
export const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
