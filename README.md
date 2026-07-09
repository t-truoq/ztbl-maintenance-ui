# Z-Table Maintenance UI

React + Vite application for maintaining dynamic SAP Z tables from a Fiori Launchpad tile. The app reads table configuration and DDIC-style metadata from RAP OData services, then renders a table maintenance experience with filters, inline editing, Excel import/export, audit history, dependency inspection, AI field guidance, and PDF data dictionary export.

## Main Features

- Dynamic Z-table list from `TableConfig`, filtered to active records only.
- Metadata-driven table UI from `getFieldMeta` and field configuration.
- Inline create, edit, delete, selected-row editing, and bulk update/delete.
- Type-aware inputs: text, decimal, date picker, checkbox, domain dropdown, and foreign-key value help.
- CSRF handling, SAP session support, optimistic lock messages, and FK/delete error dialogs.
- Excel pipeline: download template/data, upload workbook, preview diff, and confirm import.
- Audit log viewer with filters and field-level old/new value display.
- Dependency tab using repository inventory information.
- AI field descriptions shown as on-demand help in the data table and in the field schema tab.
- PDF data dictionary export from field metadata and AI descriptions.

## Tech Stack

- React 19
- Vite 6
- TypeScript
- UI5 Web Components for React
- Axios
- Vitest and ESLint
- SAP Fiori tools deploy task for ABAP repository upload

## Runtime Architecture

### Local Development

Local development runs on Vite at `http://localhost:3000`.

- The app shows a local sign-in prompt.
- Credentials are stored in session storage as a Basic Auth token for the browser session.
- Vite proxies `/sap` requests to the SAP backend configured in `vite.config.js`.

### Fiori Launchpad Deployment

The deployed app is hosted as SAPUI5 application `ZZTBL_MAINT_UI`.

- `public/Component.js` is the UI5 wrapper loaded by FLP.
- The wrapper injects `index.css` and `index.js`, then mounts the React app into a generated container.
- FLP runtime uses the existing SAP session/SSO cookies.
- The React-only header and login screen are not used in deployed mode.

## Backend Services

### Table Maintenance Service

Base path:

```text
/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001
```

Important entities/actions used by the UI:

- `TableConfig`
- `FieldConfig`
- `AuditLog`
- `getTableData`
- `getFieldMeta`
- `getDomainValues`
- `getFkValues`
- `getRepositoryInfo`
- `getAiDescription`
- `createRecord`
- `updateRecord`
- `deleteRecord`

Single-record CRUD uses `record_data`. Bulk update/delete uses `records_data` with chunks of up to 50 records.

### Excel Pipeline Service

Base path:

```text
/sap/opu/odata4/sap/zsb_excel_pl/srvd/sap/zsd_excel_pipeline/0001
```

Actions used by the Excel tab:

- `downloadExcel`
- `uploadExcel`
- `confirmImport`

## Project Structure

```text
public/
  Component.js                 UI5 wrapper used by Fiori Launchpad

src/
  main.tsx                     React mount/unmount entry for local and FLP runtime
  AuthApp.tsx                  Local Basic Auth gate and deployed-session probe
  App.tsx                      App shell entry
  pages/TableMaintenance/      Main table-maintenance page and hook
  components/                  UI components, dialogs, table, tabs, value helps
  services/                    OData clients and API wrappers
  utils/                       Metadata, formatting, validation, audit, AI, and lock helpers
  types/                       Shared TypeScript types

ui5-deploy.yaml                ABAP repository deployment config
ui5.yaml                       UI5 tooling config
vite.config.js                 Vite build, proxy, and relative asset config
```

## Environment

Create or update `.env` for deploy credentials:

```env
SAP_USER=your-user
SAP_PASSWORD=your-password
```

Local runtime login is entered in the browser prompt. The `.env` credentials are used by the deployment task.

## Commands

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Deploy to the ABAP repository:

```bash
npm run deploy
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

## Deployment Notes

`npm run deploy` builds the app first and then runs:

```bash
npx fiori deploy --config ui5-deploy.yaml
```

The deployment target is configured in `ui5-deploy.yaml`:

- URL: `https://s40lp1.ucc.cit.tum.de`
- Client: `324`
- App name: `ZZTBL_MAINT_UI`
- Package: `$tmp`

If deployment reports that `dist` is missing, run `npm run build` or use `npm run deploy` from this repository root.

## Cache Troubleshooting

If FLP still loads old JavaScript or CSS after a successful deployment:

1. Hard reload the browser.
2. Check `public/Component.js` version and deployed `index.js`/`index.css` URLs.
3. In SAP GUI, invalidate UI2 client caches with `/UI2/INVALIDATE_CLIENT_CACHES`.

Use "For all users" only when the deployed update should be visible to the whole team. For single-user testing, invalidate only your user cache.

## Development Notes

- Keep `public/Component.js` and `src/main.tsx` version values in sync when cache-busting FLP deployments.
- Do not send `MANDT` or `CLIENT` fields in CRUD payloads. Client handling is done by ABAP.
- UUID non-FK key fields can be treated as backend-generated when metadata marks them as generated/non-FK. FK UUID fields must be selected from value help.
- FK value help options are loaded through `getFkValues` and cached client-side.
- AI descriptions are loaded on demand to avoid unnecessary token usage.
- The app does not use an approuter. Local `/sap` calls are proxied by Vite, while deployed calls use FLP/SAP session cookies.
