import { describe, expect, test, vi } from "vitest";

import { FAKE_GENERALIZATION, fakeResponse } from "./fake-llm";
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

    await expect(generalize(llm, RAW)).resolves.toEqual(FAKE_GENERALIZATION);
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
      fakeResponse(JSON.stringify({ generalized: "x", changes: ["client_name", "client_name"] })),
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
    for (const text of ["not json", JSON.stringify({ generalized: 1 }), JSON.stringify({ generalized: " ", changes: [] })]) {
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
});
