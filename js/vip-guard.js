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
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function showPopup(type) {
    const overlay = document.getElementById("vipLockOverlay");
    const image = document.getElementById("vipLockImage");
    const content = document.getElementById("vipContent");

    if (!overlay || !image) return;

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    if (content) {
      content.style.display = "none";
    }

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

    // benar-benar belum login
    if (!session.memberCode) {
      showPopup("locked");
      return;
    }

    // kalau status aktif = true, utamakan buka
    if (session.vipActive) {
      const expires = parseDateSafe(session.expiresAt);

      // kalau tanggal valid dan memang sudah lewat, baru expired
      if (expires && expires.getTime() <= Date.now()) {
        localStorage.setItem(STORAGE.vipActive, "false");
        showPopup("expired");
        return;
      }

      showContent();
      return;
    }

    // punya member id tapi vip mati / expired
    showPopup("expired");
  });
})();