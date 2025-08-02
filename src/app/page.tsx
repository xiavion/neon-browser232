"use client"

import { useState, useEffect, useRef } from "react"
import {
  X,
  Minus,
  Square,
  Home,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Search,
  BookmarkIcon,
  Menu,
  Download,
  Clock,
  Shield,
  Star,
  History,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  Gift,
  Volume2,
  VolumeX,
  LayoutGrid
} from "lucide-react"

// Electron API tipi tanımı
interface ElectronAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // Tarayıcı görünüm yönetimi
  createTab: (id: string, url: string) => Promise<{success: boolean, id: string, error?: string}>;
  closeTab: (id: string) => Promise<{success: boolean, error?: string}>;
  switchTab: (id: string) => Promise<{success: boolean, error?: string}>;

  // Tarayıcı navigasyon işlevleri
  loadURL: (id: string, url: string) => Promise<{success: boolean, url: string, error?: string}>;
  goBack: (id: string) => Promise<{success: boolean, error?: string}>;
  goForward: (id: string) => Promise<{success: boolean, error?: string}>;
  refresh: (id: string) => Promise<{success: boolean, error?: string}>;

  // İçerik alanı güncellemesi
  updateContentBounds: () => Promise<{success: boolean, error?: string}>;

  // GX özellikler - Sistem kaynak yöneticisi
  updateResourceLimits: (limits: ResourceLimits) => Promise<{success: boolean, limits: ResourceLimits, error?: string}>;
  toggleAdBlocker: (enabled: boolean) => Promise<{success: boolean, enabled: boolean, error?: string}>;
  clearCache: () => Promise<{success: boolean, error?: string}>;
  clearCookies: () => Promise<{success: boolean, error?: string}>;

  // IPC event dinleyicileri
  onPageTitleUpdated: (callback: (data: {id: string, title: string}) => void) => void;
  onPageInfoUpdated: (callback: (data: {id: string, url: string, title: string, favicon?: string}) => void) => void;
  onURLUpdated: (callback: (data: {id: string, url: string}) => void) => void;
  onNavigationStateUpdated: (callback: (data: {id: string, canGoBack: boolean, canGoForward: boolean}) => void) => void;
  onSystemResourcesUpdated: (callback: (data: {cpu: number, ram: number, network: number}) => void) => void;

  // Dinleyicileri kaldırma
  removeAllListeners: () => void;
}

// Window tipini genişlet
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    globalActiveTabId?: string;
  }
}

interface Tab {
  id: string
  title: string
  url: string
  favicon?: string
  canGoBack?: boolean
  canGoForward?: boolean
}

interface ResourceLimits {
  cpuLimit?: number;
  ramLimit?: number;
  networkLimit?: number;
  isLimiterEnabled?: boolean;
}

interface SystemResources {
  cpu: number;
  ram: number;
  network: number;
}

export default function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "1", title: "Neon Speed Dial", url: "gx://speed" }
  ]);
  const [activeTab, setActiveTab] = useState("1");
  const [url, setUrl] = useState("gx://speed");
  const contentRef = useRef<HTMLDivElement>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [gxPanelOpen, setGxPanelOpen] = useState(false);

  // Sistem kaynakları
  const [systemResources, setSystemResources] = useState<SystemResources>({
    cpu: 0,
    ram: 0,
    network: 0
  });

  // Kaynak limitleri
  const [resourceLimits, setResourceLimits] = useState<ResourceLimits>({
    cpuLimit: 100,
    ramLimit: 100,
    networkLimit: 100,
    isLimiterEnabled: false
  });

  // Electron API'yi global objeden al
  const electronAPI = typeof window !== "undefined" ? window.electronAPI : undefined

  // Sayfa başlığı güncellemesi
  useEffect(() => {
    if (!electronAPI) return;

    // Electron API mevcut, dinleyicileri ayarla
    setIsElectron(true);

    electronAPI.onPageTitleUpdated((data) => {
      setTabs(prevTabs => {
        return prevTabs.map(tab => {
          if (tab.id === data.id) {
            return { ...tab, title: data.title };
          }
          return tab;
        });
      });
    });

    electronAPI.onPageInfoUpdated((data) => {
      setTabs(prevTabs => {
        return prevTabs.map(tab => {
          if (tab.id === data.id) {
            return {
              ...tab,
              title: data.title,
              url: data.url,
              favicon: data.favicon
            };
          }
          return tab;
        });
      });

      // Aktif sekme için URL'yi güncelle
      if (data.id === activeTab) {
        setUrl(data.url);
      }
    });

    electronAPI.onURLUpdated((data) => {
      setTabs(prevTabs => {
        return prevTabs.map(tab => {
          if (tab.id === data.id) {
            return { ...tab, url: data.url };
          }
          return tab;
        });
      });

      // Aktif sekme için URL'yi güncelle
      if (data.id === activeTab) {
        setUrl(data.url);
      }
    });

    electronAPI.onNavigationStateUpdated((data) => {
      setTabs(prevTabs => {
        return prevTabs.map(tab => {
          if (tab.id === data.id) {
            return {
              ...tab,
              canGoBack: data.canGoBack,
              canGoForward: data.canGoForward
            };
          }
          return tab;
        });
      });
    });

    // Sistem kaynakları izleme
    electronAPI.onSystemResourcesUpdated((data) => {
      setSystemResources(data);
    });

    // Cleanup
    return () => {
      electronAPI.removeAllListeners();
    };
  }, [electronAPI, activeTab]); // activeTab bağımlılığını ekle

  // Sekme değiştiğinde
  useEffect(() => {
    if (!electronAPI || !activeTab) return;

    // Sekmeyi değiştir
    electronAPI.switchTab(activeTab);

    // Aktif sekme URL'sini adres çubuğuna yansıt
    const currentTab = tabs.find(tab => tab.id === activeTab);
    if (currentTab) {
      setUrl(currentTab.url);
    }

    // Aktif sekme ID'sini global değişkene aktar (preload.js için)
    if (typeof window !== 'undefined') {
      // TypeScript hatası için Window tipini genişletiyoruz
      (window as Window & { globalActiveTabId?: string }).globalActiveTabId = activeTab;
    }
  }, [activeTab, electronAPI, tabs]); // tabs bağımlılığını ekle

  // Elektronun varlığını kontrol et - Geliştirme ortamında ekstra kontrol
  useEffect(() => {
    // Electron API varlığını kontrol et
    const checkElectron = () => {
      const isElectronEnv = !!(window.electronAPI);
      console.log("Electron ortamı algılandı:", isElectronEnv);
      setIsElectron(isElectronEnv);

      if (isElectronEnv) {
        // İlk sekmeyi oluştur - GX Speed Dial sayfası
        electronAPI?.createTab("1", "gx://speed");
      }
    };

    checkElectron();

    // Eğer API hemen yüklenmediyse, biraz bekleyip tekrar dene
    const timer = setTimeout(checkElectron, 1000);

    return () => clearTimeout(timer);
  }, [electronAPI]);

  // İçerik alanı boyutu değiştiğinde
  useEffect(() => {
    if (!electronAPI || !contentRef.current) return;

    const updateBounds = () => {
      electronAPI.updateContentBounds();
    };

    // İlk yükleme için
    updateBounds();

    // Pencere boyutu değiştiğinde
    window.addEventListener('resize', updateBounds);

    return () => {
      window.removeEventListener('resize', updateBounds);
    };
  }, [electronAPI]);

  // Pencere kontrolleri
  const handleMinimize = () => {
    electronAPI?.minimizeWindow();
  }

  const handleMaximize = () => {
    electronAPI?.maximizeWindow();
  }

  const handleClose = () => {
    electronAPI?.closeWindow();
  }

  // Yeni sekme ekle
  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab = { id: newId, title: "Neon Speed Dial", url: "gx://speed" };
    setTabs([...tabs, newTab]);
    setActiveTab(newId);

    // Electron API mevcut ise yeni görünüm oluştur
    if (electronAPI) {
      electronAPI.createTab(newId, "gx://speed");
    }
  }

  // Sekme kapat
  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(tab => tab.id !== id);

    // Electron API mevcut ise görünümü kapat
    if (electronAPI) {
      electronAPI.closeTab(id);
    }

    if (newTabs.length === 0) {
      // Eğer son sekmeyi kapatıyorsak yeni bir sekme aç
      const newId = `tab-${Date.now()}`;
      setTabs([{ id: newId, title: "Neon Speed Dial", url: "gx://speed" }]);
      setActiveTab(newId);

      // Electron API mevcut ise yeni görünüm oluştur
      if (electronAPI) {
        electronAPI.createTab(newId, "gx://speed");
      }
    } else if (id === activeTab) {
      // Aktif sekmeyi kapatıyorsak, bir sonraki sekmeyi aktif yap
      const currentIndex = tabs.findIndex(tab => tab.id === id);
      const nextActiveIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      const nextActiveId = newTabs[nextActiveIndex].id;
      setActiveTab(nextActiveId);

      // Electron API mevcut ise sekmeyi değiştir
      if (electronAPI) {
        electronAPI.switchTab(nextActiveId);
      }
    } else {
      setTabs(newTabs);
    }
  }

  // Geri gitme
  const handleGoBack = () => {
    if (!electronAPI) return;

    const currentTab = tabs.find(tab => tab.id === activeTab);
    if (currentTab && currentTab.canGoBack) {
      electronAPI.goBack(activeTab);
    }
  }

  // İleri gitme
  const handleGoForward = () => {
    if (!electronAPI) return;

    const currentTab = tabs.find(tab => tab.id === activeTab);
    if (currentTab && currentTab.canGoForward) {
      electronAPI.goForward(activeTab);
    }
  }

  // Sayfayı yenile
  const handleRefresh = () => {
    if (!electronAPI) return;
    electronAPI.refresh(activeTab);
  }

  // Ana sayfaya git
  const handleGoHome = () => {
    handleLoadUrl("gx://speed");
  }

  // GX Corner'a git
  const handleGoGXCorner = () => {
    handleLoadUrl("gx://corner");
  }

  // Ayarlara git
  const handleGoSettings = () => {
    handleLoadUrl("gx://settings");
  }

  // URL girişini işle
  const handleLoadUrl = (inputUrl: string = url) => {
    if (!electronAPI) return;

    // URL formatını düzenle
    let formattedUrl = inputUrl;

    // GX özel URL'leri kontrol et
    if (formattedUrl === 'gx://corner' || formattedUrl === 'gx://settings' || formattedUrl === 'gx://speed') {
      // GX özel URL'leri olduğu gibi bırak
    }
    // Normal URL'leri düzenle
    else if (inputUrl && !inputUrl.startsWith('http://') && !inputUrl.startsWith('https://') && inputUrl !== "about:blank") {
      // Arama sorgusu mu URL mi kontrol et
      if (inputUrl.includes(' ') || !inputUrl.includes('.')) {
        // Arama sorgusu ise Google'da ara
        formattedUrl = `https://www.google.com/search?q=${encodeURIComponent(inputUrl)}`;
      } else {
        // URL ise https ekle
        formattedUrl = `https://${inputUrl}`;
      }
    }

    // URL'yi yükle
    electronAPI.loadURL(activeTab, formattedUrl);
  };

  // Sekme değiştir
  const handleTabChange = (id: string) => {
    setActiveTab(id);
  };

  // Kaynak limitleri değiştiğinde
  const handleLimitsChange = (limits: ResourceLimits) => {
    if (!electronAPI) return;

    setResourceLimits(prev => ({...prev, ...limits}));
    electronAPI.updateResourceLimits(limits);
  };

  // Ad blocker değiştiğinde
  const handleToggleAdBlocker = (enabled: boolean) => {
    if (!electronAPI) return;

    electronAPI.toggleAdBlocker(enabled);
  };

  // Önbelleği temizle
  const handleClearCache = () => {
    if (!electronAPI) return;

    electronAPI.clearCache();
  };

  // Çerezleri temizle
  const handleClearCookies = () => {
    if (!electronAPI) return;

    electronAPI.clearCookies();
  };

  // URL'yi anahtar tuşuyla gönderme
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLoadUrl();
    }
  };

  // GX Gösterge Paneli
  const GXPanel = () => (
    <div className={`gx-panel ${gxPanelOpen ? 'open' : ''}`}>
      <div className="gx-panel-header">
        <h3>GX Kontrol Paneli</h3>
        <button className="close-panel-btn" onClick={() => setGxPanelOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="gx-panel-section">
        <h4 className="gx-panel-section-title">
          <Zap size={16} className="gx-panel-icon" />
          Sistem Limitleri
        </h4>

        <div className="resource-item">
          <div className="resource-item-header">
            <span>CPU Limiti</span>
            <span>{resourceLimits.cpuLimit}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={resourceLimits.cpuLimit}
            onChange={(e) => handleLimitsChange({cpuLimit: parseInt(e.target.value)})}
            className="resource-slider"
          />
        </div>

        <div className="resource-item">
          <div className="resource-item-header">
            <span>RAM Limiti</span>
            <span>{resourceLimits.ramLimit}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={resourceLimits.ramLimit}
            onChange={(e) => handleLimitsChange({ramLimit: parseInt(e.target.value)})}
            className="resource-slider"
          />
        </div>

        <div className="resource-item">
          <div className="resource-item-header">
            <span>Ağ Limiti</span>
            <span>{resourceLimits.networkLimit}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={resourceLimits.networkLimit}
            onChange={(e) => handleLimitsChange({networkLimit: parseInt(e.target.value)})}
            className="resource-slider"
          />
        </div>

        <div className="resource-toggle">
          <label className="toggle-label">
            <span>Limitleri Etkinleştir</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={resourceLimits.isLimiterEnabled}
                onChange={(e) => handleLimitsChange({isLimiterEnabled: e.target.checked})}
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
        </div>
      </div>

      <div className="gx-panel-section">
        <h4 className="gx-panel-section-title">
          <Shield size={16} className="gx-panel-icon" />
          Gizlilik ve Güvenlik
        </h4>

        <div className="resource-toggle">
          <label className="toggle-label">
            <span>Reklam Engelleyici</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                onChange={(e) => handleToggleAdBlocker(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </div>
          </label>
        </div>

        <div className="gx-panel-buttons">
          <button className="gx-panel-button" onClick={handleClearCache}>
            <Zap size={14} />
            Önbelleği Temizle
          </button>

          <button className="gx-panel-button" onClick={handleClearCookies}>
            <X size={14} />
            Çerezleri Temizle
          </button>
        </div>
      </div>

      <div className="gx-panel-section">
        <h4 className="gx-panel-section-title">
          <Cpu size={16} className="gx-panel-icon" />
          Sistem Kaynakları
        </h4>

        <div className="system-resource">
          <div className="system-resource-header">
            <Cpu size={14} />
            <span>CPU</span>
            <span>{systemResources.cpu}%</span>
          </div>
          <div className="system-resource-bar">
            <div
              className="system-resource-bar-fill"
              style={{width: `${systemResources.cpu}%`}}
            ></div>
          </div>
        </div>

        <div className="system-resource">
          <div className="system-resource-header">
            <HardDrive size={14} />
            <span>RAM</span>
            <span>{systemResources.ram}%</span>
          </div>
          <div className="system-resource-bar">
            <div
              className="system-resource-bar-fill"
              style={{width: `${systemResources.ram}%`}}
            ></div>
          </div>
        </div>

        <div className="system-resource">
          <div className="system-resource-header">
            <Wifi size={14} />
            <span>Ağ</span>
            <span>{systemResources.network}%</span>
          </div>
          <div className="system-resource-bar">
            <div
              className="system-resource-bar-fill"
              style={{width: `${systemResources.network}%`}}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="browser-window">
      {/* Başlık çubuğu */}
      <div className="title-bar">
        <div className="window-title">Xiavion Browser</div>
        <div className="window-controls">
          <button className="control-btn minimize-btn" onClick={handleMinimize}></button>
          <button className="control-btn maximize-btn" onClick={handleMaximize}></button>
          <button className="control-btn close-btn" onClick={handleClose}></button>
        </div>
      </div>

      {/* Ana içerik */}
      <div className="browser-content">
        {/* Sol kenar çubuğu */}
        <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button className="sidebar-btn" onClick={handleGoHome}>
            <Home size={20} />
          </button>
          <button className="sidebar-btn" onClick={handleGoGXCorner}>
            <LayoutGrid size={20} />
          </button>
          <button className="sidebar-btn">
            <Star size={20} />
          </button>
          <button className="sidebar-btn">
            <History size={20} />
          </button>
          <button className="sidebar-btn">
            <Download size={20} />
          </button>

          <div className="sidebar-spacer"></div>

          <button
            className={`sidebar-btn gx-toggle ${gxPanelOpen ? 'active' : ''}`}
            onClick={() => setGxPanelOpen(!gxPanelOpen)}
          >
            <Zap size={20} />
          </button>

          <button className="sidebar-btn" onClick={handleGoSettings}>
            <Settings size={20} />
          </button>

          <button
            className="sidebar-btn toggle-sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Ana tarayıcı alanı */}
        <div className="main-browser">
          {/* Sekme çubuğu */}
          <div className="tabs-bar">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.favicon ? (
                  <img src={tab.favicon} alt="" className="tab-favicon" />
                ) : (
                  <Shield size={14} className="mr-2" />
                )}
                <span className="tab-text">{tab.title}</span>
                <span className="tab-close" onClick={(e) => handleCloseTab(tab.id, e)}>
                  <X size={14} />
                </span>
              </div>
            ))}
            <button className="new-tab-btn" onClick={handleAddTab}>
              <Plus size={16} />
            </button>
          </div>

          {/* Adres çubuğu */}
          <div className="address-bar">
            <div className="nav-controls">
              <button
                className="nav-btn"
                onClick={handleGoBack}
                disabled={!tabs.find(t => t.id === activeTab)?.canGoBack}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="nav-btn"
                onClick={handleGoForward}
                disabled={!tabs.find(t => t.id === activeTab)?.canGoForward}
              >
                <ChevronRight size={18} />
              </button>
              <button className="nav-btn" onClick={handleRefresh}>
                <RefreshCw size={18} />
              </button>
              <button className="nav-btn" onClick={handleGoHome}>
                <Home size={18} />
              </button>
            </div>

            <div className="url-container">
              <div className="url-icon">
                <Shield size={16} color="#8a2be2" />
              </div>
              <input
                type="text"
                className="url-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search or enter website name"
              />
            </div>

            <div className="browser-actions">
              <button className="action-btn bookmark-btn">
                <BookmarkIcon size={18} />
              </button>
              <button
                className={`action-btn ${gxPanelOpen ? 'active' : ''}`}
                onClick={() => setGxPanelOpen(!gxPanelOpen)}
              >
                <Zap size={18} />
              </button>
              <button className="action-btn" onClick={() => handleGoSettings()}>
                <Settings size={18} />
              </button>
              <button className="action-btn">
                <Menu size={18} />
              </button>
            </div>
          </div>

          {/* Tarayıcı içeriği */}
          <div className="webpage-content" ref={contentRef}>
            {/* BrowserView buraya yerleştirilecek */}
          </div>

          {/* GX Kontrol Paneli */}
          {GXPanel()}
        </div>
      </div>
    </div>
  )
}
