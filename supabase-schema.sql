-- =====================================================================
-- Aoi-system · 全新数据模型（团队 / 成员 / 团队数据）
-- 重写自旧 leader_data 单表模型，改为「团队」粒度以支持多人管理。
-- 在 Supabase SQL Editor 中一次性执行。
-- =====================================================================

-- 1. 团队表：一个团一行，owner 为团长（超级管理员）
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default '我的团',
  invite_code text,
  member_key  text,
  created_at  timestamptz not null default now()
);

-- 迁移：为已存在的团队补充 member_key 字段（新建库已含此列，可安全重复执行）
alter table teams add column if not exists member_key text;

-- 2. 成员表：团长 + 管理员，user 可属于多个团队（phase 0+1 仅使用首个团队）
create table if not exists team_members (
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner', 'admin')),
  email      text,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- 3. 团队数据表：业务数据 blob，后续阶段（订单/活动/批次等）填充
create table if not exists team_data (
  team_id    uuid primary key references teams(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- RPC（security definer：绕过 RLS，由函数内部校验身份）
-- =====================================================================

-- 创建我的团；已属于某团队则直接返回该团队 id
create or replace function public.create_my_team(team_name text default '我的团')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing_team_id uuid;
  new_team_id uuid;
  caller_email text;
begin
  if caller is null then
    raise exception '未登录';
  end if;

  select team_id into existing_team_id
  from team_members where user_id = caller limit 1;
  if existing_team_id is not null then
    return existing_team_id;
  end if;

  insert into teams (owner_id, name)
  values (caller, team_name)
  returning id into new_team_id;

  select email into caller_email from auth.users where id = caller;

  insert into team_members (team_id, user_id, role, email)
  values (new_team_id, caller, 'owner', caller_email);

  insert into team_data (team_id) values (new_team_id);

  return new_team_id;
end;
$$;

-- 通过邀请码加入团队（成为管理员）
create or replace function public.join_team_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_team_id uuid;
  caller_email text;
begin
  if caller is null then
    raise exception '未登录';
  end if;

  select id into target_team_id from teams where invite_code = code;
  if target_team_id is null then
    raise exception '邀请码无效';
  end if;

  select email into caller_email from auth.users where id = caller;

  insert into team_members (team_id, user_id, role, email)
  values (target_team_id, caller, 'admin', caller_email)
  on conflict (team_id, user_id) do nothing;

  return target_team_id;
end;
$$;

-- 团长重新生成邀请码
create or replace function public.regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  team_id uuid;
  new_code text := substr(md5(random()::text), 1, 8);
begin
  if caller is null then
    raise exception '未登录';
  end if;

  select id into team_id from teams where owner_id = caller limit 1;
  if team_id is null then
    raise exception '仅团长可生成邀请码';
  end if;

  update teams set invite_code = new_code where id = team_id;
  return new_code;
end;
$$;

-- 团长重新生成团员密钥（团员端免登录访问口令）
create or replace function public.regenerate_member_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  team_id uuid;
  new_code text := substr(md5(random()::text), 1, 8);
begin
  if caller is null then
    raise exception '未登录';
  end if;

  select id into team_id from teams where owner_id = caller limit 1;
  if team_id is null then
    raise exception '仅团长可生成团员密钥';
  end if;

  update teams set member_key = new_code where id = team_id;
  return new_code;
end;
$$;

-- =====================================================================
-- 团员端匿名访问（security definer 绕过 RLS，内部校验 member_key）
-- 注意：任何持有 member_key 的人都能读/写团队数据，密钥即访问凭证。
-- ⚠️ 线上库重跑验证清单（v1.7.0 起本节函数签名有变更，必须 drop 后重建）：
--   1. 在 Supabase SQL Editor 顺序执行本文件；
--   2. 执行下方「排查 SQL」确认两个 RPC 存在且 anon 有 EXECUTE 权限；
--   3. 确认每个团队在 team_data 有一行（写入 RPC 已改为 upsert 自动补行）。
-- =====================================================================

-- 按团员密钥读取团队名 + 业务数据 blob + 数据版本（匿名，无 auth.uid）
-- drop 再建：create or replace 无法变更返回结构，旧签名残留会导致重跑报错
drop function if exists public.get_team_by_member_key(text);
create function public.get_team_by_member_key(member_key text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'name', t.name,
    'data', coalesce(d.data, '{}'::jsonb),
    'updatedAt', d.updated_at
  )
  from teams t
  left join team_data d on d.team_id = t.id
  where t.member_key = member_key
  limit 1;
$$;

-- 按团员密钥写入业务数据 blob（匿名，覆盖整份数据；密钥即授权）
-- v1.7.0 修复：
--   ① insert ... on conflict upsert —— 旧版只 update，team_data 缺行时
--      影响 0 行仍返回成功，造成"保存成功但什么都没写"（仅团员端复现）；
--   ② 可选乐观锁 expected_updated_at —— 与 team_data.updated_at 不一致时拒绝，
--      防止整 blob 覆盖竞态（"改了又没了"）；
--   ③ 返回写入后的 updated_at，供前端下次写入作为乐观锁版本。
drop function if exists public.update_team_data_by_member_key(text, jsonb);
create function public.update_team_data_by_member_key(
  member_key text,
  new_data jsonb,
  expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  target_team_id uuid;
  new_updated_at timestamptz;
begin
  select t.id into target_team_id from teams t where t.member_key = member_key limit 1;
  if target_team_id is null then
    raise exception '密钥无效';
  end if;

  if expected_updated_at is not null then
    if (select updated_at from team_data where team_id = target_team_id)
        is distinct from expected_updated_at then
      raise exception '数据已被他人修改，请刷新后重试';
    end if;
  end if;

  insert into team_data (team_id, data, updated_at)
  values (target_team_id, new_data, now())
  on conflict (team_id) do update
    set data = excluded.data, updated_at = excluded.updated_at
  returning updated_at into new_updated_at;

  return new_updated_at;
end;
$$;

-- —— 排查 SQL（线上排障时在 SQL Editor 执行）——
-- ① RPC 是否存在：
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('get_team_by_member_key','update_team_data_by_member_key');
-- ② anon 是否有执行权限（应均为 true）：
--   select has_function_privilege('anon','public.get_team_by_member_key(text)','EXECUTE');
-- ③ 团队密钥是否为 null：select id, name, member_key from teams;

-- =====================================================================
-- 行级安全策略（RLS）
-- =====================================================================
alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_data enable row level security;

-- teams：成员可读自己所在团队；owner 可更新（改名 / 邀请码由 RPC 负责）
create policy "teams_select_member" on teams for select
  using (exists (
    select 1 from team_members m
    where m.team_id = teams.id and m.user_id = auth.uid()
  ));

create policy "teams_update_owner" on teams for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- team_members：成员可读本团队全部成员；owner 可删除成员。
-- 插入只经 join_team_by_code / create_my_team RPC，故无需 insert 策略。
-- 成员身份判断（security definer 绕过 RLS，避免 members_select 自引用递归）
create or replace function public.is_team_member(t uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from team_members m
    where m.team_id = t and m.user_id = auth.uid()
  );
end;
$$;

create policy "members_select" on team_members for select
  using (public.is_team_member(team_members.team_id));

create policy "members_delete_owner" on team_members for delete
  using (exists (
    select 1 from teams t
    where t.id = team_members.team_id and t.owner_id = auth.uid()
  ));

-- team_data：成员可读写本团队数据
create policy "team_data_select" on team_data for select
  using (exists (
    select 1 from team_members m
    where m.team_id = team_data.team_id and m.user_id = auth.uid()
  ));

create policy "team_data_insert" on team_data for insert
  with check (exists (
    select 1 from team_members m
    where m.team_id = team_data.team_id and m.user_id = auth.uid()
  ));

create policy "team_data_update" on team_data for update
  using (exists (
    select 1 from team_members m
    where m.team_id = team_data.team_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from team_members m
    where m.team_id = team_data.team_id and m.user_id = auth.uid()
  ));
