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

/**
 * Graph API version used for both Facebook and Instagram calls.
 *
 * Meta retires a version roughly two years after its successor ships, and a
 * call to a retired version fails. v25.0 (February 2026) runs until July 2028.
 * v26.0 is the newer one if you want a longer runway; check the changelog at
 * https://developers.facebook.com/docs/graph-api/changelog/versions before
 * changing it, and override with META_GRAPH_VERSION rather than editing here.
 */
export const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
