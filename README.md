# Staff Time Off Calendar

A Netlify-ready staff calendar that shows approved time off without exposing the private request sheet.

## How It Protects Request Details

Do not publish the form response tab or the month tabs that contain reasons, emails, PTO balances, supervisor notes, or HR approval details.

Instead, create one sanitized tab named `Calendar Data` and publish only that tab as CSV. Staff will only see the fields in that tab.

Recommended columns:

| Date | End Date | Employee Name | Department | Status |
| --- | --- | --- | --- | --- |
| 06/15/2026 | 06/16/2026 | Jeff | Medical | Approved |
| 06/15/2026 | 06/15/2026 | Natalie (2 hours) | Administration | Approved |

Required columns are `Date`, `Employee Name`, and `Department`. `End Date` and `Status` are optional. If `End Date` is present, the app expands multi-day absences across each calendar day. If `Status` is present, only `Approved`, `Yes`, `Y`, or `True` rows are shown.

## Setup

1. Open `app.js`.
2. Change `PASSWORD` from `staff2026` to the staff password you want to use.
3. In Google Sheets, create a `Calendar Data` tab with only approved public calendar fields.
4. Go to `File > Share > Publish to web`.
5. Choose the `Calendar Data` tab and `Comma-separated values (.csv)`.
6. Copy the published CSV URL.
7. Paste it into `SHEET_CSV_URL` in `app.js`.

```js
SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_CSV_URL/pub?output=csv",
```

If `SHEET_CSV_URL` is blank, the app shows built-in demo data.

## Deploy To Netlify

This app has no build step.

1. Go to [Netlify](https://app.netlify.com/).
2. Drag this entire folder into Netlify.
3. Share the generated Netlify URL with staff.

You can also connect the folder to a private GitHub repository. In Netlify, leave the build command blank and use `.` as the publish directory.

## Important Security Note

This is a simple staff-facing static site. The password gate is useful for casual access control, but a static website cannot fully hide its password or fully secure a public CSV URL.

For stronger privacy, use one of these options:

- Keep the published CSV sanitized so it contains only staff-visible fields.
- Use Netlify password protection, SSO, or Identity for stronger access control.
- Use a small serverless function with a private Google service account if you need the sheet itself to remain private.

## Updating The Calendar

After deployment, update approved absences in the `Calendar Data` tab. The app fetches the CSV each time staff load or refresh the calendar, so normal calendar updates do not require redeploying.

## PTO Approval Dashboard

The staff calendar is public-facing read-only. The approval workflow uses a separate admin page plus a Netlify Function and Google Apps Script backend so sheet edits and email sending stay server-side.

Files:

| File | Purpose |
| --- | --- |
| `admin.html` | Internal PTO request dashboard |
| `admin.js` | Dashboard login, request list, assignment, approvals |
| `admin.css` | Dashboard styling |
| `netlify/functions/pto-api.js` | Authenticates dashboard users and proxies to Google Apps Script |
| `google-sheets-pto-workflow-backend.gs` | Reads/writes the response sheet and sends email |

### 1. Add The Apps Script Backend

In the same Google Apps Script project where you pasted `google-sheets-build-calendar-data.gs`, paste the full contents of:

`google-sheets-pto-workflow-backend.gs`

Save the script.

### 2. Add Apps Script Properties

In Apps Script:

1. Click `Project Settings`.
2. Under `Script Properties`, add:

| Property | Value |
| --- | --- |
| `PTO_API_TOKEN` | A long random secret. Use the same value in Netlify. |
| `PTO_DASHBOARD_URL` | Your deployed admin URL, e.g. `https://your-site.netlify.app/admin.html` |

### 3. Deploy Apps Script As Web App

1. Click `Deploy > New deployment`.
2. Select type `Web app`.
3. Set `Execute as` to `Me`.
4. Set `Who has access` to `Anyone`.
5. Click `Deploy`.
6. Copy the Web App URL.

The web app is public but protected by `PTO_API_TOKEN`; do not share the token.

### 4. Add Netlify Environment Variables

In Netlify:

`Site configuration > Environment variables`

Add:

| Variable | Value |
| --- | --- |
| `PTO_BACKEND_URL` | The Google Apps Script Web App URL |
| `PTO_API_TOKEN` | Same random secret as Apps Script |
| `PTO_DASHBOARD_PASSWORD` | Password Helen/supervisors use to open `admin.html` |
| `PTO_SESSION_SECRET` | Another long random secret used to sign dashboard sessions |

Redeploy Netlify after adding the variables.

### 5. Use The Dashboard

Open:

`https://your-site.netlify.app/admin.html`

Workflow:

1. Helen opens the dashboard.
2. Helen selects a request and assigns a supervisor name/email.
3. The supervisor receives an email telling them to review the request.
4. Supervisor decision is recorded in the dashboard.
5. Helen clicks `Approve and email employee` or `Deny and email employee`.
6. The employee receives the approval/denial email automatically.

The backend will add workflow columns to `Form Responses 1` the first time it runs.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and password gate |
| `styles.css` | Responsive staff portal design |
| `app.js` | Password session, CSV parsing, calendar rendering |
| `netlify.toml` | Netlify publish settings and headers |
