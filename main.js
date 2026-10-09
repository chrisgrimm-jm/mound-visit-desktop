const { app, BrowserWindow, Menu, desktopCapturer, dialog, ipcMain, screen, session, shell } = require('electron')
const fs = require('fs')
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

// must match the build appId so a pinned taskbar icon groups with (and relaunches) this app
app.setAppUserModelId('com.jomboymedia.confidencemonitor')

if (!app.requestSingleInstanceLock()) app.quit()

const isOurs = u => u.startsWith(HOSTED) || u.startsWith(BUNDLED.split('#')[0])
let control, displayWin = null, autoOpened = false

// tiny log so "nothing happens" reports can be diagnosed (Help -> Open log file)
const logFile = () => path.join(app.getPath('userData'), 'main.log')
const log = (...a) => { try { fs.appendFileSync(logFile(), new Date().toISOString() + ' ' + a.join(' ') + '\n') } catch {} }
process.on('uncaughtException', e => log('uncaughtException', e && e.stack || e))

// The talent Display goes fullscreen on whichever monitor Control isn't on (if there is one).
function placeDisplay(win) {
  try {
    const here = screen.getDisplayMatching(control.getBounds())
    const other = screen.getAllDisplays().find(d => d.id !== here.id)
    log('placeDisplay: displays =', screen.getAllDisplays().length, other ? 'moving to ' + JSON.stringify(other.bounds) : 'single monitor, leaving windowed')
    if (!other) return
    win.setBounds(other.bounds)
    win.setFullScreen(true)
  } catch (e) { log('placeDisplay failed', e && e.stack || e) }
}

// "Open Talent Display" when it's already open: raise it (and put it back on the second monitor if it isn't fullscreen)
ipcMain.handle('show-display', e => {
  const url = e.senderFrame ? e.senderFrame.url : ''
  if (!isOurs(url)) return false
  if (!displayWin || displayWin.isDestroyed()) { log('show-display: no Display window'); return false }
  log('show-display: raising existing Display')
  if (displayWin.isMinimized()) displayWin.restore()
  displayWin.show(); displayWin.focus()
  if (!displayWin.isFullScreen()) placeDisplay(displayWin)
  return true
})

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

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'Open log file', click: () => shell.openPath(logFile()) }] } ]))

  log('launch v' + app.getVersion(), 'displays =', screen.getAllDisplays().length, 'url =', HOSTED)
  control = new BrowserWindow({ width: 1920, height: 1080, show: false, autoHideMenuBar: true, backgroundColor: '#0b0f16',
    webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  control.maximize(); control.show()
  control.on('closed', () => app.quit())

  control.webContents.setWindowOpenHandler(({ url }) => {
    log('window.open', url, isOurs(url) ? 'allowed' : 'DENIED')
    return isOurs(url) ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000' } }
                       : { action: 'deny' }
  })
  control.webContents.on('did-create-window', win => {
    displayWin = win
    win.on('closed', () => { if (displayWin === win) displayWin = null })
    placeDisplay(win)
  })

  control.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    log('did-fail-load', code, _desc, url, isMain ? '(main frame)' : '')
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
