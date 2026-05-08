# UnitTracker — Claude Code Guide

## Project Overview
Commissioning tracker for the Divcon/RED Group Lancaster Pump Skid PLC upgrade.
React Native + Expo ~54, Zustand v5, Supabase backend, deployed as Android APK + Vercel web app.

Source: `/data/data/com.termux/files/home/UnitTracker/`
Git remote: `https://github.com/crjahn66/UnitTracker.git` (branch: `master`)

## Release Workflow — IMPORTANT
Every push to `master` triggers a GitHub Action that builds the APK and publishes a GitHub Release.
**The APK update checker compares semver — it will only notify users of a new version if `version` in `app.json` is bumped.**

Rule: any push that contains user-facing changes should include a version bump in `app.json`.
**CRITICAL: Edit app.json FIRST, then `git add` it. Staging an already-committed file without editing it is a no-op — the CI will publish the old version and users won't be notified.**

```
"version": "1.0.3"  →  "1.0.4"
```

Then commit and push together:
```bash
git add app.json <changed files>
git commit -m "Bump to 1.0.X — short description of changes"
git push origin master
```

The in-app update banner appears automatically within ~30 minutes (next poll cycle), or immediately via Reports → Check for App Updates.

## Key Architecture
- **Store**: `src/store/useStore.ts` — Zustand with persist middleware
- **Sync**: `src/utils/sync.ts` — `pushToCloud()` uses `mergeImport()` (NOT `injectRemotePhotos`); `webAutoPoll` compares against `_lastKnownRemoteAt`
- **Excel export**: `src/utils/exportExcel.ts` (APK) + `exportExcel.web.ts` (web) — must keep in sync
- **Network data**: `src/data/networkData.ts` — static IP lookup by `"Side-unitNumber"` key
- **Edit mode**: `src/context/EditModeContext.tsx` — `EDIT_TIMEOUT_MS = 180_000` (3 min inactivity)
- **APK updates**: `src/utils/appUpdater.ts` + `src/hooks/useUpdateCheck.ts` — polls GitHub Releases

## Excel Tab Order
Overview → Completed Units → Component Status → Testing Readiness → Units with Constraints → Constraints Log → General Constraints

## Unit Completion Rule
All 4 stages = `complete` AND no open **component** issues.
Misc equipment issues/status do NOT affect completion or card color.

## mergeImport Pattern
Every new Unit field added to the store MUST be explicitly listed in `mergeImport()`:
```ts
'fieldName' in imp && { fieldName: imp.fieldName }
```

## Permissions / Auth
- `viewonly@red.group` → `isViewOnly = true` — hides chiller section and all edit controls
- Edit mode gated by `EditModeContext`
