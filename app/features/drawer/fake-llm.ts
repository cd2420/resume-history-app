import type OpenAI from "openai";

import type { DrawerLlmClient, Generalization } from "./generalize.server";

type ResponseResult = OpenAI.Responses.Response;

export const FAKE_GENERALIZATION: Generalization = {
  generalized: "대형 금융사 결제 승인 API의 응답 지연 원인을 찾아 캐시를 적용함",
  changes: ["client_name"],
  tags: ["Redis", "캐시", "성능 개선"],
};

export const FAKE_SUGGESTED_TAGS = ["성능 개선"];

// Cites L1 (exists) and L99 (made up) so tests can check that unknown refs are dropped.
export const FAKE_STAR = {
  situation: { text: "대형 금융사 결제 승인 API의 응답이 느려 결제 실패가 늘던 상황이었다.", evidence: ["L1"], gaps: [] },
  task: { text: "응답 지연의 원인을 찾아 결제 승인 흐름을 안정화하는 역할을 맡았다.", evidence: ["L1"], gaps: [] },
  action: { text: "조회 병목을 확인하고 Redis 캐시 도입을 제안해 적용했다.", evidence: ["L1", "L99"], gaps: ["캐시를 고른 이유"] },
  result: { text: "응답 지연이 줄었다. [빈칸: 개선 전후 응답 시간]", evidence: [], gaps: ["개선 전후 응답 시간"] },
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
      // Each request names its output format; answer with the matching fixture.
      create: async (body) => {
        const format = body.text?.format?.type === "json_schema" ? body.text.format.name : null;
        const fixture = format === "log_tags" ? { tags: FAKE_SUGGESTED_TAGS } : format === "star_summary" ? FAKE_STAR : FAKE_GENERALIZATION;
        return fakeResponse(JSON.stringify(fixture));
      },
    },
  };
}
