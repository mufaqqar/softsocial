import { describe, expect, it } from "vitest";

import { redisConfigFromEnv } from "@/lib/queue/connection";

describe("redisConfigFromEnv", () => {
  it("throws a helpful error when REDIS_URL is missing", () => {
    expect(() => redisConfigFromEnv({})).toThrow(/REDIS_URL/);
  });

  it("parses a plain redis URL", () => {
    const config = redisConfigFromEnv({ REDIS_URL: "redis://localhost:6379" });

    expect(config).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      tls: false,
      db: 0,
    });
  });

  it("defaults to port 6379", () => {
    expect(redisConfigFromEnv({ REDIS_URL: "redis://cache.internal" }).port).toBe(6379);
  });

  it("parses credentials and enables TLS for rediss", () => {
    const config = redisConfigFromEnv({
      REDIS_URL: "rediss://default:pa%40ss@eu1.upstash.io:6380",
    });

    expect(config.host).toBe("eu1.upstash.io");
    expect(config.port).toBe(6380);
    expect(config.username).toBe("default");
    expect(config.password).toBe("pa@ss");
    expect(config.tls).toBe(true);
  });

  it("reads the database index from the path", () => {
    expect(redisConfigFromEnv({ REDIS_URL: "redis://localhost:6379/3" }).db).toBe(3);
    expect(redisConfigFromEnv({ REDIS_URL: "redis://localhost:6379" }).db).toBe(0);
  });

  it("rejects an unsupported scheme instead of connecting to nothing", () => {
    expect(() => redisConfigFromEnv({ REDIS_URL: "http://localhost:6379" })).toThrow(/redis:/);
  });

  it("rejects a malformed URL", () => {
    expect(() => redisConfigFromEnv({ REDIS_URL: "not a url" })).toThrow(/valid URL/);
  });
});
