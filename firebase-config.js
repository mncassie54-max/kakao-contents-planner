// ┌────────────────────────────────────────────────────────────────┐
// │ Firebase 설정 — Firebase 콘솔의 웹 앱 config 값을 여기에 붙여넣기 │
// └────────────────────────────────────────────────────────────────┘
// Firebase Console → 프로젝트 설정 → 내 앱(웹) → SDK 설정 및 구성 → "구성"
// 에 나오는 firebaseConfig 객체 값을 그대로 복사해 아래를 교체하세요.

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE",
  appId: "PASTE",
};

// 화면 가림막 비밀번호 (⚠️ 비보안: 공개 소스에 그대로 노출됨. 가벼운 접근 차단용).
// 바꾸려면 이 값만 수정하세요.
export const APP_PASSWORD = "viatris";
