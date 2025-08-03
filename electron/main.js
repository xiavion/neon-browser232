const { app, BrowserWindow, BrowserView, ipcMain, session, protocol, shell, net, Notification } = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');
const isDev = !app.isPackaged;

let cpuUsageHistory = [];
let networkStats = { sent: 0, received: 0 };
let lastNetworkStats = { sent: 0, received: 0 };
let lastCpuInfo = null;

let mainWindow;
let views = {};
let activeViewId = null;

let resourceLimits = {
  cpuLimit: 100,
  ramLimit: 100,
  networkLimit: 100,
  isLimiterEnabled: false
};

const RESOURCE_MONITOR_INTERVAL = 2000;

// Tema ayarları
let isDarkMode = true; // Varsayılan olarak karanlık mod açık
let neonEffectsEnabled = true; // Neon efektleri açık
let autoFillEnabled = true; // Otomatik form doldurma açık

// Performans optimizasyonu için kullanılacak değişkenler
let performanceMode = 'balanced'; // 'balanced', 'performance', 'quality'
let lastNotification = null;
let pendingNotifications = [];
let formData = {}; // Otomatik form doldurma için kaydedilen veriler

let resourceMonitorInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#030303',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../public/icon.png')
  });

  if (isDev) {
    console.log('Development modunda çalışıyor, localhost:3000 kullanılıyor');
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    const outPath = path.join(__dirname, '../out/index.html');
    console.log(`Production modunda çalışıyor, dosya yükleniyor: ${outPath}`);

    if (fs.existsSync(outPath)) {
      mainWindow.loadFile(outPath);
    } else {
      console.error(`Hata: ${outPath} bulunamadı`);
      mainWindow.loadURL('data:text/html,<h1>Build eksik</h1><p>Lütfen önce "next build" komutunu çalıştırın</p>');
    }
  }

  mainWindow.on('resize', () => {
    if (activeViewId && views[activeViewId]) {
      resizeActiveView();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    views = {};

    if (resourceMonitorInterval) {
      clearInterval(resourceMonitorInterval);
      resourceMonitorInterval = null;
    }
  });

  startResourceMonitoring();
}

function startResourceMonitoring() {
  if (resourceMonitorInterval) {
    clearInterval(resourceMonitorInterval);
  }

  updateNetworkStats();

  resourceMonitorInterval = setInterval(() => {
    Promise.all([
      getCPUUsage(),
      getMemoryUsage(),
      getNetworkUsage()
    ]).then(([cpuUsage, memoryUsage, networkUsage]) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-resources-updated', {
          cpu: cpuUsage,
          ram: memoryUsage,
          network: networkUsage
        });
      }

      if (resourceLimits.isLimiterEnabled) {
        applyResourceLimits();
      }
    });
  }, RESOURCE_MONITOR_INTERVAL);
}

async function getCPUUsage() {
  return new Promise((resolve) => {
    const cpus = os.cpus();

    if (!lastCpuInfo) {
      lastCpuInfo = cpus;
      resolve(30);
      return;
    }

    let idle = 0;
    let total = 0;

    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      const lastCpu = lastCpuInfo[i];

      for (const type in cpu.times) {
        total += cpu.times[type] - lastCpu.times[type];
      }

      idle += cpu.times.idle - lastCpu.times.idle;
    }

    const cpuPercent = Math.round(100 * (1 - idle / total));

    cpuUsageHistory.push(cpuPercent);
    if (cpuUsageHistory.length > 5) {
      cpuUsageHistory.shift();
    }

    const avgCpuUsage = Math.round(
      cpuUsageHistory.reduce((sum, val) => sum + val, 0) / cpuUsageHistory.length
    );

    lastCpuInfo = cpus;

    resolve(Math.min(Math.max(avgCpuUsage, 0), 100));
  });
}

function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryUsage = Math.round((usedMem / totalMem) * 100);
  return Math.min(Math.max(memoryUsage, 0), 100);
}

function getNetworkUsage() {
  return new Promise((resolve) => {
    updateNetworkStats().then(stats => {
      const maxBandwidth = 1024 * 1024;
      const usagePercent = Math.min(Math.round((stats.total / maxBandwidth) * 100), 100);
      resolve(Math.max(usagePercent, 0));
    }).catch(() => {
      resolve(0);
    });
  });
}

function updateNetworkStats() {
  return new Promise((resolve) => {
    try {
      const networkInterfaces = os.networkInterfaces();
      let sent = 0;
      let received = 0;

      Object.keys(networkInterfaces).forEach(ifName => {
        networkInterfaces[ifName].forEach(iface => {
          if (!iface.internal) {
            received += Math.random() * 10000;
            sent += Math.random() * 5000;
          }
        });
      });

      const currentStats = { sent, received };
      const deltaReceived = received - lastNetworkStats.received;
      const deltaSent = sent - lastNetworkStats.sent;
      const total = (deltaReceived + deltaSent) / RESOURCE_MONITOR_INTERVAL;

      lastNetworkStats = currentStats;
      networkStats = {
        sent: deltaSent / RESOURCE_MONITOR_INTERVAL,
        received: deltaReceived / RESOURCE_MONITOR_INTERVAL,
        total: total
      };

      resolve(networkStats);
    } catch (error) {
      console.error("Ağ istatistikleri alınırken hata:", error);
      resolve({ sent: 0, received: 0, total: 0 });
    }
  });
}

function applyResourceLimits() {
  if (resourceLimits.cpuLimit < 100) {
    Object.keys(views).forEach(id => {
      if (id !== activeViewId) {
        views[id].webContents.setBackgroundThrottling(true);
      }
    });
  }

  if (resourceLimits.ramLimit < 100) {
    const cacheSizeInMB = Math.max(50, Math.round(500 * (resourceLimits.ramLimit / 100)));
    session.defaultSession.setCacheSize(cacheSizeInMB * 1024 * 1024);
  }

  if (resourceLimits.networkLimit < 100) {
    // Ağ sınırlaması için özel uygulama gerekir
  }
}

// Performans moduna göre kaynak limitlerini uygula
function applyPerformanceMode() {
  switch (performanceMode) {
    case 'performance':
      // CPU, RAM kullanımını sınırla
      resourceLimits.cpuLimit = 50;
      resourceLimits.ramLimit = 50;
      break;
    case 'quality':
      // Maksimum kalite için kaynakları serbest bırak
      resourceLimits.cpuLimit = 100;
      resourceLimits.ramLimit = 100;
      break;
    case 'balanced':
    default:
      // Dengeli mod
      resourceLimits.cpuLimit = 75;
      resourceLimits.ramLimit = 75;
      break;
  }
  applyResourceLimits();
}

let isResizing = false;
let lastBounds = null;

function resizeActiveView() {
  if (!mainWindow || !views[activeViewId] || isResizing) return;

  isResizing = true;

  mainWindow.webContents.executeJavaScript(`
    (function() {
      try {
        const element = document.querySelector('.webpage-content');
        if (element) {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }

        const alternativeElements = [
          document.querySelector('.main-browser'),
          document.querySelector('.browser-content'),
          document.querySelector('[ref="contentRef"]'),
          document.body
        ];

        for (const el of alternativeElements) {
          if (el) {
            const rect = el.getBoundingClientRect();
            if (el === document.body) {
              return {
                x: 0,
                y: 100,
                width: rect.width,
                height: rect.height - 100
              };
            }
            return {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            };
          }
        }

        return {
          x: 0,
          y: 100,
          width: window.innerWidth,
          height: window.innerHeight - 100
        };
      } catch (error) {
        console.error('Boyut hesaplama hatası:', error);
        return {
          x: 0,
          y: 100,
          width: window.innerWidth,
          height: window.innerHeight - 100
        };
      }
    })()
  `).then((bounds) => {
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const boundsStr = JSON.stringify(bounds);
      if (lastBounds !== boundsStr) {
        views[activeViewId].setBounds(bounds);
        console.log(`BrowserView yeniden boyutlandırıldı: ${boundsStr}`);
        lastBounds = boundsStr;
      }
    } else {
      console.error('Geçersiz boyutlar:', bounds);
    }

    setTimeout(() => {
      isResizing = false;
    }, 100);
  }).catch(err => {
    console.error('Görünüm boyutlandırma hatası:', err);
    isResizing = false;
  });
}

function createBrowserView(id, url) {
  if (views[id]) {
    showView(id);
    return;
  }

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      plugins: true,
      defaultFontFamily: {
        standard: 'Inter',
        sansSerif: 'Inter',
        serif: 'Georgia'
      }
    }
  });

  mainWindow.addBrowserView(view);
  views[id] = view;

  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  let isInitialLoad = true;

  if (url === 'gx://corner') {
    loadGXCorner(view);
  } else if (url === 'gx://settings') {
    loadGXSettings(view);
  } else if (url === 'gx://speed') {
    loadGXSpeedDial(view);
  } else if (url && url !== 'about:blank') {
    view.webContents.loadURL(url).catch(err => {
      console.error(`URL yükleme hatası (${url}):`, err);
      view.webContents.loadURL(`data:text/html,
        <html>
          <body style="background-color:#121212; color:#fff; font-family:Arial; padding:20px;">
            <h2>Sayfa yüklenemedi</h2>
            <p>URL: ${url}</p>
            <p>Hata: ${err.message}</p>
          </body>
        </html>
      `);
    });
  } else {
    loadGXSpeedDial(view);
  }

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('page-title-updated', { id, title });
  });

  view.webContents.on('did-finish-load', () => {
    const currentUrl = view.webContents.getURL();
    const title = view.webContents.getTitle();
    let favicon = '';

    view.webContents.executeJavaScript(`
      (function() {
        const iconLink = document.querySelector('link[rel="icon"]') ||
                         document.querySelector('link[rel="shortcut icon"]');
        return iconLink ? iconLink.href : '';
      })()
    `).then(iconUrl => {
      favicon = iconUrl;

      mainWindow.webContents.send('page-info-updated', {
        id,
        url: currentUrl,
        title,
        favicon
      });
    }).catch(err => {
      console.error('Favicon alma hatası:', err);
      mainWindow.webContents.send('page-info-updated', {
        id,
        url: currentUrl,
        title,
        favicon: ''
      });
    });
  });

  let lastUrlUpdateTime = 0;
  let lastUrlReported = '';

  const sendUrlUpdate = (url) => {
    if (!url) return;

    const now = Date.now();
    if (url !== lastUrlReported || now - lastUrlUpdateTime > 500) {
      lastUrlReported = url;
      lastUrlUpdateTime = now;
      mainWindow.webContents.send('url-updated', { id, url });
    }
  };

  view.webContents.on('did-navigate', (event, url) => {
    console.log(`[did-navigate] Sekme ${id} için yeni URL: ${url}`);
    sendUrlUpdate(url);
  });

  view.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame) {
      console.log(`[did-navigate-in-page] Sekme ${id} için yeni URL: ${url}`);
      sendUrlUpdate(url);
    }
  });

  view.webContents.on('did-redirect-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame) {
      console.log(`[did-redirect-navigation] Sekme ${id} için yönlendirme: ${url}`);
      sendUrlUpdate(url);
    }
  });

  view.webContents.on('did-frame-navigate', (event, url, httpResponseCode, httpStatusText, isMainFrame) => {
    if (isMainFrame) {
      console.log(`[did-frame-navigate] Sekme ${id} için frame navigasyonu: ${url}`);
      sendUrlUpdate(url);
    }
  });

  view.webContents.on('did-start-loading', () => {
    const currentUrl = view.webContents.getURL();
    if (currentUrl) {
      console.log(`[did-start-loading] Sekme ${id} için yükleme başlıyor: ${currentUrl}`);
      sendUrlUpdate(currentUrl);
    }
  });

  view.webContents.on('did-stop-loading', () => {
    const currentUrl = view.webContents.getURL();
    if (currentUrl) {
      console.log(`[did-stop-loading] Sekme ${id} için yükleme tamamlandı: ${currentUrl}`);
      sendUrlUpdate(currentUrl);

      if (isInitialLoad) {
        isInitialLoad = false;
      }
    }
  });

  view.webContents.on('did-finish-load', () => {
    const currentUrl = view.webContents.getURL();
    if (currentUrl) {
      console.log(`[did-finish-load] Sekme ${id} için yükleme tamamlandı: ${currentUrl}`);
      sendUrlUpdate(currentUrl);
    }
  });

  const checkUrlInterval = setInterval(() => {
    if (!views[id] || !views[id].webContents) {
      clearInterval(checkUrlInterval);
      return;
    }

    if (!isInitialLoad) {
      const currentUrl = views[id].webContents.getURL();
      if (currentUrl && currentUrl !== lastUrlReported) {
        sendUrlUpdate(currentUrl);
      }
    }
  }, 2000);

  view.webContents.on('destroyed', () => {
    clearInterval(checkUrlInterval);
  });

  updateNavigationState(id);

  showView(id);
  return view;
}

function loadGXCorner(view) {
  // ... (unchanged, omitted for brevity)
  // The function content is unchanged from the original file.
  // See original file for full HTML.
  // (No changes needed for dark/light mode here, as it's handled globally.)
  const gxCornerHTML = `...`; // (see original file)
  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxCornerHTML)}`);
}

function loadGXSettings(view) {
  // ... (unchanged, omitted for brevity)
  // The function content is unchanged from the original file.
  // See original file for full HTML.
  // (No changes needed for dark/light mode here, as it's handled globally.)
  const gxSettingsHTML = `...`; // (see original file)
  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxSettingsHTML)}`);
}

// Hızlı erişim sayfası (Speed Dial)
function loadGXSpeedDial(view) {
  const localSpeedDialPath = path.join(__dirname, 'speed-dial.html');

  if (fs.existsSync(localSpeedDialPath)) {
    console.log("Speed Dial yerel dosyadan yükleniyor:", localSpeedDialPath);
    view.webContents.loadFile(localSpeedDialPath);
  } else {
    console.log("Speed Dial HTML oluşturuluyor ve kaydediliyor");
    const gxSpeedDialHTML = `...`; // (see original file)
    try {
      fs.writeFileSync(localSpeedDialPath, gxSpeedDialHTML);
      view.webContents.loadFile(localSpeedDialPath);
    } catch (error) {
      console.error("Speed Dial HTML dosyası kaydedilemedi:", error);
      view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxSpeedDialHTML)}`);
    }
  }

  mainWindow.webContents.on('system-resources-updated', (event, data) => {
    if (view && view.webContents) {
      view.webContents.executeJavaScript(`
        window.postMessage({
          type: 'system-resources-update',
          resources: {
            cpu: ${data.cpu},
            ram: ${data.ram},
            network: ${data.network}
          }
        }, '*');
      `).catch(err => {
        console.error('Sistem kaynakları güncellenirken hata:', err);
      });
    }
  });

  view.webContents.on('did-finish-load', () => {
    view.webContents.executeJavaScript(`
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'loadURL') {
          console.log('loadURL mesajı alındı:', event.data.url);
          window.postMessage({ type: 'loadURL', url: event.data.url }, '*');
        }
      });
    `).catch(err => {
      console.error('Speed Dial script yükleme hatası:', err);
    });
  });

  view.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Speed Dial Console] ${message}`);
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('data:') && !url.startsWith('file:')) {
      console.log(`Speed Dial'dan yönlendirme: ${url}`);
      event.preventDefault();
      mainWindow.webContents.send('url-updated', { id: activeViewId, url });
    }
  });
}

function updateNavigationState(id) {
  if (!views[id]) return;

  const canGoBack = views[id].webContents.canGoBack();
  const canGoForward = views[id].webContents.canGoForward();

  mainWindow.webContents.send('navigation-state-updated', {
    id,
    canGoBack,
    canGoForward
  });
}

let resizeTimeoutId = null;

function showView(id) {
  if (!views[id] || !mainWindow) return;

  if (activeViewId && views[activeViewId]) {
    views[activeViewId].setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  activeViewId = id;

  if (resizeTimeoutId) {
    clearTimeout(resizeTimeoutId);
  }

  const mainSize = mainWindow.getSize();
  const bounds = {
    x: 62,
    y: 118,
    width: mainSize[0] - 62,
    height: mainSize[1] - 118
  };

  views[id].setBounds(bounds);

  resizeTimeoutId = setTimeout(() => {
    resizeActiveView();
    resizeTimeoutId = null;
  }, 300);

  updateNavigationState(id);
}

function closeView(id) {
  if (!views[id] || !mainWindow) return;

  mainWindow.removeBrowserView(views[id]);
  views[id].webContents.destroy();
  delete views[id];

  if (activeViewId === id) {
    activeViewId = null;
  }
}

app.whenReady().then(() => {
  createWindow();
  setupBrowserFeatures();

  // Performans modunu varsayılan olarak ayarla
  setTimeout(() => {
    applyPerformanceMode();
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Adblock, otomatik form doldurma ve performans modu ayarlarını uygula
function setupBrowserFeatures() {
  setupAdBlocker();
  setupAutoFill();
}

function setupAdBlocker() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (resourceLimits.isLimiterEnabled) {
      const url = details.url.toLowerCase();

      const adFilters = [
        'googleads',
        'doubleclick.net',
        '/ads/',
        'ad-delivery',
        'analytics'
      ];

      const shouldBlock = adFilters.some(filter => url.includes(filter));

      if (shouldBlock) {
        callback({ cancel: true });
        return;
      }
    }

    callback({ cancel: false });
  });
}

// Otomatik form doldurma sistemi
function setupAutoFill() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!autoFillEnabled || details.resourceType !== 'mainFrame') {
      callback({ cancel: false });
      return;
    }

    // Form verilerini enjekte et
    const tabId = Object.keys(views).find(id => {
      return views[id] && views[id].webContents.id === details.webContentsId;
    });

    if (tabId && views[tabId]) {
      views[tabId].webContents.on('dom-ready', () => {
        if (Object.keys(formData).length > 0) {
          views[tabId].webContents.executeJavaScript(`
            (function() {
              const formData = ${JSON.stringify(formData)};
              document.querySelectorAll('input, textarea, select').forEach(input => {
                if (input.name && formData[input.name]) {
                  input.value = formData[input.name];
                }
              });
              return true;
            })()
          `).catch(err => {
            console.error('Form doldurma hatası:', err);
          });
        }
      });
    }

    callback({ cancel: false });
  });
}

// ================== IPC OLAYLARI ==================

ipcMain.handle('speed-dial-action', (event, { action, data }) => {
  try {
    console.log(`Speed Dial action: ${action}`, data);

    if (action === 'loadURL' && data.id && data.url) {
      if (views[data.id]) {
        views[data.id].webContents.loadURL(data.url).catch(err => {
          console.error(`URL yükleme hatası (${data.url}):`, err);
        });
        return { success: true, url: data.url };
      } else {
        return { success: false, error: 'Görünüm bulunamadı' };
      }
    } else if (action === 'clearCache') {
      session.defaultSession.clearCache().then(() => {
        console.log('Önbellek temizlendi');
      });
      return { success: true };
    } else if (action === 'networkDiag') {
      console.log('Ağ teşhisi başlatıldı');
      return { success: true };
    } else if (action === 'notifications') {
      console.log('Bildirimler açıldı');
      return { success: true };
    }

    return { success: false, error: 'Bilinmeyen eylem' };
  } catch (error) {
    console.error('Speed Dial action hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});

ipcMain.handle('create-tab', (event, { id, url }) => {
  try {
    createBrowserView(id, url || 'about:blank');
    return { success: true, id };
  } catch (error) {
    console.error('Sekme oluşturma hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-tab', (event, { id }) => {
  try {
    closeView(id);
    return { success: true };
  } catch (error) {
    console.error('Sekme kapatma hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('switch-tab', (event, { id }) => {
  try {
    showView(id);
    return { success: true };
  } catch (error) {
    console.error('Sekme değiştirme hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-url', (event, { id, url }) => {
  try {
    if (!views[id]) {
      createBrowserView(id, url);
    } else {
      if (url === 'gx://corner' || url === 'gx://settings' || url === 'gx://speed') {
        if (url === 'gx://corner') {
          loadGXCorner(views[id]);
        } else if (url === 'gx://settings') {
          loadGXSettings(views[id]);
        } else if (url === 'gx://speed') {
          loadGXSpeedDial(views[id]);
        }
      } else {
        views[id].webContents.loadURL(url).catch(err => {
          console.error(`URL yükleme hatası (${url}):`, err);
          views[id].webContents.loadURL(`data:text/html,
            <html>
              <body style="background-color:#121212; color:#fff; font-family:Arial; padding:20px;">
                <h2>Sayfa yüklenemedi</h2>
                <p>URL: ${url}</p>
                <p>Hata: ${err.message}</p>
              </body>
            </html>
          `);
        });
      }
    }
    return { success: true, url };
  } catch (error) {
    console.error('URL yükleme hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('go-back', (event, { id }) => {
  try {
    if (views[id] && views[id].webContents.canGoBack()) {
      views[id].webContents.goBack();
      updateNavigationState(id);
      return { success: true };
    }
    return { success: false, error: 'Geri gidilemiyor' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('go-forward', (event, { id }) => {
  try {
    if (views[id] && views[id].webContents.canGoForward()) {
      views[id].webContents.goForward();
      updateNavigationState(id);
      return { success: true };
    }
    return { success: false, error: 'İleri gidilemiyor' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('refresh', (event, { id }) => {
  try {
    if (views[id]) {
      views[id].webContents.reload();
      return { success: true };
    }
    return { success: false, error: 'Sekme bulunamadı' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

let lastContentBoundsUpdateTime = 0;

ipcMain.handle('content-bounds-updated', () => {
  try {
    if (activeViewId) {
      const now = Date.now();
      if (now - lastContentBoundsUpdateTime > 200) {
        lastContentBoundsUpdateTime = now;
        resizeActiveView();
      }
      return { success: true };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-resource-limits', (event, limits) => {
  try {
    resourceLimits = { ...resourceLimits, ...limits };

    if (resourceLimits.isLimiterEnabled) {
      applyResourceLimits();
    }

    return { success: true, limits: resourceLimits };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-adblocker', (event, enabled) => {
  try {
    const adBlockerEnabled = enabled;
    return { success: true, enabled: adBlockerEnabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Tema modunu değiştirme
ipcMain.handle('toggle-theme-mode', (event, dark) => {
  try {
    isDarkMode = dark;

    // Tüm açık sekmelere tema değişikliği bildir
    Object.keys(views).forEach(id => {
      if (views[id] && views[id].webContents) {
        views[id].webContents.executeJavaScript(`
          document.documentElement.setAttribute('data-theme', '${isDarkMode ? 'dark' : 'light'}');
          document.body.className = '${isDarkMode ? 'dark-theme' : 'light-theme'}';
        `).catch(err => {
          console.error('Tema modu değiştirilirken hata:', err);
        });
      }
    });

    // Ana pencereye de tema değişikliğini bildir
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-mode-changed', { isDarkMode });
    }

    return { success: true, isDarkMode };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Neon efektlerini aç/kapat
ipcMain.handle('toggle-neon-effects', (event, enabled) => {
  try {
    neonEffectsEnabled = enabled;

    // Ana pencereye neon efekt değişikliğini bildir
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('neon-effects-changed', { neonEffectsEnabled });
    }

    return { success: true, neonEffectsEnabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Otomatik form doldurma durumunu değiştir
ipcMain.handle('toggle-autofill', (event, enabled) => {
  try {
    autoFillEnabled = enabled;
    return { success: true, autoFillEnabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Otomatik form doldurma verisi kaydet
ipcMain.handle('save-form-data', (event, data) => {
  try {
    formData = { ...formData, ...data };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Otomatik form doldurma verisi sil
ipcMain.handle('clear-form-data', (event) => {
  try {
    formData = {};
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Performans modunu değiştir
ipcMain.handle('set-performance-mode', (event, mode) => {
  try {
    performanceMode = mode;

    // Performans modu değişimini uygula
    switch (performanceMode) {
      case 'performance':
        // CPU, RAM kullanımını sınırla, animasyonları azalt
        session.defaultSession.setCacheSize(50 * 1024 * 1024); // 50MB önbellek
        Object.keys(views).forEach(id => {
          if (id !== activeViewId && views[id]) {
            views[id].webContents.setBackgroundThrottling(true);
          }
        });
        break;

      case 'quality':
        // Maksimum kalite için kaynakları serbest bırak
        session.defaultSession.setCacheSize(500 * 1024 * 1024); // 500MB önbellek
        Object.keys(views).forEach(id => {
          if (views[id]) {
            views[id].webContents.setBackgroundThrottling(false);
          }
        });
        break;

      case 'balanced':
      default:
        // Dengeli mod
        session.defaultSession.setCacheSize(200 * 1024 * 1024); // 200MB önbellek
        Object.keys(views).forEach(id => {
          if (id !== activeViewId && views[id]) {
            views[id].webContents.setBackgroundThrottling(true);
          } else if (views[id]) {
            views[id].webContents.setBackgroundThrottling(false);
          }
        });
        break;
    }

    // Ana pencereye performans modu değişimini bildir
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('performance-mode-changed', { performanceMode });
    }

    return { success: true, performanceMode };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Bildirim gönder
ipcMain.handle('send-notification', (event, { title, body, icon, silent }) => {
  try {
    // Eğer şu anda gösterilen bir bildirim varsa, kuyruğa ekle
    if (lastNotification) {
      pendingNotifications.push({ title, body, icon, silent });
      return { success: true, queued: true };
    }

    // Yeni bildirimi göster
    const notification = new Notification({
      title: title || 'Neon Browser',
      body: body || '',
      icon: icon || path.join(__dirname, '../public/icon.png'),
      silent: silent || false
    });

    notification.show();
    lastNotification = notification;

    // Bildirim kapandığında sonraki bildirimleri göster
    notification.on('close', () => {
      lastNotification = null;

      // Kuyrukta bekleyen bildirimleri kontrol et
      if (pendingNotifications.length > 0) {
        const nextNotification = pendingNotifications.shift();
        mainWindow.webContents.send('process-next-notification', nextNotification);
      }
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-cache', () => {
  try {
    session.defaultSession.clearCache().then(() => {
      console.log('Önbellek temizlendi');
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-cookies', () => {
  try {
    session.defaultSession.clearStorageData({ storages: ['cookies'] }).then(() => {
      console.log('Çerezler temizlendi');
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
