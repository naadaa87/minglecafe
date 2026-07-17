/* ============================================================
   MINGLE 공통 스크립트 — 메뉴, 밍글보드, 문의 폼
   설정값은 아래 SITE 객체 한 곳에서만 관리합니다.
   ============================================================ */

const SITE = {
  name: "밍글카페",
  storeName: "밍글 무인카페 건대화양점",
  address: "서울특별시 광진구 화양동 10-1",
  addressRoad: "서울 광진구 능동로13길 39",
  // 아래 값은 확정되면 교체하세요. (README의 '값 바꾸기' 참고)
  supportEmail: "spaceblank0100@gmail.com",
  partnershipEmail: "spaceblank0100@gmail.com",
  instagram: "",   // 예: https://instagram.com/mingle_cafe
  kakaoChannel: "" // 예: http://pf.kakao.com/_xxxxx
};

/* ---------- 모바일 메뉴 ---------- */
(function () {
  const btn = document.querySelector(".menu-btn");
  const sheet = document.querySelector(".sheet");
  if (!btn || !sheet) return;
  const close = () => { sheet.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => {
    sheet.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    sheet.querySelector("a, button").focus();
  });
  sheet.querySelector(".sheet__bg").addEventListener("click", close);
  sheet.querySelector(".sheet__close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();

/* ---------- 연락처·주소 자동 채움 ---------- */
document.querySelectorAll("[data-site]").forEach((el) => {
  const key = el.getAttribute("data-site");
  if (SITE[key]) {
    if (el.tagName === "A" && key.includes("mail")) {
      el.href = "mailto:" + SITE[key];
      el.textContent = SITE[key];
    } else {
      el.textContent = SITE[key];
    }
  }
});
/* 인스타·카카오 링크: 값이 비어 있으면 '준비 중' 표시 */
document.querySelectorAll("[data-sns]").forEach((el) => {
  const key = el.getAttribute("data-sns");
  if (SITE[key]) { el.href = SITE[key]; el.target = "_blank"; el.rel = "noopener"; }
  else { el.removeAttribute("href"); el.textContent += " (준비 중)"; el.classList.add("small"); }
});

/* ---------- 개인 연락처 감지 (안내용, 서버에서도 다시 검사) ---------- */
function hasContactInfo(text) {
  const phone = /01[016789][ .-]?\d{3,4}[ .-]?\d{4}/;
  const kakao = /(카톡|카카오톡?|kakao(talk)?)\s*(아이디|id)?\s*[:：]?\s*[A-Za-z0-9_.-]{3,}/i;
  const insta = /(인스타|insta(gram)?)\s*[:：@]?\s*[A-Za-z0-9_.]{3,}/i;
  return phone.test(text) || kakao.test(text) || insta.test(text);
}

/* ============================================================
   밍글보드 — 동네 게시판
   ============================================================ */
const boardEl = document.querySelector("[data-board]");
if (boardEl) initBoard(boardEl);

async function initBoard(root) {
  const listEl = root.querySelector("[data-board-list]");
  const form = root.querySelector("[data-board-form]");
  const chips = root.querySelectorAll("[data-cat-chip]");
  const statusEl = root.querySelector("[data-board-status]");
  const limit = Number(root.getAttribute("data-limit") || 30);
  let currentCat = "all";
  let apiAlive = true;

  const timeAgo = (ts) => {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return "방금 전";
    if (d < 3600) return Math.floor(d / 60) + "분 전";
    if (d < 86400) return Math.floor(d / 3600) + "시간 전";
    return new Date(ts).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  };

  function render(posts) {
    listEl.innerHTML = "";
    const filtered = currentCat === "all" ? posts : posts.filter((p) => p.cat === currentCat);
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "아직 조용하네요. 첫 글을 남겨 보실래요?";
      listEl.appendChild(empty);
      return;
    }
    for (const p of filtered) {
      const art = document.createElement("article");
      art.className = "post";
      const meta = document.createElement("div");
      meta.className = "post__meta";
      const nick = document.createElement("b");
      nick.textContent = p.nick;
      const badge = document.createElement("span");
      badge.className = "badge badge--navy";
      badge.textContent = p.cat;
      const time = document.createElement("span");
      time.textContent = timeAgo(p.ts);
      meta.append(badge, nick, time);
      const body = document.createElement("p");
      body.className = "post__body";
      body.textContent = p.content;           /* textContent — HTML 삽입 차단 */
      const actions = document.createElement("div");
      actions.className = "post__actions";
      const report = document.createElement("a");
      report.href = "mailto:" + SITE.supportEmail + "?subject=" + encodeURIComponent("[밍글보드 신고] " + p.id);
      report.textContent = "신고";
      actions.appendChild(report);
      art.append(meta, body, actions);
      listEl.appendChild(art);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/posts?limit=" + limit);
      if (!res.ok) throw new Error();
      const data = await res.json();
      render(data.posts || []);
    } catch {
      apiAlive = false;
      listEl.innerHTML = "";
      if (statusEl) {
        statusEl.className = "notice notice--gray";
        statusEl.textContent = "지금은 미리보기 화면이에요. Cloudflare에 배포하면 글쓰기와 목록이 바로 작동합니다. (배포 방법은 README 참고)";
        statusEl.hidden = false;
      }
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      currentCat = chip.getAttribute("data-cat-chip");
      load();
    });
  });

  if (form) {
    const showMsg = (text, ok) => {
      const msg = form.querySelector("[data-form-msg]");
      msg.hidden = false;
      msg.className = ok ? "ok-msg" : "err-msg";
      msg.textContent = text;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector("[data-form-msg]");
      msg.hidden = true;
      const fd = new FormData(form);
      const payload = {
        nick: (fd.get("nick") || "").toString().trim(),
        cat: fd.get("cat"),
        content: (fd.get("content") || "").toString().trim(),
        website: fd.get("website") || ""
      };
      if (payload.nick.length < 2 || payload.nick.length > 12) return showMsg("닉네임은 2~12자로 적어 주세요.", false);
      if (payload.content.length < 2) return showMsg("내용을 조금만 더 적어 주세요.", false);
      if (payload.content.length > 600) return showMsg("600자까지 쓸 수 있어요. 조금만 줄여 주세요.", false);
      if (hasContactInfo(payload.nick + " " + payload.content))
        return showMsg("전화번호·카톡 아이디 같은 개인 연락처는 아직 올릴 수 없어요. 쪽지 기능이 준비될 때까지는 게시판 안에서만 소통해 주세요.", false);
      if (!apiAlive) return showMsg("미리보기 화면에서는 저장되지 않아요. 배포 후에 이용해 주세요.", false);

      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "올리는 중…";
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "잠시 후 다시 시도해 주세요.");
        form.reset();
        showMsg("올라갔어요! 좋은 이웃이 되어 주셔서 고마워요.", true);
        load();
      } catch (err) {
        showMsg(err.message || "잠시 후 다시 시도해 주세요.", false);
      } finally {
        btn.disabled = false; btn.textContent = "글 올리기";
      }
    });
  }

  load();
}

/* ============================================================
   제휴·창업 문의 폼
   ============================================================ */
document.querySelectorAll("[data-inquiry-form]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = form.querySelector("[data-form-msg]");
    const btn = form.querySelector("button[type=submit]");
    const fd = new FormData(form);
    const payload = {
      kind: form.getAttribute("data-inquiry-form"),
      ptype: fd.get("ptype") || "",
      name: (fd.get("name") || "").toString().trim(),
      contact: (fd.get("contact") || "").toString().trim(),
      region: (fd.get("region") || "").toString().trim(),
      message: (fd.get("message") || "").toString().trim(),
      agree: fd.get("agree") === "on",
      marketing: fd.get("marketing") === "on",
      website: fd.get("website") || ""
    };
    const fail = (t) => { msg.hidden = false; msg.className = "err-msg"; msg.textContent = t; };
    if (payload.name.length < 2) return fail("성함(또는 소속)을 적어 주세요.");
    if (payload.contact.length < 5) return fail("연락받을 이메일이나 전화번호를 적어 주세요.");
    if (payload.message.length < 10) return fail("문의 내용을 조금만 더 자세히 적어 주시면 답변이 빨라져요.");
    if (!payload.agree) return fail("개인정보 수집·이용 동의가 필요해요. (문의 회신 목적으로만 사용합니다)");

    btn.disabled = true; const orig = btn.textContent; btn.textContent = "보내는 중…";
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "");
      form.reset();
      msg.hidden = false; msg.className = "ok-msg";
      msg.textContent = "접수됐어요. 확인 후 남겨 주신 연락처로 답변드릴게요. 보통 1~2일 안에 연락드립니다.";
    } catch (err) {
      msg.hidden = false; msg.className = "err-msg";
      msg.textContent = (err.message || "지금은 미리보기 화면이라 전송이 되지 않아요.") +
        " 급하시면 " + SITE.partnershipEmail + " 로 직접 메일 주셔도 됩니다.";
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  });
});

/* ---------- 푸터 연도 ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
