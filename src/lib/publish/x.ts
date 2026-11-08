import { createHmac, randomBytes } from "node:crypto";
import { optional, required } from "../env";
import type { Draft } from "../types";
import { expectOk, failed, ok, skipped, type PublishOutcome } from "./result";

const PLATFORM = "x" as const;
const TWEETS_ENDPOINT = "https://api.x.com/2/tweets";

/**
 * Builds an OAuth 1.0a user-context Authorization header.
 *
 * X's v2 POST /2/tweets accepts OAuth 1.0a, which is the only flow that works
 * from a server with no user present and no refresh cycle to run.
 */
function oauth1Header(
  method: string,
  url: string,
  credentials: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessSecret: string;
  },
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  // Percent-encoding per RFC 5849: encodeURIComponent plus the four extras.
  const enc = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );

  // The JSON body is not form-encoded, so only the oauth_* params are signed.
  const parameterString = Object.keys(params)
    .sort()
    .map((key) => `${enc(key)}=${enc(params[key])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    enc(url),
    enc(parameterString),
  ].join("&");

  const signingKey = `${enc(credentials.consumerSecret)}&${enc(
    credentials.accessSecret,
  )}`;
  const signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const headerParams: Record<string, string> = {
    ...params,
    oauth_signature: signature,
  };
  const header = Object.keys(headerParams)
    .sort()
    .map((key) => `${enc(key)}="${enc(headerParams[key])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

async function postTweet(
  text: string,
  replyToId: string | undefined,
  credentials: Parameters<typeof oauth1Header>[2],
): Promise<string> {
  const body: Record<string, unknown> = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const response = await fetch(TWEETS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: oauth1Header("POST", TWEETS_ENDPOINT, credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await expectOk(response, "X publish")) as {
    data?: { id?: string };
  };
  const id = payload.data?.id;
  if (!id) throw new Error("X returned no tweet id");
  return id;
}

/**
 * Publishes to X.
 *
 * Needs X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.
 *
 * Billing note: a post costs roughly $0.015, but a post that contains a link is
 * billed at roughly $0.20. So the main post is kept link-free and any link_url
 * goes out as a reply — one cheap post plus one expensive reply instead of an
 * expensive post, and the thread reads the same. Set X_LINK_IN_REPLY=false to
 * put the link in the post itself instead.
 */
export async function publishToX(draft: Draft): Promise<PublishOutcome> {
  const text = draft.x?.trim();
  if (!text) return skipped(PLATFORM, "no x text on this draft");

  try {
    const credentials = {
      consumerKey: required("X_API_KEY"),
      consumerSecret: required("X_API_SECRET"),
      accessToken: required("X_ACCESS_TOKEN"),
      accessSecret: required("X_ACCESS_SECRET"),
    };

    const linkInReply = optional("X_LINK_IN_REPLY") !== "false";
    const hasLink = Boolean(draft.link_url);

    const mainText =
      hasLink && !linkInReply ? `${text}\n\n${draft.link_url}` : text;

    if (mainText.length > 280) {
      return failed(
        PLATFORM,
        `post is ${mainText.length} characters, over the 280 limit`,
      );
    }

    const tweetId = await postTweet(mainText, undefined, credentials);
    const handle = optional("X_HANDLE") ?? "i";
    const url = `https://x.com/${handle}/status/${tweetId}`;

    if (hasLink && linkInReply) {
      try {
        await postTweet(draft.link_url as string, tweetId, credentials);
      } catch (error) {
        // The post went out; only the link reply failed. Say so plainly rather
        // than reporting the whole platform as failed.
        return {
          platform: PLATFORM,
          status: "ok",
          externalId: tweetId,
          externalUrl: url,
          message: `posted, but the link reply failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    return ok(PLATFORM, tweetId, url);
  } catch (error) {
    return failed(PLATFORM, error instanceof Error ? error.message : String(error));
  }
}
