import { data, Form, redirect, useNavigation } from "react-router";
import { z } from "zod";

import {
  createProject,
  deleteLog,
  type DrawerLog,
  DrawerWebError,
  getDrawerOverview,
  hasRequiredConsents,
  issueLinkToken,
  renameProject,
  setCurrentProject,
  setNotifyHour,
  unlinkTelegram,
  updateLog,
} from "~/features/drawer/drawer-web.server";
import { MAX_LOG_LENGTH, MAX_PROJECT_TITLE } from "~/features/drawer/limits";
import { getEnv } from "~/lib/env.server";
import { requireUser } from "~/lib/supabase.server";
import type { Route } from "./+types/drawer";

const uuid = z.uuid();
const title = z.string().trim().min(1).max(MAX_PROJECT_TITLE);

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("connect") }),
  z.object({ intent: z.literal("unlink") }),
  z.object({
    intent: z.literal("notify_hour"),
    hour: z.union([z.literal("off"), z.coerce.number().int().min(0).max(23)]),
  }),
  z.object({ intent: z.literal("create_project"), title }),
  z.object({ intent: z.literal("rename_project"), projectId: uuid, title }),
  z.object({ intent: z.literal("set_current"), projectId: uuid }),
  z.object({ intent: z.literal("update_log"), logId: uuid, content: z.string().trim().min(1).max(MAX_LOG_LENGTH) }),
  z.object({ intent: z.literal("delete_log"), logId: uuid }),
]);

type ActionResult = { error?: string; deepLink?: string; done?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "이력서랍" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, userId, headers } = await requireUser(request);
  if (!(await hasRequiredConsents(supabase, userId))) throw redirect("/drawer/consent", { headers });
  const overview = await getDrawerOverview(supabase, userId);
  return data({ ...overview, botUsername: getEnv().TELEGRAM_BOT_USERNAME }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, userId, headers } = await requireUser(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data<ActionResult>({ error: "입력값을 확인해 주세요." }, { status: 400, headers });
  }
  const input = parsed.data;

  try {
    switch (input.intent) {
      case "connect": {
        // Linking sends answers to OpenAI, so the consent must exist first.
        if (!(await hasRequiredConsents(supabase, userId))) throw redirect("/drawer/consent", { headers });
        const token = await issueLinkToken(supabase, userId);
        const deepLink = `https://t.me/${getEnv().TELEGRAM_BOT_USERNAME}?start=${token}`;
        return data<ActionResult>({ deepLink }, { headers });
      }
      case "unlink":
        await unlinkTelegram(supabase, userId);
        return data<ActionResult>({ done: "텔레그램 연결을 해제했어요." }, { headers });
      case "notify_hour":
        await setNotifyHour(supabase, userId, input.hour === "off" ? null : input.hour);
        return data<ActionResult>({ done: "알림 시간을 저장했어요." }, { headers });
      case "create_project":
        await createProject(supabase, userId, input.title);
        return data<ActionResult>({ done: "프로젝트를 만들었어요." }, { headers });
      case "rename_project":
        await renameProject(supabase, userId, input.projectId, input.title);
        return data<ActionResult>({ done: "프로젝트 이름을 바꿨어요." }, { headers });
      case "set_current":
        await setCurrentProject(supabase, userId, input.projectId);
        return data<ActionResult>({ done: "현재 프로젝트를 바꿨어요." }, { headers });
      case "update_log":
        await updateLog(supabase, userId, input.logId, input.content);
        return data<ActionResult>({ done: "기록을 고쳤어요." }, { headers });
      case "delete_log":
        await deleteLog(supabase, userId, input.logId);
        return data<ActionResult>({ done: "기록을 지웠어요." }, { headers });
    }
  } catch (error) {
    if (!(error instanceof DrawerWebError)) throw error;
    console.error("drawer action failed", input.intent, error.code ?? "");
    return data<ActionResult>({ error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
  }
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function groupByProject(logs: DrawerLog[]) {
  const groups = new Map<string, DrawerLog[]>();
  for (const log of logs) {
    groups.set(log.project_id, [...(groups.get(log.project_id) ?? []), log]);
  }
  return groups;
}

function Section({ title: heading, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded bg-slate-800 p-4">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

const button = "shrink-0 whitespace-nowrap rounded bg-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const subtle = "shrink-0 whitespace-nowrap rounded bg-slate-700 px-3 py-2 text-sm";
const input = "min-w-0 rounded bg-slate-900 px-3 py-2 text-sm";

export default function Drawer({ loaderData, actionData }: Route.ComponentProps) {
  const { telegram, notifyHour, projects, currentProjectId, logs } = loaderData;
  const busy = useNavigation().state !== "idle";
  const logsByProject = groupByProject(logs);

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🗄️ 이력서랍</h1>
          <Form method="post" action="/logout">
            <button type="submit" className="text-sm text-slate-400 underline">
              로그아웃
            </button>
          </Form>
        </header>

        {actionData?.error && (
          <p role="alert" className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {actionData.error}
          </p>
        )}
        {actionData?.done && (
          <p role="status" className="rounded bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
            {actionData.done}
          </p>
        )}

        <Section title="텔레그램">
          {telegram ? (
            <>
              <p data-testid="telegram-status" className="text-sm">
                연결됨 ✅
                {telegram.blocked && <span className="ml-2 text-amber-400">봇이 차단돼 알림을 못 보내고 있어요. 봇에 아무 메시지나 보내면 풀려요.</span>}
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
                    텔레그램에서 @{loaderData.botUsername} 열기
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
        </Section>

        <Section title="알림 시간">
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="notify_hour" />
            <select
              name="hour"
              aria-label="알림 시간"
              defaultValue={notifyHour === null ? "off" : String(notifyHour)}
              className={input}
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
        </Section>

        <Section title="프로젝트">
          {projects.length === 0 && <p className="text-sm text-slate-300">프로젝트를 하나 만들어야 기록을 받을 수 있어요.</p>}
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-col gap-2 rounded bg-slate-900 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {project.id === currentProjectId && <span className="mr-1 text-sky-400">● 현재</span>}
                    {project.title}
                  </span>
                  {project.id !== currentProjectId && (
                    <Form method="post">
                      <input type="hidden" name="projectId" value={project.id} />
                      <button name="intent" value="set_current" disabled={busy} className={subtle}>
                        현재로
                      </button>
                    </Form>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-slate-400">이름 바꾸기</summary>
                  <Form method="post" className="mt-2 flex gap-2">
                    <input type="hidden" name="intent" value="rename_project" />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input name="title" defaultValue={project.title} maxLength={MAX_PROJECT_TITLE} required className={`${input} flex-1`} />
                    <button type="submit" disabled={busy} className={subtle}>
                      저장
                    </button>
                  </Form>
                </details>
              </li>
            ))}
          </ul>
          <Form method="post" className="flex gap-2">
            <input type="hidden" name="intent" value="create_project" />
            <input
              name="title"
              placeholder="새 프로젝트 이름"
              aria-label="새 프로젝트 이름"
              maxLength={MAX_PROJECT_TITLE}
              required
              className={`${input} flex-1`}
            />
            <button type="submit" disabled={busy} className={button}>
              만들기
            </button>
          </Form>
        </Section>

        <Section title="기록">
          {logs.length === 0 && <p className="text-sm text-slate-300">아직 서랍이 비어 있어요. 텔레그램으로 오늘 한 일을 보내 보세요.</p>}
          {projects
            .filter((project) => logsByProject.has(project.id))
            .map((project) => (
              <div key={project.id} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-300">{project.title}</h3>
                <ul className="flex flex-col gap-2">
                  {logsByProject.get(project.id)!.map((log) => (
                    <li key={log.id} data-testid="log" className="flex flex-col gap-2 rounded bg-slate-900 p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{log.log_date}</span>
                        {log.edited && <span className="rounded bg-slate-700 px-1">직접 수정</span>}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{log.content}</p>
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-400">수정·삭제</summary>
                        <Form method="post" className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="intent" value="update_log" />
                          <input type="hidden" name="logId" value={log.id} />
                          <textarea
                            name="content"
                            defaultValue={log.content}
                            maxLength={MAX_LOG_LENGTH}
                            required
                            rows={3}
                            aria-label="기록 내용"
                            className={input}
                          />
                          <p className="text-xs text-amber-400">고친 글은 그대로 저장돼요. 고객사명·내부 시스템명·절대 수치는 빼고 써 주세요.</p>
                          <button type="submit" disabled={busy} className={button}>
                            고친 내용 저장
                          </button>
                        </Form>
                        <Form
                          method="post"
                          className="mt-2"
                          onSubmit={(event) => {
                            if (!confirm("이 기록을 지울까요?")) event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="logId" value={log.id} />
                          <button name="intent" value="delete_log" disabled={busy} className="text-sm text-red-400 underline">
                            삭제
                          </button>
                        </Form>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </Section>
      </div>
    </main>
  );
}
