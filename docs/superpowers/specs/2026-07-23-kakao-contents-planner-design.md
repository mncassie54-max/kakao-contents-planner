# Kakao Contents Planner — v1 설계 (Design Spec)

> 작성일: 2026-07-23
> 근거 PRD: DI팀 내부 기획서
> 상태: 승인됨 (사용자 승인 2026-07-23)

## 1. 목적

DI팀이 카카오 콘텐츠 발송 플랜을 등록·관리·공유하고, 발송 후 결과를 기록하며,
기간별 리포트를 뽑을 수 있는 가장 작은 공유 웹앱. 현재 엑셀+Teams 공유 방식을
대체한다.

## 2. 범위 (v1)

포함:
1. 콘텐츠 발송플랜 등록 + 월별 캘린더 표시
2. 발송 후 결과 등록 (오픈률/피드백)
3. 이번 주 발송 알림 배너
4. 기간 리포트 추출 (CSV)

제외 (이번엔 안 만듦):
- 콘텐츠 이미지 업로드
- 로그인 / 권한 관리
- 카테고리·제품·포맷 고정 드롭다운 마스터 관리 (v1은 자유 텍스트 + 자동완성)
- 실시간 협업 편집 락

## 3. 기술 스택

> **2026-07-23 변경:** 실행 환경에 `npm`/네트워크가 없어(바 `node.exe` v24만 존재)
> 외부 패키지 설치가 불가능함이 확인됨. Next.js+Prisma 대신 **외부 의존성 0개의
> 순수 Node.js** 로 전환. 기능·데이터모델·화면 구성은 동일하게 유지.

- **런타임**: Node.js v24 (설치 불필요, 이미 존재)
- **서버**: 내장 `node:http` — 정적 파일 서빙 + JSON REST API
- **DB**: 내장 `node:sqlite` (`DatabaseSync`) — 파일 DB `data.db`
- **프론트**: 의존성 없는 바닐라 HTML/CSS/JS (`public/`)
- **테스트**: 내장 `node:test` + `node:assert`
- **의존성**: 없음. 설치 단계 없이 `node server.js` 한 줄로 구동.

실행: `node server.js` → http://localhost:3000. 같은 네트워크에서 접속해 공유하거나,
`data.db` 파일 자체를 공유할 수 있다. (호스팅 확정 시 같은 서버 코드를 사내 서버에서
상시 구동하면 됨.)

## 4. 데이터 모델

### Content (발송플랜)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | string (cuid) | PK |
| sendDate | DateTime | 발송일 (날짜) |
| sendTime | string | 발송시간 (예: "10:00") |
| title | string | 컨텐츠 제목 |
| link | string? | 연결 링크 |
| category | string? | 카테고리 |
| product | string? | 제품명 |
| format | string? | 포맷 |
| comment | string? | 코멘트 |
| createdAt | DateTime | 생성 시각 |

### Result (발송결과, Content와 1:1)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | string (cuid) | PK |
| contentId | string | FK → Content (unique) |
| openRate | float? | 오픈률(%) |
| feedback | string? | 피드백 |
| recordedAt | DateTime | 기록 시각 |

## 5. 화면 구성

단일 메인 페이지(`/`) + 리포트 페이지(`/report`).

1. **상단 알림 배너** — 이번 주(월~일) 발송 예정 플랜 건수 + 요약 리스트.
   발송이 지났지만 결과 미입력 항목이 있으면 함께 안내.
2. **월별 캘린더** — 각 날짜 셀에 그날 콘텐츠 제목 칩 표시. 빈 셀 클릭 → 등록 모달
   (그 날짜로 프리필). 항목 칩 클릭 → 상세/수정 모달. 이전/다음 달 이동 컨트롤.
3. **등록/수정 모달** — Content 필드 입력. category/product/format은 기존 값 기반 자동완성.
4. **결과 입력** — 상세 모달 내에서 오픈률/피드백 입력·수정. 발송일 지난 항목은 시각적 강조.
5. **리포트 페이지** — 시작일~종료일 지정 → 해당 기간 플랜+결과 표 렌더 → CSV 다운로드.

## 6. API (node:http, REST + JSON). 날짜는 `YYYY-MM-DD` 문자열.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/contents?from=&to=` | 기간 내(양끝 포함) 콘텐츠(+결과) 목록 |
| POST | `/api/contents` | 콘텐츠 생성 |
| GET | `/api/contents/:id` | 단건 조회 |
| PATCH | `/api/contents/:id` | 콘텐츠 수정 |
| DELETE | `/api/contents/:id` | 콘텐츠 삭제 (결과도 cascade 삭제) |
| PUT | `/api/contents/:id/result` | 결과 upsert |
| GET | `/api/week` | 이번 주(월~일) 콘텐츠 목록 (배너용) |
| GET | `/api/report?from=&to=` | CSV 다운로드 (text/csv, BOM 포함) |

## 7. 핵심 로직 (테스트 대상)

- **이번 주 필터링**: 주어진 기준일에 대해 그 주 월요일~일요일 범위를 계산하고
  범위 내 Content를 반환. (경계값: 일요일, 월요일, 월말 걸침)
- **CSV 생성**: Content+Result 배열 → CSV 문자열. 헤더 고정, 값에 쉼표/따옴표/개행
  포함 시 이스케이프. 결과 없는 항목은 빈 칸.
- **API 유효성**: 필수 필드(sendDate, sendTime, title) 누락 시 400.

## 8. 데이터 원칙

시드/예시 데이터는 전부 더미. 실제 고객·환자·미공개 임상·매출 정보는 사용하지 않는다
(PRD 8·9 및 요청 지시).

## 9. 성공 기준 (PRD)

- 팀원이 혼선 없이 상호 콘텐츠 플랜을 입력·관리.
- 매달 1회 카카오 콘텐츠 리포트를 매니저 보고 형태(CSV)로 추출 가능.
