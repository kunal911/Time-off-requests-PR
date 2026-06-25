const CONFIG = {
  PASSWORD: "staff2026",
  SESSION_HOURS: 8,

  // Publish a sanitized Google Sheet tab as CSV and paste the URL here.
  // Required columns: Date, Employee Name, Department.
  // Optional columns: End Date, Status.
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQXC2nEeI6_6G21HV3siA4Io0oxziCMrjr-wzgT8Srw7Zlxu-N2QEbhOZJpdzKKA9mzeiVLbdHRpmIp/pub?gid=1246276192&single=true&output=csv",

  DEPARTMENTS: ["Medical", "Behavioral", "Administration"],
};

const DEMO_CSV = `Date,End Date,Employee Name,Department,Status
05/31/2026,06/02/2026,Jeff,Medical,Approved
06/01/2026,06/01/2026,Armando,Medical,Approved
06/01/2026,06/01/2026,Ivana,Behavioral,Approved
06/01/2026,06/01/2026,Leticia,Administration,Approved
06/01/2026,06/01/2026,Natalie (2 hours),Administration,Approved
06/03/2026,06/05/2026,Nicole,Medical,Approved
06/03/2026,06/03/2026,Saundra,Medical,Approved
06/05/2026,06/05/2026,Jennifer,Administration,Approved
06/08/2026,06/09/2026,Armando,Medical,Approved
06/10/2026,06/11/2026,Marco,Medical,Approved
06/10/2026,06/10/2026,Sarah,Administration,Approved
06/11/2026,06/12/2026,Carlos,Behavioral,Approved
06/15/2026,06/16/2026,Jeff,Medical,Approved
06/15/2026,06/15/2026,Natalie,Administration,Approved
06/17/2026,06/18/2026,Armando,Medical,Approved
06/19/2026,06/19/2026,Sarah,Administration,Approved
06/20/2026,06/20/2026,Ivana,Behavioral,Approved
06/22/2026,06/23/2026,Nicole,Medical,Approved
06/24/2026,06/24/2026,Carlos,Behavioral,Approved
06/25/2026,06/26/2026,Marco,Medical,Approved
06/25/2026,06/25/2026,Leticia (half day),Administration,Approved
06/29/2026,06/30/2026,Jeff,Medical,Approved
07/01/2026,07/01/2026,Armando,Medical,Approved
07/07/2026,07/07/2026,Carlos,Behavioral,Approved
07/10/2026,07/10/2026,Natalie,Administration,Approved
07/14/2026,07/14/2026,Jeff,Medical,Approved
07/21/2026,07/21/2026,Ivana,Behavioral,Approved
07/22/2026,07/22/2026,Nicole,Medical,Approved
07/28/2026,07/28/2026,Sarah,Administration,Approved`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEPT_CLASS = {
  Medical: "medical",
  Behavioral: "behavioral",
  Administration: "administration",
};

let currentDate = new Date();
let selectedDateKey = toDateKey(currentDate);
let calendarData = {};
let usingDemo = false;
let activeDepartments = new Set(CONFIG.DEPARTMENTS);

document.addEventListener("DOMContentLoaded", () => {
  wireAuthentication();
  wireControls();
  buildMonthSelect();
  buildDepartmentFilters();

  if (hasSession()) {
    showApp();
    loadCalendarData();
  } else {
    showGate();
  }
});

function wireAuthentication() {
  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("password-input");
    const error = document.getElementById("gate-error");

    if (!input.value.trim()) {
      error.textContent = "Please enter the staff password.";
      input.focus();
      return;
    }

    if (input.value.trim() !== CONFIG.PASSWORD.trim()) {
      error.textContent = "Incorrect password. Please try again.";
      input.value = "";
      input.focus();
      return;
    }

    error.textContent = "";
    createSession();
    showApp();
    loadCalendarData();
  });

  document.getElementById("toggle-password").addEventListener("click", () => {
    const input = document.getElementById("password-input");
    const button = document.getElementById("toggle-password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem("time_off_calendar_session");
    showGate();
  });
}

function wireControls() {
  document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
  document.getElementById("today-btn").addEventListener("click", () => {
    currentDate = new Date();
    selectedDateKey = toDateKey(currentDate);
    render();
  });
  document.getElementById("month-select").addEventListener("change", (event) => {
    const [year, month] = event.target.value.split("-").map(Number);
    currentDate = new Date(year, month, 1);
    selectedDateKey = toDateKey(currentDate);
    render();
  });
  document.getElementById("refresh-btn").addEventListener("click", loadCalendarData);
  document.getElementById("print-btn").addEventListener("click", () => window.print());
  document.getElementById("retry-btn").addEventListener("click", loadCalendarData);

  document.addEventListener("keydown", (event) => {
    if (document.getElementById("app").classList.contains("hidden")) return;
    if (event.target.closest("input, select, button")) return;
    if (event.key === "ArrowLeft") changeMonth(-1);
    if (event.key === "ArrowRight") changeMonth(1);
  });
}

function buildMonthSelect() {
  const select = document.getElementById("month-select");
  const baseYear = currentDate.getFullYear();
  select.innerHTML = "";

  for (let year = baseYear - 1; year <= baseYear + 2; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const option = document.createElement("option");
      option.value = `${year}-${month}`;
      option.textContent = `${MONTHS[month]} ${year}`;
      select.appendChild(option);
    }
  }
}

function buildDepartmentFilters() {
  const wrap = document.getElementById("department-filters");
  wrap.innerHTML = "";

  CONFIG.DEPARTMENTS.forEach((department) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = department;
    button.className = "active";
    button.setAttribute("aria-pressed", "true");
    button.addEventListener("click", () => {
      if (activeDepartments.has(department) && activeDepartments.size > 1) {
        activeDepartments.delete(department);
      } else {
        activeDepartments.add(department);
      }

      button.classList.toggle("active", activeDepartments.has(department));
      button.setAttribute("aria-pressed", String(activeDepartments.has(department)));
      render();
    });
    wrap.appendChild(button);
  });
}

function changeMonth(delta) {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
  selectedDateKey = toDateKey(currentDate);
  render();
}

async function loadCalendarData() {
  setState("loading");

  try {
    const csvText = await getCsvText();
    calendarData = parseCsvToCalendar(csvText);
    setState("calendar");
    render();
  } catch (error) {
    setState("error", error.message || "Please check the published CSV link and try again.");
  }
}

async function getCsvText() {
  if (!CONFIG.SHEET_CSV_URL.trim()) {
    usingDemo = true;
    return DEMO_CSV;
  }

  usingDemo = false;
  const response = await fetch(CONFIG.SHEET_CSV_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status}. Confirm the Calendar Data tab is published as CSV.`);
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("The published Google Sheets CSV is empty. Rebuild the Calendar Data tab, then republish that tab as CSV.");
  }
  return text;
}

function parseCsvToCalendar(csvText) {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) return {};

  const headers = rows[0].map((header) => normalize(header));
  const dateIndex = findHeader(headers, ["date", "start date", "request start date"]);
  const endDateIndex = findHeader(headers, ["end date", "request end date"]);
  const nameIndex = findHeader(headers, ["employee name", "name", "employee"]);
  const deptIndex = findHeader(headers, ["department", "dept", "team"]);
  const statusIndex = findHeader(headers, ["status", "approved", "approved by supervisor"]);

  if (dateIndex === -1 || nameIndex === -1 || deptIndex === -1) {
    throw new Error("The CSV needs Date, Employee Name, and Department columns.");
  }

  const data = {};

  rows.slice(1).forEach((row) => {
    const start = parseDate(row[dateIndex]);
    const end = endDateIndex >= 0 ? parseDate(row[endDateIndex]) || start : start;
    const name = clean(row[nameIndex]);
    const department = matchDepartment(row[deptIndex]);
    const status = statusIndex >= 0 ? normalize(row[statusIndex]) : "approved";

    if (!start || !end || !name || !department) return;
    if (isNonPersonCalendarLabel(name)) return;
    if (status && !["approved", "yes", "y", "true"].includes(status)) return;

    eachDate(start, end, (dateKey) => {
      data[dateKey] ||= makeEmptyDay();
      if (!data[dateKey][department].includes(name)) {
        data[dateKey][department].push(name);
      }
    });
  });

  return data;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows.filter((csvRow) => csvRow.some((cell) => clean(cell)));
}

function render() {
  renderMonthHeading();
  renderCalendarGrid();
  renderSelectedDay();
  renderUpcoming();
}

function renderMonthHeading() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthEvents = getMonthEvents(year, month);
  const uniquePeople = new Set(monthEvents.map((event) => event.name));

  document.getElementById("month-label").textContent = `${MONTHS[month]} ${year}`;
  document.getElementById("month-summary").textContent =
    monthEvents.length === 0
      ? "No approved absences are listed for this month."
      : `${monthEvents.length} approved absence entries for ${uniquePeople.size} staff member${uniquePeople.size === 1 ? "" : "s"}.`;
  document.getElementById("month-select").value = `${year}-${month}`;
}

function renderCalendarGrid() {
  const grid = document.getElementById("calendar-grid");
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const todayKey = toDateKey(new Date());

  grid.innerHTML = "";

  for (let index = 0; index < totalCells; index += 1) {
    let day = index - startWeekday + 1;
    let cellMonth = month;
    let cellYear = year;
    let overflow = false;

    if (day <= 0) {
      day = daysInPreviousMonth + day;
      cellMonth = month - 1;
      overflow = true;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
    } else if (day > daysInMonth) {
      day -= daysInMonth;
      cellMonth = month + 1;
      overflow = true;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    }

    const date = new Date(cellYear, cellMonth, day);
    const dateKey = toDateKey(date);
    const dayData = overflow ? makeEmptyDay() : filterDayData(calendarData[dateKey]);
    const events = flattenDay(dayData);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", describeDay(date, events));

    if (overflow) button.classList.add("overflow");
    if ([0, 6].includes(date.getDay())) button.classList.add("weekend");
    if (dateKey === todayKey) button.classList.add("today");
    if (dateKey === selectedDateKey) button.classList.add("selected");

    button.innerHTML = dayCellHtml(day, events);
    button.addEventListener("click", () => {
      selectedDateKey = dateKey;
      render();
    });
    grid.appendChild(button);
  }
}

function dayCellHtml(day, events) {
  const visible = events.slice(0, 4);
  const more = events.length - visible.length;

  return `
    <div class="day-top">
      <span class="day-number">${day}</span>
      ${events.length ? `<span class="day-total">${events.length} off</span>` : ""}
    </div>
    <div class="chip-stack">
      ${visible.map((event) => `<span class="person-chip ${DEPT_CLASS[event.department]}">${escapeHtml(event.name)}</span>`).join("")}
      ${more > 0 ? `<span class="more-chip">+${more} more</span>` : ""}
    </div>
  `;
}

function renderSelectedDay() {
  const details = document.getElementById("day-details");
  const title = document.getElementById("details-title");
  const date = parseDateKey(selectedDateKey);
  const dayData = filterDayData(calendarData[selectedDateKey]);

  title.textContent = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const groups = CONFIG.DEPARTMENTS
    .filter((department) => activeDepartments.has(department))
    .map((department) => ({ department, people: dayData[department] || [] }))
    .filter((group) => group.people.length);

  if (!groups.length) {
    details.innerHTML = `<p class="empty-note">No approved absences are listed for the selected day.</p>`;
    return;
  }

  details.innerHTML = groups.map((group) => `
    <div class="detail-group">
      <p class="detail-title ${DEPT_CLASS[group.department]}">${group.department}</p>
      <ul>${group.people.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>
    </div>
  `).join("");
}

function renderUpcoming() {
  const list = document.getElementById("upcoming-list");
  const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const upcoming = [];

  eachDate(toDateKey(start), toDateKey(end), (dateKey) => {
    flattenDay(filterDayData(calendarData[dateKey])).forEach((event) => {
      upcoming.push({ ...event, dateKey });
    });
  });

  if (!upcoming.length) {
    list.innerHTML = `<p class="empty-note">Nothing upcoming for the active filters.</p>`;
    return;
  }

  list.innerHTML = upcoming.slice(0, 10).map((event) => {
    const date = parseDateKey(event.dateKey);
    return `
      <div class="upcoming-item">
        <div class="date-badge"><span>${MONTHS[date.getMonth()].slice(0, 3)}</span>${date.getDate()}</div>
        <div>
          <strong>${escapeHtml(event.name)}</strong>
          <p>${event.department}</p>
        </div>
      </div>
    `;
  }).join("");
}

function getMonthEvents(year, month) {
  const events = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = toDateKey(new Date(year, month, day));
    flattenDay(filterDayData(calendarData[key])).forEach((event) => events.push(event));
  }

  return events;
}

function setState(state, message = "") {
  document.getElementById("loading-state").classList.toggle("hidden", state !== "loading");
  document.getElementById("error-state").classList.toggle("hidden", state !== "error");
  document.getElementById("calendar-area").classList.toggle("hidden", state !== "calendar");
  document.getElementById("demo-banner").classList.toggle("hidden", !(state === "calendar" && usingDemo));
  document.getElementById("error-message").textContent = message;
}

function showGate() {
  document.getElementById("password-gate").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("password-input").value = "";
}

function showApp() {
  document.getElementById("password-gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function hasSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem("time_off_calendar_session"));
    return session && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function createSession() {
  sessionStorage.setItem("time_off_calendar_session", JSON.stringify({
    expiresAt: Date.now() + CONFIG.SESSION_HOURS * 60 * 60 * 1000,
  }));
}

function filterDayData(dayData = makeEmptyDay()) {
  const filtered = makeEmptyDay();
  CONFIG.DEPARTMENTS.forEach((department) => {
    filtered[department] = activeDepartments.has(department) ? [...(dayData[department] || [])] : [];
  });
  return filtered;
}

function flattenDay(dayData = makeEmptyDay()) {
  return CONFIG.DEPARTMENTS.flatMap((department) =>
    (dayData[department] || []).map((name) => ({ name, department }))
  );
}

function makeEmptyDay() {
  return Object.fromEntries(CONFIG.DEPARTMENTS.map((department) => [department, []]));
}

function eachDate(startKey, endKey, callback) {
  const current = parseDateKey(startKey);
  const end = parseDateKey(endKey);

  while (current <= end) {
    callback(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDate(value) {
  const raw = clean(value).replace(/"/g, "");
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const dash = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dash) return `${dash[1]}-${dash[2].padStart(2, "0")}-${dash[3].padStart(2, "0")}`;
  return "";
}

function describeDay(date, events) {
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (!events.length) return `${dateLabel}. No approved absences.`;
  return `${dateLabel}. ${events.map((event) => `${event.name}, ${event.department}`).join("; ")}.`;
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function matchDepartment(value) {
  const normalized = normalize(value);
  const aliases = {
    medical: "Medical",
    behavioral: "Behavioral",
    behavorial: "Behavioral",
    behaviourial: "Behavioral",
    administration: "Administration",
    admin: "Administration",
  };
  if (aliases[normalized.replace(":", "")]) return aliases[normalized.replace(":", "")];

  return CONFIG.DEPARTMENTS.find((department) => {
    const dept = normalize(department);
    return normalized === dept || normalized.startsWith(dept);
  }) || "";
}

function isNonPersonCalendarLabel(value) {
  const label = clean(value);
  const normalized = normalize(label).replace(":", "");
  if (!label) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(label)) return true;
  if (/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+\d{1,2}\/\d{1,2}/i.test(label)) return true;
  if (/^[A-Za-z\s]+:$/.test(label)) return true;
  return ["medical", "behavioral", "behavorial", "behaviourial", "administration", "admin"].includes(normalized);
}

function clean(value = "") {
  return String(value).trim();
}

function normalize(value = "") {
  return clean(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
