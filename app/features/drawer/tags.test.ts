import { describe, expect, test } from "vitest";

import { formatTagInput, normalizeTags, parseTagInput, topTags } from "./tags";

describe("normalizeTags", () => {
  test("trims, strips '#', collapses spaces and drops empty or over-long tags", () => {
    expect(normalizeTags(["  #Kafka ", "", "#", "성능   개선", "가".repeat(31)])).toEqual(["Kafka", "성능 개선"]);
  });

  test("dedupes case-insensitively and reuses an existing tag's casing", () => {
    expect(normalizeTags(["kafka", "KAFKA", "spring boot"], ["Kafka", "Spring Boot"])).toEqual(["Kafka", "Spring Boot"]);
  });

  test("keeps at most five", () => {
    expect(normalizeTags(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("tag input", () => {
  test("splits on commas, newlines and '#' but keeps spaces inside a tag", () => {
    expect(normalizeTags(parseTagInput("Kafka, 대용량 트래픽\n#Redis#캐시"))).toEqual(["Kafka", "대용량 트래픽", "Redis", "캐시"]);
  });

  test("round-trips through the input format", () => {
    expect(normalizeTags(parseTagInput(formatTagInput(["Kafka", "대용량 트래픽"])))).toEqual(["Kafka", "대용량 트래픽"]);
  });
});

describe("topTags", () => {
  test("orders by uses, then most recent, then name", () => {
    const logs = [
      { tags: ["캐시", "Redis"], logDate: "2026-11-09" },
      { tags: ["캐시"], logDate: "2026-10-21" },
      { tags: ["Kafka"], logDate: "2026-09-02" },
      { tags: ["Batch"], logDate: "2026-09-02" },
    ];
    expect(topTags(logs)).toEqual(["캐시", "Redis", "Batch"]);
  });
});
