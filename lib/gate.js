// 화면 가림막 (client-side, 비보안). 올바른 비밀번호 입력 시 resolve.
import { APP_PASSWORD } from "../firebase-config.js";

const KEY = "kcp_auth";

export function requirePassword() {
  return new Promise((resolve) => {
    if (sessionStorage.getItem(KEY) === "1") return resolve();

    const backdrop = document.createElement("div");
    backdrop.className = "gate-backdrop";
    backdrop.innerHTML = `
      <form class="gate-box" id="gateForm">
        <h3>🔒 Kakao Contents Planner</h3>
        <label>비밀번호</label>
        <input type="password" id="gatePw" autocomplete="current-password" autofocus />
        <div class="gate-err" id="gateErr" style="display:none">비밀번호가 올바르지 않습니다.</div>
        <button type="submit" class="primary" style="margin-top:12px; width:100%">입장</button>
      </form>`;
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#gateForm");
    const pw = backdrop.querySelector("#gatePw");
    const err = backdrop.querySelector("#gateErr");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (pw.value === APP_PASSWORD) {
        sessionStorage.setItem(KEY, "1");
        backdrop.remove();
        resolve();
      } else {
        err.style.display = "block";
        pw.value = "";
        pw.focus();
      }
    });
  });
}
