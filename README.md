# Confidence Monitor — Desktop (Windows)

A thin Electron wrapper around [Confidence Monitor](https://github.com/chrisgrimm-jm/confidence-monitor) so it runs as its own program instead of a browser tab.

- **Loads the hosted page** (`chrisgrimm-jm.github.io/confidence-monitor`), so every push to that repo shows up the next time you launch — no rebuild needed. A copy of the page is bundled as a fallback if the hosted one can't load (note the teleprompter still needs internet for Firebase).
- **Opens the talent Display by itself**, fullscreen on the second monitor (whichever monitor Control isn't on). With only one monitor it just waits for you to click **Open Talent Display**.
- **No camera prompt.** Camera access is pre-approved, so **Use Camera** picks the OBS Virtual Camera and the choice is remembered, same as in the browser.
- **Capture Feed has no picker.** It finds the OBS **Windowed Projector (Program)** window by name. If it can't find it, a dialog tells you what to open in OBS.
- Keeps rendering when other windows cover it (Chromium's occlusion/background throttling is switched off).
- Ad reads, Companion, show/hide commands — all unchanged. They live in Firebase.

## Use
Download `Confidence Monitor 1.0.0.exe` from the repo's Releases (or a workflow run's Artifacts), double-click it. It's a portable exe — no install, no admin. It's **unsigned**, so Windows SmartScreen shows a one-time "Windows protected your PC" → **More info → Run anyway**.

Start OBS's **Virtual Camera** first (or the Display retries every 3 seconds until it appears).

Menu (press Alt): View → reload, DevTools, fullscreen.

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
