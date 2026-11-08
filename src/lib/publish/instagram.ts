import { GRAPH_API_VERSION, required } from "../env";
import type { Draft } from "../types";
import { expectOk, failed, ok, skipped, type PublishOutcome } from "./result";

const PLATFORM = "instagram" as const;

/**
 * Publishes to an Instagram Business account via the Meta Graph API.
 *
 * Needs:
 *   INSTAGRAM_USER_ID               (the IG Business account id, not the handle)
 *   INSTAGRAM_ACCESS_TOKEN          (falls back to FACEBOOK_PAGE_ACCESS_TOKEN,
 *                                    which is usually the same token)
 *
 * Instagram has no text-only post type: a draft without an image_url cannot be
 * published and is recorded as skipped rather than failed, so it is clear the
 * draft is incomplete rather than the integration broken.
 */
export async function publishToInstagram(draft: Draft): Promise<PublishOutcome> {
  const caption = draft.instagram?.trim();
  if (!caption) return skipped(PLATFORM, "no instagram text on this draft");
  if (!draft.image_url) {
    return skipped(
      PLATFORM,
      "Instagram needs an image: set imageUrl on the draft (a public https URL)",
    );
  }

  try {
    const userId = required("INSTAGRAM_USER_ID");
    const token =
      process.env.INSTAGRAM_ACCESS_TOKEN ||
      required("FACEBOOK_PAGE_ACCESS_TOKEN");
    const base = `https://graph.facebook.com/${GRAPH_API_VERSION}/${userId}`;

    // Step 1: upload the image into a media container.
    const containerBody = new URLSearchParams({
      image_url: draft.image_url,
      caption: draft.link_url ? `${caption}\n\n${draft.link_url}` : caption,
      access_token: token,
    });
    const containerResponse = await fetch(`${base}/media`, {
      method: "POST",
      body: containerBody,
    });
    const container = (await expectOk(
      containerResponse,
      "Instagram media container",
    )) as { id?: string };
    if (!container.id) {
      return failed(PLATFORM, "Instagram returned no media container id");
    }

    // Step 2: publish the container.
    const publishResponse = await fetch(`${base}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: token,
      }),
    });
    const published = (await expectOk(
      publishResponse,
      "Instagram publish",
    )) as { id?: string };
    if (!published.id) {
      return failed(PLATFORM, "Instagram returned no media id");
    }

    // The media id is not a shortcode, so ask the API for the real permalink.
    // A failure here must not turn a successful post into an error.
    let permalink: string | undefined;
    try {
      const linkResponse = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${published.id}` +
          `?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      if (linkResponse.ok) {
        const data = (await linkResponse.json()) as { permalink?: string };
        permalink = data.permalink;
      }
    } catch {
      // Keep the post; the dashboard simply shows no link.
    }

    return ok(PLATFORM, published.id, permalink);
  } catch (error) {
    return failed(PLATFORM, error instanceof Error ? error.message : String(error));
  }
}
