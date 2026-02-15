import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getStack, type TestStack } from "./setup.ts";

let s: TestStack;

beforeAll(async () => {
  s = await getStack();
}, 120_000);

afterAll(async () => {
  await s.teardown();
});

describe("service health", () => {
  test("postgres accepts connections", async () => {
    const client = s.db.pg.getPgClient();
    await client.connect();
    const res = await client.query("SELECT 1 AS ok");
    expect(res.rows[0].ok).toBe(1);
    await client.end();
  });

  test("postgrest health", async () => {
    const res = await fetch(s.postgrest.url);
    expect(res.ok).toBe(true);
  });

  test("gateway routes to postgrest", async () => {
    const res = await fetch(`${s.gateway.url}/rest/v1/`, {
      headers: { apikey: s.anonKey },
    });
    expect(res.ok).toBe(true);
  });

  test("gateway rejects missing apikey", async () => {
    const res = await fetch(`${s.gateway.url}/rest/v1/`);
    expect(res.status).toBe(401);
  });
});
