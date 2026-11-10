import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DemoStore } from "~/features/demo/demo-store.server";
import type { DrawerWebStore } from "./drawer-web.server";
import { loadWithConsent } from "./session.server";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const request = () => new Request("http://localhost/drawer", { headers: { Cookie: "drawer_demo_session=1" } });

let consent: ReturnType<typeof deferred<boolean>>;

beforeEach(async () => {
  vi.stubEnv("DEMO_MODE", "1");
  vi.resetModules();
  consent = deferred<boolean>();
  vi.spyOn(DemoStore.prototype, "webStoreFor").mockReturnValue({
    hasRequiredConsents: () => consent.promise,
  } as unknown as DrawerWebStore);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loadWithConsent", () => {
  test("starts loading before the consent check finishes", async () => {
    const load = vi.fn(async () => "page data");

    const result = loadWithConsent(request(), load);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    consent.resolve(true);

    await expect(result).resolves.toMatchObject({ data: "page data" });
  });

  test("sends users without consent to /drawer/consent, even if loading failed", async () => {
    consent.resolve(false);

    const thrown = await loadWithConsent(request(), async () => {
      throw new Error("not found");
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/drawer/consent");
  });

  test("passes a loading error through once consent is confirmed", async () => {
    consent.resolve(true);

    await expect(
      loadWithConsent(request(), async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");
  });
});
