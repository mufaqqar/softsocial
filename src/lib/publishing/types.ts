import type { SocialPlatform } from "@/generated/prisma/enums";

/**
 * The provider-neutral contract for publishing one post to one profile.
 *
 * Everything a provider needs is passed in explicitly. Nothing here reads the
 * database or the environment on its own, which keeps the retry decision
 * (master.txt 3.9) in the worker rather than inside a client, and makes a
 * provider testable with a literal object.
 */

export type PublishMedia = {
  /** Absolute, publicly fetchable or streamable bytes for this attachment. */
  bytes: () => Promise<Uint8Array>;
  contentType: string;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  /** Our own media id, for logs. */
  mediaId: string;
};

export type PublishRequest = {
  platform: SocialPlatform;
  /** Facebook Page id or LinkedIn organization id. */
  providerProfileId: string;
  /** The text body: platform variant if present, else the shared copy. */
  text: string;
  media: PublishMedia[];
  /**
   * Short-lived credential for this call. Page tokens from Meta and LinkedIn
   * member tokens are both obtained per attempt by the caller, so a long delay
   * in the queue cannot leave us publishing with something already expired.
   */
  accessToken: string;
  /** Post id, used only to tag logs. */
  postId: string;
};

export type PublishOutcome = {
  /** The provider's own id for the created post. */
  providerPostId: string;
  /** A human-facing permalink when the provider gives us one. */
  providerUrl: string | null;
  /** Raw response, stored truncated for troubleshooting. */
  raw: unknown;
};

export type PublishCapability = {
  text: boolean;
  singleImage: boolean;
  video: boolean;
  multiImage: boolean;
  note?: string;
};

/**
 * What each provider can actually do, surfaced in the UI so nobody schedules a
 * video to a provider that will reject it. master.txt 3.16: never fake it.
 */
export const PUBLISH_CAPABILITIES: Record<SocialPlatform, PublishCapability> = {
  FACEBOOK: {
    text: true,
    singleImage: true,
    // Needs the extra `publish_video` permission and a two-step resumable
    // upload; not wired in this phase.
    video: false,
    multiImage: false,
    note: "Text and one image are published automatically. Video and multi-image posts stay manual.",
  },
  LINKEDIN: {
    text: true,
    singleImage: true,
    video: false,
    multiImage: false,
    note: "Text and one image are published automatically to the organisation. Video and carousel posts stay manual.",
  },
};
