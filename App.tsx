
import React, { useState, useEffect } from 'react';
import { AppScreen, AuthState, ABSLibraryItem } from './types';
import Login from './components/Login';
import Library from './components/Library';
import Player from './components/Player';

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.LOGIN);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [selectedItem, setSelectedItem] = useState<ABSLibraryItem | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const savedAuth = localStorage.getItem('rs_auth');
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setAuth(parsed);
        setScreen(AppScreen.LIBRARY);
      } catch (e) {
        localStorage.removeItem('rs_auth');
      }
    }
    setIsInitializing(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem('rs_install_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleLogin = (newAuth: AuthState) => {
    setAuth(newAuth);
    localStorage.setItem('rs_auth', JSON.stringify(newAuth));
    setScreen(AppScreen.LIBRARY);
  };

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem('rs_auth');
    setScreen(AppScreen.LOGIN);
  };

  const openPlayer = (item: ABSLibraryItem) => {
    setSelectedItem(item);
    setScreen(AppScreen.PLAYER);
    setShowInstallBanner(false);
  };

  const installPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      }
    }
  };

  const dismissBanner = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('rs_install_dismissed', 'true');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin" />
        <p className="font-black text-purple-500 tracking-[0.5em] text-[10px] uppercase">R.S Audio</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-900 flex flex-col overflow-y-auto font-sans">
      {showInstallBanner && screen !== AppScreen.PLAYER && (
        <div className="fixed bottom-6 left-6 right-6 z-[100] animate-slide-up">
          <div className="bg-neutral-900/95 backdrop-blur-xl border border-white/10 p-5 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-white mb-0.5">R.S Audio Hub</h4>
              <p className="text-[10px] text-neutral-400 font-medium leading-tight">Install app for background play.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={dismissBanner} className="p-2 text-neutral-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button onClick={installPWA} className="bg-purple-600 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg active:scale-95 transition-all">
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === AppScreen.LOGIN && <Login onLogin={handleLogin} />}
      
      {screen === AppScreen.LIBRARY && auth && (
        <Library auth={auth} onSelectItem={openPlayer} onLogout={handleLogout} />
      )}

      {screen === AppScreen.PLAYER && auth && selectedItem && (
        <Player auth={auth} item={selectedItem} onBack={() => setScreen(AppScreen.LIBRARY)} />
      )}
    </div>
  );
};

export default App;
