import { data, Form, useNavigation } from "react-router";
import { z } from "zod";

import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { getEnv } from "~/lib/env.server";
import type { Route } from "./+types/drawer.settings";

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("connect") }),
  z.object({ intent: z.literal("unlink") }),
  z.object({
    intent: z.literal("notify_hour"),
    hour: z.union([z.literal("off"), z.coerce.number().int().min(0).max(23)]),
  }),
]);

type ActionResult = { error?: string; deepLink?: string; done?: string };

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function meta({}: Route.MetaArgs) {
  return [{ title: "설정 · 이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { store, headers, isDemo } = await requireConsentedSession(request);
  const { telegram, notifyHour } = await store.getOverview();
  return data({ telegram, notifyHour, isDemo, botUsername: getEnv().TELEGRAM_BOT_USERNAME }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  // Linking sends answers to OpenAI, so it requires the consents too.
  const { store, headers, isDemo } = await requireConsentedSession(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data<ActionResult>({ error: "입력값을 확인해 주세요." }, { status: 400, headers });
  const input = parsed.data;

  try {
    switch (input.intent) {
      case "connect": {
        const token = await store.issueLinkToken();
        // Demo mode has no real bot: the link opens the in-app bot simulator instead.
        const deepLink = isDemo
          ? `/drawer/demo-bot?start=${token}`
          : `https://t.me/${getEnv().TELEGRAM_BOT_USERNAME}?start=${token}`;
        return data<ActionResult>({ deepLink }, { headers });
      }
      case "unlink":
        await store.unlinkTelegram();
        return data<ActionResult>({ done: "텔레그램 연결을 해제했어요." }, { headers });
      case "notify_hour":
        await store.setNotifyHour(input.hour === "off" ? null : input.hour);
        return data<ActionResult>({ done: "알림 시간을 저장했어요." }, { headers });
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("settings action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const subtle = "shrink-0 whitespace-nowrap rounded bg-slate-700 px-3 py-2 text-sm";

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { telegram, notifyHour, isDemo, botUsername } = loaderData;
  const busy = useNavigation().state !== "idle";

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <DrawerNav isDemo={isDemo} />
        <Flash error={actionData?.error} done={actionData?.done} />

        <section className="flex flex-col gap-3 rounded bg-slate-800 p-4">
          <h2 className="text-lg font-semibold">텔레그램</h2>
          {telegram ? (
            <>
              <p data-testid="telegram-status" className="text-sm">
                연결됨 ✅
                {telegram.blocked && (
                  <span className="ml-2 text-amber-400">봇이 차단돼 알림을 못 보내고 있어요. 봇에 아무 메시지나 보내면 풀려요.</span>
                )}
              </p>
              <Form method="post">
                <button name="intent" value="unlink" disabled={busy} className={subtle}>
                  연결 해제
                </button>
              </Form>
            </>
          ) : (
            <>
              <p data-testid="telegram-status" className="text-sm text-slate-300">
                아직 연결하지 않았어요.
              </p>
              {actionData?.deepLink ? (
                <div className="flex flex-col gap-2">
                  <a href={actionData.deepLink} data-testid="deep-link" className={`${button} text-center`}>
                    {isDemo ? "봇 시뮬레이터에서 연결하기" : `텔레그램에서 @${botUsername} 열기`}
                  </a>
                  <p className="text-xs text-slate-400">9분 안에 한 번만 쓸 수 있어요. 연결한 뒤 이 페이지를 새로고침하세요.</p>
                </div>
              ) : (
                <Form method="post">
                  <button name="intent" value="connect" disabled={busy} className={button}>
                    텔레그램 연결 링크 받기
                  </button>
                </Form>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded bg-slate-800 p-4">
          <h2 className="text-lg font-semibold">알림 시간</h2>
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="notify_hour" />
            <select
              name="hour"
              aria-label="알림 시간"
              defaultValue={notifyHour === null ? "off" : String(notifyHour)}
              className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="off">알림 끄기</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  매일 {String(hour).padStart(2, "0")}:00 (한국 시간)
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className={button}>
              저장
            </button>
          </Form>
          <p className="text-xs text-slate-400">그날 이미 기록했다면 알림을 보내지 않아요.</p>
        </section>
      </div>
    </main>
  );
}
