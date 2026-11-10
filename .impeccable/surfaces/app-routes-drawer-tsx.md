---
version: 1
slug: "app-routes-drawer-tsx"
primary_target: "app/routes/drawer.tsx"
related_targets: ["app/routes/drawer.books.$bookId.tsx","app/routes/drawer.settings.tsx"]
---

Scope: 이력서랍 웹 전체(/drawer 책장, /drawer/books/:id, /drawer/settings, /drawer/consent, 공통 내비). Mode: Operate.
Audience/job: 이력서를 쓰는 PC 앞의 경력직 개발자. 공고 요건에 맞는 기록을 1분 안에 찾고 책을 정리한다.
Constraints: 3D BookCover·view transition 유지, data-testid/aria-label 유지, 밝은·어두운 테마 둘 다.

## Direction contract
THESIS: 기록보존소의 서랍장. 상자를 쌓은 관리자 대시보드를 거부한다.
OWN-WORLD: 어두운 쪽은 먹색 서고, 밝은 쪽은 무표백 보존 판지. 천 장정 책, 호두나무 선반, 칸마다 놋쇠 라벨 홀더, 등록번호처럼 맞춘 tabular 숫자, 1.5px 선 아이콘. 강조색은 놋쇠 하나.
STORY: 들어오면 책장이 먼저 보이고, 한 줄 검색으로 요건을 찾고, 책을 꺼내 읽고 정리한다.
FIRST VIEWPORT: 얇은 상단 바(이름·내비) 아래 한 줄 검색, 바로 놋쇠 라벨 칸과 책. 설정 미완료는 접힌 한 줄 체크리스트.
FORM: 기록보존소(archive), 근거 목록 4번째, seed 5bc9647a. 브랜드·서재 톤은 사용자가 고정.
FINISH: unreviewed and undocumented is unfinished.
