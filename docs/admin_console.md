# Admin Console

The app now includes a dedicated `/admin` console with strict access controls, RPC-only write operations, and audit logging.

## Route Map

- `/admin` overview dashboard
- `/admin/seasons`
- `/admin/teams`
- `/admin/players`
- `/admin/fixtures`
- `/admin/rebuild`
- `/admin/coaches`
- `/admin/submissions`
- `/admin/content`
- `/admin/flags`
- `/admin/assets`
- `/admin/audit`

## Security Model

- Access gate checks `public.eg_profiles` role (`admin` / `super_admin`) and ban state.
- All admin writes use `SECURITY DEFINER` RPCs:
  - `eg_admin_set_user_role_and_team`
  - `eg_admin_set_ban`
  - `eg_admin_upsert_flag`
  - `eg_admin_upsert_content`
  - `eg_admin_enqueue_job`
  - `eg_admin_set_job_status`
  - `eg_admin_update_fixture`
  - `eg_admin_swap_fixture_teams`
  - `eg_admin_clear_fixture_scores`
  - `eg_admin_set_ocr_status`
- Every destructive or state-changing action requires explicit confirmation in UI.
- Audit entries are appended in `eg_audit_log` server-side by RPC helpers.

## Data Layer

- `src/lib/adminTypes.ts`: core admin types.
- `src/lib/adminApi.ts`: typed reads + RPC write wrappers.
- `src/lib/useFeatureFlag.ts`: cached feature-flag hook.
- `src/lib/usePublishedContentBlocks.ts`: read-only published content hook.

## UX/Performance Features

- Debounced search across admin pages.
- Pagination on major tables.
- Background refresh for volatile data (jobs, OCR, audit).
- Optimistic profile updates for role/team/ban controls.
- Scoped `src/styles/admin.css` so admin styles do not leak into locked pages.
