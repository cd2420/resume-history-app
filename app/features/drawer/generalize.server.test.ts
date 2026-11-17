import { describe, expect, test, vi } from "vitest";

import { FAKE_ENTRY, FAKE_GENERALIZATION, fakeResponse } from "./fake-llm";
import { generalize, GeneralizeError, MAX_LOG_LENGTH } from "./generalize.server";

const RAW = "A은행 결제승인 API 응답이 느려서 레디스 캐시 붙임";

function llmReturning(result: unknown) {
  const create = vi.fn().mockResolvedValue(result);
  return { llm: { responses: { create } }, create };
}

async function reasonOf(promise: Promise<unknown>) {
  const thrown = await promise.catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(GeneralizeError);
  return (thrown as GeneralizeError).reason;
}

describe("generalize", () => {
  test("returns the generalized text and change categories", async () => {
    const { llm } = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    await expect(generalize(llm, RAW)).resolves.toEqual({ ...FAKE_GENERALIZATION, entry: null });
  });

  test("sends store: false, the prompt as instructions and the raw text as user input", async () => {
    const { llm, create } = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    await generalize(llm, `  ${RAW}  `);

    const body = create.mock.calls[0][0];
    expect(body.store).toBe(false);
    expect(body.instructions).toContain("기밀");
    expect(body.input).toEqual([{ role: "user", content: RAW }]);
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.reasoning).toEqual({ effort: "low" });
  });

  test("dedupes repeated change categories", async () => {
    const { llm } = llmReturning(
      fakeResponse(JSON.stringify({ generalized: "x", changes: ["client_name", "client_name"], tags: [] })),
    );

    expect((await generalize(llm, RAW)).changes).toEqual(["client_name"]);
  });

  test("rejects empty and over-long input without calling the model", async () => {
    const { llm, create } = llmReturning(fakeResponse("{}"));

    expect(await reasonOf(generalize(llm, "   "))).toBe("empty");
    expect(await reasonOf(generalize(llm, "가".repeat(MAX_LOG_LENGTH + 1)))).toBe("too_long");
    expect(create).not.toHaveBeenCalled();
  });

  test("fails as truncated when output tokens ran out", async () => {
    const { llm } = llmReturning(fakeResponse("{\"general", { status: "incomplete", incompleteReason: "max_output_tokens" }));

    expect(await reasonOf(generalize(llm, RAW))).toBe("truncated");
  });

  test("fails as refused on a content filter stop or a refusal part", async () => {
    const filtered = llmReturning(fakeResponse("", { status: "incomplete", incompleteReason: "content_filter" }));
    const refused = llmReturning(fakeResponse("", { refusal: "can't help" }));

    expect(await reasonOf(generalize(filtered.llm, RAW))).toBe("refused");
    expect(await reasonOf(generalize(refused.llm, RAW))).toBe("refused");
  });

  test("fails as invalid on non-JSON, schema mismatch or empty result", async () => {
    for (const text of [
      "not json",
      JSON.stringify({ generalized: 1 }),
      JSON.stringify({ generalized: "x", changes: [] }),
      JSON.stringify({ generalized: " ", changes: [], tags: [] }),
    ]) {
      const { llm } = llmReturning(fakeResponse(text));
      expect(await reasonOf(generalize(llm, RAW))).toBe("invalid");
    }
  });

  test("fails as api when the request throws or the response failed", async () => {
    const thrown = { responses: { create: vi.fn().mockRejectedValue(new Error("network")) } };
    const failed = llmReturning(fakeResponse("", { status: "failed" }));

    expect(await reasonOf(generalize(thrown, RAW))).toBe("api");
    expect(await reasonOf(generalize(failed.llm, RAW))).toBe("api");
  });

  test("normalizes tags and reuses the user's existing spelling", async () => {
    const { llm } = llmReturning(
      fakeResponse(JSON.stringify({ generalized: "x", changes: [], tags: ["#kafka", "kafka", " 성능  개선 ", "a", "b", "c", "d"] })),
    );

    expect((await generalize(llm, RAW, ["Kafka"])).tags).toEqual(["Kafka", "성능 개선", "a", "b", "c"]);
  });

  test("sends existing tags in the instructions, never in the user input", async () => {
    const { llm, create } = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    await generalize(llm, RAW, ["Kafka", "캐시"]);

    const body = create.mock.calls[0][0];
    expect(body.instructions).toContain("사용자가 이미 쓰는 태그: Kafka, 캐시");
    expect(body.input).toEqual([{ role: "user", content: RAW }]);
  });

  test("omits the existing-tag line when there are none", async () => {
    const { llm, create } = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    await generalize(llm, RAW);

    expect(create.mock.calls[0][0].instructions).not.toContain("사용자가 이미 쓰는 태그:");
  });

  test("each question gets its own editor role on top of the shared rules", async () => {
    const roles = { 1: "업무 정리 편집자", 2: "기여 분리 편집자", 3: "성과 정리 편집자" } as const;
    for (const step of [1, 2, 3] as const) {
      const reply = step === 3 ? { ...FAKE_GENERALIZATION, entry: FAKE_ENTRY } : FAKE_GENERALIZATION;
      const { llm, create } = llmReturning(fakeResponse(JSON.stringify(reply)));

      await generalize(llm, RAW, [], { step });

      const { instructions } = create.mock.calls[0][0];
      expect(instructions).toContain("기밀");
      expect(instructions).toContain(roles[step]);
      for (const other of Object.values(roles).filter((role) => role !== roles[step])) {
        expect(instructions).not.toContain(other);
      }
    }
  });

  test("earlier summaries go into the instructions; the user input is only this answer", async () => {
    const { llm, create } = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    await generalize(llm, "제가 제안했어요", [], { step: 2, previous: { task: "결제 승인 API 응답 지연 원인을 찾음" } });

    const body = create.mock.calls[0][0];
    expect(body.instructions).toContain("앞 질문 정리");
    expect(body.instructions).toContain("결제 승인 API 응답 지연 원인을 찾음");
    expect(body.input).toEqual([{ role: "user", content: "제가 제안했어요" }]);
  });

  test("question 3 also returns the day's combined entry; earlier questions do not", async () => {
    const final = llmReturning(fakeResponse(JSON.stringify({ ...FAKE_GENERALIZATION, entry: FAKE_ENTRY })));
    const first = llmReturning(fakeResponse(JSON.stringify(FAKE_GENERALIZATION)));

    expect((await generalize(final.llm, RAW, [], { step: 3, previous: { task: "a" } })).entry).toBe(FAKE_ENTRY);
    expect(final.create.mock.calls[0][0].text.format.name).toBe("generalized_entry");
    expect((await generalize(first.llm, RAW, [], { step: 1 })).entry).toBeNull();
  });

  test("an empty or over-long combined entry is dropped, not fatal", async () => {
    for (const entry of ["  ", "가".repeat(MAX_LOG_LENGTH + 1)]) {
      const { llm } = llmReturning(fakeResponse(JSON.stringify({ ...FAKE_GENERALIZATION, entry })));
      const result = await generalize(llm, RAW, [], { step: 3 });
      expect(result.entry).toBeNull();
      expect(result.generalized).toBe(FAKE_GENERALIZATION.generalized);
    }
  });
});
