# Mound Visit — Desktop (Windows)

A thin Electron wrapper around [Mound Visit](https://github.com/chrisgrimm-jm/mound-visit) so it runs as its own program instead of a browser tab.

- **Loads the hosted page** (`chrisgrimm-jm.github.io/mound-visit`), so every push to that repo shows up the next time you launch — no rebuild needed. A copy of the page is bundled as a fallback if the hosted one can't load (note the teleprompter still needs internet for Firebase).
- **Opens the talent Display by itself**, fullscreen on the monitor you choose in Control's Talent Display card (**Monitor** dropdown; **Identify** flashes each screen's number; **Windowed** keeps it a normal window). The first time you open the Display it asks which monitor (and won't auto-open at launch until you've chosen once). With only one monitor it just waits for you to click **Open Talent Display**.
- **No camera prompt.** Camera access is pre-approved, so the **Feed** card on Control lists your cameras right away, picks the OBS Virtual Camera, and the choice is remembered, same as in the browser.
- **Capture Feed has no picker.** It finds the OBS **Windowed Projector (Program)** window by name. If it can't find it, a dialog tells you what to open in OBS.
- **Studio name, computer name and LAN IP** for the Display's test pattern (the Windows user name is the studio name by default; override it in Control's Talent Display card). A web page can't read these, so only the desktop app provides them.
- Keeps rendering when other windows cover it (Chromium's occlusion/background throttling is switched off).
- Ad reads, Companion, show/hide commands — all unchanged. They live in Firebase.

## Install
Download **`Mound-Visit-Setup-<version>.exe`** from the repo's Releases and run it. It installs just for your user (no admin needed), adds a desktop and Start menu shortcut, and launches the app. To pin it: open the app, right-click its taskbar icon → **Pin to taskbar**. To update the app itself, run a newer Setup over the old one (the page content already updates on its own).

It's **unsigned**, so Windows SmartScreen shows a one-time "Windows protected your PC" → **More info → Run anyway**.

There's also `Mound-Visit-Portable-<version>.exe` — no install, runs from wherever you put it, but unpacks on every launch (slower start) and has no shortcuts.

Start OBS's **Virtual Camera** first (or the Display retries every 3 seconds until it appears).

Menu (press Alt): View → reload, DevTools, fullscreen. **Help → Open log file** opens `main.log` (window opens, monitor count, load failures) — send it along if something doesn't behave. Clicking **Open Talent Display** while the Display is already open raises it.

## Develop
```bash
npm install
npm run sync     # copies ../confidence-monitor/index.html into app/ (the offline fallback)
npm start        # CM_URL=http://localhost:8000/ npm start  to point it at a local copy
```

## Build
Push a tag (`git tag v1.0.1 && git push --tags`) or run the **Build** workflow manually. GitHub Actions builds the Windows exe (it refreshes the bundled fallback page from the main repo first) and attaches it to the release for tags.

## Not verified
Built and tested on a Mac only (window opening, the Control→Display link, camera permission, the offline fallback). Not yet run on Windows — in particular multi-monitor placement and the OBS projector auto-select (which uses window names; adjust the regex in `main.js` if OBS names it differently on your machine).

## Renamed from "Confidence Monitor"
The app, repos and hosted page are now **Mound Visit** (hosted page: `chrisgrimm-jm.github.io/mound-visit/`). The installer keeps the same internal app id, so installing a newer Setup upgrades in place, and the app keeps using the old settings folder (`%APPDATA%\Confidence Monitor`), so your saved camera, studio name and panel layout carry over. If a leftover "Confidence Monitor" shortcut remains after upgrading, delete it and re-pin the new one. Versions before 1.3.0 point at the old page address and need updating.
