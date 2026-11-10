import type OpenAI from "openai";

import type { DrawerLlmClient, Generalization } from "./generalize.server";

type ResponseResult = OpenAI.Responses.Response;

export const FAKE_GENERALIZATION: Generalization = {
  generalized: "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함",
  changes: ["client_name"],
};

interface FakeOptions {
  status?: ResponseResult["status"];
  incompleteReason?: "max_output_tokens" | "content_filter";
  refusal?: string;
}

export function fakeResponse(text: string, { status = "completed", incompleteReason, refusal }: FakeOptions = {}): ResponseResult {
  return {
    id: "fake-response",
    object: "response",
    created_at: 0,
    model: "fake",
    status,
    incomplete_details: incompleteReason ? { reason: incompleteReason } : null,
    output: [
      {
        type: "message",
        id: "msg",
        role: "assistant",
        status: "completed",
        content: refusal
          ? [{ type: "refusal", refusal }]
          : [{ type: "output_text", text, annotations: [] }],
      },
    ],
  } as unknown as ResponseResult;
}

// Deterministic, network-free client for unit tests and E2E (E2E_FAKE_LLM=1).
export function createFakeDrawerLlm(): DrawerLlmClient {
  return {
    responses: {
      create: async () => fakeResponse(JSON.stringify(FAKE_GENERALIZATION)),
    },
  };
}
