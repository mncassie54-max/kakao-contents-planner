# Kakao Contents Planner

DI팀 카카오 콘텐츠 발송 플랜 관리 도구 (v2). **정적 사이트 + Firebase Firestore**.
서버 없이 GitHub Pages에 올려 팀원 모두 URL 하나로 접속하고, 데이터는 클라우드에서
실시간 공유됩니다.

## 기능
- 월별 캘린더로 발송 플랜 등록/수정/삭제 (실시간 동기화)
- 발송 후 결과(오픈률/피드백) 기록
- 이번 주 발송 예정 배너
- 기간 지정 리포트 CSV 다운로드 (엑셀 한글 지원, BOM 포함)
- 비밀번호 화면 가림막 (⚠️ 아래 보안 주의)

## 처음 세팅 (한 번만)

### 1) Firebase
1. https://console.firebase.google.com 에서 프로젝트 생성
2. **Build → Firestore Database → 데이터베이스 만들기** (위치 선택 후 생성)
3. **프로젝트 설정(⚙️) → 내 앱 → 웹(</>) 앱 추가** → 나오는 `firebaseConfig` 값 복사
4. `firebase-config.js` 의 `firebaseConfig` 를 복사한 값으로 교체

### 2) Firestore 보안 규칙
Firebase 콘솔 **Firestore → 규칙**에 이 저장소의 `firestore.rules` 내용을 붙여넣고 게시.
> 현재 규칙은 로그인 없이 누구나 읽기/쓰기 가능(더미/훈련 데이터 전용).

### 3) GitHub Pages 배포
저장소 **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
Branch: `main` / `/ (root)` → Save. 잠시 후 공개 URL이 생깁니다:
`https://mncassie54-max.github.io/kakao-contents-planner/`

### 4) 접속
위 URL 접속 → 비밀번호 입력 → 사용. 팀원에게 URL과 비밀번호만 공유하면 됩니다.

## 로컬에서 실행 (선택)
정적 파일이라 아무 정적 서버로 열면 됩니다. 예:

    python -m http.server 3100
    # → http://localhost:3100

(단, 실제 데이터는 `firebase-config.js`에 config가 채워져 있어야 동작)

## 테스트
순수 로직(주간 계산·CSV)만 단위 테스트:

    node --test "tests/**/*.test.js"

## 비밀번호
`firebase-config.js` 의 `APP_PASSWORD` (기본값 `viatris`). 바꾸려면 이 값만 수정.

⚠️ **보안 주의:** 이 비밀번호는 클라이언트(브라우저) 코드에 그대로 들어가 **공개 소스에서
보입니다.** Firestore 규칙도 열려 있어 DB에 직접 접근하면 데이터를 읽을 수 있습니다.
즉 "가벼운 접근 차단"일 뿐 실제 보안이 아닙니다. 실제 업무 데이터를 보호하려면
Firebase Auth(로그인)를 붙이고 규칙을 `request.auth != null` 로 바꿔야 합니다.

## 데이터 원칙
예시는 전부 더미 데이터. 실제 고객·환자·미공개 임상/매출 정보는 넣지 않는다.
회사명·개인 실명 등 민감 정보도 공개 저장소에는 넣지 않는다.
