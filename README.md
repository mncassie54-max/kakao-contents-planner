# Kakao Contents Planner

DI팀 카카오 콘텐츠 발송 플랜 관리 도구 (v1). 외부 의존성 없는 순수 Node.js.

## 요구사항
- Node.js v22+ (v24 권장). 별도 설치·빌드 없음.

## 실행
    node seed.js     # (선택) 더미 데이터 넣기
    node server.js   # http://localhost:3000

테스트: `node --test "tests/**/*.test.js"`

## 기능
- 월별 캘린더로 발송 플랜 등록/수정/삭제
- 발송 후 결과(오픈률/피드백) 기록
- 이번 주 발송 예정 배너
- 기간 지정 리포트 CSV 다운로드 (엑셀 한글 지원, BOM 포함)

## 데이터
- SQLite 파일 `data.db` (자동 생성). `KCP_DB` 환경변수로 경로 변경 가능.
- 공유: 같은 네트워크에서 서버에 접속하거나, 사내 서버에서 `node server.js` 상시 구동.

## 데이터 원칙
시드/예시는 전부 더미 데이터. 실제 고객·환자·미공개 임상/매출 정보는 넣지 않는다.
