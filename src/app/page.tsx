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
  History
} from "lucide-react"

// Electron API tipi tanımı
interface ElectronAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  loadURL: (url: string) => Promise<{success: boolean, url: string}>;
}

// Window tipini genişlet
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

interface Tab {
  id: string
  title: string
  url: string
  favicon?: string
}

export default function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "1", title: "Google", url: "https://www.google.com" },
    { id: "2", title: "GitHub", url: "https://github.com" },
    { id: "3", title: "New Tab", url: "about:blank" }
  ]);
  const [activeTab, setActiveTab] = useState("1");
  const [url, setUrl] = useState("https://www.google.com");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Gezinme geçmişi
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [historyIndex, setHistoryIndex] = useState<Record<string, number>>({});

  // Electron API'yi global objeden al
  const electronAPI = typeof window !== "undefined" ? window.electronAPI : undefined

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
    const newTab = { id: newId, title: "New Tab", url: "about:blank" };
    setTabs([...tabs, newTab]);
    setActiveTab(newId);
    setUrl("");

    // Yeni sekme için geçmiş oluştur
    setHistory(prev => ({ ...prev, [newId]: ["about:blank"] }));
    setHistoryIndex(prev => ({ ...prev, [newId]: 0 }));
  }

  // Sekme kapat
  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(tab => tab.id !== id);

    if (newTabs.length === 0) {
      // Eğer son sekmeyi kapatıyorsak yeni bir sekme aç
      const newId = `tab-${Date.now()}`;
      setTabs([{ id: newId, title: "New Tab", url: "about:blank" }]);
      setActiveTab(newId);
      setUrl("");

      // Yeni sekme için geçmiş oluştur
      setHistory(prev => ({ ...prev, [newId]: ["about:blank"] }));
      setHistoryIndex(prev => ({ ...prev, [newId]: 0 }));
    } else if (id === activeTab) {
      // Aktif sekmeyi kapatıyorsak, bir sonraki sekmeyi aktif yap
      const currentIndex = tabs.findIndex(tab => tab.id === id);
      const nextActiveIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      const nextActiveId = newTabs[nextActiveIndex].id;
      setActiveTab(nextActiveId);
      setUrl(newTabs[nextActiveIndex].url);
    } else {
      setTabs(newTabs);
    }

    // Kapatılan sekmenin geçmişini temizle
    setHistory(prev => {
      const newHistory = { ...prev };
      delete newHistory[id];
      return newHistory;
    });

    setHistoryIndex(prev => {
      const newIndex = { ...prev };
      delete newIndex[id];
      return newIndex;
    });
  }

  // Geri gitme
  const handleGoBack = () => {
    const currentHistory = history[activeTab] || [];
    const currentIndex = historyIndex[activeTab] || 0;

    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      const prevUrl = currentHistory[newIndex];

      // iframe src'yi güncelle
      if (iframeRef.current && prevUrl) {
        iframeRef.current.src = prevUrl;

        // Aktif sekmeyi ve adres çubuğunu güncelle
        const updatedTabs = tabs.map(tab => {
          if (tab.id === activeTab) {
            return { ...tab, url: prevUrl };
          }
          return tab;
        });

        setTabs(updatedTabs);
        setUrl(prevUrl);
        setHistoryIndex(prev => ({ ...prev, [activeTab]: newIndex }));
      }
    }
  }

  // İleri gitme
  const handleGoForward = () => {
    const currentHistory = history[activeTab] || [];
    const currentIndex = historyIndex[activeTab] || 0;

    if (currentIndex < currentHistory.length - 1) {
      const newIndex = currentIndex + 1;
      const nextUrl = currentHistory[newIndex];

      // iframe src'yi güncelle
      if (iframeRef.current && nextUrl) {
        iframeRef.current.src = nextUrl;

        // Aktif sekmeyi ve adres çubuğunu güncelle
        const updatedTabs = tabs.map(tab => {
          if (tab.id === activeTab) {
            return { ...tab, url: nextUrl };
          }
          return tab;
        });

        setTabs(updatedTabs);
        setUrl(nextUrl);
        setHistoryIndex(prev => ({ ...prev, [activeTab]: newIndex }));
      }
    }
  }

  // Sayfayı yenile
  const handleRefresh = () => {
    if (iframeRef.current) {
      const currentUrl = iframeRef.current.src;
      iframeRef.current.src = currentUrl;
    }
  }

  // Ana sayfaya git
  const handleGoHome = () => {
    const homeUrl = "https://www.google.com";
    loadURL(homeUrl);
  }

  // URL'yi yükle (ortak fonksiyon)
  const loadURL = (inputUrl: string) => {
    // URL formatını düzenle
    let formattedUrl = inputUrl;
    if (inputUrl && !inputUrl.startsWith('http://') && !inputUrl.startsWith('https://') && inputUrl !== "about:blank") {
      formattedUrl = `https://${inputUrl}`;
    }

    // Aktif sekmeyi güncelle
    const updatedTabs = tabs.map(tab => {
      if (tab.id === activeTab) {
        return { ...tab, url: formattedUrl, title: inputUrl.split('/')[0] || "New Tab" };
      }
      return tab;
    });

    setTabs(updatedTabs);
    setUrl(formattedUrl);

    // Electron API mevcutsa, URL'yi Electron penceresinde yükle
    if (electronAPI) {
      electronAPI.loadURL(formattedUrl);
    }

    // iframe örneğinde
    if (iframeRef.current && formattedUrl !== "about:blank") {
      iframeRef.current.src = formattedUrl;

      // Geçmişi güncelle
      const currentHistory = history[activeTab] || [];
      const currentIndex = historyIndex[activeTab] || 0;

      // Geçmişin ortasında yeni bir URL'ye gidiyorsak, sonraki geçmişi temizle
      const newHistory = currentHistory.slice(0, currentIndex + 1);
      newHistory.push(formattedUrl);

      setHistory(prev => ({ ...prev, [activeTab]: newHistory }));
      setHistoryIndex(prev => ({ ...prev, [activeTab]: newHistory.length - 1 }));

      // URL değiştiğinde başlığı güncelle
      setTimeout(() => {
        try {
          // Belirli bir süre sonra sekme başlığını güncellemeye çalış
          const pageTitle = iframeRef.current?.contentDocument?.title;
          if (pageTitle) {
            const updatedTabsWithTitle = tabs.map(tab => {
              if (tab.id === activeTab) {
                return { ...tab, title: pageTitle || tab.title };
              }
              return tab;
            });
            setTabs(updatedTabsWithTitle);
          }
        } catch (err) {
          // CORS hatası olabilir, bu durumda domain adını kullan
          try {
            const domain = new URL(formattedUrl).hostname;
            const updatedTabsWithDomain = tabs.map(tab => {
              if (tab.id === activeTab) {
                return { ...tab, title: domain || tab.title };
              }
              return tab;
            });
            setTabs(updatedTabsWithDomain);
          } catch (e) {
            console.error("URL işlenirken hata oluştu:", e);
          }
        }
      }, 2000);
    }
  };

  // URL girişini işle
  const handleLoadUrl = () => {
    loadURL(url);
  };

  // URL değişince güncelle
  useEffect(() => {
    const currentTab = tabs.find(tab => tab.id === activeTab);
    if (currentTab) {
      setUrl(currentTab.url);
    }

    // Sekme değiştiğinde, iframe içeriğini de güncelle
    if (iframeRef.current && currentTab) {
      iframeRef.current.src = currentTab.url;
    }
  }, [activeTab, tabs]);

  // İlk yüklemede geçmişi başlat
  useEffect(() => {
    // İlk sekme için geçmiş oluştur
    if (!history["1"]) {
      setHistory({
        "1": ["https://www.google.com"],
        "2": ["https://github.com"],
        "3": ["about:blank"]
      });
      setHistoryIndex({ "1": 0, "2": 0, "3": 0 });
    }
  }, []);

  // Demo içeriği
  const getDemoContent = () => {
    return (
      <div className="demo-content">
        <h1 className="demo-logo neon-text">XiaviNET Browser</h1>
        <p className="demo-text">Bu bir demo tarayıcı arayüzüdür. Gerçek bir tarayıcı olmadığı için iframe içeriği gösterilmemektedir.</p>
        <p className="demo-highlight">Gerçek bir uygulamada, bu alan ziyaret edilen web sitesini gösterecektir.</p>
        <button className="demo-btn">XiaviNET Browser Demo</button>
      </div>
    );
  };

  return (
    <div className="browser-window">
      {/* Başlık çubuğu */}
      <div className="title-bar">
        <div className="window-controls">
          <button className="control-btn close-btn" onClick={handleClose}></button>
          <button className="control-btn minimize-btn" onClick={handleMinimize}></button>
          <button className="control-btn maximize-btn" onClick={handleMaximize}></button>
        </div>
        <div className="window-title">XiaviNET Browser</div>
      </div>

      {/* Ana içerik */}
      <div className="browser-content">
        {/* Sol kenar çubuğu */}
        <div className="sidebar">
          <button className="sidebar-btn">
            <Home size={20} />
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

          <button className="sidebar-btn">
            <Settings size={20} />
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
                onClick={() => setActiveTab(tab.id)}
              >
                <Shield size={14} className="mr-2" />
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
                disabled={!history[activeTab] || (historyIndex[activeTab] || 0) <= 0}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="nav-btn"
                onClick={handleGoForward}
                disabled={!history[activeTab] || (historyIndex[activeTab] || 0) >= (history[activeTab]?.length || 0) - 1}
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
                onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
                placeholder="Search or enter website name"
              />
            </div>

            <div className="browser-actions">
              <button className="action-btn bookmark-btn">
                <BookmarkIcon size={18} />
              </button>
              <button className="action-btn">
                <Settings size={18} />
              </button>
              <button className="action-btn">
                <Menu size={18} />
              </button>
            </div>
          </div>

          {/* Tarayıcı içeriği */}
          <div className="webpage-content">
            {activeTab === "3" ? (
              getDemoContent()
            ) : (
              <iframe
                ref={iframeRef}
                className="browser-iframe"
                title="browser-content"
                src={tabs.find(tab => tab.id === activeTab)?.url || "about:blank"}
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals allow-orientation-lock allow-pointer-lock allow-presentation"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
