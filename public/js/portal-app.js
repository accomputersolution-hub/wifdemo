/**
 * Captive portal UI + Firebase Auth / Firestore wiring.
 */

import {
  watchAuthState,
  signUp,
  signIn,
  logOut,
  friendlyAuthError,
} from "./auth-service.js?v=2.8";
import {
  getUserDocument,
  saveSelectedPlan,
  markTransactionPending,
  markTransactionFailed,
  activatePlan,
  setConnectionStatus,
  ensureActivePlanDetails,
  friendlyFirestoreError,
} from "./user-service.js?v=2.8";
import {
  RAZORPAY_CONFIG,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_FINGERPRINT,
  createOrderOrFallback,
  verifyPaymentOrSkip,
  getDomesticCheckoutConfig,
  buildDomesticPrefill,
} from "./razorpay-config.js?v=2.8";

const plans = Array.from(document.querySelectorAll(".plan"));
const durationTabs = Array.from(document.querySelectorAll(".duration-tab"));
const btnPay = document.getElementById("btn-pay");
const btnRestart = document.getElementById("btn-restart");
const btnConnect = document.getElementById("btn-connect");
const btnDashToggle = document.getElementById("btn-dash-toggle");
const btnDashLogout = document.getElementById("btn-dash-logout");

const screens = {
  auth: document.getElementById("screen-auth"),
  plans: document.getElementById("screen-plans"),
  processing: document.getElementById("screen-processing"),
  success: document.getElementById("screen-success"),
  dashboard: document.getElementById("screen-dashboard"),
};

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
/** Tracks which Firebase uid the in-memory session belongs to. */
let sessionUid = null;

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

const INITIAL_SELECTED = {
  id: "standard",
  name: "30 Mbps Standard",
  speed: "30 Mbps",
  monthly: 499,
};

const INITIAL_DURATION = {
  months: 1,
  billable: 1,
  free: 0,
  label: "1 Month",
};

function clearBrowserStorage() {
  try {
    localStorage.clear();
  } catch (error) {
    console.warn("Could not clear localStorage:", error);
  }
  try {
    sessionStorage.clear();
  } catch (error) {
    console.warn("Could not clear sessionStorage:", error);
  }
}

function clearAuthForm() {
  const email = document.getElementById("auth-email");
  const password = document.getElementById("auth-password");
  const name = document.getElementById("auth-name");
  if (email) email.value = "";
  if (password) password.value = "";
  if (name) name.value = "";
  showAuthError("");
}

function clearPlanUiSelection() {
  plans.forEach((btn, index) => {
    btn.setAttribute("aria-checked", index === 0 ? "true" : "false");
  });
  durationTabs.forEach((btn) => {
    btn.setAttribute(
      "aria-checked",
      String(Number(btn.dataset.months) === INITIAL_DURATION.months)
    );
  });
}

function clearActivePlanDisplays() {
  const ids = [
    "cred-user",
    "cred-pass",
    "cred-mac",
    "meta-speed",
    "meta-duration",
    "meta-paid",
    "meta-valid",
    "success-plan-name",
    "dash-cred-user",
    "dash-cred-pass",
    "dash-mac",
    "dash-plan-name",
    "dash-speed",
    "dash-duration",
    "dash-paid",
    "dash-status",
    "dash-device",
    "dash-binding",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });

  const title = document.getElementById("success-title");
  if (title) title.textContent = "Payment Successful!";
  const subtitle = document.getElementById("success-subtitle");
  if (subtitle) {
    subtitle.innerHTML =
      'Your <span id="success-plan-name">plan</span> is now active.';
  }
  const macNote = document.getElementById("success-mac-note");
  if (macNote) {
    macNote.textContent =
      "Locked to this device. Account sharing is strictly restricted.";
  }
  const savings = document.getElementById("success-savings");
  if (savings) savings.classList.remove("visible");

  btnConnect.textContent = "Connect to Network";
  btnConnect.disabled = false;
  if (btnPay) btnPay.disabled = false;
  btnRestart.textContent = "Log out";

  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.textContent = "COPY";
    btn.classList.remove("copied");
  });
}

/**
 * Reset all in-memory app state to the initial logged-out defaults.
 * Call this on logout AND before binding a new uid after login/signup.
 */
function resetClientState({ clearAuthFields = true } = {}) {
  currentUser = null;
  userDoc = null;
  sessionUid = null;
  authMode = "login";
  selected = { ...INITIAL_SELECTED };
  duration = { ...INITIAL_DURATION };
  clearUploadedDoc();
  if (clearAuthFields) clearAuthForm();
  clearPlanUiSelection();
  clearActivePlanDisplays();
  updatePricingUI();
  updateAccountBar();
}

/**
 * Wipe previous session completely when auth uid changes or becomes null.
 */
function wipePreviousSessionState() {
  currentUser = null;
  userDoc = null;
  sessionUid = null;
  selected = { ...INITIAL_SELECTED };
  duration = { ...INITIAL_DURATION };
  clearUploadedDoc();
  clearPlanUiSelection();
  clearActivePlanDisplays();
}

/**
 * Full logout: Firebase signOut + clear storage + reset UI to login.
 * Next login always loads a fresh users/{uid} document from Firestore.
 */
async function performLogout() {
  try {
    await logOut(); // Firebase Auth signOut()
  } catch (error) {
    console.error("Firebase signOut failed:", error);
  } finally {
    clearBrowserStorage();
    resetClientState({ clearAuthFields: true });
    setAuthMode("login");
    showScreen("auth");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatINR(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function macFromUid(uid) {
  const source = String(uid || "device");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    bytes.push((hash >>> (i * 5)) & 0xff);
  }
  bytes[0] = (bytes[0] & 0xfe) | 0x02;
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function detectDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "Apple iOS device";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows device";
  if (/Mac OS X|Macintosh/i.test(ua)) return "Mac device";
  if (/Linux/i.test(ua)) return "Linux device";
  return "This browser device";
}

function validUntilDate(months) {
  const d = new Date();
  d.setDate(d.getDate() + months * 30);
  return d;
}

function formatValidUntil(date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function hasActiveSubscription(doc) {
  // Real routing: users/{uid}.activePlan must exist and still be valid.
  if (!doc || !doc.activePlan || typeof doc.activePlan !== "object") return false;

  const plan = doc.activePlan;
  if (!(plan.id || plan.name || plan.wifiUsername)) return false;

  if (plan.validUntilIso) {
    const expiry = new Date(plan.validUntilIso);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return false;
    }
  }

  return true;
}

function getConnectionStatus() {
  if (userDoc && userDoc.connectionStatus) return userDoc.connectionStatus;
  if (userDoc && userDoc.activePlan && userDoc.activePlan.connectionStatus) {
    return userDoc.activePlan.connectionStatus;
  }
  return "connected";
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
  const connected = getConnectionStatus() === "connected";

  if (hasActiveSubscription(userDoc)) {
    accountPlan.textContent =
      (active.name || "Active plan") +
      (active.durationLabel ? " · " + active.durationLabel : "") +
      (connected ? " · Online" : " · Offline");
    accountStatus.textContent = "Active subscriber";
  } else if (userDoc && userDoc.selectedPlan && userDoc.selectedPlan.name) {
    accountPlan.textContent =
      userDoc.selectedPlan.name + " · " + (status === "pending" ? "Payment pending" : "Selected");
    accountStatus.textContent = "Logged in";
  } else {
    accountPlan.textContent = "No active plan yet";
    accountStatus.textContent = "Logged in";
  }

  accountStatus.dataset.status = hasActiveSubscription(userDoc) ? "active" : status;
}

async function hydrateActivePlanDetails() {
  if (!currentUser || !userDoc || !userDoc.activePlan) return userDoc;

  const plan = { ...userDoc.activePlan };
  let changed = false;

  if (!plan.wifiUsername || !plan.wifiPassword) {
    const creds = randomCreds();
    plan.wifiUsername = plan.wifiUsername || creds.user;
    plan.wifiPassword = plan.wifiPassword || creds.pass;
    changed = true;
  }

  if (!plan.macAddress) {
    plan.macAddress = macFromUid(currentUser.uid);
    changed = true;
  }

  if (!plan.deviceLabel) {
    plan.deviceLabel = detectDeviceLabel();
    changed = true;
  }

  if (!plan.connectionStatus) {
    plan.connectionStatus = userDoc.connectionStatus || "connected";
    changed = true;
  }

  if (changed) {
    try {
      await ensureActivePlanDetails(currentUser.uid, plan);
      userDoc = {
        ...userDoc,
        activePlan: plan,
        connectionStatus: plan.connectionStatus,
      };
    } catch (error) {
      console.error(error);
      userDoc = { ...userDoc, activePlan: plan };
    }
  }

  return userDoc;
}

function renderDashboard() {
  const plan = (userDoc && userDoc.activePlan) || {};
  const connected = getConnectionStatus() === "connected";
  const name =
    currentUser && (currentUser.displayName || currentUser.email)
      ? currentUser.displayName || currentUser.email
      : "guest";

  const welcome = document.getElementById("dash-welcome");
  if (!welcome) return;

  welcome.textContent = "Welcome back, " + name;
  document.getElementById("dash-plan-name").textContent =
    plan.name || "Active hostel Wi‑Fi plan";
  document.getElementById("dash-plan-validity").textContent =
    "Valid until " + (plan.validUntil || "—");
  document.getElementById("dash-speed").textContent = plan.speed || "—";
  document.getElementById("dash-duration").textContent = plan.durationLabel || "—";
  document.getElementById("dash-paid").textContent =
    plan.amount != null ? formatINR(plan.amount) : "—";
  document.getElementById("dash-status").textContent = connected ? "Online" : "Offline";
  document.getElementById("dash-cred-user").textContent = plan.wifiUsername || "—";
  document.getElementById("dash-cred-pass").textContent = plan.wifiPassword || "—";
  document.getElementById("dash-mac").textContent = plan.macAddress || "—";
  document.getElementById("dash-device").textContent = plan.deviceLabel || detectDeviceLabel();
  document.getElementById("dash-binding").textContent = connected
    ? "MAC locked · session live"
    : "MAC locked · disconnected";

  const pill = document.getElementById("dash-status-pill");
  const label = document.getElementById("dash-connection-label");
  if (pill && label && btnDashToggle) {
    pill.classList.toggle("is-offline", !connected);
    label.textContent = connected ? "Connected" : "Disconnected";
    btnDashToggle.textContent = connected ? "Disconnect Wi‑Fi" : "Reconnect Wi‑Fi";
  }
}

function renderActivePlanView({ fromPayment = false } = {}) {
  const plan = (userDoc && userDoc.activePlan) || {};
  const titleEl = document.getElementById("success-title");
  const subtitleEl = document.getElementById("success-subtitle");
  const savingsEl = document.getElementById("success-savings");

  if (fromPayment) {
    titleEl.textContent = "Payment Successful!";
    subtitleEl.innerHTML =
      'Your <span id="success-plan-name"></span> is now active.';
    document.getElementById("success-plan-name").textContent =
      (plan.name || selected.name) +
      " · " +
      (plan.durationLabel || duration.label);
  } else {
    titleEl.textContent = "Active Plan Dashboard";
    subtitleEl.innerHTML =
      'Your <span id="success-plan-name"></span> is already active.';
    document.getElementById("success-plan-name").textContent =
      plan.name || "hostel Wi‑Fi plan";
    savingsEl.classList.remove("visible");
  }

  document.getElementById("cred-user").textContent = plan.wifiUsername || "—";
  document.getElementById("cred-pass").textContent = plan.wifiPassword || "—";
  document.getElementById("cred-mac").textContent = plan.macAddress || "—";
  document.getElementById("meta-speed").textContent = plan.speed || "—";
  document.getElementById("meta-duration").textContent = plan.durationLabel || "—";
  document.getElementById("meta-paid").textContent =
    plan.amount != null ? formatINR(plan.amount) : "—";
  document.getElementById("meta-valid").textContent = plan.validUntil || "—";

  const device = plan.deviceLabel || detectDeviceLabel();
  const mac = plan.macAddress || "this device";
  document.getElementById("success-mac-note").textContent =
    "Bound to " + mac + " · " + device + ". Account sharing is restricted.";

  document.querySelectorAll("#screen-success .copy-btn").forEach((b) => {
    b.textContent = "COPY";
    b.classList.remove("copied");
  });

  const connected = getConnectionStatus() === "connected";
  btnConnect.textContent = connected ? "Connected ✓" : "Connect to Network";
  btnConnect.disabled = connected;
  btnRestart.textContent = "Log out";

  // Keep the secondary dashboard screen in sync if present.
  if (document.getElementById("dash-plan-name")) {
    renderDashboard();
  }
}

async function openActivePlanDashboard({ fromPayment = false } = {}) {
  await hydrateActivePlanDetails();
  renderActivePlanView({ fromPayment });
  updateAccountBar();
  showScreen("success");
}

/**
 * After login/signup: load users/{uid} and route by activePlan.
 * - activePlan present & valid → Active Dashboard
 * - otherwise → plan selection / payment
 */
async function routeAfterAuth() {
  updateAccountBar();

  if (hasActiveSubscription(userDoc)) {
    await openActivePlanDashboard({ fromPayment: false });
    return;
  }

  syncPlanSelectionFromUserDoc();
  updatePricingUI();
  showScreen("plans");
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

  btnPay.textContent = "Pay " + formatINR(quote.total);
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
  return formatValidUntil(validUntilDate(months));
}

function amountToPaise(amountInr) {
  return Math.round(Number(amountInr) * 100);
}

/**
 * Persist paid plan + open Active Dashboard immediately (no fake delay).
 */
async function finalizeSuccessfulPayment({ planPayload, quote, razorpayResponse }) {
  const creds = randomCreds();
  const expiry = validUntilDate(duration.months);
  const valid = formatValidUntil(expiry);
  const macAddress = currentUser ? macFromUid(currentUser.uid) : macFromUid("guest");
  const deviceLabel = detectDeviceLabel();
  const paymentId =
    (razorpayResponse && razorpayResponse.razorpay_payment_id) ||
    `TXN${Date.now().toString(36).toUpperCase()}`;

  const activePlan = {
    ...planPayload,
    wifiUsername: creds.user,
    wifiPassword: creds.pass,
    macAddress,
    deviceLabel,
    connectionStatus: "connected",
    validUntil: valid,
    validUntilIso: expiry.toISOString(),
    transactionId: paymentId,
    razorpayPaymentId: paymentId,
  };

  const transaction = {
    planId: planPayload.id,
    planName: planPayload.name,
    amount: planPayload.amount,
    currency: "INR",
    method: "razorpay",
    documentName: uploadedDoc ? uploadedDoc.name : null,
    transactionId: paymentId,
    razorpayPaymentId: paymentId,
    razorpayOrderId:
      (razorpayResponse && razorpayResponse.razorpay_order_id) || null,
    razorpaySignature:
      (razorpayResponse && razorpayResponse.razorpay_signature) || null,
    mode: RAZORPAY_CONFIG.testMode ? "test" : "live",
  };

  if (currentUser) {
    try {
      await activatePlan(currentUser.uid, {
        plan: activePlan,
        transaction,
      });
      userDoc = await getUserDocument(currentUser.uid);
    } catch (error) {
      console.error(error);
      userDoc = {
        ...(userDoc || {}),
        uid: currentUser.uid,
        transactionStatus: "active",
        connectionStatus: "connected",
        activePlan,
        lastTransaction: { ...transaction, status: "paid" },
      };
    }
  } else {
    userDoc = {
      transactionStatus: "active",
      connectionStatus: "connected",
      activePlan,
      lastTransaction: { ...transaction, status: "paid" },
    };
  }

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

  renderActivePlanView({ fromPayment: true });
  updateAccountBar();
  showScreen("success");
  if (btnPay) btnPay.disabled = false;
}

/**
 * Open Razorpay Standard Checkout:
 * 1) POST /api/create-order
 * 2) open modal with order_id
 * 3) POST /api/verify-payment (HMAC) then activate plan
 */
async function startRazorpayCheckout() {
  if (!currentUser) {
    showScreen("auth");
    showAuthError("Please log in before payment.");
    return;
  }

  if (typeof window.Razorpay !== "function") {
    alert("Razorpay checkout failed to load. Please refresh and try again.");
    return;
  }

  const quote = getQuote();
  const planPayload = buildPlanPayload(quote);
  const amountPaise = amountToPaise(quote.total);

  if (!amountPaise || amountPaise < 100) {
    alert("Invalid payment amount.");
    return;
  }

  btnPay.disabled = true;

  try {
    await markTransactionPending(currentUser.uid, {
      planId: planPayload.id,
      planName: planPayload.name,
      amount: planPayload.amount,
      currency: "INR",
      method: "razorpay",
      documentName: uploadedDoc ? uploadedDoc.name : null,
      mode: "test",
    });
    userDoc = {
      ...(userDoc || {}),
      transactionStatus: "pending",
    };
    updateAccountBar();
  } catch (error) {
    console.error(error);
  }

  async function recordPaymentFailure(reason) {
    if (!currentUser) return;
    try {
      await markTransactionFailed(currentUser.uid, {
        planId: planPayload.id,
        planName: planPayload.name,
        amount: planPayload.amount,
        currency: "INR",
        method: "razorpay",
        mode: "test",
        failureReason: reason,
      });
      userDoc = {
        ...(userDoc || {}),
        transactionStatus: "failed",
      };
      updateAccountBar();
    } catch (error) {
      console.error(error);
    }
  }

  let checkout;
  try {
    checkout = await createOrderOrFallback({
      amountPaise,
      receipt: `wifi_${currentUser.uid.slice(0, 8)}_${Date.now()}`
        .replace(/[^a-zA-Z0-9_]/g, "")
        .slice(0, 40),
      notes: {
        planId: planPayload.id,
        planName: planPayload.name,
        uid: currentUser.uid,
        durationLabel: planPayload.durationLabel,
        portal: "kaivalyadhama-hostel-wifi",
      },
    });
  } catch (error) {
    console.error(error);
    btnPay.disabled = false;
    void recordPaymentFailure(error.message || "create-order failed");
    alert(error.message || "Could not create payment order. Is the API running?");
    return;
  }

  const order = checkout.order;
  const requireVerify = checkout.mode === "standard";
  const checkoutKey = order.key_id || RAZORPAY_KEY_ID;

  if (!checkoutKey || !String(checkoutKey).startsWith("rzp_")) {
    btnPay.disabled = false;
    alert("Razorpay Key ID is missing. Run npm run sync:razorpay-env and redeploy.");
    return;
  }

  console.info(
    "[Razorpay] opening checkout with",
    RAZORPAY_KEY_FINGERPRINT || checkoutKey.slice(0, 12) + "…",
    "mode=" + checkout.mode
  );

  const options = {
    key: checkoutKey,
    amount: order.amount,
    currency: "INR",
    name: RAZORPAY_CONFIG.name,
    description: planPayload.name + " · " + planPayload.durationLabel,
    image: "assets/kaivalyadhama-logo.png",
    // Land on domestic Indian methods (UPI first); never force international cards.
    prefill: buildDomesticPrefill({
      name: currentUser.displayName || "",
      email: currentUser.email || "",
      contact:
        (userDoc && (userDoc.mobile || userDoc.phone || userDoc.contact)) || "",
    }),
    notes: {
      planId: planPayload.id,
      planName: planPayload.name,
      uid: currentUser.uid,
      durationLabel: planPayload.durationLabel,
      portal: "kaivalyadhama-hostel-wifi",
      mode: checkout.mode === "standard" ? "test-standard" : "test-fallback",
      market: "IN",
    },
    theme: {
      color: RAZORPAY_CONFIG.themeColor || "#7a1a32",
    },
    config: getDomesticCheckoutConfig(),
    modal: {
      ondismiss() {
        void recordPaymentFailure("cancelled");
        btnPay.disabled = false;
      },
    },
    handler(response) {
      (async () => {
        try {
          await verifyPaymentOrSkip(response, { requireVerify });
          await finalizeSuccessfulPayment({
            planPayload,
            quote,
            razorpayResponse: response,
          });
        } catch (error) {
          console.error(error);
          void recordPaymentFailure(error.message || "verify failed");
          alert(error.message || "Payment verification failed.");
          btnPay.disabled = false;
        }
      })();
    },
  };

  if (order.order_id) {
    options.order_id = order.order_id;
  }

  try {
    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (response) => {
      console.error("Razorpay payment failed:", response);
      const desc =
        (response &&
          response.error &&
          (response.error.description || response.error.reason)) ||
        "Payment failed. Please try again.";
      void recordPaymentFailure(desc);
      alert(desc);
      btnPay.disabled = false;
    });
    rzp.open();
  } catch (error) {
    console.error(error);
    alert("Could not open Razorpay checkout. Please try again.");
    btnPay.disabled = false;
  }
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

btnPay.addEventListener("click", async () => {
  if (!currentUser) {
    showScreen("auth");
    showAuthError("Please log in or create an account before payment.");
    return;
  }
  if (!requireDocument()) return;
  await persistSelectedPlan();
  updatePricingUI();
  // Open official Razorpay Checkout modal directly (no in-app checkout page).
  await startRazorpayCheckout();
});

btnRestart.addEventListener("click", () => {
  performLogout();
});

btnConnect.addEventListener("click", async () => {
  btnConnect.textContent = "Connected ✓";
  btnConnect.disabled = true;

  if (currentUser && hasActiveSubscription(userDoc)) {
    try {
      const plan = {
        ...(userDoc.activePlan || {}),
        connectionStatus: "connected",
      };
      await setConnectionStatus(currentUser.uid, {
        connectionStatus: "connected",
        activePlanPatch: plan,
      });
      userDoc = {
        ...userDoc,
        connectionStatus: "connected",
        activePlan: plan,
      };
      renderActivePlanView({ fromPayment: false });
      updateAccountBar();
    } catch (error) {
      console.error(error);
    }
  }
});

btnDashToggle.addEventListener("click", async () => {
  if (!currentUser || !hasActiveSubscription(userDoc)) return;

  const nextStatus = getConnectionStatus() === "connected" ? "disconnected" : "connected";
  btnDashToggle.disabled = true;

  try {
    const plan = {
      ...(userDoc.activePlan || {}),
      connectionStatus: nextStatus,
    };
    await setConnectionStatus(currentUser.uid, {
      connectionStatus: nextStatus,
      activePlanPatch: plan,
    });
    userDoc = {
      ...userDoc,
      connectionStatus: nextStatus,
      activePlan: plan,
    };
    renderDashboard();
    renderActivePlanView({ fromPayment: false });
    updateAccountBar();
  } catch (error) {
    console.error(error);
    alert(friendlyFirestoreError(error));
  } finally {
    btnDashToggle.disabled = false;
  }
});

btnDashLogout.addEventListener("click", () => {
  performLogout();
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

  // Drop any previous in-memory session before creating/signing into an account.
  wipePreviousSessionState();
  updateAccountBar();

  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "signup" ? "Creating…" : "Signing in…";

  try {
    if (authMode === "signup") {
      await signUp({ email, password, displayName });
    } else {
      await signIn({ email, password });
    }
    // onAuthStateChanged will bind the new uid and fetch Firestore fresh.
  } catch (error) {
    console.error(error);
    wipePreviousSessionState();
    updateAccountBar();
    showAuthError(friendlyAuthError(error));
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "signup" ? "Create account" : "Log in";
  }
});

btnLogout.addEventListener("click", () => {
  performLogout();
});

watchAuthState(async (user) => {
  // Always discard previous session variables on any auth transition.
  const nextUid = user && user.uid ? user.uid : null;
  const uidChanged = nextUid !== sessionUid;

  if (!user) {
    wipePreviousSessionState();
    clearAuthForm();
    updatePricingUI();
    updateAccountBar();
    setAuthMode("login");
    showScreen("auth");
    return;
  }

  if (uidChanged) {
    wipePreviousSessionState();
  }

  // Bind ONLY the authenticated uid, then force a server fetch.
  currentUser = user;
  sessionUid = user.uid;
  userDoc = null;

  try {
    userDoc = await getUserDocument(user.uid);
    // Guard: never keep a doc that doesn't belong to this uid.
    if (userDoc && userDoc.uid && userDoc.uid !== user.uid) {
      console.warn("Discarding mismatched user document for uid", user.uid);
      userDoc = null;
    }
    if (userDoc && userDoc.id && userDoc.id !== user.uid) {
      console.warn("Discarding user document with mismatched id", user.uid);
      userDoc = null;
    }
  } catch (error) {
    console.error(error);
    userDoc = null;
  }

  await routeAfterAuth();
});

setAuthMode("login");
updatePricingUI();
