import { useEffect, useRef, useState } from "react";
import { data, Form, Link, useNavigation } from "react-router";
import { z } from "zod";

import { requireDemoUser } from "~/features/demo/demo-auth.server";
import { DEMO_TELEGRAM_USER_ID, getDemoStore, resetDemoStore } from "~/features/demo/demo-store.server";
import { handleUpdate } from "~/features/drawer/bot.server";
import { getBotDeps, getNotifyDeps } from "~/features/drawer/deps.server";
import { isLinkTokenShape } from "~/features/drawer/link-token.server";
import { runHourlyNotify } from "~/features/drawer/notify.server";
import { getEnv } from "~/lib/env.server";
import { kstDate } from "~/lib/kst";
import type { Route } from "./+types/drawer.demo-bot";

// Demo mode only: a chat screen that feeds the real bot handler the same Update objects
// Telegram would send, with the fake Telegram client writing replies into a transcript.

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("send"), text: z.string().trim().min(1).max(2000) }),
  z.object({
    intent: z.literal("press"),
    data: z.string().min(1).max(64),
    messageId: z.coerce.number().int(),
    label: z.string().max(100),
  }),
  z.object({ intent: z.literal("notify") }),
  z.object({ intent: z.literal("reset") }),
]);

function requireDemo() {
  if (!getEnv().isDemo) throw data(null, { status: 404 });
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "봇 시뮬레이터 · 이력서랍 데모" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  requireDemo();
  const { userId } = requireDemoUser(request);
  const store = getDemoStore();
  const link = await store.findLinkByTelegramUser(DEMO_TELEGRAM_USER_ID);
  const start = new URL(request.url).searchParams.get("start");
  return {
    transcript: store.transcript.map((entry) => ({ ...entry })),
    linked: link?.userId === userId,
    notifyHour: store.notifyHour.get(userId) ?? null,
    startToken: start && isLinkTokenShape(start) ? start : null,
    botUsername: getEnv().TELEGRAM_BOT_USERNAME,
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireDemo();
  const { userId } = requireDemoUser(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
  const input = parsed.data;
  const store = getDemoStore();
  const chat = { id: DEMO_TELEGRAM_USER_ID, type: "private" };
  const from = { id: DEMO_TELEGRAM_USER_ID };

  try {
    switch (input.intent) {
      case "send": {
        store.addEntry("user", input.text);
        const updateId = store.nextUpdate();
        await handleUpdate(getBotDeps(), {
          update_id: updateId,
          message: { message_id: updateId, from, chat, text: input.text },
        });
        break;
      }
      case "press": {
        store.addEntry("system", `「${input.label}」 버튼을 눌렀어요`);
        await handleUpdate(getBotDeps(), {
          update_id: store.nextUpdate(),
          callback_query: {
            id: `demo-${Date.now()}`,
            from,
            data: input.data,
            message: { message_id: input.messageId, chat },
          },
        });
        break;
      }
      case "notify": {
        const hour = store.notifyHour.get(userId);
        if (hour === undefined) {
          store.addEntry("system", "알림 시간이 꺼져 있어요. 서랍 화면에서 먼저 정해 주세요.");
          break;
        }
        // Pretend it is the chosen hour today (KST) and let the real notifier decide.
        const today = kstDate(new Date());
        const now = new Date(`${today}T${String(hour).padStart(2, "0")}:00:00+09:00`);
        store.notifications.delete(`${userId}:${today}`);
        store.addEntry("system", `오늘 ${hour}:00 정각이 됐다고 가정하고 알림 작업을 실행했어요.`);
        const result = await runHourlyNotify({ ...getNotifyDeps(), now: () => now });
        if (result.sent === 0) {
          store.addEntry("system", "알림 대상이 아니에요. 봇이 연결돼 있지 않거나, 오늘 이미 기록해서 건너뛰었어요.");
        }
        break;
      }
      case "reset":
        resetDemoStore();
        break;
    }
  } catch (error) {
    console.error("demo bot failed", error instanceof Error ? error.name : "unknown");
    getDemoStore().addEntry("system", "처리 중 오류가 났어요.");
  }
  return data({ error: null });
}

export default function DemoBot({ loaderData, actionData }: Route.ComponentProps) {
  const { transcript, linked, notifyHour, startToken, botUsername } = loaderData;
  const busy = useNavigation().state !== "idle";
  const bottom = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [transcript.length]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-900 text-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold">@{botUsername}</h1>
          <p className="text-xs text-slate-400" data-testid="demo-link-status">
            {linked ? "연결됨 · 텔레그램 대신 쓰는 시뮬레이터" : "미연결 · 서랍 화면에서 연결 링크를 받아 주세요"}
          </p>
        </div>
        <Link to="/drawer" className="shrink-0 text-sm text-sky-400 underline">
          서랍으로
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-4">
        {startToken && !linked && (
          <Form method="post" className="flex flex-col gap-2 rounded bg-sky-950 p-3">
            <p className="text-sm">텔레그램에서 링크를 열면 나오는 [시작] 버튼과 같아요.</p>
            <input type="hidden" name="intent" value="send" />
            <input type="hidden" name="text" value={`/start ${startToken}`} />
            <button type="submit" disabled={busy} className="rounded bg-sky-600 py-2 font-semibold disabled:opacity-50">
              시작
            </button>
          </Form>
        )}

        {transcript.length === 0 && (
          <p className="text-center text-sm text-slate-500">아직 대화가 없어요.</p>
        )}

        <ol className="flex flex-col gap-2" data-testid="transcript">
          {transcript.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.from === "user"
                  ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-sky-700 px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
                  : entry.from === "bot"
                    ? "max-w-[85%] self-start"
                    : "self-center text-center text-xs text-slate-400"
              }
            >
              {entry.from === "bot" ? (
                <div className="flex flex-col gap-1">
                  <p className="rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid="bot-message">
                    {entry.text}
                  </p>
                  {entry.keyboard?.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex gap-1">
                      {row.map((button) =>
                        !("callback_data" in button) ? (
                          <a
                            key={button.text}
                            href={button.login_url.url}
                            className="flex-1 rounded bg-slate-700 px-2 py-1.5 text-center text-sm text-sky-300"
                          >
                            {button.text}
                          </a>
                        ) : (
                        <Form key={button.callback_data} method="post" className="flex-1">
                          <input type="hidden" name="intent" value="press" />
                          <input type="hidden" name="data" value={button.callback_data} />
                          <input type="hidden" name="messageId" value={entry.messageId} />
                          <input type="hidden" name="label" value={button.text} />
                          <button
                            type="submit"
                            disabled={busy}
                            className="w-full rounded bg-slate-700 px-2 py-1.5 text-sm text-sky-300 disabled:opacity-50"
                          >
                            {button.text}
                          </button>
                        </Form>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                entry.text
              )}
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      <footer className="sticky bottom-0 border-t border-slate-800 bg-slate-900 px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {actionData?.error && (
            <p role="alert" className="text-sm text-red-400">
              {actionData.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {["/record", "/project", "/help"].map((command) => (
              <Form key={command} method="post">
                <input type="hidden" name="intent" value="send" />
                <input type="hidden" name="text" value={command} />
                <button type="submit" disabled={busy} className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50">
                  {command}
                </button>
              </Form>
            ))}
            <Form method="post">
              <button name="intent" value="notify" disabled={busy} className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50">
                ⏰ {notifyHour === null ? "정각 알림" : `${notifyHour}:00 알림`} 시뮬레이션
              </button>
            </Form>
            <Form method="post">
              <button name="intent" value="reset" disabled={busy} className="rounded bg-slate-800 px-2 py-1 text-red-300 disabled:opacity-50">
                데모 초기화
              </button>
            </Form>
          </div>
          {/* Form data is read at submit time, so clearing the controlled input here is safe. */}
          <Form method="post" className="flex gap-2" onSubmit={() => setDraft("")}>
            <input type="hidden" name="intent" value="send" />
            <input
              name="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="메시지"
              placeholder={linked ? "오늘 한 일을 보내 보세요" : "연결 후 메시지를 보낼 수 있어요"}
              required
              autoComplete="off"
              className="min-w-0 flex-1 rounded bg-slate-800 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={busy} className="shrink-0 rounded bg-sky-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              보내기
            </button>
          </Form>
        </div>
      </footer>
    </main>
  );
}
