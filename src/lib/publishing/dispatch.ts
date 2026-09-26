import { PublishError } from "@/lib/publishing/errors";
import { publishToFacebook } from "@/lib/publishing/meta";
import { publishToLinkedIn } from "@/lib/publishing/linkedin";
import type { PublishOutcome, PublishRequest } from "@/lib/publishing/types";

/**
 * Single entry point the worker uses, so the pipeline never branches on
 * platform itself and a new provider only has to be registered once.
 */
export async function publish(request: PublishRequest): Promise<PublishOutcome> {
  switch (request.platform) {
    case "FACEBOOK":
      return publishToFacebook(request);
    case "LINKEDIN":
      return publishToLinkedIn(request);
    default: {
      const platform: string = request.platform;
      throw new PublishError({
        kind: "PERMANENT",
        code: "UNSUPPORTED_PLATFORM",
        message: `No publisher is implemented for ${platform}. Publish this post by hand.`,
      });
    }
  }
}
