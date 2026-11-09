import type { ProjectDraft } from "./schema";

type Career = ProjectDraft["career"];
type Project = ProjectDraft["project"];
type Achievement = ProjectDraft["achievements"][number];

type DraftCardProps = {
  draft: ProjectDraft;
  onChange: (draft: ProjectDraft) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
  error?: string;
};

type FieldProps = {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  type?: "text" | "month" | "number";
  isMultiline?: boolean;
};

const INPUT_CLASS = "w-full rounded bg-slate-800 px-3 py-2 text-base text-slate-50";

const blankToNull = (value: string) => (value.trim() === "" ? null : value);

function Field({ label, value, onChange, type = "text", isMultiline = false }: FieldProps) {
  const shared = { value: value ?? "", onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      {isMultiline ? (
        <textarea rows={3} className={INPUT_CLASS} {...shared} />
      ) : (
        <input type={type} className={INPUT_CLASS} {...shared} />
      )}
    </label>
  );
}

export function DraftCard({ draft, onChange, onSave, onBack, isSaving, error }: DraftCardProps) {
  const setCareer = (patch: Partial<Career>) => onChange({ ...draft, career: { ...draft.career, ...patch } });
  const setProject = (patch: Partial<Project>) => onChange({ ...draft, project: { ...draft.project, ...patch } });
  const setAchievement = (index: number, patch: Partial<Achievement>) =>
    onChange({
      ...draft,
      achievements: draft.achievements.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const removeAchievement = (index: number) =>
    onChange({ ...draft, achievements: draft.achievements.filter((_, i) => i !== index) });

  const { career, project } = draft;

  return (
    <section aria-label="프로젝트 초안" className="flex flex-col gap-5">
      {draft.generalized.length > 0 && (
        <div className="rounded border border-amber-500/60 bg-amber-500/10 p-3">
          <h2 className="text-sm font-semibold text-amber-300">기밀 일반화된 항목</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-100">
            {draft.generalized.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-200/80">원문이 남아 있지 않은지 저장 전에 확인하세요.</p>
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">회사</legend>
        <Field label="회사명" value={career.company_name} onChange={(v) => setCareer({ company_name: v })} />
        <Field label="회사 설명" value={career.company_desc} onChange={(v) => setCareer({ company_desc: blankToNull(v) })} />
        <Field label="직무" value={career.role} onChange={(v) => setCareer({ role: blankToNull(v) })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="입사" type="month" value={career.start_date} onChange={(v) => setCareer({ start_date: blankToNull(v) })} />
          <Field label="퇴사" type="month" value={career.end_date} onChange={(v) => setCareer({ end_date: blankToNull(v) })} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">프로젝트</legend>
        <Field label="프로젝트명" value={project.title} onChange={(v) => setProject({ title: v })} />
        <Field label="요약" isMultiline value={project.summary} onChange={(v) => setProject({ summary: blankToNull(v) })} />
        <Field label="내 역할" value={project.my_role} onChange={(v) => setProject({ my_role: blankToNull(v) })} />
        <Field
          label="기술 스택 (쉼표로 구분)"
          value={project.tech_stack.join(", ")}
          onChange={(v) => setProject({ tech_stack: v.split(",").map((s) => s.trim()).filter(Boolean) })}
        />
        <Field
          label="팀 인원"
          type="number"
          value={project.team_size}
          onChange={(v) => setProject({ team_size: v === "" ? null : Number(v) })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="시작" type="month" value={project.start_date} onChange={(v) => setProject({ start_date: blankToNull(v) })} />
          <Field label="종료" type="month" value={project.end_date} onChange={(v) => setProject({ end_date: blankToNull(v) })} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-semibold">내 기여</legend>
        {draft.achievements.length === 0 && <p className="text-sm text-slate-400">아직 기록된 기여가 없습니다.</p>}
        {draft.achievements.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 rounded border border-slate-700 p-3">
            <Field label="한 일" isMultiline value={item.action} onChange={(v) => setAchievement(index, { action: v })} />
            <Field label="내린 결정" isMultiline value={item.decision} onChange={(v) => setAchievement(index, { decision: blankToNull(v) })} />
            <Field label="결과" isMultiline value={item.impact} onChange={(v) => setAchievement(index, { impact: blankToNull(v) })} />
            {!item.impact && <p className="text-xs text-amber-300">결과가 비어 있습니다. 전후 비교라도 적어 두면 이력서에 쓰기 좋습니다.</p>}
            <button type="button" onClick={() => removeAchievement(index)} className="self-end text-xs text-slate-400 underline">
              이 기여 삭제
            </button>
          </div>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} disabled={isSaving} className="flex-1 rounded border border-slate-600 py-3">
          대화로 돌아가기
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex-1 rounded bg-sky-600 py-3 font-semibold disabled:opacity-50"
        >
          {isSaving ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}
