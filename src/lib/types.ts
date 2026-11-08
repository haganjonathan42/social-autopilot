import type { Platform } from "./env";

export type DraftStatus =
  | "pending"
  | "approved"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "rejected";

export type DraftSource = "api" | "github" | "manual";

export interface Draft {
  id: number;
  topic: string;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  x: string | null;
  image_idea: string | null;
  image_url: string | null;
  link_url: string | null;
  scheduled_for: string | null;
  status: DraftStatus;
  source: DraftSource;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishLog {
  id: number;
  draft_id: number;
  platform: Platform | string;
  status: "ok" | "error" | "skipped";
  external_id: string | null;
  external_url: string | null;
  message: string | null;
  created_at: string;
}

/** The JSON shape accepted by POST /api/drafts and by files in /drafts. */
export interface DraftInput {
  topic: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  x?: string;
  imageIdea?: string;
  imageUrl?: string;
  linkUrl?: string;
  scheduledFor?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: Required<Pick<DraftInput, "topic">> & DraftInput;
}

const MAX_TOPIC = 300;
const MAX_BODY = 6000;
const MAX_X = 4000;

function asText(
  value: unknown,
  field: string,
  max: number,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    errors.push(`${field} is longer than ${max} characters`);
    return undefined;
  }
  return trimmed;
}

/**
 * Validates one incoming draft.
 *
 * Both intake paths (the API endpoint and the GitHub importer) run through this,
 * so a malformed draft is rejected the same way wherever it came from.
 */
export function validateDraft(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["draft must be a JSON object"] };
  }
  const input = raw as Record<string, unknown>;

  const topic = asText(input.topic, "topic", MAX_TOPIC, errors);
  if (!topic) errors.push("topic is required");

  const facebook = asText(input.facebook, "facebook", MAX_BODY, errors);
  const instagram = asText(input.instagram, "instagram", MAX_BODY, errors);
  const linkedin = asText(input.linkedin, "linkedin", MAX_BODY, errors);
  const x = asText(input.x, "x", MAX_X, errors);
  const imageIdea = asText(input.imageIdea, "imageIdea", MAX_BODY, errors);
  const imageUrl = asText(input.imageUrl, "imageUrl", 2000, errors);
  const linkUrl = asText(input.linkUrl, "linkUrl", 2000, errors);

  if (!facebook && !instagram && !linkedin && !x) {
    errors.push(
      "at least one of facebook, instagram, linkedin or x must have text",
    );
  }

  for (const [field, url] of [
    ["imageUrl", imageUrl],
    ["linkUrl", linkUrl],
  ] as const) {
    if (url && !/^https:\/\//i.test(url)) {
      errors.push(`${field} must be an https URL`);
    }
  }

  let scheduledFor: string | undefined;
  const rawSchedule = asText(input.scheduledFor, "scheduledFor", 64, errors);
  if (rawSchedule) {
    const parsed = new Date(rawSchedule);
    if (Number.isNaN(parsed.getTime())) {
      errors.push("scheduledFor must be an ISO 8601 date-time");
    } else {
      scheduledFor = parsed.toISOString();
    }
  }

  if (errors.length > 0 || !topic) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      topic,
      facebook,
      instagram,
      linkedin,
      x,
      imageIdea,
      imageUrl,
      linkUrl,
      scheduledFor,
    },
  };
}
