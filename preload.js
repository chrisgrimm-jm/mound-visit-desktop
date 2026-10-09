// the only thing the hosted page can ask of the desktop app: bring the Display window forward
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('cmDesktop', { showDisplay: () => ipcRenderer.invoke('show-display') })
