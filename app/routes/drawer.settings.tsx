import { BellRing, CircleCheck, Gauge, Send, TriangleAlert, UserX } from "lucide-react";
import type { ReactNode } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { demoLogoutHeaders } from "~/features/demo/demo-auth.server";
import { ConfirmDelete } from "~/features/drawer/components/ConfirmDelete";
import { DrawerNav, Flash } from "~/features/drawer/components/DrawerNav";
import { TelegramConnect } from "~/features/drawer/components/TelegramSetup";
import { ICON, ui } from "~/features/drawer/components/ui";
import { DAILY_SESSION_LIMIT, DAILY_STAR_LIMIT } from "~/features/drawer/limits";
import { isUnlimited } from "~/features/drawer/roles";
import { FREE_STAR_GENERATIONS } from "~/features/drawer/star";
import { deleteAccount } from "~/features/drawer/deps.server";
import { DrawerDbError } from "~/features/drawer/drawer.server";
import { DrawerWebError } from "~/features/drawer/drawer-web.server";
import { requireConsentedSession } from "~/features/drawer/session.server";
import { getEnv } from "~/lib/env.server";
import { createSupabase } from "~/lib/supabase.server";
import type { Route } from "./+types/drawer.settings";

const actionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("connect"),
    // Field names from consent.ts: TELEGRAM_CONSENT_KIND and versionField(TELEGRAM_CONSENT_KIND).
    telegram: z.literal("on").optional(),
    version_telegram: z.string().optional(),
  }),
  z.object({ intent: z.literal("unlink") }),
  z.object({ intent: z.literal("delete_account") }),
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
  const [{ telegram, notifyHour }, telegramTerm, role] = await Promise.all([store.getOverview(), store.getTelegramTerm(), store.getRole()]);
  return data(
    { telegram, notifyHour, isDemo, telegramTerm, botUsername: getEnv().TELEGRAM_BOT_USERNAME, isUnlimited: isUnlimited(role) },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  // Linking sends answers to OpenAI, so it requires the consents too.
  const { store, headers, isDemo, userId } = await requireConsentedSession(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data<ActionResult>({ error: "입력값을 확인해 주세요." }, { status: 400, headers });
  const input = parsed.data;

  try {
    switch (input.intent) {
      case "connect": {
        // Telegram IDs are collected only with this separate consent, given at the connect button.
        if (input.telegram !== "on") {
          return data<ActionResult>({ error: "텔레그램 연결 약관에 동의해야 연결할 수 있어요." }, { status: 400, headers });
        }
        const term = await store.getTelegramTerm();
        if (input.version_telegram !== term.version) {
          return data<ActionResult>({ error: "약관이 방금 바뀌었어요. 새로고침해서 확인하고 다시 동의해 주세요." }, { status: 409, headers });
        }
        await store.ensureConsent(term);
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
      case "delete_account":
        await deleteAccount(userId);
        throw redirect("/login?deleted=1", { headers: await signOutHeaders(request, isDemo) });
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError || error instanceof DrawerDbError)) throw error;
    console.error("settings action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

/** Clears the session cookies. Local scope: the auth user is already gone, so there is no server session to revoke. */
async function signOutHeaders(request: Request, isDemo: boolean): Promise<Headers> {
  if (isDemo) return demoLogoutHeaders();
  const { supabase, headers } = createSupabase(request);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("sign out after account deletion failed", error.code ?? error.status);
  return headers;
}

/** One settings row: what it is on the left, the control on the right. */
function Row({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[15rem_1fr] md:gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold tracking-title">
          {icon}
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { telegram, notifyHour, isDemo, botUsername, telegramTerm, isUnlimited: hasNoLimits } = loaderData;
  const busy = useNavigation().state !== "idle";

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <DrawerNav isDemo={isDemo} />
        <h1 className="text-3xl leading-[1.3] font-bold tracking-title">설정</h1>
        <Flash error={actionData?.error} done={actionData?.done} />

        <div className="flex flex-col divide-y divide-line border-y border-line">
          <Row
            icon={<Send {...ICON} aria-hidden className="text-brass" />}
            title="텔레그램"
            description="봇이 정한 시간에 오늘 한 일을 물어보고, 답을 이 서랍에 넣어요."
          >
            {telegram ? (
              <>
                <p data-testid="telegram-status" className="inline-flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 font-medium text-ok">
                    <CircleCheck size={14} strokeWidth={1.5} aria-hidden />
                    연결됨
                  </span>
                  {telegram.blocked && (
                    <span className="inline-flex items-start gap-1.5 text-muted">
                      <TriangleAlert size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                      봇이 차단돼 알림을 못 보내고 있어요. 봇에 아무 메시지나 보내면 풀려요.
                    </span>
                  )}
                </p>
                <Form method="post">
                  <button name="intent" value="unlink" disabled={busy} className={ui.secondary}>
                    연결 해제
                  </button>
                </Form>
              </>
            ) : (
              <>
                <p data-testid="telegram-status" className="text-sm text-muted">
                  아직 연결하지 않았어요.
                </p>
                <TelegramConnect isDemo={isDemo} botUsername={botUsername} term={telegramTerm} />
              </>
            )}
          </Row>

          <Row
            icon={<BellRing {...ICON} aria-hidden className="text-brass" />}
            title="알림 시간"
            description="그날 이미 기록했다면 알림을 보내지 않아요."
          >
            <Form method="post" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="intent" value="notify_hour" />
              <select name="hour" aria-label="알림 시간" defaultValue={notifyHour === null ? "off" : String(notifyHour)} className={ui.input}>
                <option value="off">알림 끄기</option>
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    매일 {String(hour).padStart(2, "0")}:00 (한국 시간)
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy} className={ui.primary}>
                저장
              </button>
            </Form>
          </Row>

          <Row
            icon={<Gauge {...ICON} aria-hidden className="text-brass" />}
            title="이용 한도"
            description="AI를 쓰는 기능은 무료로 하루 횟수가 정해져 있어요. 한국 시간 자정에 다시 채워져요."
          >
            {hasNoLimits ? (
              <p className="text-sm">관리자 계정이라 횟수 제한이 없어요.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">텔레그램 기록 AI 정리</dt>
                <dd className="tabular-nums">하루 {DAILY_SESSION_LIMIT}회 (질문 3개 한 번)</dd>
                <dt className="text-muted">STAR 정리</dt>
                <dd className="tabular-nums">
                  하루 {DAILY_STAR_LIMIT}회, 책마다 {FREE_STAR_GENERATIONS}회
                </dd>
                <dt className="text-muted">웹 '기록 직접 쓰기'</dt>
                <dd>제한 없음 (AI를 쓰지 않아요)</dd>
              </dl>
            )}
          </Row>

          <Row
            icon={<UserX {...ICON} aria-hidden className="text-danger" />}
            title="회원 탈퇴"
            description="책장·기록·텔레그램 연결이 모두 지워지고 되돌릴 수 없어요."
          >
            <div>
              <ConfirmDelete
                label="회원 탈퇴"
                question="정말 탈퇴할까요? 모든 기록이 바로 지워져요."
                intent="delete_account"
                fields={{}}
                busy={busy}
                confirmLabel="탈퇴하기"
              />
            </div>
          </Row>
        </div>
      </div>
    </main>
  );
}
