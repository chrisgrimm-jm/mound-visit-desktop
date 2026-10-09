const { app, BrowserWindow, Menu, desktopCapturer, dialog, screen, session } = require('electron')
const { pathToFileURL } = require('url')
const path = require('path')

// Hosted page = always the latest push. Bundled copy (app/index.html) only loads if the hosted one can't.
const HOSTED = process.env.CM_URL || 'https://chrisgrimm-jm.github.io/confidence-monitor/'
const BUNDLED = pathToFileURL(path.join(__dirname, 'app', 'index.html')).href

// Chromium freezes/throttles windows that are covered or in the background (the Display is often
// covered by other windows, and a frozen capture would freeze the feed).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

if (!app.requestSingleInstanceLock()) app.quit()

const isOurs = u => u.startsWith(HOSTED) || u.startsWith(BUNDLED.split('#')[0])
let control, autoOpened = false

// The talent Display goes fullscreen on whichever monitor Control isn't on (if there is one).
function placeDisplay(win) {
  const here = screen.getDisplayMatching(control.getBounds())
  const other = screen.getAllDisplays().find(d => d.id !== here.id)
  if (!other) return
  win.setBounds(other.bounds)
  win.setFullScreen(true)
}

app.whenReady().then(() => {
  const ses = session.defaultSession

  // camera access (OBS Virtual Camera) without a prompt, so the saved camera auto-connects on load
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'fullscreen'].includes(perm)))
  ses.setPermissionCheckHandler((_wc, perm) => ['media', 'fullscreen'].includes(perm))

  // "Capture Feed": pick the OBS Windowed Projector (Program) by name instead of showing a picker
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    const srcs = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
    const proj = srcs.find(s => /projector.*program|program.*projector/i.test(s.name))
    if (proj) return cb({ video: proj })
    dialog.showMessageBox(control, { type: 'info', message: 'OBS projector window not found',
      detail: 'In OBS, right-click the Program preview → Windowed Projector (Program), then click Capture Feed again.' })
    cb({})
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'View', submenu: [
    { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' } ] }]))

  control = new BrowserWindow({ width: 1920, height: 1080, show: false, autoHideMenuBar: true, backgroundColor: '#0b0f16' })
  control.maximize(); control.show()
  control.on('closed', () => app.quit())

  control.webContents.setWindowOpenHandler(({ url }) =>
    isOurs(url) ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000' } }
                : { action: 'deny' })
  control.webContents.on('did-create-window', placeDisplay)

  control.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith(HOSTED)) control.loadURL(BUNDLED)   // -3 = aborted, not a real failure
  })

  // open the Display straight away when there's a second monitor to put it on
  control.webContents.on('did-finish-load', () => {
    if (autoOpened || screen.getAllDisplays().length < 2) return
    autoOpened = true
    setTimeout(() => control.webContents.executeJavaScript('document.getElementById("openDisplay")?.click()', true), 1500)
  })

  control.loadURL(HOSTED)
})

app.on('second-instance', () => { if (control) { if (control.isMinimized()) control.restore(); control.focus() } })
