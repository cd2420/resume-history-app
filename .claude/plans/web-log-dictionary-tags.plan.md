# Plan: 이력서랍 — 키워드 사전으로 태그 붙이기 (관리자 관리 + 사용자 태그 수집)

**Source PRD**: `.claude/prds/resume-drawer-agent.prd.md`
**Related Milestone**: 2 — 책장 열어보기 (태그 필터)
**Complexity**: Medium (DB 테이블 1개 + 수집 함수, 순수 매칭 함수, 저장 경로 2곳)

## Summary
웹 책 화면에서 직접 쓴 기록은 AI를 거치지 않아 태그가 비어 있다. 그래서 책장의 태그 필터에 걸리지 않는다. AI 태그 채우기 버튼은 비용 때문에 없앴으므로, **AI 없이 키워드 사전으로** 저장하는 순간 태그를 붙인다.

사전은 코드가 아니라 **DB 테이블(`tag_dictionary`)**에 둔다. 관리자(서비스 운영자)는 Supabase 대시보드에서 직접 추가·수정한다. 사용자가 웹에서 태그를 입력하면 그 태그도 사전 후보로 **수집**된다. 이미 있는 말이면 넣지 않고 무시한다.

수집한 태그는 바로 공용으로 쓰지 않는다. **관리자가 승인한 항목만** 모든 사용자의 자동 태그에 쓴다. 사용자가 태그에 회사명·내부 시스템명을 적을 수 있어서, 승인 없이 공용으로 쓰면 다른 사용자의 기록에 기밀이 붙을 수 있다.

직군에 묶이지 않게 만든다. 사용자 자신의 태그와 공통 역량 사전을 기본으로 두고, 개발 기술 사전은 첫 번째 **직군 묶음(pack)**으로 둔다.

## 결정
| 항목 | 결정 | 이유 |
|---|---|---|
| 사전 위치 | DB 테이블 `tag_dictionary` | 관리자가 배포 없이 추가·수정 |
| 관리 방법 | Supabase 대시보드 Table Editor(관리 화면은 만들지 않음) | 관리자가 1명인 지금은 화면이 필요 없음(YAGNI) |
| 수집 대상 | 사용자가 **웹에서 직접 입력한 태그**(책 화면 태그 편집) | 요청 범위. AI가 만든 태그는 수집하지 않음 |
| 수집 상태 | `pending`으로 넣음. 관리자가 `approved`로 바꿔야 공용으로 쓰임 | 한 사용자의 기밀 태그가 다른 사용자에게 퍼지는 것을 막음 |
| 중복 | 별칭을 정규화한 값(소문자, 앞뒤 공백 제거, 연속 공백 1칸)에 unique. 수집은 `on conflict do nothing` | 요청대로 중복이면 무시. "Kafka"와 "kafka "는 같은 말 |
| 누가 넣었는지 | 저장하지 않음 | 수집 데이터에서 사용자를 알아볼 수 없게. 탈퇴 시 지울 개인 데이터도 생기지 않음 |
| 적용 대상 | 웹에서 **새로 쓰는 기록** | 텔레그램 기록은 기밀 일반화 AI 호출에서 태그를 함께 받음 |
| 기록 수정 시 | 태그는 다시 계산하지 않음 | 손으로 고친 태그를 덮어쓰지 않음 |
| 태그 우선순위 | ① 사용자 자신의 기존 태그 → ② 승인된 사전(기술·직군 묶음) → ③ 승인된 공통 역량. 같은 단계 안에서는 글에 먼저 나온 순서 | 표기를 사용자 것으로 통일, 구체적인 말을 넓은 말보다 먼저 |
| 개수·형식 | 기존 `normalizeTags`를 거침(최대 5개, 30자) | 텔레그램 기록과 같은 규칙 |
| 직군 | `pack` 컬럼. `null`은 공통, `dev`는 개발 묶음. 지금은 모든 사용자에게 공통 + `dev`를 켬 | 직군 선택은 개발자 외 사용자를 받을 때 결정(PRD Users) |

## DB 설계
```sql
create table public.tag_dictionary (
  id bigint generated always as identity primary key,
  tag text not null check (char_length(btrim(tag)) between 1 and 30),          -- 붙일 표준 표기 (예: Redis)
  alias text not null check (char_length(btrim(alias)) between 1 and 30),      -- 글에서 찾을 말 (예: 레디스)
  alias_key text generated always as (lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) stored,
  kind text not null default 'skill' check (kind in ('tech', 'skill')),
  pack text check (pack in ('dev')),                                            -- null = 모든 직군 공통
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  source text not null default 'admin' check (source in ('admin', 'user')),
  created_at timestamptz not null default now(),
  constraint tag_dictionary_alias_unique unique (alias_key)
);
```
- **RLS**: 로그인 사용자는 `approved`만 읽을 수 있다. 직접 insert·update·delete 권한은 주지 않는다. 관리자 작업은 대시보드(service role)에서 한다.
- **수집 함수** `public.drawer_collect_tags(p_tags text[])`: `security definer`로 만들고 `authenticated`만 실행하게 한다. 각 태그를 `(tag = alias = 입력값, status 'pending', source 'user')`로 넣고 `on conflict (alias_key) do nothing`을 쓴다. 한 번에 최대 5개, 태그당 30자까지만 받는다(`private.valid_tags`로 검사).
- **시드**: 계획서 이전 버전의 기술 사전(약 30개)과 공통 역량 사전을 `approved`, `source 'admin'`으로 넣는다.
- **거절 기록**: 관리자가 쓰지 않기로 한 수집 태그는 지우지 않고 `rejected`로 둔다. 그러면 같은 말이 다시 수집돼도 중복이라 무시된다.
- **마이그레이션 위치**: CLAUDE.md 규칙대로 `drizzle/`에 둔다. 먼저 Drizzle 기준선(`npm run db:pull` → `db:migrate`)을 만든 뒤, 테이블은 `drizzle/schema.ts`, RLS·함수·시드는 `npm run db:generate -- --custom --name=tag_dictionary`로 만든다.

## 매칭 규칙 (순수 함수)
- **영문**: 대소문자를 구분하지 않고 **단어 경계**가 있을 때만 맞춘다. 앞뒤가 영문·숫자가 아니어야 한다. `Java`는 "JavaScript"에, `React`는 "reactive"에 걸리지 않는다. 한글 조사가 붙어도 맞춘다("Redis를").
- **한글**: 부분 문자열로 맞춘다("레디스를" → `Redis`).
- **애매한 짧은 말은 승인하지 않는다**(`Go`, `스프링`). 관리자 승인 기준으로 계획서에 남긴다.
- 함수는 DB에 의존하지 않는다: `suggestTagsFromText(content, { ownTags, entries }) → string[]`. `entries`는 승인된 사전 행이다.

## 사전 읽기
- 웹 action에서 승인된 사전 전체를 읽는다(행 수가 수백 개 수준).
- 서버 인스턴스 메모리에 **10분** 캐시한다. 관리자가 바꾼 내용은 최대 10분 뒤에 반영된다.
- ponytail: 전체 읽기 + 메모리 캐시. 사전이 수천 개를 넘으면 DB에서 매칭하는 방식으로 바꾼다.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `drizzle/schema.ts`, `drizzle/` 마이그레이션 | `tag_dictionary` 테이블, RLS, `drawer_collect_tags`, 시드 |
| `app/features/drawer/tag-dictionary.ts` (새 파일) | 매칭 순수 함수와 `TagEntry` 타입. 서버 전용 import 없음 |
| `app/features/drawer/tag-dictionary.test.ts` (새 파일) | 아래 테스트 |
| `app/features/drawer/drawer-web.server.ts` | `listTagDictionary()`(승인된 항목, 10분 캐시), `collectTags(tags)`(수집 RPC), `createLog(..., tags)` 태그 인자 추가 |
| `app/features/demo/demo-store.server.ts` | 데모용 메모리 사전과 수집(중복 무시)을 같은 규칙으로 |
| `app/routes/drawer.books.$bookId.tsx` | `create_log`: 자기 태그 + 승인 사전으로 태그를 만들어 저장. `update_tags`: 저장한 뒤 입력한 태그를 수집. 수집이 실패해도 태그 저장은 성공으로 처리하고 로그만 남김 |
| `e2e/demo.spec.ts` | 웹 기록에 "레디스"를 넣으면 `Redis` 칩이 붙는지, 태그를 손으로 고친 뒤 다음 기록에 그 태그가 자동으로 붙는지 |

## 테스트 (먼저 작성)
**매칭 함수**
1. 한글 별칭이 표준 표기로 바뀐다: "레디스를 붙였다" → `["Redis"]`
2. 단어 경계: "JavaScript로 화면 개발"은 `Java`를 붙이지 않는다. "reactive 스트림"은 `React`를 붙이지 않는다.
3. 사용자 자신의 태그가 사전보다 먼저 오고, 사용자 표기를 그대로 쓴다.
4. 역량: "응답 지연을 줄이려고 캐시 적용" → `성능 개선`, `캐시`.
5. 우선순위와 상한: 6개 이상 맞아도 5개만.
6. 아무것도 맞지 않으면 빈 배열(지어내지 않음).

**수집·DB (로컬 Postgres 검사)**
7. 같은 말을 대소문자·공백만 바꿔 다시 수집하면 무시된다(행 수 그대로).
8. 수집한 태그는 `pending`이고, 다른 사용자가 읽는 승인 사전에 나오지 않는다.
9. 로그인 사용자는 `tag_dictionary`에 직접 insert·update할 수 없다.
10. `rejected`인 말은 다시 수집해도 상태가 바뀌지 않는다.

## 작업 순서
1. Drizzle 기준선 만들기(`db:pull` → 첫 마이그레이션 주석 확인 → `db:migrate`)
2. 매칭 함수 테스트 작성 → 실패 확인 → 구현
3. `tag_dictionary` 마이그레이션(테이블·RLS·수집 함수·시드) → 로컬 Postgres 검사 → 운영 적용
4. 스토어(Supabase·데모)에 사전 읽기·수집·태그 저장 추가
5. 책 화면 action 연결(`create_log` 자동 태그, `update_tags` 수집)
6. 데모 E2E 보강 → `npm run typecheck`, `npm test`, 데모 E2E

## 관리자 운영 방법
- **추가**: Table Editor에서 `tag`, `alias`, `kind`, `pack`을 넣고 `status = approved`. 한 표기에 별칭이 여럿이면 행을 여러 개 만든다(예: `Redis`/`redis`, `Redis`/`레디스`).
- **수집 검토**: `status = pending`으로 걸러 보고, 쓸 말이면 `tag` 표기를 다듬어 `approved`로, 아니면 `rejected`로 바꾼다.
- **승인 기준**: 회사명·고객사명·내부 시스템명·사람 이름은 승인하지 않는다. 뜻이 여러 개인 짧은 말도 승인하지 않는다.

## 선택 단계 (이번 범위 밖)
- 직군 선택 화면과 다른 직군 묶음(기획·디자인 등). 개발자 외 사용자를 받을 때 PRD Users와 함께 결정.
- 기존 태그 없는 기록 일괄 채우기(같은 함수로 한 번 실행).
- AI가 태그를 0개 준 텔레그램 기록을 사전으로 보완.
- 수집 태그 사용 횟수(`uses`) 집계. 승인 우선순위를 정할 때 필요해지면.

## Risks
| Risk | 대응 |
|---|---|
| 수집 태그에 기밀(회사명·내부 시스템명)이 섞임 | `pending`으로만 저장, 승인한 것만 공용. 누가 넣었는지 저장하지 않음. 승인 기준에 기밀 제외 명시 |
| 사전이 커져 잘못된 태그가 붙음 | 관리자 승인 단계, 단어 경계 규칙. 틀리면 책 화면에서 고침 |
| 수집 함수 남용(대량 insert) | 한 번에 5개·30자 제한, 로그인 사용자만, 중복은 무시. 필요하면 사용자별 일일 상한 추가 |
| 관리자 수정이 늦게 반영됨 | 최대 10분(메모리 캐시) |
| Drizzle 기준선 전에 마이그레이션을 만들면 이력이 꼬임 | 작업 순서 1번으로 기준선부터 |
