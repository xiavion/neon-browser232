"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
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
  Search
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
    { id: "1", title: "Yeni Sekme", url: "about:blank" }
  ]);
  const [activeTab, setActiveTab] = useState("1");
  const [url, setUrl] = useState("");
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
    const newTab = { id: newId, title: "Yeni Sekme", url: "about:blank" };
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
      setTabs([{ id: newId, title: "Yeni Sekme", url: "about:blank" }]);
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
        return { ...tab, url: formattedUrl, title: inputUrl.split('/')[0] || "Yeni Sekme" };
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

      // URL değiştiğinde başlığı güncelle (Next.js önizlemesinde çalışır)
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
            // URL geçersiz olabilir
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
      setHistory({ "1": ["about:blank"] });
      setHistoryIndex({ "1": 0 });
    }
  }, [history]);

  return (
    <div className="flex flex-col h-screen">
      {/* Başlık çubuğu */}
      <div className="bg-card flex justify-between items-center p-1 drag">
        <div className="flex items-center gap-2 pl-2">
          <span className="text-primary neon-text text-lg">Neon Browser</span>
        </div>
        <div className="flex items-center no-drag">
          <Button onClick={handleMinimize} variant="ghost" size="icon" className="h-8 w-8">
            <Minus className="h-4 w-4" />
          </Button>
          <Button onClick={handleMaximize} variant="ghost" size="icon" className="h-8 w-8">
            <Square className="h-4 w-4" />
          </Button>
          <Button onClick={handleClose} variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/20">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sekme çubuğu */}
      <div className="bg-card border-t border-b border-border p-1 flex">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList neon className="w-full h-10 gap-1 justify-start bg-muted/30">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                neon
                className="px-4 flex items-center gap-2"
              >
                {tab.favicon && (
                  <img src={tab.favicon} alt="" className="w-4 h-4" />
                )}
                <span className="truncate max-w-[120px]">{tab.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-1 opacity-70 hover:opacity-100"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  forwardedAs="span"
                >
                  <X className="h-3 w-3" />
                </Button>
              </TabsTrigger>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-1"
              onClick={handleAddTab}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TabsList>

          {tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0 p-0">
              {/* Burada her sekmenin içeriği olacak */}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Adres çubuğu */}
      <div className="flex items-center gap-2 p-2 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleGoBack}
            disabled={!history[activeTab] || (historyIndex[activeTab] || 0) <= 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleGoForward}
            disabled={!history[activeTab] || (historyIndex[activeTab] || 0) >= (history[activeTab]?.length || 0) - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleGoHome}
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-0 rounded-md overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 opacity-70"></div>
          </div>
          <div className="relative flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-l-md border border-r-0 border-input bg-muted/50">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
              placeholder="Web adresini girin veya arama yapın"
              className="rounded-l-none border-l-0 bg-muted/50 focus-visible:ring-0"
            />
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Tarayıcı içeriği */}
      <div className="flex-1 bg-background overflow-hidden">
        <div className="w-full h-full">
          {/* Gerçek bir tarayıcıda burada webview olacak, şimdilik iframe kullanıyoruz */}
          <iframe
            ref={iframeRef}
            className="w-full h-full border-none"
            title="browser-content"
            src="about:blank"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals allow-orientation-lock allow-pointer-lock allow-presentation"
          />
        </div>
      </div>

      {/* Alt bilgi çubuğu */}
      <div className="bg-card border-t border-border p-1 flex justify-between text-xs text-muted-foreground">
        <div>Hazır</div>
        <div>Neon Browser v1.0</div>
      </div>
    </div>
  )
}
