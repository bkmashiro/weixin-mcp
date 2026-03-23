import test from "node:test";
import assert from "node:assert/strict";

test("weixinRequest retries once on transient network error", async () => {
  const { weixinRequest } = await import("../dist/api.js");
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("temporary network failure");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await weixinRequest("/v1/test", { hello: "world" }, "token", "https://example.com");
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("weixinRequest returns auth guidance for expired token", async () => {
  const { weixinRequest, WeixinAuthError } = await import("../dist/api.js");
  const originalFetch = global.fetch;

  global.fetch = async () =>
    new Response("expired", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });

  try {
    await assert.rejects(
      () => weixinRequest("/v1/test", {}, "token", "https://example.com"),
      (error) => {
        assert.ok(error instanceof WeixinAuthError);
        assert.match(error.message, /Run: npm run login/);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
