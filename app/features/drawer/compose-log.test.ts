import { expect, test } from "vitest";

import { MAX_LOG_LENGTH } from "./limits";
import { composeLog } from "./record.server";

test("joins the three answers in the bot's log format and leaves out skipped ones", () => {
  expect(composeLog({ task: "캐시를 붙임", role: "도입을 제안함", result: "응답 시간 절반" })).toBe(
    "캐시를 붙임\n· 내 역할·이유: 도입을 제안함\n· 결과: 응답 시간 절반",
  );
  expect(composeLog({ task: "캐시를 붙임", role: null, result: "응답 시간 절반" })).toBe("캐시를 붙임\n· 결과: 응답 시간 절반");
});

test("never exceeds the log length limit", () => {
  const text = composeLog({ task: "가".repeat(MAX_LOG_LENGTH), role: "나", result: null });
  expect(text.length).toBe(MAX_LOG_LENGTH);
  expect(text.endsWith("…")).toBe(true);
});
