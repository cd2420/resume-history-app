import { describe, expect, test, vi } from "vitest";

import { completion, createFakeLlm, FAKE_DRAFT } from "./fake-llm";
import { extractDraft, InterviewError, nextQuestion } from "./interview.server";
import type { ChatTurn } from "./schema";

const TURNS: ChatTurn[] = [
  { role: "assistant", content: "어느 회사에서 일하셨나요?" },
  { role: "user", content: "A사에서 결제 시스템을 만들었어요." },
];

function llmReturning(result: unknown) {
  const create = vi.fn().mockResolvedValue(result);
  return { llm: { chat: { completions: { create } } }, create };
}

async function reasonOf(promise: Promise<unknown>) {
  const thrown = await promise.catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(InterviewError);
  return (thrown as InterviewError).reason;
}

describe("nextQuestion", () => {
  test("returns the model's question and sends system prompt before history", async () => {
    const { llm, create } = llmReturning(completion("맡은 역할은 무엇이었나요?"));

    const question = await nextQuestion(llm, TURNS);

    expect(question).toBe("맡은 역할은 무엇이었나요?");
    const body = create.mock.calls[0][0];
    expect(body.messages[0].role).toBe("system");
    expect(body.messages.slice(1)).toEqual(TURNS);
    expect(body.reasoning_effort).toBe("low");
  });

  test("starts the interview when the conversation is empty", async () => {
    const { llm } = llmReturning(completion("어느 회사 이야기부터 할까요?"));

    await expect(nextQuestion(llm, [])).resolves.toBe("어느 회사 이야기부터 할까요?");
  });

  test("fails as truncated when the reply hit the length limit", async () => {
    const { llm } = llmReturning(completion("맡은 역", { finishReason: "length" }));

    expect(await reasonOf(nextQuestion(llm, TURNS))).toBe("truncated");
  });

  test("fails as refused when the model refuses", async () => {
    const { llm } = llmReturning(completion(null, { refusal: "can't help" }));

    expect(await reasonOf(nextQuestion(llm, TURNS))).toBe("refused");
  });

  test("fails as api when the client throws", async () => {
    const create = vi.fn().mockRejectedValue(new Error("503"));
    const llm = { chat: { completions: { create } } };

    expect(await reasonOf(nextQuestion(llm, TURNS))).toBe("api");
  });
});

describe("extractDraft", () => {
  test("returns the draft validated against the schema", async () => {
    const { llm, create } = llmReturning(completion(JSON.stringify(FAKE_DRAFT)));

    const draft = await extractDraft(llm, TURNS);

    expect(draft).toEqual(FAKE_DRAFT);
    expect(create.mock.calls[0][0].response_format.type).toBe("json_schema");
  });

  test("fails as empty without calling the model when there are no user answers", async () => {
    const { llm, create } = llmReturning(completion("{}"));

    expect(await reasonOf(extractDraft(llm, [TURNS[0]]))).toBe("empty");
    expect(create).not.toHaveBeenCalled();
  });

  test("fails as invalid when the JSON does not match the schema", async () => {
    const broken = { ...FAKE_DRAFT, project: { ...FAKE_DRAFT.project, title: "" } };
    const { llm } = llmReturning(completion(JSON.stringify(broken)));

    expect(await reasonOf(extractDraft(llm, TURNS))).toBe("invalid");
  });

  test("fails as invalid when the reply is not JSON", async () => {
    const { llm } = llmReturning(completion("not json"));

    expect(await reasonOf(extractDraft(llm, TURNS))).toBe("invalid");
  });

  test("fails as truncated when the draft hit the length limit", async () => {
    const { llm } = llmReturning(completion('{"career":', { finishReason: "length" }));

    expect(await reasonOf(extractDraft(llm, TURNS))).toBe("truncated");
  });

  test("fails as refused on content filter", async () => {
    const { llm } = llmReturning(completion(null, { finishReason: "content_filter" }));

    expect(await reasonOf(extractDraft(llm, TURNS))).toBe("refused");
  });
});

describe("createFakeLlm", () => {
  test("answers questions and drafts without network", async () => {
    const llm = createFakeLlm();

    await expect(nextQuestion(llm, [])).resolves.toMatch(/\S/);
    await expect(extractDraft(llm, TURNS)).resolves.toEqual(FAKE_DRAFT);
  });
});
