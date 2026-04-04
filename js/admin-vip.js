const SUPABASE_URL = "https://rqkgvsbpgmdbfogfljdr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iS7HhDGg2wYGnCH7tqR7HQ_n3Xegih5";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE = {
  loggedIn: "kp_member_logged_in",
  memberCode: "kp_member_code",
  vipActive: "kp_vip_active",
  expiresAt: "kp_vip_expires_at"
};

const el = {
  memberCode: document.getElementById("memberCode"),
  memberPassword: document.getElementById("memberPassword"),
  loginMemberBtn: document.getElementById("loginMemberBtn"),
  logoutMemberBtn: document.getElementById("logoutMemberBtn"),

  newMemberPassword: document.getElementById("newMemberPassword"),
  newMemberPasswordConfirm: document.getElementById("newMemberPasswordConfirm"),
  createMemberBtn: document.getElementById("createMemberBtn"),

  redeemMemberCode: document.getElementById("redeemMemberCode"),
  redeemKey: document.getElementById("redeemKey"),
  redeemKeyBtn: document.getElementById("redeemKeyBtn"),

  vipStatusBox: document.getElementById("vipStatusBox"),
  vipStatusNote: document.getElementById("vipStatusNote")
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function parseBool(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function formatWIB(isoString) {
  if (!isoString) return "-";

  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) {
    return String(isoString);
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta"
  }).format(dt) + " WIB";
}

function getSession() {
  return {
    loggedIn: localStorage.getItem(STORAGE.loggedIn) === "true",
    memberCode: localStorage.getItem(STORAGE.memberCode) || "",
    vipActive: localStorage.getItem(STORAGE.vipActive) === "true",
    expiresAt: localStorage.getItem(STORAGE.expiresAt) || ""
  };
}

function saveSession({ loggedIn, memberCode, vipActive, expiresAt }) {
  localStorage.setItem(STORAGE.loggedIn, String(!!loggedIn));
  localStorage.setItem(STORAGE.memberCode, memberCode || "");
  localStorage.setItem(STORAGE.vipActive, String(!!vipActive));
  localStorage.setItem(STORAGE.expiresAt, expiresAt || "");
}

function clearSession() {
  localStorage.removeItem(STORAGE.loggedIn);
  localStorage.removeItem(STORAGE.memberCode);
  localStorage.removeItem(STORAGE.vipActive);
  localStorage.removeItem(STORAGE.expiresAt);
}

function setStatusRows({ loginText, memberCode, vipStatus, expiresAt, note }) {
  if (el.vipStatusBox) {
    el.vipStatusBox.innerHTML = `
      <div class="mini-row"><span>Login</span><strong>${escapeHtml(loginText)}</strong></div>
      <div class="mini-row"><span>Member ID</span><strong>${escapeHtml(memberCode || "-")}</strong></div>
      <div class="mini-row"><span>Status VIP</span><strong>${escapeHtml(vipStatus || "-")}</strong></div>
      <div class="mini-row"><span>Expired At</span><strong>${escapeHtml(expiresAt || "-")}</strong></div>
    `;
  }

  if (el.vipStatusNote) {
    el.vipStatusNote.textContent = note || "Menunggu aksi berikutnya.";
  }
}

function hydrateFormFromSession() {
  const session = getSession();

  if (el.memberCode && session.memberCode) {
    el.memberCode.value = session.memberCode;
  }

  if (el.redeemMemberCode && session.memberCode) {
    el.redeemMemberCode.value = session.memberCode;
  }

  if (!session.loggedIn) {
    setStatusRows({
      loginText: "Belum Login",
      memberCode: session.memberCode || "-",
      vipStatus: session.vipActive ? "Active" : "-",
      expiresAt: formatWIB(session.expiresAt),
      note: "Silakan login terlebih dahulu. VIP hanya akan terbuka jika login benar dan durasi masih aktif."
    });
    return;
  }

  setStatusRows({
    loginText: "Sudah Login",
    memberCode: session.memberCode || "-",
    vipStatus: session.vipActive ? "Active" : "Expired / Terkunci",
    expiresAt: formatWIB(session.expiresAt),
    note: session.vipActive
      ? "Login berhasil dan VIP masih aktif."
      : "Login berhasil, tetapi VIP belum aktif atau sudah expired. Masukkan key untuk membuka akses."
  });
}

async function createMember() {
  const password = String(el.newMemberPassword?.value || "").trim();
  const confirm = String(el.newMemberPasswordConfirm?.value || "").trim();

  if (!password || !confirm) {
    setStatusRows({
      loginText: "Belum Login",
      memberCode: "-",
      vipStatus: "-",
      expiresAt: "-",
      note: "Password baru dan konfirmasi password wajib diisi."
    });
    return;
  }

  if (password !== confirm) {
    setStatusRows({
      loginText: "Belum Login",
      memberCode: "-",
      vipStatus: "-",
      expiresAt: "-",
      note: "Password baru dan konfirmasi password tidak sama."
    });
    return;
  }

  const { data, error } = await supabaseClient.rpc("create_vip_member", {
    p_password: password,
    p_prefix: "VIP"
  });

  if (error) {
    setStatusRows({
      loginText: "Belum Login",
      memberCode: "-",
      vipStatus: "-",
      expiresAt: "-",
      note: error.message || "Gagal membuat member baru."
    });
    return;
  }

  if (data?.ok && data?.member_code) {
    if (el.memberCode) el.memberCode.value = data.member_code;
    if (el.redeemMemberCode) el.redeemMemberCode.value = data.member_code;

    setStatusRows({
      loginText: "Belum Login",
      memberCode: data.member_code,
      vipStatus: "Belum Aktif",
      expiresAt: "-",
      note: "Member baru berhasil dibuat. Simpan Member ID ini lalu login untuk lanjut."
    });
    return;
  }

  setStatusRows({
    loginText: "Belum Login",
    memberCode: "-",
    vipStatus: "-",
    expiresAt: "-",
    note: data?.message || "Gagal membuat member baru."
  });
}

async function loginMember() {
  const memberCode = String(el.memberCode?.value || "").trim();
  const password = String(el.memberPassword?.value || "").trim();

  if (!memberCode || !password) {
    setStatusRows({
      loginText: "Belum Login",
      memberCode: memberCode || "-",
      vipStatus: "-",
      expiresAt: "-",
      note: "Member ID dan password wajib diisi."
    });
    return;
  }

  const { data, error } = await supabaseClient.rpc("login_vip_member", {
    p_member_code: memberCode,
    p_password: password
  });

  if (error) {
    setStatusRows({
      loginText: "Gagal",
      memberCode: memberCode || "-",
      vipStatus: "-",
      expiresAt: "-",
      note: error.message || "Login gagal."
    });
    return;
  }

  if (data?.login_ok) {
    const isVipActive = parseBool(data.vip_active);

    saveSession({
      loggedIn: true,
      memberCode: data.member_code || memberCode,
      vipActive: isVipActive,
      expiresAt: data.expires_at || ""
    });

    if (el.redeemMemberCode) {
      el.redeemMemberCode.value = data.member_code || memberCode;
    }

    setStatusRows({
      loginText: "Sudah Login",
      memberCode: data.member_code || memberCode,
      vipStatus: isVipActive ? "Active" : "Expired / Terkunci",
      expiresAt: formatWIB(data.expires_at),
      note: data.message || "Login berhasil."
    });
    return;
  }

  clearSession();

  setStatusRows({
    loginText: "Gagal",
    memberCode: memberCode || "-",
    vipStatus: "-",
    expiresAt: "-",
    note: data?.message || "Login gagal."
  });
}

async function redeemKey() {
  const memberCode = String(el.redeemMemberCode?.value || "").trim();
  const key = String(el.redeemKey?.value || "").trim();

  if (!memberCode || !key) {
    const session = getSession();

    setStatusRows({
      loginText: session.loggedIn ? "Sudah Login" : "Belum Login",
      memberCode: memberCode || session.memberCode || "-",
      vipStatus: session.vipActive ? "Active" : "Expired / Terkunci",
      expiresAt: formatWIB(session.expiresAt),
      note: "Member ID dan key wajib diisi."
    });
    return;
  }

  const { data, error } = await supabaseClient.rpc("redeem_vip_key", {
    p_key: key,
    p_member_code: memberCode
  });

  if (error) {
    const session = getSession();

    setStatusRows({
      loginText: session.loggedIn ? "Sudah Login" : "Belum Login",
      memberCode: memberCode || "-",
      vipStatus: session.vipActive ? "Active" : "Expired / Terkunci",
      expiresAt: formatWIB(session.expiresAt),
      note: error.message || "Gagal mengaktifkan key."
    });
    return;
  }

  const session = getSession();

  if (data?.ok) {
    saveSession({
      loggedIn: true,
      memberCode,
      vipActive: true,
      expiresAt: data.new_expires_at || data.expires_at || session.expiresAt || ""
    });

    if (el.memberCode) {
      el.memberCode.value = memberCode;
    }

    setStatusRows({
      loginText: "Sudah Login",
      memberCode,
      vipStatus: "Active",
      expiresAt: formatWIB(data.new_expires_at || data.expires_at),
      note: data.message || "Key berhasil dipakai."
    });

    if (el.redeemKey) {
      el.redeemKey.value = "";
    }

    return;
  }

  setStatusRows({
    loginText: session.loggedIn ? "Sudah Login" : "Belum Login",
    memberCode: memberCode || "-",
    vipStatus: session.vipActive ? "Active" : "Expired / Terkunci",
    expiresAt: formatWIB(session.expiresAt),
    note: data?.message || "Key gagal dipakai."
  });
}

function logoutMember() {
  clearSession();

  if (el.memberPassword) el.memberPassword.value = "";
  if (el.redeemKey) el.redeemKey.value = "";

  hydrateFormFromSession();
}

document.addEventListener("DOMContentLoaded", () => {
  hydrateFormFromSession();

  if (el.createMemberBtn) {
    el.createMemberBtn.addEventListener("click", createMember);
  }

  if (el.loginMemberBtn) {
    el.loginMemberBtn.addEventListener("click", loginMember);
  }

  if (el.redeemKeyBtn) {
    el.redeemKeyBtn.addEventListener("click", redeemKey);
  }

  if (el.logoutMemberBtn) {
    el.logoutMemberBtn.addEventListener("click", logoutMember);
  }
});