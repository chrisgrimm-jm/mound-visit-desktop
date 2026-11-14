const { app, BrowserWindow, Menu, desktopCapturer, dialog, ipcMain, screen, session, shell } = require('electron')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const path = require('path')

// Hosted page = always the latest push. Bundled copy (app/index.html) only loads if the hosted one can't.
// Renamed from "Confidence Monitor": keep using the old settings folder so saved camera/studio name/layout survive the rename
app.setPath('userData', path.join(app.getPath('appData'), 'Confidence Monitor'))

const HOSTED = process.env.CM_URL || 'https://chrisgrimm-jm.github.io/mound-visit/'
const BUNDLED = pathToFileURL(path.join(__dirname, 'app', 'index.html')).href

// Chromium freezes/throttles windows that are covered or in the background (the Display is often
// covered by other windows, and a frozen capture would freeze the feed).
// MediaFoundationVideoCapture off = Chromium reads cameras through DirectShow, OBS Virtual Camera's native
// interface; through Media Foundation it delivered only ~10 fps of OBS's 60. (One disable-features switch only:
// a second appendSwitch would replace this one.)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,MediaFoundationVideoCapture')
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

// ---- which monitor the talent Display goes on (chosen on the Control page; null = "the monitor Control isn't on") ----
let preferredMon = null   // a display id, 'windowed' (never fullscreen), or null

// monitors numbered left-to-right (then top-to-bottom), which is how people count them
function monitors() {
  const here = control ? screen.getDisplayMatching(control.getBounds()).id : null
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().slice()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({ id: d.id, n: i + 1, label: d.label || '', w: d.bounds.width, h: d.bounds.height, primary: d.id === primary, hasControl: d.id === here }))
}
// the monitor the Display should be on right now: the chosen one if it's still connected, else any monitor other than Control's
function targetDisplay() {
  const all = screen.getAllDisplays()
  if (typeof preferredMon === 'number') { const d = all.find(x => x.id === preferredMon); if (d) return d }
  const here = screen.getDisplayMatching(control.getBounds())
  return all.find(d => d.id !== here.id) || null
}
function moveFullscreen(win, bounds) {
  const go = () => { win.setBounds(bounds); win.setFullScreen(true) }
  if (win.isFullScreen()) { win.once('leave-full-screen', go); win.setFullScreen(false) } else go()
}
function placeDisplay(win) {
  try {
    if (preferredMon === 'windowed') {
      log('placeDisplay: windowed by choice')
      if (win.isFullScreen()) win.setFullScreen(false)
      return
    }
    const t = targetDisplay()
    log('placeDisplay: displays =', screen.getAllDisplays().length, 'preferred =', preferredMon, t ? 'target ' + t.id + ' ' + JSON.stringify(t.bounds) : 'no other monitor, leaving windowed')
    if (t) moveFullscreen(win, t.bounds)
  } catch (e) { log('placeDisplay failed', e && e.stack || e) }
}

const fromPage = e => isOurs(e.senderFrame ? e.senderFrame.url : '')
ipcMain.handle('list-displays', e => fromPage(e) ? { monitors: monitors(), chosen: preferredMon === 'windowed' ? 'windowed' : (targetDisplay() || {}).id } : null)
ipcMain.handle('set-display-monitor', (e, id) => {
  if (!fromPage(e)) return false
  preferredMon = id === 'windowed' ? 'windowed' : (typeof id === 'number' ? id : null)
  log('set-display-monitor', preferredMon)
  if (displayWin && !displayWin.isDestroyed()) placeDisplay(displayWin)
  return true
})
// flash each monitor's number for 3 seconds so identical screens can be told apart
ipcMain.handle('identify-displays', e => {
  if (!fromPage(e)) return false
  const labelOf = new Map(monitors().map(m => [m.id, m]))
  screen.getAllDisplays().forEach(d => {
    const m = labelOf.get(d.id), W = 460, H = 260
    const w = new BrowserWindow({ x: Math.round(d.bounds.x + (d.bounds.width - W) / 2), y: Math.round(d.bounds.y + (d.bounds.height - H) / 2), width: W, height: H,
      frame: false, transparent: true, alwaysOnTop: true, focusable: false, skipTaskbar: true, resizable: false, hasShadow: false })
    w.setIgnoreMouseEvents(true)
    const html = `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(11,15,22,.92);border:6px solid #E40000;box-sizing:border-box;border-radius:24px;color:#fff;font-family:Impact,sans-serif;overflow:hidden">
      <div style="font-size:30px;letter-spacing:4px;color:#00B7FF">MONITOR</div><div style="font-size:150px;line-height:1">${m.n}</div>
      <div style="font:600 18px sans-serif;color:#b8c0d0">${m.w}×${m.h}${m.primary ? ' · main' : ''}</div></body>`
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    setTimeout(() => { if (!w.isDestroyed()) w.destroy() }, 3000)
  })
  return true
})

// Studio name for the Display's test pattern: each studio's computer is logged in as that studio, so the Windows user name is it
ipcMain.handle('host-info', e => {
  if (!isOurs(e.senderFrame ? e.senderFrame.url : '')) return null
  let user = ''
  try { user = os.userInfo().username } catch {}
  // LAN IPv4 addresses (no loopback / link-local), private ranges first, so the Display can show where this PC is on the network
  const ips = []
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if ((n.family === 'IPv4' || n.family === 4) && !n.internal && !n.address.startsWith('169.254.')) ips.push(n.address)
  const priv = a => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) ? 0 : 1
  // only the real LAN addresses when there are any (drops VPN/Tailscale-style 100.x etc.)
  const lan = ips.filter(a => priv(a) === 0)
  return { user, host: os.hostname(), ips: lan.length ? lan : ips }
})

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
    return isOurs(url) ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000', webPreferences: { preload: path.join(__dirname, 'preload.js') } } }
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
    // no auto-open until the user has picked a monitor once (the page asks on the first manual open)
    if (autoOpened || screen.getAllDisplays().length < 2 || preferredMon === null) return
    autoOpened = true
    setTimeout(() => control.webContents.executeJavaScript('document.getElementById("openDisplay")?.click()', true), 1500)
  })

  control.loadURL(HOSTED)
})

app.on('second-instance', () => { if (control) { if (control.isMinimized()) control.restore(); control.focus() } })
