import { BookCheck, Info, Sparkles } from "lucide-react";
import { Form, useNavigation } from "react-router";

import type { BookLog } from "../bookshelf";
import { FREE_STAR_GENERATIONS, MAX_STAR_TEXT, STAR_FIELDS, STAR_LABELS, type StarQuota, type StarSummary as Star } from "../star";
import { ConfirmDelete } from "./ConfirmDelete";
import { ICON, ui } from "./ui";

type Props = { star: Star | null; logs: BookLog[]; busy: boolean; quota: StarQuota };

/** The free-tier caps, said before the button rather than after a refusal. */
function QuotaNote({ quota }: { quota: StarQuota }) {
  if (quota.isUnlimited) return null;
  const isUsedUp = quota.remainingToday === 0;
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-relaxed ${isUsedUp ? "text-ink" : "text-muted"}`}>
      <Info size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-brass" />
      {isUsedUp
        ? "오늘 STAR 정리를 이미 했어요. 내일 다시 정리할 수 있어요. (STAR 정리는 하루 1회)"
        : `STAR는 한 책에 한 번만 정리할 수 있어요. 오늘 남은 정리 ${quota.remainingToday}회`}
    </p>
  );
}

function shortDate(date: string) {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}`;
}

function Evidence({ ids, logs }: { ids: string[]; logs: BookLog[] }) {
  const cited = logs.filter((log) => ids.includes(log.id)).sort((a, b) => a.logDate.localeCompare(b.logDate));
  if (cited.length === 0) return <span className="text-xs text-faint">근거 기록 없음</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
      근거:
      {cited.map((log) => (
        <a key={log.id} href={`#log-${log.id}`} className="rounded-sm border border-line px-1.5 py-0.5 text-muted tabular-nums transition hover:border-brass hover:text-brass">
          {shortDate(log.logDate)}
        </a>
      ))}
    </span>
  );
}

/** The book's summary page (M3): generate a STAR from the logs, review blanks and evidence, then save. */
export function StarSummary({ star, logs, busy, quota }: Props) {
  const isGenerating = useNavigation().formData?.get("intent") === "generate_star";

  if (!star) {
    return (
      <section aria-label="STAR 요약" className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold tracking-title">
          <BookCheck {...ICON} aria-hidden className="text-brass" />
          STAR 요약
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">기록이 쌓이면 프로젝트가 끝났을 때 STAR로 정리해 드려요.</p>
        ) : (
          <>
            <p className="max-w-prose text-sm leading-relaxed text-muted">
              프로젝트가 끝났나요? 기록 {logs.length}개로 이력서용 STAR를 정리해 드려요. 기록에 없는 수치는 지어내지 않고 빈칸으로 남겨요.
            </p>
            <QuotaNote quota={quota} />
            <Form method="post">
              <button name="intent" value="generate_star" disabled={busy || quota.remainingToday === 0} className={ui.primary}>
                <Sparkles {...ICON} aria-hidden />
                {isGenerating ? "정리하는 중… 30초쯤 걸려요" : "프로젝트 끝내고 STAR 정리"}
              </button>
            </Form>
          </>
        )}
      </section>
    );
  }

  // Regenerating also spends the day's STAR, so both caps apply to regular users.
  const canRegenerate = quota.isUnlimited || (star.generationCount < FREE_STAR_GENERATIONS && quota.remainingToday !== 0);
  return (
    <section aria-label="STAR 요약" className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold tracking-title">
          <BookCheck {...ICON} aria-hidden className="text-brass" />
          STAR 요약
        </h2>
        <span
          data-testid="star-status"
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${star.status === "saved" ? "bg-ok-soft text-ok" : "bg-brass-soft text-ink"}`}
        >
          {star.status === "saved" ? "저장됨" : "초안 · 확인 후 저장해 주세요"}
        </span>
      </div>
      {/* key resets the textareas when a new draft arrives. */}
      <Form key={star.generatedAt} method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="save_star" />
        {STAR_FIELDS.map((field) => (
          <div key={field} className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[2.5rem_1fr]">
            <span aria-hidden className="hidden text-3xl leading-none font-bold text-brass sm:block">
              {field[0].toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
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
              className={`${ui.input} leading-relaxed`}
            />
            {star.generated[field].gaps.length > 0 && (
              <p className="flex flex-wrap gap-1 text-xs">
                {star.generated[field].gaps.map((gap) => (
                  <span key={gap} className="rounded-sm border border-dashed border-brass px-1.5 py-0.5 text-ink">
                    빈칸: {gap}
                  </span>
                ))}
              </p>
            )}
            <Evidence ids={star.generated[field].evidence} logs={logs} />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">빈칸은 기록에 없던 정보예요. 아는 내용으로 채우거나 지운 뒤 저장하세요.</p>
        <button type="submit" disabled={busy} className={`${ui.primary} w-fit`}>
          {star.status === "saved" ? "고친 내용 저장" : "이대로 저장"}
        </button>
      </Form>
      {!canRegenerate && !quota.isUnlimited && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-brass" />
          STAR는 한 책에 한 번만 정리할 수 있어요. 내용은 위에서 직접 고쳐 저장해 주세요.
        </p>
      )}
      {canRegenerate && (
        <ConfirmDelete
          label={quota.isUnlimited ? "다시 만들기" : `다시 만들기 (${star.generationCount}/${FREE_STAR_GENERATIONS})`}
          question="지금 내용은 사라지고 기록으로 새로 정리해요. 계속할까요?"
          intent="generate_star"
          fields={{}}
          busy={busy}
          confirmLabel={isGenerating ? "정리하는 중…" : "다시 만들기"}
        />
      )}
    </section>
  );
}
