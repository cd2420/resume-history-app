import type OpenAI from "openai";

import type { LlmClient } from "./interview.server";
import type { ProjectDraft } from "./schema";

type FinishReason = OpenAI.Chat.ChatCompletion.Choice["finish_reason"];

export const FAKE_QUESTIONS = [
  "어느 회사의 어떤 프로젝트부터 이야기해 볼까요?",
  "그 프로젝트에서 본인이 직접 맡은 부분은 무엇이었나요?",
  "그때 내린 결정과 결과는 어땠나요?",
  "이 프로젝트를 정리해도 될까요?",
];

export const FAKE_DRAFT: ProjectDraft = {
  career: {
    company_name: "테스트컴퍼니",
    company_desc: "핀테크 스타트업",
    role: "백엔드 개발자",
    start_date: "2022-03",
    end_date: null,
  },
  project: {
    title: "결제 시스템 개편",
    summary: "국내 대형 유통사 대상 결제 처리 시스템 재구축",
    my_role: "결제 승인 API 설계와 구현",
    tech_stack: ["Spring Boot", "Kafka", "MySQL"],
    team_size: 5,
    start_date: "2023-01",
    end_date: "2023-09",
  },
  achievements: [
    {
      action: "결제 승인 흐름을 비동기 처리로 전환",
      decision: "트래픽 급증 구간 대응을 위해 Kafka 기반 큐 도입",
      impact: "결제 승인 응답 시간 40% 단축",
    },
  ],
  generalized: ["고객사명 -> 국내 대형 유통사", "일 결제 건수 -> 비율 표현"],
};

export function completion(
  content: string | null,
  { finishReason = "stop", refusal = null }: { finishReason?: FinishReason; refusal?: string | null } = {},
): OpenAI.Chat.ChatCompletion {
  return {
    id: "fake-completion",
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        logprobs: null,
        message: { role: "assistant", content, refusal },
      },
    ],
  };
}

// Deterministic, network-free client for unit tests and E2E (E2E_FAKE_LLM=1).
export function createFakeLlm(): LlmClient {
  return {
    chat: {
      completions: {
        create: async (body) => {
          if (body.response_format) return completion(JSON.stringify(FAKE_DRAFT));
          const answered = body.messages.filter((m) => m.role === "user").length;
          return completion(FAKE_QUESTIONS[Math.min(answered, FAKE_QUESTIONS.length - 1)]);
        },
      },
    },
  };
}
