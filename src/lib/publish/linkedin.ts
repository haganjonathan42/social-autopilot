import { required } from "../env";
import type { Draft } from "../types";
import { expectOk, failed, ok, skipped, type PublishOutcome } from "./result";

const PLATFORM = "linkedin" as const;

/**
 * Publishes to LinkedIn via the UGC Posts API.
 *
 * Needs:
 *   LINKEDIN_ACCESS_TOKEN  (3-legged OAuth member token, scope w_member_social)
 *   LINKEDIN_AUTHOR_URN    e.g. "urn:li:person:AbC123"
 *                          A company page uses "urn:li:organization:12345" and
 *                          w_organization_social, which LinkedIn
 *                          only grants through the Community Management API
 *                          partner programme. Personal profile works today.
 */
export async function publishToLinkedIn(draft: Draft): Promise<PublishOutcome> {
  const text = draft.linkedin?.trim();
  if (!text) return skipped(PLATFORM, "no linkedin text on this draft");

  try {
    const token = required("LINKEDIN_ACCESS_TOKEN");
    const author = required("LINKEDIN_AUTHOR_URN");

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text },
      shareMediaCategory: "NONE",
    };

    // A link is attached as an ARTICLE so LinkedIn renders a preview card.
    if (draft.link_url) {
      shareContent.shareMediaCategory = "ARTICLE";
      shareContent.media = [
        {
          status: "READY",
          originalUrl: draft.link_url,
        },
      ];
    }

    const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    const payload = (await expectOk(response, "LinkedIn publish")) as {
      id?: string;
    };
    const postUrn = payload.id ?? response.headers.get("x-restli-id") ?? undefined;
    if (!postUrn) return failed(PLATFORM, "LinkedIn returned no post id");

    return ok(
      PLATFORM,
      postUrn,
      `https://www.linkedin.com/feed/update/${postUrn}/`,
    );
  } catch (error) {
    return failed(PLATFORM, error instanceof Error ? error.message : String(error));
  }
}
