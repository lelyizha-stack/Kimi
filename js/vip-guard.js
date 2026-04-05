(function () {
  const STORAGE = {
    loggedIn: "kp_member_logged_in",
    memberCode: "kp_member_code",
    vipActive: "kp_vip_active",
    expiresAt: "kp_vip_expires_at"
  };

  function getSession() {
    return {
      loggedIn: localStorage.getItem(STORAGE.loggedIn) === "true",
      memberCode: localStorage.getItem(STORAGE.memberCode) || "",
      vipActive: localStorage.getItem(STORAGE.vipActive) === "true",
      expiresAt: localStorage.getItem(STORAGE.expiresAt) || ""
    };
  }

  function parseDateSafe(value) {
    if (!value) return null;

    const v = String(value).trim();

    // format YYYY-MM-DD => anggap aktif sampai akhir hari
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const dt = new Date(v + "T23:59:59+07:00");
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // format DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      const [dd, mm, yyyy] = v.split("/");
      const dt = new Date(`${yyyy}-${mm}-${dd}T23:59:59+07:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function showPopup(type) {
    const overlay = document.getElementById("vipLockOverlay");
    const image = document.getElementById("vipLockImage");
    const content = document.getElementById("vipContent");

    if (!overlay || !image) return;

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    if (content) content.style.display = "none";

    if (type === "expired") {
      image.src = "./images/popup2.webp";
      image.alt = "Membership VIP Expired";
    } else {
      image.src = "./images/popup1.webp";
      image.alt = "VIP Terkunci";
    }
  }

  function showContent() {
    const overlay = document.getElementById("vipLockOverlay");
    const content = document.getElementById("vipContent");

    if (overlay) overlay.hidden = true;
    if (content) content.style.display = "";
    document.body.style.overflow = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const session = getSession();
    console.log("VIP SESSION:", session);

    // wajib login
    if (!session.loggedIn) {
      showPopup("locked");
      return;
    }

    // VIP tidak aktif
    if (!session.vipActive) {
      showPopup("expired");
      return;
    }

    const expires = parseDateSafe(session.expiresAt);

    // kalau ada expiry dan sudah lewat
    if (expires && expires.getTime() < Date.now()) {
      localStorage.setItem(STORAGE.vipActive, "false");
      showPopup("expired");
      return;
    }

    showContent();
  });
})();