-- Saves one confirmed interview draft (career -> project -> achievements)
-- in a single transaction so a failure never leaves a partial project.
-- security invoker: runs as the caller, so the table RLS policies still apply.

create function public.save_project_draft(draft jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  career jsonb := draft -> 'career';
  project jsonb := draft -> 'project';
  v_career_id uuid;
  v_project_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Reuse the company when the user already restored another project there.
  select id into v_career_id
  from public.careers
  where user_id = (select auth.uid())
    and company_name = career ->> 'company_name'
  order by created_at
  limit 1;

  if v_career_id is null then
    insert into public.careers (company_name, company_desc, role, start_date, end_date)
    values (
      career ->> 'company_name',
      career ->> 'company_desc',
      career ->> 'role',
      to_date(career ->> 'start_date', 'YYYY-MM'),
      to_date(career ->> 'end_date', 'YYYY-MM')
    )
    returning id into v_career_id;
  end if;

  insert into public.projects (career_id, title, summary, my_role, tech_stack, team_size, start_date, end_date)
  values (
    v_career_id,
    project ->> 'title',
    project ->> 'summary',
    project ->> 'my_role',
    array(select jsonb_array_elements_text(coalesce(project -> 'tech_stack', '[]'::jsonb))),
    (project ->> 'team_size')::integer,
    to_date(project ->> 'start_date', 'YYYY-MM'),
    to_date(project ->> 'end_date', 'YYYY-MM')
  )
  returning id into v_project_id;

  insert into public.achievements (project_id, action, decision, impact)
  select v_project_id, item ->> 'action', item ->> 'decision', item ->> 'impact'
  from jsonb_array_elements(coalesce(draft -> 'achievements', '[]'::jsonb)) as item;

  return v_project_id;
end;
$$;

revoke execute on function public.save_project_draft(jsonb) from public, anon;
grant execute on function public.save_project_draft(jsonb) to authenticated;
