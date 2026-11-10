import { useState } from "react";
import { Form } from "react-router";

import { ui } from "./ui";

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
      <button type="button" onClick={() => setIsConfirming(true)} disabled={busy} className={ui.dangerGhost}>
        {label}
      </button>
    );
  }
  return (
    <Form method="post" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2">
      <span className="text-xs text-ink">{question}</span>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button name="intent" value={intent} disabled={busy} className={`${ui.danger} bg-raised font-semibold`}>
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setIsConfirming(false)} className={ui.ghost}>
        취소
      </button>
    </Form>
  );
}
