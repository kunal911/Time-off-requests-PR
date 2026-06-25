/**
 * PTO workflow backend for the Netlify admin dashboard.
 *
 * Paste this into the same Google Apps Script project as the calendar script.
 * Then set Script Properties:
 *   PTO_API_TOKEN      - same secret value as Netlify PTO_API_TOKEN
 *   PTO_DASHBOARD_URL  - optional admin dashboard URL, e.g. https://your-site.netlify.app/admin.html
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The secret token prevents public use of the web app endpoint.
 */

const PTO_RESPONSES_SHEET = "Form Responses 1";
const PTO_WORKFLOW_COLUMNS = [
  "Assigned Supervisor Email",
  "Workflow Status",
  "Supervisor Decision",
  "Supervisor Decision Date",
  "Supervisor Note",
  "HR Decision",
  "HR Decision Date",
  "HR Note",
  "Employee Email Sent At",
  "Supervisor Email Sent At",
];

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || "{}");
    validatePtoToken_(body.token);

    const action = body.action;
    const payload = body.payload || {};

    const actions = {
      listRequests: () => listPtoRequests_(),
      assignSupervisor: () => assignPtoSupervisor_(payload),
      supervisorApprove: () => setPtoSupervisorDecision_(payload, "Approved"),
      supervisorDeny: () => setPtoSupervisorDecision_(payload, "Denied"),
      hrApprove: () => setPtoHrDecision_(payload, "Approved"),
      hrDeny: () => setPtoHrDecision_(payload, "Denied"),
    };

    if (!actions[action]) throw new Error(`Unknown action: ${action}`);
    return json_(actions[action]());
  } catch (error) {
    return json_({ ok: false, error: error.message || "PTO workflow failed." });
  }
}

function listPtoRequests_() {
  const sheet = getResponsesSheet_();
  const context = getSheetContext_(sheet);
  const values = sheet.getDataRange().getValues();
  const requests = [];

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const request = buildRequest_(row, index + 1, context);
    if (!request.employeeName && !request.employeeEmail) continue;
    requests.push(request);
  }

  requests.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return { ok: true, requests: requests.slice(0, 300) };
}

function assignPtoSupervisor_(payload) {
  const rowNumber = requireRowNumber_(payload.rowNumber);
  const supervisorName = String(payload.supervisorName || "").trim();
  const supervisorEmail = String(payload.supervisorEmail || "").trim();

  if (!supervisorName) throw new Error("Supervisor name is required.");
  if (!supervisorEmail || !/@/.test(supervisorEmail)) throw new Error("A valid supervisor email is required.");

  const sheet = getResponsesSheet_();
  const context = getSheetContext_(sheet);
  const request = buildRequest_(sheet.getRange(rowNumber, 1, 1, context.headers.length).getValues()[0], rowNumber, context);

  setCell_(sheet, rowNumber, context, ["Supervisor's Name", "Supervisor Name"], supervisorName);
  setCell_(sheet, rowNumber, context, ["Assigned Supervisor Email"], supervisorEmail);
  setCell_(sheet, rowNumber, context, ["Workflow Status"], "Assigned to Supervisor");
  setCell_(sheet, rowNumber, context, ["Supervisor Email Sent At"], new Date());

  sendSupervisorEmail_(supervisorEmail, supervisorName, request);
  return { ok: true, message: `Assigned to ${supervisorName} and emailed supervisor.` };
}

function setPtoSupervisorDecision_(payload, decision) {
  const rowNumber = requireRowNumber_(payload.rowNumber);
  const sheet = getResponsesSheet_();
  const context = getSheetContext_(sheet);
  const value = decision === "Approved" ? "Y" : "N";

  setCell_(sheet, rowNumber, context, ["Approved by Supervisor? (Y/N)", "Approved by Supervisor", "Supervisor Approved"], value);
  setCell_(sheet, rowNumber, context, ["Supervisor Decision"], decision);
  setCell_(sheet, rowNumber, context, ["Supervisor Decision Date"], new Date());
  setCell_(sheet, rowNumber, context, ["Supervisor Note"], String(payload.note || "").trim());
  setCell_(sheet, rowNumber, context, ["Workflow Status"], decision === "Approved" ? "Supervisor Approved - Pending HR" : "Supervisor Denied - Pending HR");

  return { ok: true, message: `Supervisor decision recorded: ${decision}.` };
}

function setPtoHrDecision_(payload, decision) {
  const rowNumber = requireRowNumber_(payload.rowNumber);
  const sheet = getResponsesSheet_();
  const context = getSheetContext_(sheet);
  const value = decision === "Approved" ? "Y" : "N";

  setCell_(sheet, rowNumber, context, ["Approved by HR? (Y/N)", "Approved by HR", "HR Approved"], value);
  setCell_(sheet, rowNumber, context, ["HR Decision"], decision);
  setCell_(sheet, rowNumber, context, ["HR Decision Date"], new Date());
  setCell_(sheet, rowNumber, context, ["HR Note"], String(payload.note || "").trim());
  setCell_(sheet, rowNumber, context, ["Workflow Status"], decision === "Approved" ? "Final Approved - Employee Emailed" : "Final Denied - Employee Emailed");
  setCell_(sheet, rowNumber, context, ["Date Employee Notified"], new Date());
  setCell_(sheet, rowNumber, context, ["Employee Email Sent At"], new Date());

  const request = buildRequest_(sheet.getRange(rowNumber, 1, 1, context.headers.length).getValues()[0], rowNumber, context);
  sendEmployeeDecisionEmail_(request, decision, String(payload.note || "").trim());

  if (decision === "Approved" && typeof rebuildCalendarData === "function") {
    rebuildCalendarData();
  }

  return { ok: true, message: `Employee emailed: request ${decision.toLowerCase()}.` };
}

function buildRequest_(row, rowNumber, context) {
  const get = (aliases) => getValue_(row, context, aliases);
  const supervisorDecision = normalizeDecision_(get(["Supervisor Decision", "Approved by Supervisor? (Y/N)", "Approved by Supervisor"]));
  const hrDecision = normalizeDecision_(get(["HR Decision", "Approved by HR? (Y/N)", "Approved by HR"]));
  const workflowStatus = String(get(["Workflow Status"]) || "").trim();
  const statusInfo = getStatus_(workflowStatus, supervisorDecision, hrDecision);

  return {
    rowNumber,
    timestamp: toIso_(get(["Timestamp"])),
    employeeEmail: String(get(["Email Address", "Employee Email", "Email"]) || "").trim(),
    employeeName: String(get(["Employee Name", "Name"]) || "").trim(),
    supervisorName: String(get(["Supervisor's Name", "Supervisor Name"]) || "").trim(),
    supervisorEmail: String(get(["Assigned Supervisor Email", "Supervisor Email"]) || "").trim(),
    startDate: toIso_(get(["Request Start Date", "Start Date", "Date"])),
    endDate: toIso_(get(["Request End Date", "End Date"])),
    hours: String(get(["Number of hours requested", "Hours Requested", "Hours"]) || "").trim(),
    reason: String(get(["Reason for absence", "Reason"]) || "").trim(),
    supervisorDecision,
    supervisorNote: String(get(["Supervisor Note"]) || "").trim(),
    hrDecision,
    hrNote: String(get(["HR Note"]) || "").trim(),
    employeeNotifiedAt: formatValue_(get(["Employee Email Sent At", "Date Employee Notified"])),
    status: statusInfo.label,
    statusKey: statusInfo.key,
  };
}

function getStatus_(workflowStatus, supervisorDecision, hrDecision) {
  if (hrDecision === "Approved") return { key: "final-approved", label: "Final Approved" };
  if (hrDecision === "Denied") return { key: "final-denied", label: "Final Denied" };
  if (supervisorDecision === "Approved") return { key: "supervisor-approved", label: "Supervisor Approved" };
  if (supervisorDecision === "Denied") return { key: "supervisor-denied", label: "Supervisor Denied" };
  if (workflowStatus) return { key: normalizeKey_(workflowStatus), label: workflowStatus };
  return { key: "new", label: "New" };
}

function getSheetContext_(sheet) {
  ensureWorkflowColumns_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[normalizeKey_(header)] = index + 1;
  });
  return { headers, headerMap };
}

function ensureWorkflowColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
  const normalized = headers.map(normalizeKey_);
  const missing = PTO_WORKFLOW_COLUMNS.filter((header) => !normalized.includes(normalizeKey_(header)));
  if (!missing.length) return;

  sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  sheet.getRange(1, headers.length + 1, 1, missing.length)
    .setFontWeight("bold")
    .setBackground("#147D7E")
    .setFontColor("#FFFFFF");
}

function sendSupervisorEmail_(email, supervisorName, request) {
  const dashboardUrl = getScriptProperty_("PTO_DASHBOARD_URL") || "";
  const subject = `PTO request assigned: ${request.employeeName || "Employee"}`;
  const body = [
    `Hi ${supervisorName},`,
    "",
    "A PTO request has been assigned to you for review.",
    "",
    `Employee: ${request.employeeName}`,
    `Dates: ${formatDateRange_(request.startDate, request.endDate)}`,
    `Hours: ${request.hours || "Not listed"}`,
    `Reason: ${request.reason || "Not provided"}`,
    "",
    dashboardUrl ? `Open the dashboard to approve or deny: ${dashboardUrl}` : "Open the PTO dashboard to approve or deny this request.",
    "",
    "Thank you.",
  ].join("\n");

  MailApp.sendEmail(email, subject, body);
}

function sendEmployeeDecisionEmail_(request, decision, note) {
  if (!request.employeeEmail || !/@/.test(request.employeeEmail)) {
    throw new Error("Employee email is missing or invalid.");
  }

  const approved = decision === "Approved";
  const subject = approved ? "Your PTO request was approved" : "Your PTO request was denied";
  const body = [
    `Hi ${request.employeeName || "there"},`,
    "",
    approved
      ? "Your PTO request has been approved."
      : "Your PTO request has been denied.",
    "",
    `Dates: ${formatDateRange_(request.startDate, request.endDate)}`,
    request.hours ? `Hours: ${request.hours}` : "",
    note ? `Note: ${note}` : "",
    "",
    "Please contact HR if you have questions.",
  ].filter(Boolean).join("\n");

  MailApp.sendEmail(request.employeeEmail, subject, body);
}

function getResponsesSheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(PTO_RESPONSES_SHEET);
  if (!sheet) throw new Error(`Could not find sheet: ${PTO_RESPONSES_SHEET}`);
  return sheet;
}

function validatePtoToken_(token) {
  const expected = getScriptProperty_("PTO_API_TOKEN");
  if (!expected) throw new Error("PTO_API_TOKEN is not set in Apps Script properties.");
  if (!token || token !== expected) throw new Error("Unauthorized PTO workflow request.");
}

function getScriptProperty_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function getValue_(row, context, aliases) {
  const column = getColumn_(context, aliases);
  return column ? row[column - 1] : "";
}

function setCell_(sheet, rowNumber, context, aliases, value) {
  const column = getColumn_(context, aliases);
  if (!column) throw new Error(`Missing required column: ${aliases[0]}`);
  sheet.getRange(rowNumber, column).setValue(value);
}

function getColumn_(context, aliases) {
  for (let index = 0; index < aliases.length; index += 1) {
    const key = normalizeKey_(aliases[index]);
    if (context.headerMap[key]) return context.headerMap[key];
  }
  return 0;
}

function requireRowNumber_(rowNumber) {
  const value = Number(rowNumber);
  if (!Number.isFinite(value) || value < 2) throw new Error("A valid request row is required.");
  return value;
}

function normalizeDecision_(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["y", "yes", "approved", "approve", "true"].includes(text)) return "Approved";
  if (["n", "no", "denied", "deny", "false"].includes(text)) return "Denied";
  return "";
}

function normalizeKey_(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toIso_(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatValue_(value) {
  if (!value) return "";
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "MM/dd/yyyy h:mm a");
  return String(value);
}

function formatDateRange_(start, end) {
  const startLabel = formatIsoDate_(start);
  const endLabel = formatIsoDate_(end);
  if (!startLabel && !endLabel) return "Not listed";
  if (!endLabel || startLabel === endLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
}

function formatIsoDate_(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
