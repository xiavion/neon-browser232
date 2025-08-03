const { contextBridge, ipcRenderer } = require('electron');

// Ana süreç ile iletişim için API
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

  // Yeni Eklenen Özellikler

  // Tema modu ve neon efektleri
  toggleThemeMode: (dark) => ipcRenderer.invoke('toggle-theme-mode', dark),
  toggleNeonEffects: (enabled) => ipcRenderer.invoke('toggle-neon-effects', enabled),

  // Form doldurma özellikleri
  toggleAutofill: (enabled) => ipcRenderer.invoke('toggle-autofill', enabled),
  saveFormData: (data) => ipcRenderer.invoke('save-form-data', data),
  clearFormData: () => ipcRenderer.invoke('clear-form-data'),

  // Performans modunu ayarlama
  setPerformanceMode: (mode) => ipcRenderer.invoke('set-performance-mode', mode),

  // Bildirim sistemi
  sendNotification: (options) => ipcRenderer.invoke('send-notification', options),

  // IPC Event Dinleyicileri
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

  // Tema ve performans için olay dinleyicileri
  onThemeModeChanged: (callback) => {
    ipcRenderer.on('theme-mode-changed', (_, data) => callback(data));
  },
  onNeonEffectsChanged: (callback) => {
    ipcRenderer.on('neon-effects-changed', (_, data) => callback(data));
  },
  onPerformanceModeChanged: (callback) => {
    ipcRenderer.on('performance-mode-changed', (_, data) => callback(data));
  },
  onProcessNextNotification: (callback) => {
    ipcRenderer.on('process-next-notification', (_, data) => callback(data));
  },

  // Dinleyicileri kaldırma
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('page-title-updated');
    ipcRenderer.removeAllListeners('page-info-updated');
    ipcRenderer.removeAllListeners('url-updated');
    ipcRenderer.removeAllListeners('navigation-state-updated');
    ipcRenderer.removeAllListeners('system-resources-updated');
    ipcRenderer.removeAllListeners('theme-mode-changed');
    ipcRenderer.removeAllListeners('neon-effects-changed');
    ipcRenderer.removeAllListeners('performance-mode-changed');
    ipcRenderer.removeAllListeners('process-next-notification');
  }
});

// SpeedDial sayfasından gelen postMessage olaylarını dinle
window.addEventListener('message', (event) => {
  // Güvenlik kontrolü
  if (event.source !== window) return;

  const message = event.data;

  if (!message || typeof message !== 'object') return;

  // postMessage olaylarını işle
  if (message.type === 'loadURL') {
    // Aktif sekme ID'sini daha güvenli bir şekilde al
    const activeTabId = getCurrentTabId();
    if (activeTabId && message.url) {
      console.log(`loadURL: ${activeTabId} için ${message.url} yükleniyor`);

      // İki yöntemle de deneyelim - biri başarısız olursa diğeri çalışabilir
      ipcRenderer.invoke('load-url', { id: activeTabId, url: message.url })
        .catch(err => {
          console.error('load-url hatası, speed-dial-action deneniyor:', err);

          // Alternatif metot - özel speed-dial-action olayı
          ipcRenderer.invoke('speed-dial-action', {
            action: 'loadURL',
            data: { id: activeTabId, url: message.url }
          });
        });
    } else {
      console.error("Aktif sekme ID'si bulunamadı veya URL boş");
    }
  } else if (message.type === 'clearCache') {
    ipcRenderer.invoke('clear-cache')
      .catch(err => {
        console.error('clear-cache hatası, alternatif metot deneniyor:', err);
        ipcRenderer.invoke('speed-dial-action', { action: 'clearCache', data: {} });
      });
  } else if (message.type === 'networkDiag') {
    // Ağ teşhis işlevselliği
    console.log('Ağ teşhisi başlatıldı');
    ipcRenderer.invoke('speed-dial-action', { action: 'networkDiag', data: {} });
  } else if (message.type === 'notifications') {
    // Bildirim işlevselliği
    console.log('Bildirimler açıldı');
    ipcRenderer.invoke('speed-dial-action', { action: 'notifications', data: {} });
  }
});

// Mevcut aktif sekmenin ID'sini getir
function getCurrentTabId() {
  try {
    // Sayfadan aktif sekme ID'sini almaya çalış
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      return activeTab.getAttribute('data-id') || activeTab.id;
    }

    // Eğer DOM'dan alamazsak, globalde saklanan ID değişkenini kontrol et
    if (window.globalActiveTabId) {
      return window.globalActiveTabId;
    }

    // Her ikisi de başarısız olursa, mevcut tüm sekmeleri al ve ilk sekmeyi kullan
    const allTabs = document.querySelectorAll('.tab');
    if (allTabs.length > 0) {
      return allTabs[0].getAttribute('data-id') || allTabs[0].id;
    }

    // Varsayılan değer
    return "1";
  } catch (error) {
    console.error("Sekme ID'si alınırken hata:", error);
    return "1"; // Hata durumunda varsayılan sekme ID'si
  }
}
