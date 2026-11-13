import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

const TOKEN = "123456:test-bot-token";
const USER = "00000000-0000-4000-8000-0000000000aa";

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  createLoginTokenHash: vi.fn(),
  getClaims: vi.fn(),
  verifyOtp: vi.fn(),
  isDemo: false,
}));

vi.mock("~/lib/env.server", () => ({
  getEnv: () => ({ isDemo: mocks.isDemo, TELEGRAM_BOT_TOKEN: TOKEN }),
}));
vi.mock("~/lib/supabase-admin.server", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("~/lib/supabase.server", () => ({
  createSupabase: () => ({
    supabase: { auth: { getClaims: mocks.getClaims, verifyOtp: mocks.verifyOtp } },
    headers: new Headers({ "Set-Cookie": "sb=session" }),
  }),
}));
vi.mock("~/features/drawer/drawer.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/features/drawer/drawer.server")>()),
  createDrawerRepo: () => ({ findLinkByTelegramUser: mocks.findLink }),
  createLoginTokenHash: mocks.createLoginTokenHash,
}));

const { loader } = await import("./auth.telegram");

function signedQuery(fields: Record<string, string>): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const FRESH = () => signedQuery({ id: "111", first_name: "A", auth_date: String(Math.floor(Date.now() / 1000)) });

async function run(path: string, query: string): Promise<Response> {
  const request = new Request(`https://drawer.example.com/auth/telegram${path}?${query}`);
  const splat = path.replace(/^\//, "");
  try {
    await loader({ request, params: { "*": splat }, context: {} } as never);
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
  throw new Error("loader did not redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDemo = false;
  mocks.findLink.mockResolvedValue({ userId: USER, chatId: 111, blocked: false });
  mocks.createLoginTokenHash.mockResolvedValue("hashed-token");
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

describe("/auth/telegram", () => {
  test("a linked Telegram user is signed in and lands on the named page", async () => {
    const response = await run("/settings", FRESH());

    expect(response.headers.get("Location")).toBe("/drawer/settings");
    expect(response.headers.get("Set-Cookie")).toContain("sb=session");
    expect(mocks.findLink).toHaveBeenCalledWith(111);
    expect(mocks.createLoginTokenHash).toHaveBeenCalledWith({}, USER);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hashed-token" });
  });

  test("a bad signature signs nobody in", async () => {
    const response = await run("", FRESH().replace(/hash=[0-9a-f]+/, `hash=${"0".repeat(64)}`));

    expect(response.headers.get("Location")).toBe("/drawer");
    expect(mocks.findLink).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  test("declined (no Telegram data) or unlinked Telegram account just opens the page", async () => {
    expect((await run("", "")).headers.get("Location")).toBe("/drawer");
    mocks.findLink.mockResolvedValue(null);
    expect((await run("", FRESH())).headers.get("Location")).toBe("/drawer");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  test("never switches away from an account already signed in on this browser", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "someone-else" } }, error: null });

    const response = await run("", FRESH());

    expect(response.headers.get("Location")).toBe("/drawer");
    expect(mocks.createLoginTokenHash).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  test("an unknown page falls back to the bookshelf (no open redirect)", async () => {
    const response = await run("/..%2F..%2Fevil.example", FRESH());
    expect(response.headers.get("Location")).toBe("/drawer");
  });

  test("a failed sign-in sends the user to the login page", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await run("", FRESH())).headers.get("Location")).toBe("/login");
  });

  test("demo mode has no real Telegram: just opens the page", async () => {
    mocks.isDemo = true;
    expect((await run("/settings", FRESH())).headers.get("Location")).toBe("/drawer/settings");
    expect(mocks.findLink).not.toHaveBeenCalled();
  });
});
