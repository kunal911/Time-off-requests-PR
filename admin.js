const ADMIN_SESSION_KEY = "pto_dashboard_session";

let adminToken = sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
let requests = [];
let selectedRowNumber = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("admin-login-form").addEventListener("submit", handleLogin);
  document.getElementById("admin-refresh").addEventListener("click", loadRequests);
  document.getElementById("admin-logout").addEventListener("click", logout);
  document.getElementById("status-filter").addEventListener("change", renderRequests);
  document.getElementById("request-search").addEventListener("input", renderRequests);

  if (adminToken) {
    showDashboard();
    loadRequests();
  }
});

async function handleLogin(event) {
  event.preventDefault();
  const passwordInput = document.getElementById("admin-password");
  const error = document.getElementById("admin-login-error");
  error.textContent = "";

  try {
    const result = await callApi("login", { password: passwordInput.value }, false);
    adminToken = result.sessionToken;
    sessionStorage.setItem(ADMIN_SESSION_KEY, adminToken);
    passwordInput.value = "";
    showDashboard();
    await loadRequests();
  } catch (err) {
    error.textContent = err.message || "Could not sign in.";
  }
}

function showDashboard() {
  document.getElementById("admin-login").classList.add("hidden");
  document.getElementById("admin-app").classList.remove("hidden");
}

function logout() {
  adminToken = "";
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  document.getElementById("admin-login").classList.remove("hidden");
  document.getElementById("admin-app").classList.add("hidden");
}

async function loadRequests() {
  setLoading(true);
  try {
    const result = await callApi("listRequests");
    requests = result.requests || [];
    selectedRowNumber ||= requests[0]?.rowNumber || null;
    renderRequests();
    renderSelectedRequest();
    showAlert("");
  } catch (err) {
    showAlert(err.message || "Could not load requests.", "error");
  } finally {
    setLoading(false);
  }
}

function renderRequests() {
  const list = document.getElementById("request-list");
  const filtered = getFilteredRequests();

  document.getElementById("request-count").textContent =
    `${filtered.length} shown of ${requests.length} request${requests.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    list.innerHTML = `<div class="state-card">No requests match the current filters.</div>`;
    list.classList.remove("hidden");
    return;
  }

  list.innerHTML = filtered.map((request) => `
    <button class="request-card ${request.rowNumber === selectedRowNumber ? "selected" : ""}" type="button" data-row="${request.rowNumber}">
      <div>
        <strong>${escapeHtml(request.employeeName || "Unknown employee")}</strong>
        <span>${escapeHtml(request.employeeEmail || "No email")}</span>
      </div>
      <div>
        <strong>${formatDateRange(request)}</strong>
        <span>${escapeHtml(request.hours || "")}${request.hours ? " hours" : ""}</span>
      </div>
      <div>
        <span class="status-badge ${statusClass(request.status)}">${escapeHtml(request.status)}</span>
      </div>
      <div>
        <strong>${escapeHtml(request.supervisorName || "Unassigned")}</strong>
        <span>${escapeHtml(request.supervisorEmail || "")}</span>
      </div>
    </button>
  `).join("");

  list.querySelectorAll(".request-card").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRowNumber = Number(button.dataset.row);
      renderRequests();
      renderSelectedRequest();
    });
  });

  list.classList.remove("hidden");
}

function renderSelectedRequest() {
  const request = requests.find((item) => item.rowNumber === selectedRowNumber);
  const title = document.getElementById("selected-request-title");
  const details = document.getElementById("selected-request-details");

  if (!request) {
    title.textContent = "No request selected";
    details.innerHTML = `<p class="empty-note">Choose a request to assign, approve, deny, or email the employee.</p>`;
    return;
  }

  title.textContent = request.employeeName || "Unknown employee";
  details.innerHTML = `
    <div class="request-meta">
      <div><strong>Dates</strong><span>${formatDateRange(request)}</span></div>
      <div><strong>Employee email</strong><span>${escapeHtml(request.employeeEmail || "Missing")}</span></div>
      <div><strong>Status</strong><span>${escapeHtml(request.status)}</span></div>
      <div><strong>Reason</strong><span>${escapeHtml(request.reason || "Not provided")}</span></div>
      <div><strong>Current supervisor</strong><span>${escapeHtml(request.supervisorName || "Unassigned")} ${request.supervisorEmail ? `(${escapeHtml(request.supervisorEmail)})` : ""}</span></div>
    </div>

    <section class="action-section">
      <h3>Assign supervisor</h3>
      <div class="field-grid">
        <label>Supervisor name <input id="supervisor-name" value="${escapeAttribute(request.supervisorName || "")}"></label>
        <label>Supervisor email <input id="supervisor-email" type="email" value="${escapeAttribute(request.supervisorEmail || "")}"></label>
      </div>
      <button class="primary-button small-button" type="button" data-action="assignSupervisor">Assign and email supervisor</button>
    </section>

    <section class="action-section">
      <h3>Supervisor decision</h3>
      <label class="field-grid">Supervisor note
        <textarea id="supervisor-note" rows="3">${escapeHtml(request.supervisorNote || "")}</textarea>
      </label>
      <div class="button-row">
        <button class="primary-button small-button" type="button" data-action="supervisorApprove">Approve</button>
        <button class="primary-button danger-button small-button" type="button" data-action="supervisorDeny">Deny</button>
      </div>
      <p class="muted-line">Decision: ${escapeHtml(request.supervisorDecision || "Not recorded")}</p>
    </section>

    <section class="action-section">
      <h3>HR final decision and employee email</h3>
      <label class="field-grid">Employee email note
        <textarea id="hr-note" rows="3">${escapeHtml(request.hrNote || "")}</textarea>
      </label>
      <div class="button-row">
        <button class="primary-button secondary-button small-button" type="button" data-action="hrApprove">Approve and email employee</button>
        <button class="primary-button danger-button small-button" type="button" data-action="hrDeny">Deny and email employee</button>
      </div>
      <p class="muted-line">Employee notified: ${escapeHtml(request.employeeNotifiedAt || "Not yet")}</p>
    </section>
  `;

  details.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleRequestAction(button.dataset.action, request));
  });
}

async function handleRequestAction(action, request) {
  const rowNumber = request.rowNumber;
  const supervisorName = document.getElementById("supervisor-name")?.value.trim() || "";
  const supervisorEmail = document.getElementById("supervisor-email")?.value.trim() || "";
  const supervisorNote = document.getElementById("supervisor-note")?.value.trim() || "";
  const hrNote = document.getElementById("hr-note")?.value.trim() || "";

  const actionMap = {
    assignSupervisor: { rowNumber, supervisorName, supervisorEmail },
    supervisorApprove: { rowNumber, decision: "Approved", note: supervisorNote },
    supervisorDeny: { rowNumber, decision: "Denied", note: supervisorNote },
    hrApprove: { rowNumber, decision: "Approved", note: hrNote },
    hrDeny: { rowNumber, decision: "Denied", note: hrNote },
  };

  try {
    setPanelBusy(true);
    const result = await callApi(action, actionMap[action]);
    showAlert(result.message || "Request updated.");
    await loadRequests();
  } catch (err) {
    showAlert(err.message || "Request update failed.", "error");
  } finally {
    setPanelBusy(false);
  }
}

function getFilteredRequests() {
  const statusFilter = document.getElementById("status-filter").value;
  const query = document.getElementById("request-search").value.trim().toLowerCase();

  return requests.filter((request) => {
    const status = String(request.statusKey || "").toLowerCase();
    const active = !["final-approved", "final-denied"].includes(status);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && active) ||
      (statusFilter === "final" && !active) ||
      status === statusFilter;

    const haystack = [
      request.employeeName,
      request.employeeEmail,
      request.supervisorName,
      request.supervisorEmail,
      request.status,
    ].join(" ").toLowerCase();

    return matchesStatus && (!query || haystack.includes(query));
  });
}

async function callApi(action, payload = {}, requireAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (requireAuth && adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const response = await fetch("/.netlify/functions/pto-api", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    if (response.status === 401) logout();
    throw new Error(result.error || `Request failed with ${response.status}`);
  }
  return result;
}

function setLoading(isLoading) {
  document.getElementById("admin-loading").classList.toggle("hidden", !isLoading);
  document.getElementById("request-list").classList.toggle("hidden", isLoading);
}

function setPanelBusy(isBusy) {
  document.querySelectorAll("#selected-request-details button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function showAlert(message, type = "success") {
  const alert = document.getElementById("admin-alert");
  alert.textContent = message;
  alert.classList.toggle("hidden", !message);
  alert.classList.toggle("error", type === "error");
}

function formatDateRange(request) {
  const start = formatDate(request.startDate);
  const end = formatDate(request.endDate);
  if (!start && !end) return "No dates";
  if (!end || start === end) return start;
  return `${start} - ${end}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("denied")) return "denied";
  if (value.includes("final") || value.includes("emailed")) return "final";
  return "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
