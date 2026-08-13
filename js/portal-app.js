/**
 * Captive portal UI + Firebase Auth / Firestore wiring.
 */

import {
  watchAuthState,
  signUp,
  signIn,
  logOut,
  friendlyAuthError,
} from "./auth-service.js";
import {
  getUserDocument,
  saveSelectedPlan,
  markTransactionPending,
  activatePlan,
  friendlyFirestoreError,
} from "./user-service.js";

const plans = Array.from(document.querySelectorAll(".plan"));
const durationTabs = Array.from(document.querySelectorAll(".duration-tab"));
const payMethods = Array.from(document.querySelectorAll(".pay-method"));
const btnPay = document.getElementById("btn-pay");
const btnConfirmPay = document.getElementById("btn-confirm-pay");
const btnGatewayBack = document.getElementById("btn-gateway-back");
const btnRestart = document.getElementById("btn-restart");
const btnConnect = document.getElementById("btn-connect");

const screens = {
  auth: document.getElementById("screen-auth"),
  plans: document.getElementById("screen-plans"),
  gateway: document.getElementById("screen-gateway"),
  processing: document.getElementById("screen-processing"),
  success: document.getElementById("screen-success"),
};

const steps = [
  document.getElementById("step-1"),
  document.getElementById("step-2"),
  document.getElementById("step-3"),
];

const accountBar = document.getElementById("account-bar");
const accountEmail = document.getElementById("account-email");
const accountPlan = document.getElementById("account-plan");
const accountStatus = document.getElementById("account-status");
const btnLogout = document.getElementById("btn-logout");
const authError = document.getElementById("auth-error");
const authForm = document.getElementById("auth-form");
const authSubmit = document.getElementById("auth-submit");
const authToggleBtns = Array.from(document.querySelectorAll("[data-auth-mode]"));
const authNameField = document.getElementById("auth-name-field");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");

let currentUser = null;
let userDoc = null;
let authMode = "login";

let selected = {
  id: "standard",
  name: "30 Mbps Standard",
  speed: "30 Mbps",
  monthly: 499,
};

let duration = {
  months: 1,
  billable: 1,
  free: 0,
  label: "1 Month",
};

let paymentMethod = "upi";
let uploadedDoc = null;

const docDrop = document.getElementById("doc-drop");
const docFileInput = document.getElementById("doc-file");
const docFileMeta = document.getElementById("doc-file-meta");
const docFileName = document.getElementById("doc-file-name");
const docFileSize = document.getElementById("doc-file-size");
const docDropTitle = document.getElementById("doc-drop-title");
const docDropSub = document.getElementById("doc-drop-sub");
const docError = document.getElementById("doc-error");
const docRemove = document.getElementById("doc-remove");
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_DOC_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];

function formatINR(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function showDocError(message) {
  docError.textContent = message;
  docError.classList.add("visible");
}

function clearDocError() {
  docError.textContent = "";
  docError.classList.remove("visible");
}

function isAllowedDoc(file) {
  const name = (file.name || "").toLowerCase();
  const extOk = ALLOWED_DOC_EXTS.some((ext) => name.endsWith(ext));
  const typeOk = !file.type || ALLOWED_DOC_TYPES.includes(file.type);
  return extOk && typeOk;
}

function clearUploadedDoc() {
  uploadedDoc = null;
  docFileInput.value = "";
  docDrop.classList.remove("has-file");
  docFileMeta.classList.remove("visible");
  docFileName.textContent = "—";
  docFileSize.textContent = "—";
  docDropTitle.textContent = "Tap to upload document";
  docDropSub.textContent = "Required for network activation";
  clearDocError();
}

function setUploadedDoc(file) {
  if (!file) {
    clearUploadedDoc();
    return false;
  }
  if (!isAllowedDoc(file)) {
    clearUploadedDoc();
    showDocError("Please upload a PDF, JPG, or PNG file.");
    return false;
  }
  if (file.size > MAX_DOC_BYTES) {
    clearUploadedDoc();
    showDocError("File is too large. Maximum size is 5 MB.");
    return false;
  }

  uploadedDoc = file;
  clearDocError();
  docDrop.classList.add("has-file");
  docFileMeta.classList.add("visible");
  docFileName.textContent = file.name;
  docFileSize.textContent = formatFileSize(file.size);
  docDropTitle.textContent = "Document ready";
  docDropSub.textContent = "You can replace this file anytime";
  return true;
}

function requireDocument() {
  if (uploadedDoc) {
    clearDocError();
    return true;
  }
  showDocError("Please upload your ID document before payment.");
  document.getElementById("doc-upload").scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
  return false;
}

function calcPricing(monthly) {
  const full = monthly * duration.months;
  const total = monthly * duration.billable;
  const savings = full - total;
  return { monthly, full, total, savings };
}

function getQuote() {
  return calcPricing(selected.monthly);
}

function buildPlanPayload(quote = getQuote()) {
  return {
    id: selected.id,
    name: selected.name,
    speed: selected.speed,
    monthlyPrice: selected.monthly,
    durationMonths: duration.months,
    billableMonths: duration.billable,
    freeMonths: duration.free,
    durationLabel: duration.label,
    amount: quote.total,
    fullAmount: quote.full,
    savings: quote.savings,
  };
}

function showScreen(name) {
  Object.values(screens).forEach((el) => {
    if (el) el.classList.remove("active");
  });
  if (screens[name]) screens[name].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAuthError(message) {
  authError.textContent = message || "";
  authError.classList.toggle("visible", Boolean(message));
}

function setAuthMode(mode) {
  authMode = mode;
  authToggleBtns.forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.authMode === mode));
  });
  const isSignup = mode === "signup";
  authNameField.hidden = !isSignup;
  authTitle.textContent = isSignup ? "Create account" : "Welcome back";
  authSubtitle.textContent = isSignup
    ? "Sign up to save your plan and activate hostel Wi‑Fi."
    : "Log in to continue to plan selection and payment.";
  authSubmit.textContent = isSignup ? "Create account" : "Log in";
  showAuthError("");
}

function updateAccountBar() {
  if (!currentUser) {
    accountBar.hidden = true;
    accountBar.setAttribute("aria-hidden", "true");
    return;
  }

  accountBar.hidden = false;
  accountBar.setAttribute("aria-hidden", "false");
  accountEmail.textContent = currentUser.email || currentUser.displayName || "Signed in";

  const active = userDoc && userDoc.activePlan;
  const status = (userDoc && userDoc.transactionStatus) || "none";

  if (active && active.name) {
    accountPlan.textContent =
      active.name +
      (active.durationLabel ? " · " + active.durationLabel : "") +
      " · Active";
  } else if (userDoc && userDoc.selectedPlan && userDoc.selectedPlan.name) {
    accountPlan.textContent =
      userDoc.selectedPlan.name + " · " + (status === "pending" ? "Payment pending" : "Selected");
  } else {
    accountPlan.textContent = "No active plan yet";
  }

  accountStatus.textContent = status === "active" ? "Logged in" : "Logged in";
  accountStatus.dataset.status = status;
}

function syncPlanSelectionFromUserDoc() {
  if (!userDoc || !userDoc.selectedPlan || !userDoc.selectedPlan.id) return;

  const planBtn = plans.find((btn) => btn.dataset.id === userDoc.selectedPlan.id);
  if (planBtn) {
    plans.forEach((p) => p.setAttribute("aria-checked", "false"));
    planBtn.setAttribute("aria-checked", "true");
    selected = {
      id: planBtn.dataset.id,
      name: planBtn.dataset.name,
      speed: planBtn.dataset.speed,
      monthly: Number(planBtn.dataset.price),
    };
  }

  const months = Number(userDoc.selectedPlan.durationMonths);
  if (months) {
    const durBtn = durationTabs.find((btn) => Number(btn.dataset.months) === months);
    if (durBtn) {
      durationTabs.forEach((t) => t.setAttribute("aria-checked", "false"));
      durBtn.setAttribute("aria-checked", "true");
      duration = {
        months: Number(durBtn.dataset.months),
        billable: Number(durBtn.dataset.billable),
        free: Number(durBtn.dataset.free),
        label: durBtn.dataset.label,
      };
    }
  }

  updatePricingUI();
}

function updatePricingUI() {
  const quote = getQuote();
  const durationShort =
    duration.months === 1 ? "1 month" : duration.months + " months";
  const detail = selected.name + " · " + duration.label;

  plans.forEach((btn) => {
    const monthly = Number(btn.dataset.price);
    const p = calcPricing(monthly);
    const amountEl = btn.querySelector("[data-total]");
    const wasEl = btn.querySelector("[data-was]");
    const periodEl = btn.querySelector("[data-period]");
    const durLabel = btn.querySelector(".plan-duration-label");

    amountEl.textContent = formatINR(p.total);
    if (p.savings > 0) {
      wasEl.textContent = formatINR(p.full);
      wasEl.classList.add("visible");
      periodEl.textContent = "total · " + duration.label;
    } else {
      wasEl.textContent = "";
      wasEl.classList.remove("visible");
      periodEl.textContent = "/month";
    }
    if (durLabel) durLabel.textContent = durationShort;
  });

  document.getElementById("summary-detail").textContent = detail;
  document.getElementById("summary-total").textContent = formatINR(quote.total);
  document.getElementById("gateway-plan").textContent = detail;
  document.getElementById("gateway-total").textContent = formatINR(quote.total);

  const wasSummary = document.getElementById("summary-was");
  const savingsChip = document.getElementById("savings-chip");
  if (quote.savings > 0) {
    wasSummary.textContent = formatINR(quote.full);
    wasSummary.classList.add("visible");
    document.getElementById("savings-amount").textContent = formatINR(quote.savings);
    savingsChip.classList.add("visible");
  } else {
    wasSummary.classList.remove("visible");
    savingsChip.classList.remove("visible");
  }

  btnPay.textContent = "Proceed to Pay " + formatINR(quote.total);
  btnConfirmPay.textContent = "Confirm & Pay " + formatINR(quote.total);
}

async function persistSelectedPlan() {
  if (!currentUser) return;
  try {
    const payload = buildPlanPayload();
    await saveSelectedPlan(currentUser.uid, payload);
    userDoc = {
      ...(userDoc || {}),
      selectedPlan: payload,
      transactionStatus: "selected",
    };
    updateAccountBar();
  } catch (error) {
    console.error(error);
    showDocError(friendlyFirestoreError(error));
  }
}

async function selectPlan(btn) {
  plans.forEach((p) => p.setAttribute("aria-checked", "false"));
  btn.setAttribute("aria-checked", "true");
  selected = {
    id: btn.dataset.id,
    name: btn.dataset.name,
    speed: btn.dataset.speed,
    monthly: Number(btn.dataset.price),
  };
  updatePricingUI();
  await persistSelectedPlan();
}

async function selectDuration(btn) {
  durationTabs.forEach((t) => t.setAttribute("aria-checked", "false"));
  btn.setAttribute("aria-checked", "true");
  duration = {
    months: Number(btn.dataset.months),
    billable: Number(btn.dataset.billable),
    free: Number(btn.dataset.free),
    label: btn.dataset.label,
  };
  updatePricingUI();
  await persistSelectedPlan();
}

function selectPayMethod(btn) {
  paymentMethod = btn.dataset.method;
  payMethods.forEach((t) => t.setAttribute("aria-selected", "false"));
  btn.setAttribute("aria-selected", "true");

  document.querySelectorAll(".pay-panel").forEach((panel) => {
    const active = panel.id === "panel-" + paymentMethod;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function randomCreds() {
  const n = String(Math.floor(1000 + Math.random() * 9000));
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return {
    user: "kdhm" + n,
    pass: "Yoga@" + suffix + n.slice(0, 2),
  };
}

function validUntil(months) {
  const d = new Date();
  d.setDate(d.getDate() + months * 30);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function resetSteps() {
  steps.forEach((s, i) => {
    s.classList.remove("active", "done");
    if (i === 0) s.classList.add("active");
  });
}

function methodLabel() {
  if (paymentMethod === "card") return "card";
  if (paymentMethod === "net") return "net banking";
  return "UPI";
}

async function runPayment() {
  const quote = getQuote();
  const planPayload = buildPlanPayload(quote);
  resetSteps();
  document.getElementById("processing-msg").textContent =
    "Confirming " + methodLabel() + " payment · Please wait…";
  showScreen("processing");

  if (currentUser) {
    try {
      await markTransactionPending(currentUser.uid, {
        planId: planPayload.id,
        planName: planPayload.name,
        amount: planPayload.amount,
        method: paymentMethod,
        documentName: uploadedDoc ? uploadedDoc.name : null,
      });
      userDoc = {
        ...(userDoc || {}),
        transactionStatus: "pending",
      };
      updateAccountBar();
    } catch (error) {
      console.error(error);
    }
  }

  [700, 1400, 2100].forEach((ms, i) => {
    setTimeout(() => {
      if (i > 0) {
        steps[i - 1].classList.remove("active");
        steps[i - 1].classList.add("done");
      }
      steps[i].classList.add("active");
    }, ms);
  });

  setTimeout(async () => {
    steps[2].classList.remove("active");
    steps[2].classList.add("done");

    const creds = randomCreds();
    const valid = validUntil(duration.months);

    document.getElementById("cred-user").textContent = creds.user;
    document.getElementById("cred-pass").textContent = creds.pass;
    document.getElementById("success-plan-name").textContent =
      selected.name + " · " + duration.label;
    document.getElementById("meta-speed").textContent = selected.speed;
    document.getElementById("meta-duration").textContent = duration.label;
    document.getElementById("meta-paid").textContent = formatINR(quote.total);
    document.getElementById("meta-valid").textContent = valid;

    const savingsEl = document.getElementById("success-savings");
    if (quote.savings > 0) {
      document.getElementById("success-savings-amount").textContent =
        formatINR(quote.savings) +
        " (" +
        duration.free +
        (duration.free === 1 ? " month" : " months") +
        " free)";
      savingsEl.classList.add("visible");
    } else {
      savingsEl.classList.remove("visible");
    }

    document.querySelectorAll(".copy-btn").forEach((b) => {
      b.textContent = "COPY";
      b.classList.remove("copied");
    });

    if (currentUser) {
      try {
        await activatePlan(currentUser.uid, {
          plan: {
            ...planPayload,
            wifiUsername: creds.user,
            validUntil: valid,
          },
          transaction: {
            planId: planPayload.id,
            planName: planPayload.name,
            amount: planPayload.amount,
            method: paymentMethod,
            documentName: uploadedDoc ? uploadedDoc.name : null,
          },
        });
        userDoc = await getUserDocument(currentUser.uid);
        updateAccountBar();
      } catch (error) {
        console.error(error);
      }
    }

    showScreen("success");
    btnConfirmPay.disabled = false;
  }, 2800);
}

plans.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectPlan(btn);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectPlan(btn);
    }
  });
});

durationTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectDuration(btn);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectDuration(btn);
    }
  });
});

payMethods.forEach((btn) => {
  btn.addEventListener("click", () => selectPayMethod(btn));
});

btnPay.addEventListener("click", async () => {
  if (!currentUser) {
    showScreen("auth");
    showAuthError("Please log in or create an account before payment.");
    return;
  }
  if (!requireDocument()) return;
  await persistSelectedPlan();
  updatePricingUI();
  showScreen("gateway");
});

btnGatewayBack.addEventListener("click", () => {
  showScreen("plans");
});

btnConfirmPay.addEventListener("click", () => {
  if (!currentUser) {
    showScreen("auth");
    return;
  }
  btnConfirmPay.disabled = true;
  runPayment();
});

btnRestart.addEventListener("click", () => {
  clearUploadedDoc();
  showScreen(currentUser ? "plans" : "auth");
  btnConnect.textContent = "Connect to Network";
  btnConnect.disabled = false;
  btnConfirmPay.disabled = false;
});

btnConnect.addEventListener("click", () => {
  btnConnect.textContent = "Connected ✓";
  btnConnect.disabled = true;
  setTimeout(() => {
    btnConnect.textContent = "Connect to Network";
    btnConnect.disabled = false;
  }, 2200);
});

docFileInput.addEventListener("change", () => {
  const file = docFileInput.files && docFileInput.files[0];
  setUploadedDoc(file || null);
});

docRemove.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearUploadedDoc();
});

["dragenter", "dragover"].forEach((evt) => {
  docDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    docDrop.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  docDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    docDrop.classList.remove("is-dragover");
  });
});

docDrop.addEventListener("drop", (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  setUploadedDoc(file);
});

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-copy");
    const text = document.getElementById(id).textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    btn.textContent = "Copied! ✓";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "COPY";
      btn.classList.remove("copied");
    }, 2000);
  });
});

authToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => setAuthMode(btn.dataset.authMode));
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");

  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const displayName = document.getElementById("auth-name").value.trim();

  if (!email || !password) {
    showAuthError("Email and password are required.");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "signup" ? "Creating…" : "Signing in…";

  try {
    if (authMode === "signup") {
      await signUp({ email, password, displayName });
    } else {
      await signIn({ email, password });
    }
    // Auth state listener will switch screens.
  } catch (error) {
    console.error(error);
    showAuthError(friendlyAuthError(error));
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "signup" ? "Create account" : "Log in";
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await logOut();
  } catch (error) {
    console.error(error);
  }
});

watchAuthState(async (user) => {
  currentUser = user;

  if (!user) {
    userDoc = null;
    updateAccountBar();
    setAuthMode("login");
    showScreen("auth");
    return;
  }

  try {
    userDoc = await getUserDocument(user.uid);
  } catch (error) {
    console.error(error);
    userDoc = null;
  }

  updateAccountBar();
  syncPlanSelectionFromUserDoc();
  updatePricingUI();
  showScreen("plans");
});

setAuthMode("login");
updatePricingUI();
