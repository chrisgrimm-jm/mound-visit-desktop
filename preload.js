// the only things the hosted page can ask of the desktop app: raise the Display window, and who/where this computer is
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('cmDesktop', {
  showDisplay: () => ipcRenderer.invoke('show-display'),
  hostInfo: () => ipcRenderer.invoke('host-info')
})
