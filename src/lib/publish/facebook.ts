import { GRAPH_API_VERSION, required } from "../env";
import type { Draft } from "../types";
import { expectOk, failed, ok, skipped, type PublishOutcome } from "./result";

const PLATFORM = "facebook" as const;

/**
 * Publishes to a Facebook Page via the Meta Graph API.
 *
 * Needs:
 *   FACEBOOK_PAGE_ID
 *   FACEBOOK_PAGE_ACCESS_TOKEN  (a long-lived Page access token with
 *                                pages_manage_posts + pages_read_engagement)
 *
 * A draft with an image_url is posted as a photo with a caption; otherwise it is
 * a text post, with link_url attached as a link preview when present.
 */
export async function publishToFacebook(draft: Draft): Promise<PublishOutcome> {
  const message = draft.facebook?.trim();
  if (!message) return skipped(PLATFORM, "no facebook text on this draft");

  try {
    const pageId = required("FACEBOOK_PAGE_ID");
    const token = required("FACEBOOK_PAGE_ACCESS_TOKEN");
    const base = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}`;

    const body = new URLSearchParams({ access_token: token });
    let endpoint: string;

    if (draft.image_url) {
      endpoint = `${base}/photos`;
      body.set("url", draft.image_url);
      body.set(
        "caption",
        draft.link_url ? `${message}\n\n${draft.link_url}` : message,
      );
      body.set("published", "true");
    } else {
      endpoint = `${base}/feed`;
      body.set("message", message);
      if (draft.link_url) body.set("link", draft.link_url);
    }

    const response = await fetch(endpoint, { method: "POST", body });
    const payload = (await expectOk(response, "Facebook publish")) as {
      id?: string;
      post_id?: string;
    };

    const postId = payload.post_id ?? payload.id;
    if (!postId) {
      return failed(PLATFORM, "Facebook returned no post id");
    }
    return ok(PLATFORM, postId, `https://www.facebook.com/${postId}`);
  } catch (error) {
    return failed(PLATFORM, error instanceof Error ? error.message : String(error));
  }
}
