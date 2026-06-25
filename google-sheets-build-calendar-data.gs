/**
 * Builds a sanitized "Calendar Data" tab from the existing monthly calendar tabs.
 *
 * It reads tabs named like "June 2026", "July 2026", etc.
 * It looks for day headers like "Monday, 6/1", then reads names under:
 *   Medical:
 *   Behavioral:
 *   Administration:
 *
 * Output columns:
 *   Date | End Date | Employee Name | Department | Status
 *
 * Only this Calendar Data tab should be published to web as CSV.
 */

const PUBLIC_TAB_NAME = "Calendar Data";
const DEPARTMENTS = ["Medical", "Behavioral", "Administration"];
const INCLUDE_CURRENT_MONTH_AND_FUTURE_ONLY = true;
const DEPARTMENT_ALIASES = {
  medical: "Medical",
  behavioral: "Behavioral",
  behavorial: "Behavioral",
  behaviourial: "Behavioral",
  administration: "Administration",
  admin: "Administration",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Staff Calendar")
    .addItem("Rebuild Calendar Data", "rebuildCalendarData")
    .addToUi();
}

function rebuildCalendarData() {
  const ss = SpreadsheetApp.getActive();
  const output = getOrCreateOutputSheet_(ss);
  const rows = [["Date", "End Date", "Employee Name", "Department", "Status"]];
  const publicStartDate = getPublicStartDate_();

  ss.getSheets().forEach((sheet) => {
    const sheetMonth = parseMonthSheetName_(sheet.getName());
    if (!sheetMonth) return;

    const values = sheet.getDataRange().getDisplayValues();
    const dateByColumnAndRow = findDateHeaders_(values, sheetMonth);

    for (let row = 0; row < values.length; row += 1) {
      for (let col = 0; col < values[row].length; col += 1) {
        const department = getDepartmentFromLabel_(values[row][col]);
        if (!department) continue;

        const date = findNearestDateAbove_(dateByColumnAndRow, row, col);
        if (!date) continue;
        if (INCLUDE_CURRENT_MONTH_AND_FUTURE_ONLY && date < publicStartDate) continue;

        const stopRow = findDepartmentBlockEnd_(values, row + 1, col);
        for (let nameRow = row + 1; nameRow < stopRow; nameRow += 1) {
          const employeeName = String(values[nameRow][col] || "").trim();
          if (!employeeName) continue;
          if (looksLikeSectionOrDate_(employeeName)) continue;

          rows.push([
            date,
            date,
            employeeName,
            department,
            "Approved",
          ]);
        }
      }
    }
  });

  output.clear();
  output.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  output.getRange("A:B").setNumberFormat("mm/dd/yyyy");
  output.getRange(1, 1, 1, 5)
    .setFontWeight("bold")
    .setBackground("#147D7E")
    .setFontColor("#FFFFFF");
  output.setFrozenRows(1);
  output.autoResizeColumns(1, 5);

  SpreadsheetApp.getActive().toast(
    `Calendar Data rebuilt with ${rows.length - 1} approved absence rows.`,
    "Staff Calendar",
    5
  );
}

function getOrCreateOutputSheet_(ss) {
  return ss.getSheetByName(PUBLIC_TAB_NAME) || ss.insertSheet(PUBLIC_TAB_NAME);
}

function getPublicStartDate_() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function parseMonthSheetName_(sheetName) {
  const match = String(sheetName).trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const monthIndex = monthNames.findIndex((name) =>
    name.startsWith(match[1].toLowerCase())
  );

  if (monthIndex === -1) return null;
  return { monthIndex, year: Number(match[2]) };
}

function findDateHeaders_(values, sheetMonth) {
  const dates = {};
  const datePattern = /(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+(\d{1,2})\/(\d{1,2})/i;

  values.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const match = String(cell || "").trim().match(datePattern);
      if (!match) return;

      const monthNumber = Number(match[1]);
      const dayNumber = Number(match[2]);
      let year = sheetMonth.year;

      if (sheetMonth.monthIndex === 0 && monthNumber === 12) year -= 1;
      if (sheetMonth.monthIndex === 11 && monthNumber === 1) year += 1;

      dates[`${rowIndex}:${colIndex}`] = new Date(year, monthNumber - 1, dayNumber);
    });
  });

  return dates;
}

function findNearestDateAbove_(dateByColumnAndRow, row, col) {
  for (let scanRow = row; scanRow >= 0; scanRow -= 1) {
    const date = dateByColumnAndRow[`${scanRow}:${col}`];
    if (date) return date;
  }
  return null;
}

function findDepartmentBlockEnd_(values, startRow, col) {
  for (let row = startRow; row < values.length; row += 1) {
    const value = String(values[row][col] || "").trim();
    if (!value) continue;
    if (looksLikeSectionOrDate_(value)) return row;
  }

  return values.length;
}

function looksLikeSectionOrDate_(value) {
  const normalized = normalize_(value).replace(":", "");
  if (DEPARTMENT_ALIASES[normalized]) return true;
  if (/^[A-Za-z\s]+:$/.test(String(value || "").trim())) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(value || "").trim())) return true;
  return /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+\d{1,2}\/\d{1,2}/i.test(value);
}

function normalize_(value) {
  return String(value || "").trim().toLowerCase();
}

function getDepartmentFromLabel_(value) {
  const normalized = normalize_(value).replace(":", "");
  return DEPARTMENT_ALIASES[normalized] || "";
}
