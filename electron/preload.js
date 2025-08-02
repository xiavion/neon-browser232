const { contextBridge, ipcRenderer } = require('electron');

// Ana süreç ile renderer süreci arasındaki güvenli köprü
contextBridge.exposeInMainWorld('electronAPI', {
  // Pencere kontrolleri
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Tarayıcı görünüm yönetimi
  createTab: (id, url) => ipcRenderer.invoke('create-tab', { id, url }),
  closeTab: (id) => ipcRenderer.invoke('close-tab', { id }),
  switchTab: (id) => ipcRenderer.invoke('switch-tab', { id }),

  // Tarayıcı navigasyon işlevleri
  loadURL: (id, url) => ipcRenderer.invoke('load-url', { id, url }),
  goBack: (id) => ipcRenderer.invoke('go-back', { id }),
  goForward: (id) => ipcRenderer.invoke('go-forward', { id }),
  refresh: (id) => ipcRenderer.invoke('refresh', { id }),

  // İçerik alanı güncellemesi
  updateContentBounds: () => ipcRenderer.invoke('content-bounds-updated'),

  // GX özellikler - Sistem kaynak yöneticisi
  updateResourceLimits: (limits) => ipcRenderer.invoke('update-resource-limits', limits),
  toggleAdBlocker: (enabled) => ipcRenderer.invoke('toggle-adblocker', enabled),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  clearCookies: () => ipcRenderer.invoke('clear-cookies'),

  // IPC event dinleyicileri
  onPageTitleUpdated: (callback) => {
    ipcRenderer.on('page-title-updated', (_, data) => callback(data));
  },
  onPageInfoUpdated: (callback) => {
    ipcRenderer.on('page-info-updated', (_, data) => callback(data));
  },
  onURLUpdated: (callback) => {
    ipcRenderer.on('url-updated', (_, data) => callback(data));
  },
  onNavigationStateUpdated: (callback) => {
    ipcRenderer.on('navigation-state-updated', (_, data) => callback(data));
  },
  onSystemResourcesUpdated: (callback) => {
    ipcRenderer.on('system-resources-updated', (_, data) => callback(data));
  },

  // Dinleyicileri kaldırma
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('page-title-updated');
    ipcRenderer.removeAllListeners('page-info-updated');
    ipcRenderer.removeAllListeners('url-updated');
    ipcRenderer.removeAllListeners('navigation-state-updated');
    ipcRenderer.removeAllListeners('system-resources-updated');
  }
});
