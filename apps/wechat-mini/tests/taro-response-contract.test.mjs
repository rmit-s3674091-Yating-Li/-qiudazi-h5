import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseTaroRequestResponse,
  parseTaroUploadResponse,
} from "../src/core/taro-response-contract.ts";

const request = (statusCode, data = { ok: true }) => ({ statusCode, data });
const upload = (statusCode, data) => ({ statusCode, data });

test("valid request and upload envelopes preserve transport-only outcomes", () => {
  assert.deepEqual(parseTaroRequestResponse(request(200)), {
    status: 200,
    data: { ok: true },
  });
  assert.deepEqual(parseTaroRequestResponse(request(401, { error: true })), {
    status: 401,
    data: { error: true },
  });
  assert.deepEqual(parseTaroUploadResponse(upload(503, "retry later")), {
    status: 503,
    rawBody: "retry later",
  });
  assert.deepEqual(parseTaroUploadResponse(upload(204, "")), {
    status: 204,
    rawBody: "",
  });
});

test("invalid, ambiguous and redirect statuses fail closed", () => {
  for (const status of [
    undefined,
    null,
    "200",
    0,
    199,
    300,
    301,
    302,
    307,
    308,
    600,
    200.1,
    NaN,
    Infinity,
    -Infinity,
  ]) {
    assert.throws(
      () => parseTaroRequestResponse(request(status)),
      /^Error: INVALID_TARO_RESPONSE$/,
    );
    assert.throws(
      () => parseTaroUploadResponse(upload(status)),
      /^Error: INVALID_TARO_RESPONSE$/,
    );
  }
});

test("missing, inherited and accessor fields are rejected without invoking getters", () => {
  let reads = 0;
  const withGetter = { statusCode: 200 };
  Object.defineProperty(withGetter, "data", {
    enumerable: true,
    get() {
      reads++;
      throw new Error("SECRET_VALUE_SHOULD_NOT_BE_READ");
    },
  });
  assert.throws(
    () => parseTaroRequestResponse(withGetter),
    /^Error: INVALID_TARO_RESPONSE$/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => parseTaroUploadResponse(withGetter),
    /^Error: INVALID_TARO_RESPONSE$/,
  );
  assert.equal(reads, 0);
  const inherited = Object.create({ statusCode: 200 });
  inherited.data = "{}";
  assert.throws(
    () => parseTaroUploadResponse(inherited),
    /^Error: INVALID_TARO_RESPONSE$/,
  );
  assert.throws(
    () => parseTaroRequestResponse({ statusCode: 200 }),
    /^Error: INVALID_TARO_RESPONSE$/,
  );
});

test("revoked Proxy and primitives fail closed without leaking trap messages", () => {
  const { proxy, revoke } = Proxy.revocable(request(200), {});
  revoke();
  for (const value of [proxy, null, 0, "oops", []]) {
    assert.throws(
      () => parseTaroRequestResponse(value),
      /^Error: INVALID_TARO_RESPONSE$/,
    );
  }
});

test("upload requires a bounded string body and does not stringify objects", () => {
  let called = 0;
  const malicious = {
    toString() {
      called++;
      return "credential";
    },
  };
  for (const value of [null, undefined, malicious, 123, new Uint8Array(2)]) {
    assert.throws(
      () => parseTaroUploadResponse(upload(200, value)),
      /^Error: INVALID_TARO_RESPONSE$/,
    );
  }
  assert.equal(called, 0);
  assert.equal(
    parseTaroUploadResponse(upload(200, "x".repeat(256 * 1024))).rawBody.length,
    256 * 1024,
  );
  assert.throws(
    () => parseTaroUploadResponse(upload(200, "x".repeat(256 * 1024 + 1))),
    /^Error: INVALID_TARO_RESPONSE$/,
  );
});

test("the Taro adapter uses both response guards, not raw statusCode/data", () => {
  const source = readFileSync(
    new URL("../src/platform/taro-ports.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /return parseTaroRequestResponse<T>\(result\);/);
  assert.match(source, /return parseTaroUploadResponse\(response\);/);
  assert.doesNotMatch(
    source,
    /return \{ status: (result|response)\.statusCode/,
  );
  assert.equal((source.match(/guardedNetworkCall\(/g) ?? []).length, 2);
});

test("upload body limit measures UTF-8 bytes, not JavaScript UTF-16 code units", () => {
  const limit = 256 * 1024;
  const cases = [
    ["é".repeat(limit / 2), true],
    ["é".repeat(limit / 2 + 1), false],
    ["中".repeat(Math.floor(limit / 3)), true],
    ["中".repeat(Math.floor(limit / 3) + 1), false],
    ["😀".repeat(limit / 4), true],
    ["😀".repeat(limit / 4 + 1), false],
    ["abc中😀", true],
  ];
  for (const [body, allowed] of cases) {
    assert.equal(Buffer.byteLength(body, "utf8") <= limit, allowed);
    if (allowed) {
      assert.equal(parseTaroUploadResponse(upload(200, body)).rawBody, body);
    } else {
      assert.throws(
        () => parseTaroUploadResponse(upload(200, body)),
        /^Error: INVALID_TARO_RESPONSE$/,
      );
    }
  }
});

test("upload rejects malformed UTF-16 surrogate sequences without leaking bodies", () => {
  for (const body of [
    "\uD800",
    "\uDC00",
    "a\uD800b",
    "\uD800\uD800",
    "\uDC00\uD800",
  ]) {
    assert.throws(
      () => parseTaroUploadResponse(upload(200, body)),
      /^Error: INVALID_TARO_RESPONSE$/,
    );
  }
  assert.equal(
    parseTaroUploadResponse(upload(200, "a\uD83D\uDE00b")).rawBody,
    "a\uD83D\uDE00b",
  );
});
