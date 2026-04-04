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

  function isExpired(expiresAt) {
    if (!expiresAt) return true;
    const dt = new Date(expiresAt);
    if (Number.isNaN(dt.getTime())) return true;
    return dt.getTime() <= Date.now();
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

    if (!session.loggedIn || !session.memberCode) {
      showPopup("locked");
      return;
    }

    if (!session.vipActive || isExpired(session.expiresAt)) {
      localStorage.setItem(STORAGE.vipActive, "false");
      showPopup("expired");
      return;
    }

    showContent();
  });
})();