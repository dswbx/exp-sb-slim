import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getStack, type TestStack } from "./setup.ts";

let s: TestStack;

beforeAll(async () => {
  s = await getStack();

  // Create a test table via raw PG
  const client = s.db.pg.getPgClient();
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.todos (
      id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
      title text NOT NULL,
      done boolean DEFAULT false,
      user_id uuid
    );
    ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS anon_read ON public.todos;
    DELETE FROM public.todos;
  `);
  await client.end();
}, 120_000);

afterAll(async () => {
  await s.teardown();
});

describe("CRUD via supabase-js", () => {
  test("insert and select", async () => {
    // Use service_role to bypass RLS
    const { data: inserted, error: insertErr } = await s.supabaseAdmin
      .from("todos")
      .insert({ title: "Test todo" })
      .select()
      .single();

    expect(insertErr).toBeNull();
    expect(inserted!.title).toBe("Test todo");

    const { data: rows, error: selectErr } = await s.supabaseAdmin
      .from("todos")
      .select("*");

    expect(selectErr).toBeNull();
    expect(rows!.length).toBeGreaterThan(0);
  });

  test("update", async () => {
    const { data } = await s.supabaseAdmin
      .from("todos")
      .update({ done: true })
      .eq("title", "Test todo")
      .select()
      .single();

    expect(data!.done).toBe(true);
  });

  test("delete", async () => {
    const { error } = await s.supabaseAdmin
      .from("todos")
      .delete()
      .eq("title", "Test todo");

    expect(error).toBeNull();
  });
});

describe("Auth", () => {
  const email = `test-${Date.now()}@example.com`;
  const password = "testpassword123";

  test("signup", async () => {
    const { data, error } = await s.supabase.auth.signUp({ email, password });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(email);
  });

  test("signin", async () => {
    const { data, error } = await s.supabase.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();

    // Sign out so auth session doesn't interfere with subsequent anon-key tests
    await s.supabase.auth.signOut();
  });
});

describe("RLS", () => {
  test("anon blocked without policy", async () => {
    const { data } = await s.supabase
      .from("todos")
      .select("*");

    // PostgREST returns empty array when RLS blocks
    expect(data).toEqual([]);
  });

  test("anon allowed with policy", async () => {
    const client = s.db.pg.getPgClient();
    await client.connect();
    await client.query(`
      CREATE POLICY anon_read ON public.todos FOR SELECT TO anon USING (true);
    `);
    await client.end();

    // Insert a row as admin
    await s.supabaseAdmin.from("todos").insert({ title: "Visible" });

    // Notify PostgREST of schema change
    const adminClient = s.db.pg.getPgClient();
    await adminClient.connect();
    await adminClient.query("NOTIFY pgrst, 'reload schema'");
    await adminClient.end();

    await Bun.sleep(1000);

    const { data } = await s.supabase.from("todos").select("*");
    expect(data!.length).toBeGreaterThan(0);

    // Cleanup
    const cleanClient = s.db.pg.getPgClient();
    await cleanClient.connect();
    await cleanClient.query("DROP POLICY anon_read ON public.todos");
    await cleanClient.end();
    await s.supabaseAdmin.from("todos").delete().eq("title", "Visible");
  });
});
