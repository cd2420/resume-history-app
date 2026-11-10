import { useState } from "react";
import { Form } from "react-router";

type Props = {
  label: string;
  question: string;
  intent: string;
  fields: Record<string, string>;
  busy: boolean;
  confirmLabel?: string;
};

/**
 * Two-step delete that asks inline. window.confirm is avoided on purpose: embedded browsers
 * and in-app webviews (Telegram, IDE panes) may block it, which silently cancels the submit.
 */
export function ConfirmDelete({ label, question, intent, fields, busy, confirmLabel = "지우기" }: Props) {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isConfirming) {
    return (
      <button type="button" onClick={() => setIsConfirming(true)} disabled={busy} className="px-2 py-2 text-sm text-red-400 underline">
        {label}
      </button>
    );
  }
  return (
    <Form method="post" className="flex flex-wrap items-center gap-2 rounded bg-red-950/60 px-3 py-2">
      <span className="text-xs text-red-200">{question}</span>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button name="intent" value={intent} disabled={busy} className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold">
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setIsConfirming(false)} className="px-2 py-1.5 text-sm text-slate-300 underline">
        취소
      </button>
    </Form>
  );
}
