// ┌────────────────────────────────────────────────────────────────┐
// │ Firebase 설정 — Firebase 콘솔의 웹 앱 config 값                    │
// └────────────────────────────────────────────────────────────────┘
// 값을 바꾸려면 Firebase Console → 프로젝트 설정 → 내 앱(웹) → 구성 에서 복사.

export const firebaseConfig = {
  apiKey: "AIzaSyCTdi9SE4TDBUliADpupcEsgmpFkyVbWOA",
  authDomain: "viatris-kakao-contents-planner.firebaseapp.com",
  projectId: "viatris-kakao-contents-planner",
  storageBucket: "viatris-kakao-contents-planner.firebasestorage.app",
  messagingSenderId: "167379070696",
  appId: "1:167379070696:web:690e95259dac061dc0e35d",
};

// 화면 가림막 비밀번호 (⚠️ 비보안: 공개 소스에 그대로 노출됨. 가벼운 접근 차단용).
// 바꾸려면 이 값만 수정하세요.
export const APP_PASSWORD = "viatris";
