const { contextBridge, ipcRenderer } = require('electron');

// Ana süreç ile renderer süreci arasındaki güvenli köprü
contextBridge.exposeInMainWorld('electronAPI', {
  // Pencere kontrolleri
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Tarayıcı işlevleri
  loadURL: (url) => ipcRenderer.invoke('load-url', url),
});
