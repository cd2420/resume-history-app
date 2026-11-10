import { beforeEach, describe, expect, test, vi } from "vitest";

import { fillMissingTags } from "~/features/drawer/bookshelf.server";
import type { DrawerWebStore } from "~/features/drawer/drawer-web.server";
import { createFakeDrawerLlm, FAKE_SUGGESTED_TAGS, fakeResponse } from "~/features/drawer/fake-llm";
import { DEMO_USER_ID, DemoStore } from "./demo-store.server";

const OTHER = "00000000-0000-4000-8000-0000000000ff";

let demo: DemoStore;
let store: DrawerWebStore;

beforeEach(() => {
  demo = new DemoStore();
  store = demo.webStoreFor(DEMO_USER_ID);
});

const noFilters = { q: null, tag: null, from: null, to: null };

describe("bookshelf", () => {
  test("seeds two named shelves and one newly shelved book, current book first", async () => {
    const view = await store.getBookshelf();
    expect(view.shelves.map((s) => s.name)).toEqual(["A사", "개인 프로젝트"]);
    expect(view.books[0]).toMatchObject({ title: "결제 시스템 개편", isCurrent: true });
    expect(view.books.filter((b) => b.shelfId === null).map((b) => b.title)).toEqual(["사내 해커톤"]);
    expect(view.untaggedCount).toBe(2);
    expect(view.tags).toContain("Kafka");
  });

  test("books have period, count and top tags", async () => {
    const book = (await store.getBookshelf()).books.find((b) => b.title === "결제 시스템 개편")!;
    expect(book.logCount).toBe(7);
    expect(book.topTags).toEqual(["결제", "Kafka", "Redis"]);
  });

  test("shelves can be created, renamed, reordered and deleted; deleting unshelves its books", async () => {
    await store.createShelf("오픈소스");
    let shelves = (await store.getBookshelf()).shelves;
    expect(shelves.map((s) => s.name)).toEqual(["A사", "개인 프로젝트", "오픈소스"]);

    await store.moveShelf(shelves[2].id, "up");
    await store.renameShelf(shelves[2].id, "OSS");
    shelves = (await store.getBookshelf()).shelves;
    expect(shelves.map((s) => s.name)).toEqual(["A사", "OSS", "개인 프로젝트"]);

    const company = shelves[0];
    await store.deleteShelf(company.id);
    const view = await store.getBookshelf();
    expect(view.shelves.map((s) => s.name)).toEqual(["OSS", "개인 프로젝트"]);
    expect(view.books.filter((b) => b.shelfId === null).map((b) => b.title)).toEqual(
      expect.arrayContaining(["결제 시스템 개편", "정산 배치 안정화", "사내 해커톤"]),
    );
  });

  test("moving a book to another user's shelf is ignored", async () => {
    const foreign = demo.webStoreFor(OTHER);
    await foreign.createShelf("남의 칸");
    const foreignShelf = (await foreign.getBookshelf()).shelves[0];
    const book = (await store.getBookshelf()).books[0];

    await store.moveBook(book.id, foreignShelf.id);

    expect((await store.getBook(book.id))!.book.shelfId).not.toBe(foreignShelf.id);
    expect(await foreign.getBook(book.id)).toBeNull();
  });
});

describe("search", () => {
  test("finds by keyword in content or book title, case-insensitively", async () => {
    expect((await store.search({ ...noFilters, q: "kafka" })).map((h) => h.content)).toEqual([
      "결제 완료 이벤트를 Kafka로 비동기 발행하도록 바꿈",
      "피크 시간대 결제 요청을 파티션 확장으로 분산 처리함",
    ]);
    expect((await store.search({ ...noFilters, q: "블로그" })).every((h) => h.bookTitle === "개인 블로그")).toBe(true);
  });

  test("filters by tag and period, newest first, with shelf names", async () => {
    const hits = await store.search({ ...noFilters, tag: "성능 개선" });
    expect(hits.map((h) => h.bookTitle)).toEqual(["결제 시스템 개편", "개인 블로그", "정산 배치 안정화"]);
    expect(hits[1].shelfName).toBe("개인 프로젝트");

    const oldest = hits.at(-1)!.logDate.slice(0, 7);
    const ranged = await store.search({ ...noFilters, tag: "성능 개선", from: oldest, to: oldest });
    expect(ranged.map((h) => h.bookTitle)).toEqual(["정산 배치 안정화"]);
  });

  test("never returns another user's logs", async () => {
    demo.logs.push({ id: "x", userId: OTHER, projectId: "p", logDate: "2026-11-01", content: "Kafka 비밀", edited: false, tags: [] });
    expect((await store.search({ ...noFilters, q: "비밀" }))).toEqual([]);
  });
});

describe("fillMissingTags", () => {
  test("tags untagged logs with the model's suggestion", async () => {
    const result = await fillMissingTags(store, createFakeDrawerLlm());

    expect(result).toEqual({ tagged: 2, failed: 0 });
    expect((await store.getBookshelf()).untaggedCount).toBe(0);
    const hit = (await store.search({ ...noFilters, q: "코드 리뷰" }))[0];
    expect(hit.tags).toEqual(FAKE_SUGGESTED_TAGS);
  });

  test("counts model failures and leaves those logs untagged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const llm = { responses: { create: vi.fn().mockResolvedValue(fakeResponse("not json")) } };

    expect(await fillMissingTags(store, llm)).toEqual({ tagged: 0, failed: 2 });
    expect((await store.getBookshelf()).untaggedCount).toBe(2);
    error.mockRestore();
  });
});
