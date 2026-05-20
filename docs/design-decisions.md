# AI DC 게이미피케이션 UI — 디자인 결정 기록
## Step 1: frontend-design 스킬 적용 결과

### 디자인 방향 (frontend-design 스킬 기준)

**Purpose:** AI DC 플랫폼 학습자 게이미피케이션 대시보드.
역량 발현 행동 기반 XP 시스템 — "포인트 집착 방지 원칙"을 시각적으로 구현.

**Tone:** Professional Dark — 기업 교육 환경에서 절제된 게임 요소.
과도한 게임화 금지. 역량 개발 진지함 + 동기부여 균형.

**Differentiation:** 12역량 각 고유 색상 + 진행 추이 가시화.
"합격선 도달 후 멈춤 없음" 원칙이 디자인에 반영 — XP 상한선 없는 연속적 진행.

### 확정 컬러 팔레트

- **배경**: #0a0e1a (깊은 네이비)
- **서피스**: #111827, #1a2236 (카드)
- **액센트**: #C8A96E (황금 — 기존 AI DC 솔루션 --accent 정합)
- **12역량**: 각 고유 색상 12종 (파란·주황·초록·보라·분홍·청록·황색·라임·핑크·틸·주황·보라)

### AI 티 5요소 0건 선언

- 그라데이션: XP 바 단일 방향 그라데이션만 (황금 계열·기능적)
- 블롭/웨이브: 0건
- Glassmorphism 남용: 0건 (카드 배경 단순 불투명 처리)
- 이모지: 0건 (UI 텍스트 없음)
- 진부 일러스트: 0건 (아이콘 없음·순수 CSS)

### 접근성 (WCAG AA)

- 본문 텍스트 #f1f5f9 on #0a0e1a: 대비 ≈ 16:1 ✅
- 보조 텍스트 #94a3b8 on #0a0e1a: 대비 ≈ 7.2:1 ✅
- 황금 #C8A96E on #0a0e1a: 대비 ≈ 5.8:1 (대형 텍스트·레벨 표시용) ✅
- 키보드 네비게이션: 기본 HTML 구조 준수

### 기술 스택 정합

- 바닐라 HTML/CSS/JS ✅
- Pretendard CDN ✅
- CSS 변수 (design-system.css) ✅
- 하드코딩 색상·크기 0건 ✅
- 4 시뮬 약자: IB (In-Basket)·RP (Role-Playing)·**PRES (Presentation)**·GD (Group Discussion) — AI Presentation 기법은 AI Canvas 도구로 구현 (대장님 분부 KST 15:34 정합·AC = Assessment 약자 혼동 방지)
  - JS data 주입: `var(--comp-N)` 문자열 직접 전달
  - JS 색상 배열: `getComputedStyle()` + `alpha()` 헬퍼 패턴
  - CSS 비표준 불투명도: `color-mix(in srgb, var(--X) N%, transparent)`
  - design-system.css 신규 변수 3종: `--accent-subtle`·`--accent-light`·`--shadow-glow-sm`

### 아이콘 라이브러리 (Phosphor Icons — 대장님 분부 KST 15:52 "가자" 확정)

- **Phosphor Icons CDN**: `<script src="https://unpkg.com/@phosphor-icons/web"></script>`
- 라이선스: MIT (상업 무료)·9,000+ 아이콘·6 weight (Thin/Light/Regular/Bold/Fill/Duotone)
- 적용 원칙:
  - 순수 장식 아이콘: `aria-hidden="true"` 전체 적용 (WCAG AA 정합)
  - 의미 전달 아이콘: `aria-label="..."` 추가
- 아이콘 체계:
  - 12역량: ph-target·ph-scales·ph-megaphone-simple·ph-handshake·ph-chat-circle·ph-users·ph-graduation-cap·ph-lightning·ph-lightbulb·ph-buildings·ph-star·ph-book-open
  - UI: ph-trophy·ph-crown-simple·ph-medal·ph-lock-simple·ph-check-circle 등
- AI Slop 원칙 유지: 이모지 0건 대체·과도한 아이콘 남발 금지

### Step 2 (design-html) 완료 ✅
5종 파일 구현 완료. 박진영 grep 검출 18건 → 종합 전수 재검증 추가 9건 → CSS 변수 전환 완료.

### Step 3 (design-system slop-check) 완료 ✅
최종 grep 검증: 하드코딩 브랜드 색상 0건·AI Slop 5요소 0건. 결과 `docs/ai-slop-audit.md` 저장 완료.

---

## Step 4: 라이트 B컨셉 전환 (2026-05-20 KST)

### 전환 배경
대장님 분부: "어두운 컨셉을 버리자. 밝게 가자" + "B로 가자" (B = 코칭·성장 스토리)

### 컨셉 전환 — Professional Dark → 라이트 B컨셉

| 항목 | A (Professional Dark) | **B (코칭·성장 스토리)** |
|------|----------------------|----------------------|
| 톤 | 어둡고 절제된 게임 UI | 밝고 따뜻한 성장 여정 |
| 배경 | #0a0e1a 단색 | 황금·파란 블롭 + 도트 그리드 3중 레이어 |
| 카드 | 어두운 표면 | 흰 배경 + 드롭쉐도우 |
| 메타포 | 게임 (XP·레벨업·왕관) | 성장 (마일스톤·트렌드·여정) |
| 아이콘 (1위) | 왕관 SVG | 별 SVG (성취 마일스톤) |
| 트로피 | 트로피 SVG | 성장 트렌드 꺾은선 SVG |

### 라이트 팔레트 (design-system.css 기준)

- **배경**: `#f5f7fb` + 3중 레이어 배경 패턴
  - 황금 블롭: `radial-gradient(ellipse at 8% 12%, rgba(184,146,58,0.10))`
  - 파란 블롭: `radial-gradient(ellipse at 92% 88%, rgba(37,99,235,0.07))`
  - 도트 그리드: `radial-gradient(rgba(0,0,0,0.028) 1px, transparent 1px)` 22px 타일
- **카드**: `#ffffff` + `box-shadow: 0 2px 8px rgba(0,0,0,0.05)`
- **테두리**: `#e2e8f0` (명확한 라이트 보더)
- **hover 테두리**: `var(--bc-hover)` (`#cbd5e1`)
- **진행바 트랙**: `#e2e8f0` (선명한 라이트 트랙)
- **액센트**: `#b8923a` (황금 — 라이트 배경 대비 최적화)

### 신규 CSS 변수 (Step 4 추가)

| 변수 | 값 | 용도 |
|------|----|------|
| `--bc-hover` | `#cbd5e1` | hover border-color 전용 |
| `--bc-strong` | `#b0bec8` | strong hover border-color |
| `--border-color-hover` | (--bc-hover 동의어) | WCAG 정합 |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.05)` | 카드 기본 그림자 |
| `--shadow-card-hover` | `0 8px 24px rgba(0,0,0,0.10)` | hover 강화 그림자 |
| `--accent-soft` | `rgba(184,146,58,0.15)` | 강조 카드 배경 |

### 성장 메타포 전환 (leaderboard)

- 제목: "리더보드" → "성장 여정 리더보드"
- 서브텍스트: "동료 코호트 함께 성장하는 여정 · 2026년 2분기"
- 1위 아이콘: 왕관 → 별(star) SVG
- 2위 아이콘: 메달 → 성장 화살표 SVG (원 + 위 방향)
- 3위 아이콘: 메달 → 마일스톤 마커 SVG
- 트로피: 트로피 SVG → 성장 트렌드 꺾은선 SVG

### 정정 사이클 (2026-05-20 KST)

| 정정 항목 | before | after |
|---------|--------|-------|
| 하드코딩 #hex | 8건 | **0건** |
| aria (4종) | 0건 | **22건** |
| leaderboard 성장 메타포 | 0건 | **7건** |
| xp-bar 줄 수 | 304줄 | **300줄** |
| 5종 평균 | 93.6% | **97.13%** |

**박진영 R-26 재채점: 97.13% ✅ 5종 전체 통과 (2026-05-20 KST)**
