import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";

import { DEMO_USER_ID, DemoStore } from "~/features/demo/demo-store.server";
import type { DrawerWebStore } from "./drawer-web.server";
import { createFakeDrawerLlm, FAKE_STAR } from "./fake-llm";
import type { DrawerLlmClient } from "./generalize.server";
import { FREE_STAR_GENERATIONS } from "./star";
import { generateStar, saveStar, StarError } from "./star.server";

const OTHER = "00000000-0000-4000-8000-0000000000ff";

let demo: DemoStore;
let store: DrawerWebStore;
let create: Mock<DrawerLlmClient["responses"]["create"]>;
let llm: DrawerLlmClient;

beforeEach(() => {
  demo = new DemoStore();
  store = demo.webStoreFor(DEMO_USER_ID);
  create = vi.fn(createFakeDrawerLlm().responses.create);
  llm = { responses: { create } };
});

async function bookWithLogs() {
  const book = (await store.getBookshelf()).books.find((b) => b.title === "결제 시스템 개편")!;
  const detail = (await store.getBook(book.id))!;
  return { id: book.id, logs: detail.logs };
}

describe("generateStar", () => {
  test("an admin can make several STARs a day and regenerate a book", async () => {
    demo.roles.set(DEMO_USER_ID, "admin");
    const books = (await store.getBookshelf()).books.filter((b) => b.logCount > 0);

    await generateStar(store, llm, books[0].id);
    await generateStar(store, llm, books[1].id);
    await generateStar(store, llm, books[0].id);

    expect(create).toHaveBeenCalledTimes(3);
    expect((await store.getStar(books[0].id))!.generationCount).toBe(2);
  });

  test("one STAR a day per user, across books, before calling the model", async () => {
    const books = (await store.getBookshelf()).books.filter((b) => b.logCount > 0);
    // 2026-11-10 23:30 KST, then 00:10 KST the next day.
    const tonight = new Date("2026-11-10T14:30:00Z");
    const tomorrow = new Date("2026-11-10T15:10:00Z");

    await generateStar(store, llm, books[0].id, tonight);
    await expect(generateStar(store, llm, books[1].id, tonight)).rejects.toMatchObject({ reason: "daily_limit" });
    expect(create).toHaveBeenCalledTimes(1);

    await generateStar(store, llm, books[1].id, tomorrow);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("sends only the book's generalized logs, oldest first, with store: false", async () => {
    const { id, logs } = await bookWithLogs();

    await generateStar(store, llm, id);

    const body = create.mock.calls[0][0];
    expect(body.store).toBe(false);
    const input = JSON.stringify(body.input);
    for (const log of logs) expect(input).toContain(log.content);
    const oldest = [...logs].sort((a, b) => a.logDate.localeCompare(b.logDate))[0];
    expect(input).toContain(`L1 (${oldest.logDate})`);
  });

  test("keeps evidence that points at real logs and drops made-up references", async () => {
    const { id, logs } = await bookWithLogs();
    const oldest = [...logs].sort((a, b) => a.logDate.localeCompare(b.logDate))[0];

    await generateStar(store, llm, id);

    const star = (await store.getStar(id))!;
    // FAKE_STAR cites L1 and L99; only L1 exists.
    expect(star.generated.action.evidence).toEqual([oldest.id]);
    expect(star.generated.result.gaps).toEqual(FAKE_STAR.result.gaps);
    expect(star.fields.action).toBe(FAKE_STAR.action.text);
    expect(star).toMatchObject({ status: "draft", edited: false, generationCount: 1 });
  });

  test("a book without logs is refused before calling the model", async () => {
    await store.createProject("빈 책");
    const empty = (await store.getBookshelf()).books.find((b) => b.title === "빈 책")!;

    await expect(generateStar(store, llm, empty.id)).rejects.toMatchObject({ reason: "no_logs" });
    expect(create).not.toHaveBeenCalled();
  });

  test(`stops after ${FREE_STAR_GENERATIONS} generations of one book`, async () => {
    const { id } = await bookWithLogs();
    for (let i = 0; i < FREE_STAR_GENERATIONS; i++) await generateStar(store, llm, id);

    await expect(generateStar(store, llm, id)).rejects.toMatchObject({ reason: "limit" });
    expect(create).toHaveBeenCalledTimes(FREE_STAR_GENERATIONS);
    expect((await store.getStar(id))!.generationCount).toBe(FREE_STAR_GENERATIONS);
  });

  test("ending the current book clears it, so the bot stops filing answers into it", async () => {
    const { id } = await bookWithLogs();
    expect(demo.currentProject.get(DEMO_USER_ID)).toBe(id);

    await generateStar(store, llm, id);

    expect(demo.currentProject.has(DEMO_USER_ID)).toBe(false);
    expect(demo.ended.has(id)).toBe(true);
    expect((await demo.listProjects(DEMO_USER_ID)).map((p) => p.id)).not.toContain(id);
  });

  test("ending another book keeps the current one", async () => {
    const current = demo.currentProject.get(DEMO_USER_ID)!;
    const other = (await store.getBookshelf()).books.find((b) => b.id !== current && b.logCount > 0)!;

    await generateStar(store, llm, other.id);

    expect(demo.currentProject.get(DEMO_USER_ID)).toBe(current);
  });

  test("another user's book is not found", async () => {
    const { id } = await bookWithLogs();
    const foreign = demo.webStoreFor(OTHER);

    await expect(generateStar(foreign, llm, id)).rejects.toBeInstanceOf(StarError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("saveStar", () => {
  test("saving the generated text unchanged counts as not edited", async () => {
    const { id } = await bookWithLogs();
    await generateStar(store, llm, id);
    const { fields } = (await store.getStar(id))!;

    await saveStar(store, id, fields);

    expect(await store.getStar(id)).toMatchObject({ status: "saved", edited: false });
  });

  test("changing any part marks the summary as edited", async () => {
    const { id } = await bookWithLogs();
    await generateStar(store, llm, id);
    const { fields } = (await store.getStar(id))!;

    await saveStar(store, id, { ...fields, result: "응답 시간을 절반으로 줄였다" });

    expect(await store.getStar(id)).toMatchObject({ status: "saved", edited: true });
  });

  test("there is nothing to save before a summary exists", async () => {
    const { id } = await bookWithLogs();
    const fields = { situation: "s", task: "t", action: "a", result: "r" };

    await expect(saveStar(store, id, fields)).rejects.toMatchObject({ reason: "not_found" });
  });
});
