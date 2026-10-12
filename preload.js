// the only things the hosted page can ask of the desktop app: raise the Display window, who/where this computer is, and which monitor the Display goes on
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('cmDesktop', {
  showDisplay: () => ipcRenderer.invoke('show-display'),
  hostInfo: () => ipcRenderer.invoke('host-info'),
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  setDisplayMonitor: id => ipcRenderer.invoke('set-display-monitor', id),
  identifyDisplays: () => ipcRenderer.invoke('identify-displays')
})
