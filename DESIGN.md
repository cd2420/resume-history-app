---
name: 이력서랍
description: 기록보존소의 서랍장. 천 장정 책이 호두나무 선반에 꽂히고, 강조색은 놋쇠 하나.
colors:
  ground: "#e6e3dc"
  raised: "#f2f0eb"
  sunken: "#dad6cd"
  line: "#c3bcaf"
  ink: "#1d1a15"
  muted: "#5b5449"
  faint: "#6f675a"
  brass: "#7d5f1e"
  brass-ink: "#fbf7ee"
  brass-soft: "#eadfc2"
  danger: "#9c3424"
  danger-soft: "#f1d9d3"
  ok: "#3a6638"
  ok-soft: "#d9e6d5"
  wood-top: "#a5845f"
  wood: "#8a6a4c"
  wood-dark: "#5e4632"
  contact-shadow: "rgba(40, 28, 16, 0.45)"
  ground-dark: "#161410"
  raised-dark: "#201d18"
  sunken-dark: "#100e0b"
  line-dark: "#3a342b"
  ink-dark: "#ece6da"
  muted-dark: "#a99f8f"
  faint-dark: "#8e8373"
  brass-dark: "#cfa75c"
  brass-ink-dark: "#1c160c"
  brass-soft-dark: "#3a301c"
  danger-dark: "#e58a78"
  danger-soft-dark: "#3d1e18"
  ok-dark: "#93c48d"
  ok-soft-dark: "#1d2f1c"
  wood-top-night: "#6e5640"
  wood-night: "#5a4634"
  wood-dark-night: "#3b2d22"
  contact-shadow-night: "rgba(0, 0, 0, 0.7)"
  label: "#efe7d4"
  label-ink: "#241f1a"
  label-muted: "#4f473e"
  cloth-ink: "#f6f1e6"
  page-edge: "#efe7d4"
  page-edge-line: "#d6cbb2"
  cloth-oxblood: "#6b2b2b"
  cloth-bottle-green: "#2f4b3a"
  cloth-navy: "#23395b"
  cloth-ochre: "#8a6a24"
  cloth-plum: "#4e3350"
  cloth-teal: "#24545a"
  cloth-rust: "#8a4626"
typography:
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  title-sm:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.015em"
  cover-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body-log:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    fontFeature: "tnum"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  row: "12px"
  row-log: "16px"
  page: "24px"
  book-gap-x: "20px"
  book-gap-y: "32px"
  shelf: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-ghost:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  button-ghost-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-danger-hover:
    backgroundColor: "{colors.danger-soft}"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: "32px"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.lg}"
  menu:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.lg}"
    padding: "6px"
    width: "240px"
  menu-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  menu-item-hover:
    backgroundColor: "{colors.sunken}"
  nav-link:
    textColor: "{colors.muted}"
    padding: "0 12px"
    height: "36px"
  nav-link-active:
    textColor: "{colors.ink}"
  book-cover:
    rounded: "{rounded.sm}"
  book-title-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.xs}"
    padding: "8px 10px"
    typography: "{typography.cover-title}"
  book-cover-tag:
    textColor: "{colors.cloth-ink}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  add-book-slot:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
  status-pill-current:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.full}"
  status-pill-done:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "{rounded.full}"
  toast:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  toast-error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.ink}"
---

# Design System: 이력서랍

## Overview

**Creative North Star: "기록보존소의 서랍장"**

이력서랍의 웹은 대시보드가 아니라 서고다. 들어오면 책장이 먼저 보이고, 프로젝트는 천으로 장정한 책이 되어 호두나무 선반 위에 비스듬히 서 있다. 기록이 쌓일수록 책이 두꺼워진다. 물성은 책과 선반 두 곳에만 몰아 둔다. 칸 머리말, 검색, 설정, 기록 목록은 글자와 가는 구분선으로만 정리한 조용한 종이 면이다.

테마는 기기 설정에 따라 바뀐다. 밝은 쪽은 무표백 보존 판지(따뜻한 회갈색 바탕), 어두운 쪽은 먹색 서고(거의 검은 갈색 바탕)다. 두 테마가 같은 역할 토큰을 쓰고, 강조색은 놋쇠 하나다. 놋쇠는 주 실행 버튼, 현재 상태, 활성 내비 밑줄, 포커스, 텍스트 선택, 입력 캐럿, hover 강조에만 쓴다. 책의 재료(크림 라벨, 종이 단면, 천 위 글자)는 두 테마에서 같은 종이와 실이다.

글꼴은 Pretendard 하나다. 위계는 크기, 굵기(600/700), 살짝 좁힌 자간으로 만든다. 바쁜 사람이 1분 안에 찾고 나가는 도구라서 첫 화면은 얇은 상단 바, 한 줄 검색, 바로 이어지는 책장으로 채운다. 상자를 겹겹이 쌓은 카드 레이아웃은 쓰지 않는다. 목록은 구분선으로 나눈 행이다.

**Key Characteristics:**
- 강조색은 놋쇠 하나. 성공(ok)과 위험(danger)은 상태를 알릴 때만 쓴다.
- 글꼴은 Pretendard 하나. 제목은 600/700, 자간 -0.015em.
- 날짜, 개수, 기간은 모두 tabular 숫자로 쓴다(등록번호처럼 자릿수를 맞춤).
- 물성(3D 책, 두 면짜리 나무 선반, 접촉 그림자)은 책장에만 두고 나머지는 평면이다.
- 목록과 칸 머리말은 카드가 아니라 가는 구분선 행이다.
- lucide 선 아이콘, 16px, 선 굵기 1.5.

## Colors

따뜻한 무채색 바탕에 놋쇠 한 색을 쓰고, 깊은 천 색 일곱 가지는 책 표지에만 쓴다.

### Primary
- **놋쇠 (Brass)**: 주 실행 버튼 바탕, 활성 내비 2px 밑줄, '진행 중' 배지, 필터 개수 배지, 포커스 링, `::selection`, 캐럿, 링크와 '책 추가' 슬롯의 hover. 밝은 테마는 어두운 황동(`brass`), 어두운 테마는 밝은 황동(`brass-dark`)이라 두 테마 모두 대비가 유지된다.
- **놋쇠 위 글자 (Brass Ink)**: 놋쇠 바탕 위의 글자 전용.
- **옅은 놋쇠 (Brass Soft)**: 데모 배너, URL 해시로 지목된 기록 행의 배경(50% 투명).

### Secondary
- **호두나무 선반 (Wood Top / Wood / Wood Dark)**: 선반 윗면은 `wood-top`에서 `wood`로 흐르는 그라데이션, 앞면은 `wood-dark`에서 25% 더 어두워지는 그라데이션이다. 서랍장 마크의 몸체(`wood`)와 서랍(`wood-dark`)에도 쓴다. 어두운 테마에서는 `-night` 값으로 바뀐다. 빈 칸에서는 6px `wood-dark` 아래 테두리가 선반 대신 들어간다.
- **접촉 그림자 (Contact Shadow)**: 책이 선반에 닿는 자리의 흐린 타원. 밝은 테마는 갈색 45%, 어두운 테마는 검정 70%.

### Tertiary
- **책 천 일곱 색 (Cloth)**: 옥스블러드, 병 초록, 남색, 황토, 자두, 청록, 녹 주황. 책 id 해시로 한 색이 정해지고, 책장과 책 페이지 헤더에서 같은 색을 유지한다. 표지 밖 UI에는 쓰지 않는다.
- **크림 라벨 (Label / Label Ink / Label Muted)**: 표지에 붙인 제목 라벨의 종이, 제목과 기록 수 글자, 기간 글자.
- **천 위 글자 (Cloth Ink)**: 천 바탕에 직접 놓이는 태그 글자.
- **책 배 (Page Edge / Page Edge Line)**: 두 색을 1px씩 번갈아 깐 줄무늬로 종이 단면을 만든다.

### Neutral
- **바탕 (Ground)**: 페이지 전체 배경.
- **올린 면 (Raised)**: 패널, 보조 버튼, 메뉴, 팝오버, 완료 토스트.
- **꺼진 면 (Sunken)**: 입력란 바탕, 고스트·아이콘 버튼과 메뉴 항목의 hover.
- **선 (Line)**: 모든 테두리와 구분선, '책 추가' 점선, 스크롤바.
- **먹 (Ink)**: 본문과 제목.
- **흐린 먹 (Muted)**: 보조 설명, 비활성 내비, 고스트 버튼 글자, 권수, 폼 라벨.
- **더 흐린 먹 (Faint)**: 날짜, 플레이스홀더, 슬로건, 비활성 메뉴 항목.

### 상태색
- **위험 (Danger / Danger Soft)**: 삭제·탈퇴 버튼(40% 투명 테두리), 오류 토스트 바탕.
- **완료 (Ok / Ok Soft)**: '완결' 배지, 텔레그램 연결됨, 완료 토스트 아이콘.

### Named Rules
**The One Brass Rule.** 강조색은 놋쇠 하나다. 새 강조색을 만들지 않는다. 강조가 필요하면 놋쇠를 쓰거나 강조를 뺀다.

**The Cloth Stays On Books Rule.** 천 일곱 색은 책 표지에만 쓴다. 버튼, 배지, 차트 색으로 가져다 쓰지 않는다.

**The Two Rooms Rule.** 모든 색은 역할 토큰으로 칠한다. 밝은 판지와 어두운 서고는 같은 토큰 이름 아래 값만 바뀐다. 테마와 무관한 책 재료도 `label`, `label-ink`, `label-muted`, `cloth-ink`, `page-edge` 토큰을 쓴다. 토큰이 없는 hex는 천 일곱 색뿐이다.

## Typography

**Body Font:** Pretendard Variable (with Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Apple SD Gothic Neo, Malgun Gothic, sans-serif)

**Character:** 한 가족의 글꼴이 이름과 도구를 모두 맡는다. 제목은 굵기와 살짝 좁힌 자간(-0.015em, `tracking-title`)으로 단단하게 세우고, 본문은 기본 자간으로 숨을 쉬게 둔다.

### Hierarchy
- **Headline** (700, 1.875rem, 1.3, -0.015em): 페이지 제목. 책 제목, '설정'.
- **Title** (600~700, 1.25rem, -0.015em): 서비스 워드마크(700), 월 제목, 빈 책장 안내 제목. 홈·로그인 화면의 이름만 1.5rem 700.
- **Title Small** (600, 1.125rem, -0.015em): 칸 이름, 검색 결과의 책 이름, 설정 행 제목.
- **Cover Title** (700, 0.875rem, 1.35, -0.015em, 최대 3줄): 표지 라벨의 책 제목.
- **Body Log** (400, 0.95rem, 1.625, 최대 70ch): 기록 본문. 줄바꿈을 그대로 둔다.
- **Body** (400, 0.875rem): 컨트롤, 설명, 검색 결과 본문, 권수. 설명 문단은 `max-w-prose`.
- **Label** (500, 0.75rem): 폼 라벨, 날짜, 개수, 표지의 기간과 태그. 숫자는 tabular.

### Named Rules
**The Weight Not Face Rule.** 제목을 본문과 구분할 때는 굵기(600/700)와 `tracking-title`을 쓴다. 두 번째 글꼴을 들이지 않는다.

**The Accession Number Rule.** 날짜, 기간, 개수, 건수는 언제나 `tabular-nums`로 쓴다. 숫자가 행마다 같은 자리에 서야 목록이 장부처럼 읽힌다.

**The Keep Words Rule.** 한글 제목은 `break-keep`으로 어절 단위로 줄을 바꾼다. 긴 영문이나 URL이 섞일 수 있는 기록 본문은 `overflow-wrap: anywhere`를 쓴다.

## Layout

한 열짜리 중앙 정렬 페이지다. 폭은 화면 성격에 따라 좁아진다. 책장은 `max-w-6xl`(72rem), 책은 `max-w-5xl`(64rem), 설정은 `max-w-4xl`(56rem), 홈·로그인·가입은 `max-w-sm`(24rem)이다. 좌우 여백 16px, 위아래 24px, 큰 덩어리 사이 24px.

- **상단 바:** 왼쪽에 마크, 워드마크, 슬로건, 오른쪽에 내비. 아래에 `line` 구분선 하나.
- **책장:** 한 줄 검색, (설정을 마치지 않았으면) 접힌 시작하기 체크리스트, 그 아래 칸들. 칸 사이 40px. 칸 머리말 아래 가는 구분선, 그 아래 책 그리드. 그리드는 2열에서 시작해 440px 이상 3열, md 이상은 `minmax(9.5rem, 1fr)` 자동 채움이다. 책 사이 가로 20px, 세로 32px. 책은 5:7 비율로 칸 폭을 채운다. 그리드 아래에 두 면짜리 선반을 둔다.
- **책:** 미니 표지와 제목 헤더 아래, md 이상에서 8rem 목차 열(sticky)과 기록 열 두 열. 모바일에서는 목차가 가로 스크롤 탭이 된다.
- **기록·검색 행:** 날짜 열(기록 3.5rem, 검색 6.5rem)과 본문 열의 그리드. 행 사이 `line` 구분선, 행 위아래 12~16px.
- **설정:** 위아래 `line`으로 묶은 구분선 행. md 이상에서 15rem 라벨 열(아이콘, 제목, 설명)과 컨트롤 열.
- **현관(홈·로그인·가입):** 화면 정중앙에 서랍장 마크, 이름, 두 줄 슬로건을 가운데 정렬하고, 그 아래 32px 띄워 폼을 둔다.

**The Divider Not Box Rule.** 반복되는 목록(칸, 기록, 검색 결과, 설정 항목)은 카드로 감싸지 않고 구분선 행으로 쌓는다. 패널(`raised`와 `line` 테두리)은 접는 폼이나 빈 상태처럼 한 화면에 한두 개 놓이는 덩어리에만 쓴다.

## Elevation & Depth

기본은 평면이고, 그림자는 실제로 놓이거나 떠 있는 물건에만 붙는다. 바탕, 패널, 입력란의 깊이는 `ground` / `raised` / `sunken` 세 단의 명도 차로 낸다.

### Shadow Vocabulary
- **책 그림자** (`box-shadow: 0 14px 24px -12px rgba(0,0,0,0.6)`): 책장 위 3D 표지. 책 페이지 미니 표지는 `0 12px 22px -10px rgba(0,0,0,0.6)`.
- **접촉 그림자** (`--contact-shadow`, 6px blur 타원): 책 바닥이 선반에 닿는 자리. 너비는 표지의 84%.
- **선반 앞면** (`box-shadow: 0 12px 20px -10px rgba(0,0,0,0.6)`): 선반 앞면 아래로 떨어지는 그림자.
- **뜨는 면** (`box-shadow: 0 18px 40px -16px rgba(0,0,0,0.55)`): 필터 팝오버와 칸 메뉴.
- **토스트** (`box-shadow: 0 16px 36px -14px rgba(0,0,0,0.6)`): 화면 아래 고정 토스트.
- **활성 탭 밑줄** (`box-shadow: inset 0 -2px 0 var(--brass)`): 그림자 문법을 빌린 2px 놋쇠 밑줄.

### Named Rules
**The Only Objects Cast Shadows Rule.** 그림자는 책, 선반, 뜨는 면(팝오버, 메뉴, 토스트)에만 쓴다. 패널, 버튼, 입력란은 그림자 없이 명도와 1px 선으로 구분한다.

**The Books Stand On Wood Rule.** 선반은 윗면(8px)과 앞면(12px) 두 면이고, 앞면이 책 하단을 6px 덮는다(z-index를 책보다 높게). 책 바닥 아래에는 접촉 그림자를 둔다. 책이 선반 위에 떠 보이면 안 된다.

## Shapes

모서리는 작다. 컨트롤과 메뉴 항목 6px, 패널·메뉴·토스트 8px. 책 표지는 앞쪽 4px, 책등 쪽 2px로 비대칭이다(제본된 쪽이 더 각지다). 크림 라벨과 태그는 2px. 알약형은 상태 배지(진행 중, 완결, 연결됨)와 개수 배지에만 쓴다. 테두리는 1px `line`이 기본이다. 강조 테두리는 `brass`(입력 포커스, '책 추가' hover)나 `danger` 40%만 쓴다. 점선 테두리는 '책 추가' 빈 자리에만 쓴다. 선반 윗면은 양 끝을 0.6%씩 깎은 사다리꼴이라 원근이 생긴다.

## Components

### Buttons
도구답고 조용하다. 놋쇠 버튼 하나가 화면의 주 실행을 맡고 나머지는 물러선다.
- **Shape:** 6px 모서리, 0.875rem 글자, 아이콘과 6px 간격, 줄바꿈 없음.
- **Primary:** `brass` 바탕, `brass-ink` 글자, 600 굵기, 8px 14px. 화면당 주 실행 하나(찾기, 책 만들기, 연결하기, 저장).
- **Hover / Active:** primary는 hover 때 밝기 110%, 누르면 1px 내려간다. secondary는 hover 때 테두리가 `faint`로 짙어진다.
- **Secondary:** `raised` 바탕, 1px `line` 테두리, `ink` 글자. 칸 만들기, 이름 바꾸기, 필터 열기.
- **Ghost:** 테두리와 바탕 없이 `muted` 글자. hover 때 `sunken` 바탕과 `ink` 글자. 돌아가기, 지우기, 로그아웃.
- **Danger / Danger Ghost:** `danger` 글자(40% 테두리), hover 때 `danger-soft` 바탕. 삭제와 탈퇴에만 쓴다.
- **Icon:** 32px 정사각. 칸 메뉴(⋯) 같은 보조 조작.
- **Disabled:** 50% 투명(아이콘 버튼은 30%), not-allowed 커서.

### Menus
- **칸 메뉴:** 칸 머리말 끝의 ⋯ 아이콘 버튼 하나에 접기, 위로, 아래로, 이름 바꾸기, 지우기를 모은다. `raised` 바탕, 1px `line`, 8px 모서리, 6px 안쪽 여백, 240px 폭, 뜨는 면 그림자.
- **메뉴 항목:** 높이 36px 이상, 6px 모서리, `ink` 글자, hover 때 `sunken`. 비활성은 `faint`. 입력이 필요한 항목(이름 바꾸기)은 위 `line` 구분선 아래에 작은 폼으로 펼친다.

### Chips
- **상태 배지:** 알약형, 0.75rem 600. 진행 중은 `brass` 바탕 `brass-ink` 글자에 lucide Dot 아이콘. 완결과 연결됨은 `ok-soft` 바탕 `ok` 글자.
- **표지 태그:** 40% 검정 바탕에 `cloth-ink` 글자, 0.75rem 500, 2px 모서리. sm 미만에서는 숨기고 책 페이지에서 보여 준다.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** `raised`, 1px `line` 테두리.
- **Shadow Strategy:** 없음(뜨는 면만 예외, Elevation 참고).
- **Internal Padding:** 16~24px.
- 접히는 덩어리(시작하기 체크리스트, 기록 쓰기, 책 관리)는 `details/summary` 디스클로저로 만든다. 요약 줄은 `muted`이고 hover 때 `ink`가 된다.

### Inputs / Fields
- **Style:** `sunken` 바탕, 1px `line` 테두리, 6px 모서리, 8px 12px, 플레이스홀더 `faint`.
- **Focus:** 테두리가 `brass`로 바뀐다. 전역 `:focus-visible`은 2px `brass` 외곽선, 2px 간격.
- **검색:** 한 줄. 왼쪽에 16px 돋보기(36px 들여쓰기), 오른쪽에 필터 팝오버 버튼(활성 필터 수 배지)과 찾기 버튼.

### Navigation
- **마크:** 나무 몸체에 서랍 셋, 서랍마다 놋쇠 손잡이를 단 26×28 SVG 서랍장. `wood`, `wood-dark`, `brass` 토큰을 따른다.
- **워드마크:** 1.25rem 700, `tracking-title`. 아래에 `faint` 0.75rem 슬로건.
- **링크:** 아이콘과 글자, 높이 36px, 좌우 12px, `muted`이고 hover 때 `ink`. 활성은 바탕 없이 `ink`, 600 굵기, 아래 2px 놋쇠 밑줄 하나뿐이다. 모바일에서는 보조 링크 글자를 화면낭독기 전용으로 숨기고 아이콘만 남긴다.
- **목차(책 페이지):** md 이상에서 왼쪽 세로 `line` 위의 월 목록. hover 때 그 항목의 왼쪽 선이 `brass`가 된다.

### 칸 머리말
칸 이름(1.125rem 600, `tracking-title`)과 'n권'(0.875rem `muted`, tabular)을 한 줄에 baseline으로 맞춘다. 아래에 1px `line` 구분선, 오른쪽 끝에 ⋯ 칸 메뉴. 머리말 자체를 누르면 칸이 접힌다. 라벨 판, 리벳, 테두리 상자는 쓰지 않는다.

### 천 장정 책 (Signature)
- **크기와 자세:** 5:7 비율로 그리드 칸을 채운다. 원근 700px, 바닥 기준으로 22° 돌아서 책등과 두께가 보인다. hover나 포커스 때 정면으로 돌며 10px 떠오르고 103%로 커진다(spring, stiffness 260, damping 22). 누르면 97%.
- **두께:** 기록 수 × 0.8px + 10px, 최대 34px(기록 약 30개). 기록이 쌓인 만큼 두꺼워진다.
- **구조:** 앞표지(천 색, 3px 간격 가로세로 직조 결, 비스듬한 빛 그라데이션, 경첩 홈), 책등(같은 천, 밝기 75%), 책 배(종이 줄무늬).
- **라벨:** 앞표지 위쪽에 크림 라벨 하나. 안에 제목(최대 3줄), 그 아래 한 줄에 기간(`label-muted`)과 '기록 n개'(600, `label-ink`)를 양끝 정렬로 둔다. 라벨 아래에 진행 중 배지와 대표 태그를 둔다.
- **모션 접근성:** OS의 '동작 줄이기'를 따른다. 그때도 책은 22° 돌아 있지만 바뀔 때 움직이지 않는다. 서버 렌더 때부터 쉬는 자세라 하이드레이션 전에도 보인다.
- **전환:** 앞표지와 책 페이지 미니 표지가 같은 view-transition 이름(`book-{id}`)을 쓴다. 그래서 책을 열면 표지가 헤더로 이어진다.

### 책 추가 슬롯
첫 칸의 마지막 자리에 책과 같은 5:7 크기로 둔다. 1px 점선 `line` 테두리, 4px 모서리, 가운데에 22px 책 더하기 아이콘과 '책 추가'(`muted`). hover 때 테두리와 글자가 `brass`가 된다. 누르면 새 책 이름 입력란으로 스크롤하고 포커스를 옮긴다.

### 선반
윗면 8px(`wood-top`에서 `wood`, 양끝을 깎은 사다리꼴)과 앞면 12px(`wood-dark`에서 더 어둡게, 아래 2px 모서리)의 두 면이다. 앞면이 책 하단을 덮고 그 아래로 그림자가 떨어진다.

### 토스트
실행 결과는 화면 아래 가운데에 고정 토스트로 띄워 페이지를 밀어내지 않는다. 8px 모서리, 10px 16px, 0.875rem `ink` 글자, 토스트 그림자. 오류는 `danger-soft` 바탕에 `danger` 40% 테두리와 경고 아이콘, 완료는 `raised` 바탕에 `ok` 40% 테두리와 체크 아이콘이다. 등장은 `toast-in`(200ms ease-out, 8px 아래에서 투명하게 올라옴)이고, 동작 줄이기 설정이면 애니메이션 없이 나타난다.

### 현관 (AuthShell)
홈, 로그인, 가입이 함께 쓰는 입구다. 서랍장 마크, 이름(1.5rem 700), 두 줄 슬로건(0.875rem `muted`)을 가운데 정렬로 세우고 그 아래에 폼을 둔다. 장식은 더하지 않는다.

## Do's and Don'ts

### Do:
- **Do** 모든 색을 역할 토큰(`ground`, `raised`, `sunken`, `line`, `ink`, `muted`, `faint`, `brass`, `label` …)으로 칠해 밝은 판지와 어두운 서고를 함께 지켜라.
- **Do** 아이콘은 lucide 선 아이콘을 16px, 선 굵기 1.5로 써라(`ICON` 상수). 글자 옆 보조 아이콘만 14px로 줄인다.
- **Do** 컨트롤은 `ui.ts`의 어휘(input, primary, secondary, ghost, danger, dangerGhost, icon, panel, label, disclosure)에서 골라 써라. 새 버튼 모양을 만들지 않는다.
- **Do** 제목은 Pretendard 600/700에 `tracking-title`, 날짜와 개수는 `tabular-nums`로 써라.
- **Do** 칸이나 행에 붙는 조작이 여럿이면 ⋯ 메뉴 하나로 모아라.
- **Do** 목록은 구분선 행으로, 날짜 열은 고정 폭 그리드로 맞춰라.
- **Do** 움직임은 책과 토스트에만 주고 `prefers-reduced-motion`을 따르라.
- **Do** 책 표지 색은 `spineColor(id)`로 정해 책장과 책 페이지에서 같은 천을 유지하라.

### Don't:
- **Don't** 놋쇠 말고 다른 강조색을 들이지 마라. 천 일곱 색을 표지 밖 UI에 쓰지도 마라.
- **Don't** 두 번째 글꼴(세리프 포함)을 들이지 마라. 위계는 크기와 굵기로 만든다.
- **Don't** 칸 이름을 라벨 판, 리벳, 테두리 상자에 담지 마라. 이름, 권수, 가는 구분선이면 충분하다.
- **Don't** 기록, 검색 결과, 설정 항목을 그림자 진 카드로 하나씩 감싸지 마라. 상자를 쌓은 관리자 대시보드가 이 시스템이 버린 모습이다.
- **Don't** 패널, 버튼, 입력란에 그림자를 넣지 마라. 그림자는 책, 선반, 뜨는 면에만 쓴다.
- **Don't** 활성 내비에 배경 알약을 깔지 마라. 놋쇠 밑줄 하나로 표시한다.
- **Don't** 결과 알림을 페이지 흐름 안에 끼워 레이아웃을 밀지 마라. 하단 토스트로 띄운다.
- **Don't** 상태를 글리프 문자(●, ✓ 같은 기호)로 표시하지 마라. lucide 아이콘이나 배지 색을 쓴다.
