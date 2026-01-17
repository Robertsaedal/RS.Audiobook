import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ABSService } from './services/absService';
import { AuthState, AppScreen, ABSLibraryItem, ABSSeries, ABSChapter } from './types';

// --- COMPONENTS ---

const Login: React.FC<{ onLogin: (auth: AuthState) => void }> = ({ onLogin }) => {
  // Pull from environment variable, fallback to the specific DuckDNS URL
  const defaultUrl = (import.meta as any).env?.VITE_ABS_URL || 'rs-audio-server.duckdns.org';
  const [serverUrl, setServerUrl] = useState(defaultUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await ABSService.login(serverUrl, username, password);
      
      let cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;

      onLogin({
        serverUrl: cleanUrl,
        user: { id: data.user.id, username: data.user.username, token: data.user.token }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 safe-top bg-black h-screen">
      <div className="w-full max-w-md space-y-12">
        <div className="text-center">
          <h1 className="text-6xl font-black tracking-tighter text-aether-purple mb-2 drop-shadow-[0_0_20px_rgba(157,80,187,0.4)]">R.S</h1>
          <p className="text-neutral-600 uppercase tracking-[0.5em] text-[10px] font-black">Audiobookshelf Client</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-neutral-600 uppercase tracking-widest ml-4">Server Address</label>
            <input type="text" placeholder="your-server.duckdns.org" value={serverUrl} onChange={e => setServerUrl(e.target.value)} className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white shadow-inner" required />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-neutral-600 uppercase tracking-widest ml-4">Credentials</label>
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white shadow-inner mb-2" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white shadow-inner" required />
          </div>
          {error && <p className="text-red-500 text-[11px] font-bold text-center uppercase tracking-wider bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}
          <button type="submit" disabled={loading} className="w-full gradient-aether p-5 rounded-[24px] font-black text-lg tracking-widest active:scale-95 transition-all disabled:opacity-50 shadow-[0_10px_30px_rgba(157,80,187,0.3)] mt-4">
            {loading ? 'CONNECTING...' : 'ENTER HUB'}
          </button>
        </form>
      </div>
    </div>
  );
};

const Library: React.FC<{ auth: AuthState, onSelectItem: (item: ABSLibraryItem) => void, onLogout: () => void }> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [series, setSeries] = useState<ABSSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RECENT' | 'SERIES' | 'HISTORY'>('RECENT');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<ABSSeries | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [libraryItems, seriesList] = await Promise.all([absService.getLibraryItems(), absService.getSeries()]);
        setItems(libraryItems);
        setSeries(seriesList);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [absService]);

  const filteredItems = useMemo(() => items.filter(i => 
    i.media.metadata.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.media.metadata.authorName.toLowerCase().includes(searchTerm.toLowerCase())
  ), [items, searchTerm]);

  const seriesItems = useMemo(() => {
    if (!selectedSeries) return [];
    return items.filter(item => selectedSeries.libraryItemIds.includes(item.id))
      .sort((a, b) => parseInt(a.media.metadata.sequence || '0') - parseInt(b.media.metadata.sequence || '0'));
  }, [selectedSeries, items]);

  return (
    <div className="flex-1 flex flex-col safe-top bg-black h-screen overflow-hidden">
      <header className="px-6 pt-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-aether-purple drop-shadow-aether-glow">LIBRARY</h2>
          <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-600 font-black">Digital Audiobookshelf</p>
        </div>
        <button onClick={onLogout} className="text-[10px] font-black uppercase tracking-widest text-neutral-600">LOGOUT</button>
      </header>
      <div className="px-6 py-4">
        <div className="relative">
          <input type="text" placeholder="Search title or author..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-neutral-900/60 border border-white/5 rounded-2xl py-4 pl-12 pr-6 text-sm" />
          <svg className="w-4 h-4 text-aether-purple absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
      </div>
      <nav className="flex px-6 py-2 gap-6 border-b border-white/5 shrink-0 overflow-x-auto no-scrollbar">
        {['RECENT', 'SERIES', 'HISTORY'].map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab as any); setSelectedSeries(null); }} className={`text-[10px] font-black uppercase tracking-widest pb-2 whitespace-nowrap relative ${activeTab === tab ? 'text-white' : 'text-neutral-600'}`}>
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 gradient-aether shadow-aether-glow" />}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
        {loading ? <div className="text-center text-neutral-700 animate-pulse font-black uppercase py-20">Syncing with Hub...</div> : (
          <>
            {activeTab === 'RECENT' && (
              <div className="grid grid-cols-2 gap-8">
                {filteredItems.map(item => (
                  <div key={item.id} onClick={() => onSelectItem(item)} className="group animate-fade-in flex flex-col text-left">
                    <div className="aspect-[2/3] bg-neutral-900 rounded-3xl overflow-hidden mb-3 relative border border-white/5 shadow-xl group-active:scale-95 transition-all">
                      <img src={absService.getCoverUrl(item.id)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </div>
                    <h3 className="text-[12px] font-bold uppercase truncate leading-tight mb-0.5">{item.media.metadata.title}</h3>
                    <p className="text-[10px] font-black text-neutral-600 uppercase truncate tracking-wider">{item.media.metadata.authorName}</p>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'SERIES' && (
              <div className="space-y-4">
                {selectedSeries ? (
                  <div className="animate-fade-in">
                    <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple mb-6 text-[10px] font-black uppercase tracking-widest">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                      Back to Series
                    </button>
                    <h3 className="text-xl font-black mb-8 border-l-4 border-aether-purple pl-4 uppercase tracking-tight">{selectedSeries.name}</h3>
                    <div className="grid grid-cols-2 gap-8">
                      {seriesItems.map(item => (
                        <div key={item.id} onClick={() => onSelectItem(item)} className="group animate-fade-in flex flex-col text-left">
                          <div className="aspect-[2/3] bg-neutral-900 rounded-3xl overflow-hidden mb-3 relative border border-white/5 shadow-xl group-active:scale-95 transition-all">
                            <img src={absService.getCoverUrl(item.id)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          </div>
                          <h3 className="text-[12px] font-bold uppercase truncate leading-tight mb-0.5">{item.media.metadata.title}</h3>
                          <p className="text-[10px] font-black text-neutral-600 uppercase truncate">Book {item.media.metadata.sequence || '?'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {series.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(s => (
                      <button key={s.id} onClick={() => setSelectedSeries(s)} className="p-6 bg-neutral-950 border border-neutral-900 rounded-[32px] flex items-center justify-between group active:scale-[0.98] transition-all">
                        <div className="text-left">
                          <h3 className="text-sm font-black uppercase group-hover:text-aether-purple transition-colors">{s.name}</h3>
                          <p className="text-[10px] font-black text-neutral-700 tracking-widest mt-1">{s.libraryItemIds.length} ITEMS</p>
                        </div>
                        <svg className="w-5 h-5 text-neutral-800 group-hover:text-aether-purple transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7"/></svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Player: React.FC<{ auth: AuthState, item: ABSLibraryItem, onBack: () => void }> = ({ auth, item, onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [sleepChapters, setSleepChapters] = useState(0);
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;
  const audioUrl = absService.getAudioUrl(item.id, item.media.audioFiles[0].id);
  const coverUrl = absService.getCoverUrl(item.id);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [details, progress] = await Promise.all([absService.getItemDetails(item.id), absService.getProgress(item.id)]);
        setChapters(details.media.chapters || []);
        if (progress && audioRef.current) {
          audioRef.current.currentTime = progress.currentTime;
          setCurrentTime(progress.currentTime);
        }
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    })();
  }, [item.id, absService]);

  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) absService.saveProgress(item.id, audioRef.current.currentTime, duration);
      }, 10000);
    } else { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); }
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [isPlaying, item.id, duration, absService]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        album: 'R.S Audiobooks',
        artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => skip(30));
    }
  }, [item, coverUrl]);

  const skip = (s: number) => { if (audioRef.current) audioRef.current.currentTime += s; };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const t = audioRef.current.currentTime;
      setCurrentTime(t);
      if (targetTime !== null && t >= targetTime) {
        audioRef.current.pause();
        setTargetTime(null);
        setSleepChapters(0);
      }
    }
  };

  const currentChapterIndex = chapters.findIndex(c => currentTime >= c.start && currentTime < c.end);
  const currentChapter = chapters[currentChapterIndex];
  const chapterRemaining = currentChapter ? currentChapter.end - currentTime : 0;

  const stopAfterLabel = useMemo(() => {
    if (sleepChapters <= 0 || currentChapterIndex === -1) return null;
    const targetIdx = Math.min(chapters.length - 1, currentChapterIndex + sleepChapters - 1);
    return targetIdx + 1;
  }, [sleepChapters, currentChapterIndex, chapters]);

  useEffect(() => {
    if (sleepChapters > 0 && currentChapterIndex !== -1) {
      const idx = Math.min(chapters.length - 1, currentChapterIndex + sleepChapters - 1);
      setTargetTime(chapters[idx].end);
    } else setTargetTime(null);
  }, [sleepChapters, currentChapterIndex, chapters]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center font-black text-aether-purple animate-pulse uppercase tracking-widest">Initialising Player...</div>;

  return (
    <div className="flex-1 flex flex-col bg-black safe-top safe-bottom h-screen overflow-hidden selection:bg-none">
      <audio ref={audioRef} src={audioUrl} playsInline preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => { setIsPlaying(false); if (audioRef.current) absService.saveProgress(item.id, audioRef.current.currentTime, duration); }} onTimeUpdate={handleTimeUpdate} className="hidden" />
      <header className="px-6 py-4 flex justify-between items-center z-10 shrink-0">
        <button onClick={() => { if (audioRef.current) absService.saveProgress(item.id, audioRef.current.currentTime, duration); onBack(); }} className="p-2 -ml-2 text-neutral-400 active:scale-90 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-600 font-black">R.S AUDIOBOOKS</span>
        <button onClick={() => setShowChapters(true)} className="p-2 -mr-2 text-aether-purple drop-shadow-aether-glow active:scale-90 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>
      </header>
      <div className="flex-1 flex flex-col items-center px-8 pb-8 overflow-y-auto no-scrollbar">
        <div className="w-full aspect-square max-w-[320px] rounded-[48px] shadow-[0_40px_80px_-20px_rgba(157,80,187,0.4)] overflow-hidden mb-8 border border-white/5 relative shrink-0">
          <img src={coverUrl} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
             <button onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()} className="w-24 h-24 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl transition-all active:scale-90 group">
                {isPlaying ? <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-12 h-12 text-white ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
             </button>
          </div>
        </div>
        <div className="text-center mb-10 uppercase shrink-0 px-4">
          <h1 className="text-xl font-black tracking-tight line-clamp-2 leading-tight mb-1">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 font-bold tracking-[0.2em] text-[10px] opacity-80">{item.media.metadata.authorName}</p>
        </div>
        <div className="w-full space-y-4 mb-12 shrink-0 text-center">
          <div className="font-mono-timer h-24 flex flex-col justify-center">
            {stopAfterLabel && <p className="text-[9px] text-aether-purple font-black animate-pulse mb-1">STOPPING AFTER: CH {stopAfterLabel}</p>}
            <h2 className="text-5xl font-bold tracking-tighter text-white tabular-nums shadow-aether-glow">-{formatTime(chapterRemaining)}</h2>
            <p className="text-[10px] text-neutral-700 font-black mt-2 tracking-widest opacity-60">TOTAL REMAINING: {formatTime(duration - currentTime)}</p>
          </div>
          <div className="relative w-full h-4 px-2">
            <div className="absolute inset-0 left-2 right-2 bg-neutral-950 border border-white/5 rounded-full overflow-hidden">
               <div className="h-full gradient-aether shadow-aether-glow transition-[width] duration-300" style={{ width: `${(currentTime/duration)*100}%` }} />
            </div>
            <input type="range" min="0" max={duration} step="1" value={currentTime} onChange={e => { if(audioRef.current) audioRef.current.currentTime = parseFloat(e.target.value); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
          </div>
        </div>
        <div className="flex items-center justify-between w-full max-w-sm mb-12 shrink-0 px-6">
          <button onClick={() => skip(-15)} className="text-neutral-800 active:text-white transition-all transform active:scale-90"><svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>
          <button onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-[0_20px_40px_rgba(157,80,187,0.4)] active:scale-95 transition-all">
            {isPlaying ? <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-10 h-10 text-white ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <button onClick={() => skip(30)} className="text-neutral-800 active:text-white transition-all transform active:scale-90"><svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full shrink-0 pb-10">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-[32px] flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-neutral-600 mb-3 font-black">Playback Speed</span>
            <div className="flex items-center gap-5">
               <button onClick={() => { const r = Math.max(0.5, Math.round((playbackRate - 0.1) * 10) / 10); setPlaybackRate(r); if(audioRef.current) audioRef.current.playbackRate = r; }} className="w-10 h-10 rounded-full border border-neutral-800 active:bg-neutral-800 transition-colors text-xl font-bold">-</button>
               <span className="text-lg font-mono font-black text-aether-purple shadow-aether-glow w-10 text-center">{playbackRate.toFixed(1)}x</span>
               <button onClick={() => { const r = Math.min(3.0, Math.round((playbackRate + 0.1) * 10) / 10); setPlaybackRate(r); if(audioRef.current) audioRef.current.playbackRate = r; }} className="w-10 h-10 rounded-full border border-neutral-800 active:bg-neutral-800 transition-colors text-xl font-bold">+</button>
            </div>
          </div>
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-[32px] flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-neutral-600 mb-3 font-black">Chapter Sleep</span>
            <div className="flex items-center gap-5">
               <button onClick={() => setSleepChapters(v => Math.max(0, v - 1))} className="w-10 h-10 rounded-full border border-neutral-800 active:bg-neutral-800 transition-colors text-xl font-bold">-</button>
               <div className="flex flex-col items-center min-w-[40px]"><span className="text-lg font-mono font-black text-aether-purple shadow-aether-glow leading-none">{sleepChapters}</span><span className="text-[8px] text-neutral-700 font-black tracking-tighter uppercase mt-1">CH</span></div>
               <button onClick={() => setSleepChapters(v => Math.min(10, v + 1))} className="w-10 h-10 rounded-full border border-neutral-800 active:bg-neutral-800 transition-colors text-xl font-bold">+</button>
            </div>
          </div>
        </div>
      </div>
      {showChapters && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40 animate-fade-in" onClick={() => setShowChapters(false)} />
          <div className="fixed bottom-0 left-0 right-0 top-[30%] z-50 flex flex-col bg-neutral-950 rounded-t-[48px] p-8 animate-slide-up border-t border-white/5 backdrop-blur-3xl shadow-2xl">
            <div className="w-12 h-1 bg-neutral-900 rounded-full self-center mb-8 opacity-40" />
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black uppercase text-aether-purple drop-shadow-aether-glow">Chapter Index</h2>
              <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-3 rounded-full text-neutral-500 hover:text-white transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-12 no-scrollbar">
              {chapters.map((c, i) => {
                const isActive = currentTime >= c.start && currentTime < c.end;
                return (
                  <button key={i} onClick={() => { if(audioRef.current) audioRef.current.currentTime = c.start; setShowChapters(false); }} className={`w-full text-left p-6 rounded-[28px] border group transition-all relative ${isActive ? 'bg-aether-purple border-transparent text-white shadow-lg scale-[1.02]' : 'bg-neutral-900/40 border-white/5 text-neutral-500 hover:border-neutral-800'}`}>
                    <div className="flex justify-between items-center uppercase font-black">
                      <div className="flex items-center gap-4 flex-1 truncate pr-4">
                        <span className={`text-[10px] w-6 shrink-0 ${isActive ? 'text-white' : 'text-neutral-700'}`}>{isActive ? '•' : (i + 1).toString().padStart(2, '0')}</span>
                        <span className="text-sm truncate">{c.title}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-50 tabular-nums">{formatTime(c.end - c.start)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// --- APP ROOT ---

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.LOGIN);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [selectedItem, setSelectedItem] = useState<ABSLibraryItem | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('rs_auth');
    if (saved) {
      try { setAuth(JSON.parse(saved)); setScreen(AppScreen.LIBRARY); } catch (e) {}
    }
    setInitializing(false);
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault(); setDeferredPrompt(e);
      if (!sessionStorage.getItem('rs_dismissed')) setShowInstallBanner(true);
    });
  }, []);

  const handleLogin = (a: AuthState) => { setAuth(a); localStorage.setItem('rs_auth', JSON.stringify(a)); setScreen(AppScreen.LIBRARY); };
  const handleLogout = () => { setAuth(null); localStorage.removeItem('rs_auth'); setScreen(AppScreen.LOGIN); };

  if (initializing) return <div className="h-screen bg-black flex items-center justify-center font-black text-aether-purple animate-pulse uppercase tracking-widest">Aether Initialising...</div>;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-900 flex flex-col font-sans">
      {showInstallBanner && screen !== AppScreen.PLAYER && (
        <div className="fixed bottom-6 left-6 right-6 z-[100] animate-slide-up">
          <div className="bg-neutral-900/95 backdrop-blur-xl border border-white/10 p-6 rounded-[32px] shadow-2xl flex items-center justify-between gap-6">
            <div className="flex-1 uppercase font-black">
              <h4 className="text-[13px] text-white tracking-wide">Install R.S Audio</h4>
              <p className="text-[10px] text-neutral-500 mt-0.5">Standalone player with background audio support.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowInstallBanner(false)} className="text-neutral-600 p-2 hover:text-white transition-colors">✕</button>
              <button onClick={() => { if(deferredPrompt) deferredPrompt.prompt(); setShowInstallBanner(false); }} className="gradient-aether px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg">Install</button>
            </div>
          </div>
        </div>
      )}
      {screen === AppScreen.LOGIN && <Login onLogin={handleLogin} />}
      {screen === AppScreen.LIBRARY && auth && <Library auth={auth} onSelectItem={i => { setSelectedItem(i); setScreen(AppScreen.PLAYER); }} onLogout={handleLogout} />}
      {screen === AppScreen.PLAYER && auth && selectedItem && <Player auth={auth} item={selectedItem} onBack={() => setScreen(AppScreen.LIBRARY)} />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
