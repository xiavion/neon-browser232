const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

// Electron penceresi referansını global olarak tut
let mainWindow;

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
  });

  // Geliştirme modunda Next.js dev sunucusunu yükle
  if (isDev) {
    console.log('Development modunda çalışıyor, localhost:3000 kullanılıyor');
    mainWindow.loadURL('http://localhost:3000');
    // Dev araçlarını aç
    mainWindow.webContents.openDevTools();
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

  // Pencere kapandığında olayı yakala
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron hazır olduğunda pencereyi oluştur
app.whenReady().then(createWindow);

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

// Yeni sekme oluşturma ve URL yükleme isteklerini ele al
ipcMain.handle('load-url', (event, url) => {
  // Bu fonksiyon tarayıcı içindeki web view'e URL yüklemek için kullanılacak
  return { success: true, url };
});
