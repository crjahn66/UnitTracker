# UnitTracker

Android app for tracking commissioning of 51 Chilling Units at Skybox Data Center.
- **North side**: N-01 to N-26 (26 units)
- **South side**: S-01 to S-25 (25 units)

---

## Running the dev server (Expo Go)

Requires Node 20. The server must be running on the same Wi-Fi network as your phone.

1. Open a terminal and run:
   ```
   cd "C:\OD\OneDrive - Red Group\Tools\UnitTracker"
   start.bat
   ```
2. Scan the QR code with the **Expo Go** app on your phone.

> If `start.bat` doesn't work from the terminal, double-click it in File Explorer instead.

### Node not found?

Node 20 is managed via nvm. If the server fails to start:

```
C:\Users\kiraz\AppData\Local\nvm\nvm.exe use 20.19.1
```

Then run `start.bat` again.

---

## Building a standalone APK

Pushing to the `master` branch on GitHub automatically triggers a build via GitHub Actions.

### Push a new build

```
cd "C:\OD\OneDrive - Red Group\Tools\UnitTracker"
git add -A
git commit -m "your message"
git push
```

### Download the APK

1. Go to https://github.com/crjahn66/UnitTracker/actions
2. Click the latest green workflow run
3. Scroll to **Artifacts** → download **app-debug**
4. Unzip → install `app-debug.apk` on your phone

Build takes ~5-10 min (first run longer). Subsequent builds are faster due to caching.

---

## Backup & Restore data

Data is stored locally on the phone in AsyncStorage. To preserve it across app reinstalls:

1. Open the app → **Reports** tab
2. Tap **Backup Data** → save the `.json` file somewhere safe (email it to yourself, save to OneDrive, etc.)
3. After reinstalling, tap **Restore Backup** → pick the saved `.json`

---

## Project structure

```
UnitTracker/
├── src/
│   ├── components/
│   │   └── ComponentModal.tsx     # Per-component status + issue logging
│   ├── navigation/
│   │   └── index.tsx              # Bottom tabs (North / South / Reports)
│   ├── screens/
│   │   ├── UnitListScreen.tsx     # Grid of unit cards
│   │   ├── UnitDetailScreen.tsx   # Stage checklist + component list
│   │   └── ReportsScreen.tsx      # Stats, export, backup/restore
│   ├── store/
│   │   └── useStore.ts            # Zustand store with AsyncStorage persistence
│   ├── types/
│   │   └── index.ts               # Shared types (Unit, Issue, Stage, Component)
│   └── utils/
│       ├── exportExcel.ts         # Excel export (5 colour-coded sheets)
│       ├── backup.ts              # JSON backup / restore
│       └── initialData.ts         # Creates the 51 default units
├── assets/                        # App icons and splash screen
├── .github/workflows/
│   └── build-apk.yml             # GitHub Actions APK build
├── app.json                       # Expo config
├── package.json                   # Dependencies
└── start.bat                      # Dev server launcher
```

---

## After updating the app (re-installing APK)

Your data is stored on the phone and **will be lost** if you uninstall. Always **Backup Data** before installing a new APK, then **Restore Backup** after.
