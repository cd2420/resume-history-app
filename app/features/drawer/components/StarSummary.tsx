import { Form, useNavigation } from "react-router";

import type { BookLog } from "../bookshelf";
import { MAX_STAR_GENERATIONS, MAX_STAR_TEXT, STAR_FIELDS, STAR_LABELS, type StarSummary as Star } from "../star";
import { ConfirmDelete } from "./ConfirmDelete";

const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";

type Props = { star: Star | null; logs: BookLog[]; busy: boolean };

function shortDate(date: string) {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}`;
}

function Evidence({ ids, logs }: { ids: string[]; logs: BookLog[] }) {
  const cited = logs.filter((log) => ids.includes(log.id)).sort((a, b) => a.logDate.localeCompare(b.logDate));
  if (cited.length === 0) return <span className="text-xs text-slate-500">근거 기록 없음</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
      근거:
      {cited.map((log) => (
        <a key={log.id} href={`#log-${log.id}`} className="rounded bg-slate-900 px-1.5 py-0.5 text-sky-300 hover:underline">
          {shortDate(log.logDate)}
        </a>
      ))}
    </span>
  );
}

/** The book's summary page (M3): generate a STAR from the logs, review blanks and evidence, then save. */
export function StarSummary({ star, logs, busy }: Props) {
  const isGenerating = useNavigation().formData?.get("intent") === "generate_star";

  if (!star) {
    return (
      <section aria-label="STAR 요약" className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-800 p-4">
        <h2 className="font-semibold">📘 STAR 요약</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">기록이 쌓이면 프로젝트가 끝났을 때 STAR로 정리해 드려요.</p>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              프로젝트가 끝났나요? 기록 {logs.length}개로 이력서용 STAR를 정리해 드려요. 기록에 없는 수치는 지어내지 않고 빈칸으로 남겨요.
            </p>
            <Form method="post">
              <button name="intent" value="generate_star" disabled={busy} className={button}>
                {isGenerating ? "정리하는 중… 30초쯤 걸려요" : "프로젝트 끝내고 STAR 정리"}
              </button>
            </Form>
          </>
        )}
      </section>
    );
  }

  const canRegenerate = star.generationCount < MAX_STAR_GENERATIONS;
  return (
    <section aria-label="STAR 요약" className="flex flex-col gap-3 rounded border border-sky-800 bg-slate-800 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">📘 STAR 요약</h2>
        <span data-testid="star-status" className="rounded-full bg-slate-700 px-2 py-0.5 text-xs">
          {star.status === "saved" ? "저장됨" : "초안 · 확인 후 저장해 주세요"}
        </span>
      </div>
      {/* key resets the textareas when a new draft arrives. */}
      <Form key={star.generatedAt} method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="save_star" />
        {STAR_FIELDS.map((field) => (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={`star-${field}`} className="text-sm font-semibold">
              {STAR_LABELS[field]}
            </label>
            <textarea
              id={`star-${field}`}
              name={field}
              defaultValue={star.fields[field]}
              rows={3}
              maxLength={MAX_STAR_TEXT}
              required
              className="rounded bg-slate-900 px-3 py-2 text-sm"
            />
            {star.generated[field].gaps.length > 0 && (
              <p className="flex flex-wrap gap-1 text-xs">
                {star.generated[field].gaps.map((gap) => (
                  <span key={gap} className="rounded bg-amber-950 px-1.5 py-0.5 text-amber-300">
                    빈칸: {gap}
                  </span>
                ))}
              </p>
            )}
            <Evidence ids={star.generated[field].evidence} logs={logs} />
          </div>
        ))}
        <p className="text-xs text-slate-400">빈칸은 기록에 없던 정보예요. 아는 내용으로 채우거나 지운 뒤 저장하세요.</p>
        <button type="submit" disabled={busy} className={`${button} w-fit`}>
          {star.status === "saved" ? "고친 내용 저장" : "이대로 저장"}
        </button>
      </Form>
      {canRegenerate ? (
        <ConfirmDelete
          label={`다시 만들기 (${star.generationCount}/${MAX_STAR_GENERATIONS})`}
          question="지금 내용은 사라지고 기록으로 새로 정리해요. 계속할까요?"
          intent="generate_star"
          fields={{}}
          busy={busy}
          confirmLabel={isGenerating ? "정리하는 중…" : "다시 만들기"}
        />
      ) : (
        <p className="text-xs text-slate-500">이 책은 더 다시 만들 수 없어요(최대 {MAX_STAR_GENERATIONS}번).</p>
      )}
    </section>
  );
}
