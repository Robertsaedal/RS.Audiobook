import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AuthState, ABSLibraryItem, ABSChapter, ABSProgress } from '../types';
import { ABSService } from '../services/absService';

interface PlayerProps {
  auth: AuthState;
  item: ABSLibraryItem;
  onBack: () => void;
}

const Player: React.FC<PlayerProps> = ({ auth, item, onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const syncIntervalRef = useRef<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPopping, setIsPopping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [sleepChapters, setSleepChapters] = useState<number>(0);
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    if (item.media.audioFiles && item.media.audioFiles.length > 0) {
      return absService.getAudioUrl(item.id, item.media.audioFiles[0].id);
    }
    return '';
  }, [item, absService]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item, absService]);

  // Initial Data Fetch & Resume Logic
  useEffect(() => {
    const initPlayer = async () => {
      setIsLoading(true);
      try {
        // Fetch detailed item (to get chapters) and progress
        const [details, progress] = await Promise.all([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (details.media.chapters) {
          setChapters(details.media.chapters);
        }
        
        if (progress && audioRef.current) {
          audioRef.current.currentTime = progress.currentTime;
          setCurrentTime(progress.currentTime);
        }
      } catch (e) {
        console.error("Player init failed", e);
      } finally {
        setIsLoading(false);
      }
    };
    initPlayer();
  }, [item.id, absService]);

  // Periodic Progress Sync Logic
  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          absService.saveProgress(item.id, audioRef.current.currentTime, duration);
        }
      }, 10000); // 10 seconds per requirements
    } else {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isPlaying, item.id, duration, absService]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {}
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const syncProgress = () => {
    if (audioRef.current) {
      absService.saveProgress(item.id, audioRef.current.currentTime, duration);
    }
  };

  const handleBack = () => {
    syncProgress();
    releaseWakeLock();
    onBack();
  };

  useEffect(() => {
    const savedSpeed = localStorage.getItem(`rs_speed_${item.id}`);
    if (savedSpeed) {
      const rate = parseFloat(savedSpeed);
      setPlaybackRate(rate);
      if (audioRef.current) audioRef.current.playbackRate = rate;
    }
  }, [item.id]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        album: 'R.S Audiobooks',
        artwork: [
          { src: coverUrl, sizes: '512x512', type: 'image/png' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => skip(30));
      navigator.mediaSession.setActionHandler('previoustrack', () => jumpChapter(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => jumpChapter(1));
    }
  }, [item, coverUrl]);

  const currentChapterIndex = chapters.findIndex(c => currentTime >= c.start && currentTime < c.end);
  const currentChapter = chapters[currentChapterIndex];

  const sleepTimeRemaining = useMemo(() => {
    if (sleepChapters <= 0 || currentChapterIndex === -1) return 0;
    let total = (chapters[currentChapterIndex]?.end || 0) - currentTime;
    for (let i = 1; i < sleepChapters; i++) {
      const nextIdx = currentChapterIndex + i;
      if (nextIdx < chapters.length) {
        total += (chapters[nextIdx].end - chapters[nextIdx].start);
      }
    }
    return Math.max(0, total);
  }, [sleepChapters, currentChapterIndex, currentTime, chapters]);

  const stopAfterLabel = useMemo(() => {
    if (sleepChapters <= 0 || currentChapterIndex === -1) return null;
    const targetIdx = Math.min(chapters.length - 1, currentChapterIndex + sleepChapters - 1);
    return targetIdx + 1;
  }, [sleepChapters, currentChapterIndex, chapters]);

  useEffect(() => {
    if (sleepChapters > 0 && currentChapterIndex !== -1) {
      const targetIndex = Math.min(chapters.length - 1, currentChapterIndex + sleepChapters - 1);
      setTargetTime(chapters[targetIndex].end);
    } else {
      setTargetTime(null);
    }
  }, [sleepChapters, currentChapterIndex, chapters]);

  const skip = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime += seconds;
  };

  const jumpChapter = (direction: number) => {
    if (!audioRef.current || chapters.length === 0) return;
    if (direction === -1 && currentTime - (currentChapter?.start || 0) > 3) {
       audioRef.current.currentTime = currentChapter?.start || 0;
       return;
    }
    const targetIndex = Math.max(0, Math.min(chapters.length - 1, currentChapterIndex + direction));
    audioRef.current.currentTime = chapters[targetIndex].start;
  };

  const jumpToChapter = (chapter: ABSChapter) => {
    if (audioRef.current) {
      audioRef.current.currentTime = chapter.start;
      setShowChapters(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      setCurrentTime(current);
      if (targetTime !== null && current >= targetTime) {
        audioRef.current.pause();
        setTargetTime(null);
        setSleepChapters(0);
      }
    }
  };

  const togglePlay = () => {
    setIsPopping(true);
    setTimeout(() => setIsPopping(false), 200);
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTotalRemaining = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}H ${m}M LEFT`;
    return `${m}M LEFT`;
  };

  const chapterRemaining = currentChapter ? currentChapter.end - currentTime : 0;
  const totalRemaining = duration - currentTime;

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-black text-aether-purple font-black animate-pulse">LOADING BOOK...</div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-black safe-top safe-bottom h-full overflow-hidden relative selection:bg-none">
      <audio
        ref={audioRef}
        src={audioUrl}
        playsInline
        preload="auto"
        onPlay={() => { setIsPlaying(true); requestWakeLock(); }}
        onPause={() => { setIsPlaying(false); syncProgress(); releaseWakeLock(); }}
        onTimeUpdate={handleTimeUpdate}
        className="hidden"
      />

      <header className="px-6 py-4 flex items-center justify-between z-10 shrink-0">
        <button onClick={handleBack} className="p-2 -ml-2 text-neutral-400 active:scale-90 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-600 font-black">R.S AUDIOBOOKS</span>
        <button onClick={() => setShowChapters(true)} className="p-2 -mr-2 text-aether-purple drop-shadow-aether-glow">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center px-8 pb-8 overflow-y-auto no-scrollbar">
        <div className="w-full aspect-square max-w-[320px] rounded-[40px] shadow-[0_40px_80px_-20px_rgba(157,80,187,0.4)] overflow-hidden mb-6 relative border border-white/5 shrink-0">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
             <button onClick={togglePlay} className={`w-20 h-20 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl transition-all ${isPopping ? 'animate-tap-pop' : ''}`}>
                {isPlaying ? <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-10 h-10 text-white ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
             </button>
          </div>
        </div>

        <div className="text-center mb-8 w-full max-w-sm shrink-0">
          <h1 className="text-xl font-black tracking-tight line-clamp-1 mb-0.5 uppercase">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 font-bold tracking-widest text-[10px] uppercase">{item.media.metadata.authorName}</p>
          <div className="h-6 flex items-center justify-center mt-3">
             {currentChapter && (
                <button onClick={() => setShowChapters(true)} className="text-[9px] text-neutral-400 uppercase tracking-widest font-black bg-neutral-950 px-4 py-1.5 rounded-full border border-neutral-900 shadow-xl">
                  {currentChapter.title}
                </button>
             )}
          </div>
        </div>

        <div className="w-full space-y-2 mb-10 shrink-0">
          <div className="flex flex-col items-center justify-center font-mono-timer select-none h-20">
            <div className="h-4">
              {stopAfterLabel && <div className="text-[8px] font-black uppercase tracking-[0.2em] text-aether-purple animate-pulse">STOPPING AFTER: CH {stopAfterLabel}</div>}
            </div>
            <div className="text-5xl font-bold tracking-tighter text-white tabular-nums leading-none mt-1 shadow-aether-glow">-{formatTime(chapterRemaining)}</div>
            <div className="text-[11px] font-bold text-aether-purple tracking-tight uppercase tabular-nums mt-1.5 shadow-aether-glow opacity-80">{formatTotalRemaining(totalRemaining)}</div>
          </div>

          <div className="relative w-full h-3.5 flex items-center">
            <div className="absolute inset-0 bg-neutral-950 border border-white/5 rounded-full overflow-hidden">
               <div className="h-full gradient-aether rounded-full shadow-[0_0_15px_rgba(157,80,187,0.9)] transition-[width] duration-300" style={{ width: `${(currentTime / duration) * 100}%` }} />
            </div>
            <input type="range" min="0" max={duration} step="1" value={currentTime} onChange={(e) => { const time = parseFloat(e.target.value); setCurrentTime(time); if (audioRef.current) audioRef.current.currentTime = time; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
          </div>
          <div className="flex justify-between text-[9px] font-mono-timer text-neutral-800 tracking-tighter font-black uppercase">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between w-full max-w-sm mb-12 shrink-0 px-2">
           <button onClick={() => skip(-15)} className="p-2 text-neutral-800 hover:text-white active:scale-90 transition-all"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg></button>
           <button onClick={() => jumpChapter(-1)} className="p-2 text-aether-purple drop-shadow-aether-glow active:scale-90 mr-4"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'scaleX(-1)' }}><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg></button>
           <button onClick={togglePlay} className={`w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-[0_15px_40px_rgba(157,80,187,0.5)] transition-all ${isPopping ? 'animate-tap-pop' : 'active:scale-95'}`}>
              {isPlaying ? <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-10 h-10 text-white ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
           </button>
           <button onClick={() => jumpChapter(1)} className="p-2 text-aether-purple drop-shadow-aether-glow active:scale-90 ml-4"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg></button>
           <button onClick={() => skip(30)} className="p-2 text-neutral-800 hover:text-white active:scale-90 transition-all"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"/></svg></button>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full shrink-0 pb-12">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-[32px] flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-[0.3em] text-neutral-600 mb-4 font-black">Speed</span>
            <div className="flex items-center gap-4 mt-auto">
               <button onClick={() => { const rate = Math.max(0.5, Math.round((playbackRate - 0.1) * 10) / 10); setPlaybackRate(rate); if (audioRef.current) audioRef.current.playbackRate = rate; localStorage.setItem(`rs_speed_${item.id}`, rate.toString()); }} className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center text-xl font-bold transition-all">-</button>
               <span className="text-lg font-mono font-black w-12 text-center text-aether-purple shadow-aether-glow">{playbackRate.toFixed(1)}x</span>
               <button onClick={() => { const rate = Math.min(3.0, Math.round((playbackRate + 0.1) * 10) / 10); setPlaybackRate(rate); if (audioRef.current) audioRef.current.playbackRate = rate; localStorage.setItem(`rs_speed_${item.id}`, rate.toString()); }} className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center text-xl font-bold transition-all">+</button>
            </div>
          </div>
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-[32px] flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-[0.3em] text-neutral-600 mb-4 font-black">Sleep</span>
            <div className="h-4 flex items-center justify-center mb-2">
              {sleepChapters > 0 && <p className="text-[8px] font-black tracking-tighter text-[#6E48AA] animate-fade-in uppercase">ENDS IN: {Math.ceil(sleepTimeRemaining / 60)}m</p>}
            </div>
            <div className="flex items-center gap-3">
               <button onClick={() => setSleepChapters(v => Math.max(0, v - 1))} className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center text-xl font-bold">-</button>
               <div className="flex flex-col items-center min-w-[40px]"><span className="text-xl font-mono font-black text-aether-purple shadow-aether-glow">{sleepChapters}</span><span className="text-[8px] uppercase tracking-tighter text-neutral-700 font-black">CH</span></div>
               <button onClick={() => setSleepChapters(v => Math.min(10, v + 1))} className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center text-xl font-bold">+</button>
            </div>
          </div>
        </div>
      </div>

      {showChapters && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40 animate-fade-in" onClick={() => setShowChapters(false)} />
          <div className="fixed bottom-0 left-0 right-0 top-[30%] z-50 flex flex-col bg-neutral-950 backdrop-blur-2xl p-6 rounded-t-[48px] border-t border-white/5 animate-slide-up shadow-2xl">
            <div className="w-12 h-1 bg-neutral-900 rounded-full self-center mb-6 opacity-50" />
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black tracking-tight uppercase text-aether-purple drop-shadow-aether-glow">Chapters</h2>
              <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-3 rounded-full text-neutral-500 hover:text-white transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 no-scrollbar pb-10">
              {chapters.map((chapter, idx) => {
                const isActive = currentTime >= chapter.start && currentTime < chapter.end;
                return (
                  <button key={idx} onClick={() => jumpToChapter(chapter)} className={`w-full text-left p-5 rounded-3xl transition-all border group relative ${isActive ? 'bg-aether-purple border-transparent text-white shadow-[0_10px_30px_rgba(157,80,187,0.4)] scale-[1.02]' : 'bg-neutral-900/40 border-white/5 text-neutral-500 hover:border-neutral-800'}`}>
                    <div className="flex justify-between items-center relative z-10">
                      <div className="flex items-center gap-4 flex-1 truncate">
                        <span className={`text-[10px] font-black uppercase tracking-widest w-8 shrink-0 ${isActive ? 'text-white' : 'text-neutral-700'}`}>{isActive ? '•' : (idx + 1).toString().padStart(2, '0')}</span>
                        <span className={`font-bold text-sm truncate uppercase ${isActive ? 'text-white' : 'group-hover:text-neutral-300'}`}>{chapter.title}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-40 ml-4 font-bold tabular-nums">{formatTime(chapter.end - chapter.start)}</span>
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

export default Player;
