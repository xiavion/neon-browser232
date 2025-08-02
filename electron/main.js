const { app, BrowserWindow, BrowserView, ipcMain, session, protocol, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const isDev = !app.isPackaged;

// Pencere ve aktif görünüm referanslarını global olarak tut
let mainWindow;
let views = {}; // Tüm browserView'leri depolamak için
let activeViewId = null;

// Sistem kaynak sınırlamaları için varsayılan değerler
let resourceLimits = {
  cpuLimit: 100, // % olarak
  ramLimit: 100, // % olarak
  networkLimit: 100, // % olarak
  isLimiterEnabled: false
};

// Kaynak izleme aralığı (ms cinsinden)
const RESOURCE_MONITOR_INTERVAL = 2000;
let resourceMonitorInterval = null;

function createWindow() {
  // Tarayıcı penceresini oluştur
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#030303', // Koyu arka plan
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false, // Çerçevesiz pencere
    titleBarStyle: 'hidden', // Gizli başlık çubuğu
    icon: path.join(__dirname, '../public/icon.png') // Uygulama ikonu
  });

  // Geliştirme modunda Next.js dev sunucusunu yükle
  if (isDev) {
    console.log('Development modunda çalışıyor, localhost:3000 kullanılıyor');
    mainWindow.loadURL('http://localhost:3000');
    // Dev araçlarını aç
    // mainWindow.webContents.openDevTools();
  } else {
    // Dağıtım için build edilmiş Next.js uygulamasını yükle
    const outPath = path.join(__dirname, '../out/index.html');
    console.log(`Production modunda çalışıyor, dosya yükleniyor: ${outPath}`);

    if (fs.existsSync(outPath)) {
      mainWindow.loadFile(outPath);
    } else {
      console.error(`Hata: ${outPath} bulunamadı`);
      mainWindow.loadURL('data:text/html,<h1>Build eksik</h1><p>Lütfen önce "next build" komutunu çalıştırın</p>');
    }
  }

  // İçerik alanının boyutunu ayarlamak için
  mainWindow.on('resize', () => {
    if (activeViewId && views[activeViewId]) {
      resizeActiveView();
    }
  });

  // Pencere kapandığında olayı yakala
  mainWindow.on('closed', () => {
    mainWindow = null;
    views = {};

    // Kaynak izleyiciyi temizle
    if (resourceMonitorInterval) {
      clearInterval(resourceMonitorInterval);
      resourceMonitorInterval = null;
    }
  });

  // Sistem kaynak izleyiciyi başlat
  startResourceMonitoring();
}

// Sistem kaynaklarını izlemeye başla
function startResourceMonitoring() {
  if (resourceMonitorInterval) {
    clearInterval(resourceMonitorInterval);
  }

  resourceMonitorInterval = setInterval(() => {
    // CPU kullanımını al
    getCPUUsage().then(cpuUsage => {
      // RAM kullanımını al
      const memoryInfo = process.getProcessMemoryInfo();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsage = Math.round((usedMem / totalMem) * 100);

      // Ağ kullanımını al (daha karmaşık, basitleştirilmiş)
      const networkUsage = 50; // Şimdilik sabit bir değer, gerçek değer için özel modül gerekir

      // Sonuçları ana pencereye gönder
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-resources-updated', {
          cpu: cpuUsage,
          ram: memoryUsage,
          network: networkUsage
        });
      }

      // Eğer kaynak sınırlama etkinse, tarayıcı davranışını ayarla
      if (resourceLimits.isLimiterEnabled) {
        applyResourceLimits();
      }
    });
  }, RESOURCE_MONITOR_INTERVAL);
}

// CPU kullanımını almak için yardımcı fonksiyon
async function getCPUUsage() {
  return new Promise((resolve) => {
    const startUsage = process.cpuUsage();

    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = endUsage.user + endUsage.system;
      // 500ms içindeki CPU kullanımını yüzde olarak hesapla
      const cpuPercent = Math.round((totalUsage / (500 * 1000)) * 100);
      resolve(Math.min(cpuPercent, 100)); // Max %100
    }, 500);
  });
}

// Kaynak sınırlamalarını uygula
function applyResourceLimits() {
  // CPU sınırlaması - yoğun işlemleri kısıtlama
  if (resourceLimits.cpuLimit < 100) {
    // Aktif olmayan sekmelerin throttle edilmesi
    Object.keys(views).forEach(id => {
      if (id !== activeViewId) {
        views[id].webContents.setBackgroundThrottling(true);
      }
    });
  }

  // RAM sınırlaması - önbellek boyutunu sınırla
  if (resourceLimits.ramLimit < 100) {
    const cacheSizeInMB = Math.max(50, Math.round(500 * (resourceLimits.ramLimit / 100)));
    session.defaultSession.setCacheSize(cacheSizeInMB * 1024 * 1024);
  }

  // Ağ sınırlaması - indirme hızını sınırla
  if (resourceLimits.networkLimit < 100) {
    // Ağ sınırlaması için özel uygulama gerekir
    // Electron'da doğrudan bir API yok, throttling uygulanabilir
  }
}

// Aktif görünümün boyutunu ayarla
function resizeActiveView() {
  if (!mainWindow || !views[activeViewId]) return;

  // UI'daki content div'in koordinatlarını al
  mainWindow.webContents.executeJavaScript(`
    (function() {
      const rect = document.querySelector('.webpage-content').getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    })()
  `).then((bounds) => {
    // BrowserView'i ayarla
    views[activeViewId].setBounds(bounds);
  }).catch(err => {
    console.error('Görünüm boyutlandırma hatası:', err);
  });
}

// Yeni bir tarayıcı görünümü oluştur
function createBrowserView(id, url) {
  if (views[id]) {
    // Görünüm zaten mevcut, sadece göster
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

  // Görünümü pencereye ekle
  mainWindow.addBrowserView(view);
  views[id] = view;

  // Başlangıçta gizle, daha sonra düzgün boyutlandırılacak
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  // GX Sayfası mı kontrol et
  if (url === 'gx://corner') {
    // GX Corner sayfasını göster
    loadGXCorner(view);
  } else if (url === 'gx://settings') {
    // Ayarlar sayfasını göster
    loadGXSettings(view);
  } else if (url === 'gx://speed') {
    // Hız sayfasını göster
    loadGXSpeedDial(view);
  } else if (url && url !== 'about:blank') {
    // Normal URL
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
    // Yeni sekme sayfası
    loadGXSpeedDial(view);
  }

  // Harici bağlantıları tarayıcıda aç
  view.webContents.setWindowOpenHandler(({ url }) => {
    // Bazı bağlantıları dış tarayıcıda açma seçeneği
    if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Sayfa başlığı değiştiğinde olayı yakala
  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('page-title-updated', { id, title });
  });

  // Sayfa yüklendiğinde olayı yakala
  view.webContents.on('did-finish-load', () => {
    const currentUrl = view.webContents.getURL();
    const title = view.webContents.getTitle();
    let favicon = '';

    // Favicon'ı almaya çalış
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

  // URL değiştiğinde olayı yakala
  view.webContents.on('did-navigate', (event, url) => {
    mainWindow.webContents.send('url-updated', { id, url });
  });

  // URL veya alt kaynaklar değiştiğinde olayı yakala
  view.webContents.on('did-navigate-in-page', (event, url) => {
    mainWindow.webContents.send('url-updated', { id, url });
  });

  // Navigasyon durumu değiştiğinde olayı yakala (ileri-geri butonları için)
  updateNavigationState(id);

  // Görünümü etkinleştir
  showView(id);
  return view;
}

// GX Corner (Oyun sayfası) yükle
function loadGXCorner(view) {
  const gxCornerHTML = `
  <html>
    <head>
      <title>GX Corner</title>
      <style>
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0c0c0c;
          color: #fff;
          margin: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        h1 {
          font-size: 28px;
          margin-bottom: 20px;
          color: #8a2be2;
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
        }
        .game-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          width: 100%;
          max-width: 1200px;
        }
        .game-card {
          background-color: #181818;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.3);
          transition: all 0.3s ease;
        }
        .game-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 0 15px rgba(138, 43, 226, 0.5);
        }
        .game-img {
          width: 100%;
          height: 180px;
          object-fit: cover;
        }
        .game-info {
          padding: 15px;
        }
        .game-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #f0f0f0;
        }
        .game-desc {
          font-size: 14px;
          color: #aaa;
          margin-bottom: 15px;
        }
        .game-price {
          font-size: 16px;
          color: #2bd8d0;
        }
        .section-title {
          font-size: 22px;
          margin: 30px 0 15px 0;
          color: #f0f0f0;
          align-self: flex-start;
          max-width: 1200px;
          width: 100%;
        }
        .tab-bar {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #333;
          width: 100%;
          max-width: 1200px;
        }
        .tab {
          padding: 8px 15px;
          background-color: #181818;
          color: #aaa;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tab.active {
          background-color: #8a2be2;
          color: #fff;
        }
      </style>
    </head>
    <body>
      <h1>GX Corner</h1>

      <div class="tab-bar">
        <div class="tab active">Oyun Haberleri</div>
        <div class="tab">Ücretsiz Oyunlar</div>
        <div class="tab">İndirimler</div>
        <div class="tab">Yeni Çıkanlar</div>
      </div>

      <h2 class="section-title">Öne Çıkan Oyunlar</h2>
      <div class="game-grid">
        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/1286680/header.jpg" alt="Baldur's Gate 3">
          <div class="game-info">
            <div class="game-title">Baldur's Gate 3</div>
            <div class="game-desc">Efsanevi D&D RPG'sinin modern devamı. Sürükleyici bir hikaye ve gelişmiş strateji savaşları.</div>
            <div class="game-price">59.99€</div>
          </div>
        </div>

        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/1817070/header.jpg" alt="Starfield">
          <div class="game-info">
            <div class="game-title">Starfield</div>
            <div class="game-desc">Bethesda'nın yeni RPG'si. Uzay keşifleri ve galaktik maceralar seni bekliyor.</div>
            <div class="game-price">69.99€</div>
          </div>
        </div>

        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg" alt="Elden Ring">
          <div class="game-info">
            <div class="game-title">Elden Ring</div>
            <div class="game-desc">FromSoftware'in epik açık dünya RPG'si. Savaş, keşfet ve efsane ol.</div>
            <div class="game-price">49.99€</div>
          </div>
        </div>

        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/2050650/header.jpg" alt="Diablo IV">
          <div class="game-info">
            <div class="game-title">Diablo IV</div>
            <div class="game-desc">Blizzard'ın efsanevi aksiyon RPG serisinin yeni oyunu. Şeytanlarla savaş.</div>
            <div class="game-price">69.99€</div>
          </div>
        </div>
      </div>

      <h2 class="section-title">Ücretsiz Oyunlar</h2>
      <div class="game-grid">
        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/1966720/header.jpg" alt="Epic Games Free">
          <div class="game-info">
            <div class="game-title">Fallout 76</div>
            <div class="game-desc">Epic Games Store'da sınırlı süre için ücretsiz. Bu hafta kaçırma!</div>
            <div class="game-price">ÜCRETSİZ</div>
          </div>
        </div>

        <div class="game-card">
          <img class="game-img" src="https://cdn.akamai.steamstatic.com/steam/apps/1172470/header.jpg" alt="Epic Games Free">
          <div class="game-info">
            <div class="game-title">Apex Legends</div>
            <div class="game-desc">Ücretsiz battle royale oyunu. Eşsiz karakterler ve hızlı oynanış.</div>
            <div class="game-price">ÜCRETSİZ</div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxCornerHTML)}`);
}

// GX Ayarlar sayfası
function loadGXSettings(view) {
  const gxSettingsHTML = `
  <html>
    <head>
      <title>GX Ayarlar</title>
      <style>
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0c0c0c;
          color: #fff;
          margin: 0;
          padding: 20px;
        }
        h1 {
          font-size: 28px;
          margin-bottom: 20px;
          color: #8a2be2;
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
        }
        .settings-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .settings-section {
          background-color: #181818;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.3);
        }
        .settings-title {
          font-size: 18px;
          margin-bottom: 15px;
          color: #f0f0f0;
          border-bottom: 1px solid #333;
          padding-bottom: 10px;
        }
        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #222;
        }
        .setting-item:last-child {
          border-bottom: none;
        }
        .setting-name {
          font-size: 16px;
          color: #ddd;
        }
        .setting-desc {
          font-size: 13px;
          color: #888;
          margin-top: 4px;
        }
        .setting-control {
          display: flex;
          align-items: center;
        }
        .slider {
          width: 150px;
          margin-right: 10px;
        }
        .value {
          width: 40px;
          text-align: center;
          color: #2bd8d0;
        }
        .toggle {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 24px;
        }
        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider-toggle {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #333;
          transition: .4s;
          border-radius: 24px;
        }
        .slider-toggle:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider-toggle {
          background-color: #8a2be2;
        }
        input:checked + .slider-toggle:before {
          transform: translateX(26px);
        }
        button {
          background-color: #8a2be2;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        button:hover {
          background-color: #7926b2;
        }
      </style>
    </head>
    <body>
      <div class="settings-container">
        <h1>Tarayıcı Ayarları</h1>

        <div class="settings-section">
          <div class="settings-title">Sistem Kaynak Sınırlayıcı</div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Kaynak Sınırlayıcı</div>
              <div class="setting-desc">Tarayıcının sistem kaynaklarını kullanmasını sınırla</div>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" id="limiter-toggle">
                <span class="slider-toggle"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div>
              <div class="setting-name">CPU Sınırı</div>
              <div class="setting-desc">Tarayıcının maksimum CPU kullanımını sınırla</div>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="100" value="100" class="slider" id="cpu-slider">
              <div class="value" id="cpu-value">100%</div>
            </div>
          </div>

          <div class="setting-item">
            <div>
              <div class="setting-name">RAM Sınırı</div>
              <div class="setting-desc">Tarayıcının maksimum RAM kullanımını sınırla</div>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="100" value="100" class="slider" id="ram-slider">
              <div class="value" id="ram-value">100%</div>
            </div>
          </div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Ağ Sınırı</div>
              <div class="setting-desc">Tarayıcının maksimum ağ bant genişliği kullanımını sınırla</div>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="100" value="100" class="slider" id="network-slider">
              <div class="value" id="network-value">100%</div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Görünüm Ayarları</div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Neon Efektleri</div>
              <div class="setting-desc">Arayüzde neon efektlerini etkinleştir</div>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" id="neon-toggle" checked>
                <span class="slider-toggle"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Tema Rengi</div>
              <div class="setting-desc">Tarayıcının neon rengini değiştir</div>
            </div>
            <div class="setting-control">
              <select style="background-color: #222; color: #fff; padding: 5px; border: 1px solid #444;">
                <option value="purple">Mor</option>
                <option value="blue">Mavi</option>
                <option value="green">Yeşil</option>
                <option value="red">Kırmızı</option>
                <option value="orange">Turuncu</option>
              </select>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Gizlilik ve Güvenlik</div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Reklam Engelleyici</div>
              <div class="setting-desc">Tüm sitelerde reklamları engelle</div>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" id="adblocker-toggle">
                <span class="slider-toggle"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div>
              <div class="setting-name">Çerezleri Otomatik Temizle</div>
              <div class="setting-desc">Tarayıcı kapatıldığında tüm çerezleri temizle</div>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" id="cookie-toggle">
                <span class="slider-toggle"></span>
              </label>
            </div>
          </div>
        </div>

        <button style="margin-top: 20px;">Değişiklikleri Kaydet</button>
      </div>

      <script>
        // Slider değerlerini güncelleyen işlevler
        document.getElementById('cpu-slider').addEventListener('input', function() {
          document.getElementById('cpu-value').textContent = this.value + '%';
        });

        document.getElementById('ram-slider').addEventListener('input', function() {
          document.getElementById('ram-value').textContent = this.value + '%';
        });

        document.getElementById('network-slider').addEventListener('input', function() {
          document.getElementById('network-value').textContent = this.value + '%';
        });
      </script>
    </body>
  </html>
  `;

  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxSettingsHTML)}`);
}

// Hızlı erişim sayfası (Speed Dial)
function loadGXSpeedDial(view) {
  const gxSpeedDialHTML = `
  <html>
    <head>
      <title>Neon Speed Dial</title>
      <style>
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0c0c0c;
          color: #fff;
          margin: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .search-container {
          width: 100%;
          max-width: 600px;
          margin: 40px 0;
        }
        .search-box {
          width: 100%;
          height: 50px;
          background-color: #181818;
          border: 1px solid #333;
          border-radius: 25px;
          padding: 0 20px;
          color: #fff;
          font-size: 16px;
          outline: none;
          transition: all 0.3s ease;
          box-shadow: 0 0 15px rgba(138, 43, 226, 0.2);
        }
        .search-box:focus {
          border-color: #8a2be2;
          box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        }
        .shortcuts-container {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          width: 100%;
          max-width: 800px;
          margin-top: 20px;
        }
        .shortcut {
          background-color: #181818;
          border-radius: 8px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.1);
        }
        .shortcut:hover {
          transform: translateY(-5px);
          box-shadow: 0 0 15px rgba(138, 43, 226, 0.3);
        }
        .shortcut-icon {
          width: 48px;
          height: 48px;
          background-color: #333;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          overflow: hidden;
        }
        .shortcut-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .shortcut-name {
          font-size: 14px;
          color: #ddd;
          text-align: center;
        }
        .logo {
          margin-top: 60px;
          font-size: 32px;
          color: #8a2be2;
          text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
          letter-spacing: 2px;
        }
        .tools {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 40px;
        }
        .tool-btn {
          padding: 10px 20px;
          background-color: #222;
          color: #ddd;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }
        .tool-btn:hover {
          background-color: #333;
        }
        .bottom-section {
          display: flex;
          justify-content: space-between;
          width: 100%;
          max-width: 800px;
          margin-top: 40px;
        }
        .resource-monitor {
          background-color: #181818;
          border-radius: 8px;
          padding: 15px;
          width: 48%;
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.2);
        }
        .monitor-title {
          font-size: 16px;
          color: #8a2be2;
          margin-bottom: 15px;
          border-bottom: 1px solid #333;
          padding-bottom: 5px;
        }
        .resource-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .resource-name {
          font-size: 14px;
          color: #ddd;
        }
        .resource-bar {
          width: 150px;
          height: 8px;
          background-color: #333;
          border-radius: 4px;
          overflow: hidden;
          position: relative;
        }
        .resource-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #8a2be2, #2bd8d0);
          width: 30%;
        }
        .resource-value {
          font-size: 14px;
          color: #2bd8d0;
          width: 40px;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <div class="logo">XİAVİON BROWSER</div>

      <div class="search-container">
        <input type="text" class="search-box" placeholder="Google'da ara veya URL gir">
      </div>

      <div class="shortcuts-container">
        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.google.com/favicon.ico" alt="Google">
          </div>
          <div class="shortcut-name">Google</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.youtube.com/favicon.ico" alt="YouTube">
          </div>
          <div class="shortcut-name">YouTube</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.twitch.tv/favicon.ico" alt="Twitch">
          </div>
          <div class="shortcut-name">Twitch</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://github.com/favicon.ico" alt="GitHub">
          </div>
          <div class="shortcut-name">GitHub</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.reddit.com/favicon.ico" alt="Reddit">
          </div>
          <div class="shortcut-name">Reddit</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.twitter.com/favicon.ico" alt="Twitter">
          </div>
          <div class="shortcut-name">Twitter</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="http://xiavion.com.tr/discord-icon-svgrepo-com.ico" alt="Discord">
          </div>
          <div class="shortcut-name">Discord</div>
        </div>

        <div class="shortcut">
          <div class="shortcut-icon">
            <img src="https://www.netflix.com/favicon.ico" alt="Netflix">
          </div>
          <div class="shortcut-name">Netflix</div>
        </div>
      </div>

      <div class="tools">
        <button class="tool-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"></path>
          </svg>
          GX Corner
        </button>

        <button class="tool-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Ayarlar
        </button>

        <button class="tool-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          Hızlı Erişim
        </button>
      </div>

      <div class="bottom-section">
        <div class="resource-monitor">
          <div class="monitor-title">Sistem Kaynakları</div>

          <div class="resource-item">
            <div class="resource-name">CPU</div>
            <div class="resource-bar">
              <div class="resource-bar-fill" style="width: 45%"></div>
            </div>
            <div class="resource-value">45%</div>
          </div>

          <div class="resource-item">
            <div class="resource-name">RAM</div>
            <div class="resource-bar">
              <div class="resource-bar-fill" style="width: 30%"></div>
            </div>
            <div class="resource-value">30%</div>
          </div>

          <div class="resource-item">
            <div class="resource-name">Ağ</div>
            <div class="resource-bar">
              <div class="resource-bar-fill" style="width: 15%"></div>
            </div>
            <div class="resource-value">15%</div>
          </div>
        </div>

        <div class="resource-monitor">
          <div class="monitor-title">Hızlı Araçlar</div>

          <div class="tool-btn" style="width: 100%; margin-bottom: 10px; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Önbelleği Temizle
          </div>

          <div class="tool-btn" style="width: 100%; margin-bottom: 10px; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Ağ Teşhis
          </div>

          <div class="tool-btn" style="width: 100%; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Bildirimler
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gxSpeedDialHTML)}`);
}

// Navigasyon durumunu güncelle ve frontend'e bildir
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

// Belirli bir görünümü göster, diğerlerini gizle
function showView(id) {
  if (!views[id] || !mainWindow) return;

  // Mevcut aktif görünümü gizle
  if (activeViewId && views[activeViewId]) {
    views[activeViewId].setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  activeViewId = id;
  resizeActiveView();

  // Navigasyon durumunu güncelle
  updateNavigationState(id);
}

// Görünümü kapat
function closeView(id) {
  if (!views[id] || !mainWindow) return;

  mainWindow.removeBrowserView(views[id]);
  views[id].webContents.destroy();
  delete views[id];

  // Eğer kapatılan, aktif görünümse aktif ID'yi temizle
  if (activeViewId === id) {
    activeViewId = null;
  }
}

// Electron hazır olduğunda pencereyi oluştur
app.whenReady().then(() => {
  createWindow();

  // Uygulama başladığında adblock, cookie kontrolü gibi işlemleri başlat
  setupAdBlocker();
});

// Tüm pencereler kapandığında uygulamayı kapat (macOS hariç)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS'da uygulama ikonuna tıklandığında pencereyi yeniden oluştur
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// AdBlocker kurulumu
function setupAdBlocker() {
  // Basit reklam engelleme
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // Reklam engelleyici etkinse
    if (resourceLimits.isLimiterEnabled) {
      const url = details.url.toLowerCase();

      // Basit reklam URL filtreleri (gerçek uygulamada daha kapsamlı liste olmalı)
      const adFilters = [
        'googleads',
        'doubleclick.net',
        '/ads/',
        'ad-delivery',
        'analytics'
      ];

      // URL'de reklam kalıpları var mı kontrol et
      const shouldBlock = adFilters.some(filter => url.includes(filter));

      if (shouldBlock) {
        callback({ cancel: true });
        return;
      }
    }

    callback({ cancel: false });
  });
}

// ================== IPC OLAYLARI ==================

// Pencere kontrolü için IPC olayları
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

// Yeni tarayıcı görünümü oluştur
ipcMain.handle('create-tab', (event, { id, url }) => {
  try {
    createBrowserView(id, url || 'about:blank');
    return { success: true, id };
  } catch (error) {
    console.error('Sekme oluşturma hatası:', error);
    return { success: false, error: error.message };
  }
});

// Sekmeyi kapat
ipcMain.handle('close-tab', (event, { id }) => {
  try {
    closeView(id);
    return { success: true };
  } catch (error) {
    console.error('Sekme kapatma hatası:', error);
    return { success: false, error: error.message };
  }
});

// Sekmeyi değiştir
ipcMain.handle('switch-tab', (event, { id }) => {
  try {
    showView(id);
    return { success: true };
  } catch (error) {
    console.error('Sekme değiştirme hatası:', error);
    return { success: false, error: error.message };
  }
});

// URL yükle
ipcMain.handle('load-url', (event, { id, url }) => {
  try {
    if (!views[id]) {
      createBrowserView(id, url);
    } else {
      // GX özel sayfaları kontrol et
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

// Tarayıcı navigasyon komutları
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

// İçerik alanı boyutu değiştiğinde
ipcMain.handle('content-bounds-updated', () => {
  try {
    if (activeViewId) {
      resizeActiveView();
      return { success: true };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Sistem kaynak sınırlarını güncelle
ipcMain.handle('update-resource-limits', (event, limits) => {
  try {
    resourceLimits = { ...resourceLimits, ...limits };

    // Sınırlamaları uygula
    if (resourceLimits.isLimiterEnabled) {
      applyResourceLimits();
    }

    return { success: true, limits: resourceLimits };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reklam engelleyiciyi etkinleştir/devre dışı bırak
ipcMain.handle('toggle-adblocker', (event, enabled) => {
  try {
    // AdBlocker durumunu güncelle (basitleştirilmiş)
    const adBlockerEnabled = enabled;
    return { success: true, enabled: adBlockerEnabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Önbelleği temizle
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

// Çerezleri temizle
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
