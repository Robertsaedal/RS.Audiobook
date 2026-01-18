
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { ABSService } from '../services/absService';

interface PlayerProps {
  auth: AuthState;
  item: ABSLibraryItem;
  onBack: () => void;
}

const Player: React.FC<PlayerProps> = ({ auth, item, onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [detailedItem, setDetailedItem] = useState<ABSLibraryItem | null>(null);
  const [initialSeekDone, setInitialSeekDone] = useState(false);
  const [savedStartTime, setSavedStartTime] = useState(0);

  // Precision Features
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState<number | null>(null);
  const [sleepAtEndOfChapter, setSleepAtEndOfChapter] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    if (!detailedItem?.media?.audioFiles?.length) return null;
    const sortedFiles = [...detailedItem.media.audioFiles].sort((a, b) => (a.index || 0) - (b.index || 0));
    const firstFile = sortedFiles[0];
    const fileId = firstFile.id || firstFile.ino;
    return fileId ? `${auth.serverUrl}/api/items/${item.id}/file/${fileId}?token=${auth.user?.token}` : null;
  }, [detailedItem, item.id, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item.id, absService]);

  // Media Session API Integration
  useEffect(() => {
    if ('mediaSession' in navigator && item) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        album: item.media.metadata.seriesName || 'R.S Audio Hub',
        artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('seekbackward', () => { if (audioRef.current) audioRef.current.currentTime -= 15; });
      navigator.mediaSession.setActionHandler('seekforward', () => { if (audioRef.current) audioRef.current.currentTime += 30; });
    }
  }, [item, coverUrl]);

  // Load book details and progress
  useEffect(() => {
    isMounted.current = true;
    const initData = async () => {
      setIsLoading(true);
      try {
        const [details, progress] = await Promise.all([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (isMounted.current) {
          if (details) {
            setDetailedItem(details);
            if (details.media.chapters) setChapters(details.media.chapters);
          }
          if (progress?.currentTime) {
            setSavedStartTime(progress.currentTime);
          }
        }
      } catch (e) {
        console.error("Init Error:", e);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };

    initData();
    return () => { isMounted.current = false; };
  }, [item.id, absService]);

  // Handle Playback Rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle Sleep Timer Countdown
  useEffect(() => {
    if (sleepTimerActive && sleepMinutesLeft !== null && isPlaying) {
      const interval = setInterval(() => {
        setSleepMinutesLeft(prev => {
          if (prev !== null && prev <= 1) {
            if (audioRef.current) audioRef.current.pause();
            setSleepTimerActive(false);
            return null;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [sleepTimerActive, sleepMinutesLeft, isPlaying]);

  // Handle End of Chapter Sleep
  useEffect(() => {
    if (sleepAtEndOfChapter && isPlaying && chapters.length > 0) {
      const currentChapterIndex = chapters.findIndex((ch, i) => 
        currentTime >= ch.start && (i === chapters.length - 1 || currentTime < chapters[i+1].start)
      );
      if (currentChapterIndex !== -1) {
        const endOfChapter = chapters[currentChapterIndex].end;
        if (currentTime >= endOfChapter - 1) {
          if (audioRef.current) audioRef.current.pause();
          setSleepAtEndOfChapter(false);
          setSleepTimerActive(false);
        }
      }
    }
  }, [currentTime, sleepAtEndOfChapter, isPlaying, chapters]);

  const handleLoadedMetadata = () => {
    if (audioRef.current && !initialSeekDone && savedStartTime > 0) {
      audioRef.current.currentTime = savedStartTime;
      setCurrentTime(savedStartTime);
      setInitialSeekDone(true);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current = window.setInterval(() => {
        if (audioRef.current && isMounted.current) {
          absService.saveProgress(item.id, audioRef.current.currentTime, duration);
        }
      }, 10000);
    }
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [isPlaying, item.id, duration, absService]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      if (playPromiseRef.current) await playPromiseRef.current;
      if (audioRef.current.paused) {
        playPromiseRef.current = audioRef.current.play();
        await playPromiseRef.current;
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } catch (e) {
      console.error("Toggle Error:", e);
      setIsPlaying(false);
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const formatTime = (s: number) => {
    if (isNaN(s) || s === null) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const setSleepTimer = (min: number | 'chapter') => {
    if (min === 'chapter') {
      setSleepAtEndOfChapter(true);
      setSleepMinutesLeft(null);
    } else {
      setSleepMinutesLeft(min);
      setSleepAtEndOfChapter(false);
    }
    setSleepTimerActive(true);
    setShowSleepMenu(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin mb-4" />
        <p className="text-purple-500 font-black tracking-widest text-[10px] uppercase">Connecting Hub...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black text-white h-full overflow-hidden relative">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          preload="auto"
        />
      )}

      <header className="px-6 py-4 flex justify-between items-center safe-top z-10">
        <button onClick={onBack} className="text-neutral-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
          Library
        </button>
        <div className="flex items-center gap-4">
           {sleepTimerActive && (
             <div className="text-[10px] font-black text-purple-500 tracking-widest uppercase">
               Timer: {sleepAtEndOfChapter ? 'Ch.' : `${sleepMinutesLeft}m`}
             </div>
           )}
           <button onClick={() => setShowSleepMenu(true)} className="p-2 text-neutral-500 hover:text-purple-500">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
             </svg>
           </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-8 pt-4">
        <div className="w-full aspect-square max-w-[300px] rounded-[48px] overflow-hidden mb-8 shadow-2xl border border-white/5 relative group">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        <div className="text-center mb-6 w-full">
          <h1 className="text-xl font-black uppercase truncate px-4 tracking-tight leading-tight">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">{item.media.metadata.authorName}</p>
        </div>

        <div className="w-full mb-10">
          <div className="text-5xl font-black tabular-nums mb-6 tracking-tighter text-center text-white/90">
            {formatTime(currentTime)}
          </div>
          <div 
            className="h-1.5 w-full bg-neutral-900 rounded-full overflow-hidden cursor-pointer relative"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) audioRef.current.currentTime = pos * duration;
            }}
          >
            <div className="h-full gradient-aether transition-all duration-300" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-3 px-1">
            <span className="text-[9px] font-black text-neutral-600">{formatTime(currentTime)}</span>
            <span className="text-[9px] font-black text-neutral-600">-{formatTime(duration - currentTime)}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 w-full">
          <div className="flex items-center gap-10">
            <button onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)} className="text-neutral-500 active:scale-90 transition-all">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            <button onClick={togglePlay} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all">
              {isPlaying ? (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={() => audioRef.current && (audioRef.current.currentTime += 30)} className="text-neutral-500 active:scale-90 transition-all">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
            </button>
          </div>

          <div className="flex items-center gap-4 w-full justify-center">
            <button 
              onClick={() => {
                const rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
                const nextIdx = (rates.indexOf(playbackSpeed) + 1) % rates.length;
                setPlaybackSpeed(rates[nextIdx]);
              }}
              className="bg-neutral-900 px-6 py-2.5 rounded-full text-[10px] font-black text-purple-500 tracking-widest border border-white/5 active:scale-95"
            >
              {playbackSpeed}X SPEED
            </button>
            <button 
              onClick={() => setShowChapters(true)}
              className="bg-neutral-900 px-6 py-2.5 rounded-full text-[10px] font-black text-neutral-400 tracking-widest border border-white/5 active:scale-95"
            >
              CHAPTERS
            </button>
          </div>
        </div>
      </div>

      {showSleepMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end animate-fade-in" onClick={() => setShowSleepMenu(false)}>
          <div className="w-full bg-neutral-950 border-t border-white/10 rounded-t-[40px] p-8 space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-neutral-800 rounded-full mx-auto mb-4" />
            <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] text-center mb-6">Set Sleep Timer</h3>
            <div className="grid grid-cols-2 gap-4">
              {[15, 30, 45, 60].map(m => (
                <button key={m} onClick={() => setSleepTimer(m)} className="bg-neutral-900 p-5 rounded-3xl text-[11px] font-black uppercase tracking-widest hover:text-purple-500 transition-colors">{m} Minutes</button>
              ))}
              <button onClick={() => setSleepTimer('chapter')} className="col-span-2 bg-purple-600 p-5 rounded-3xl text-[11px] font-black uppercase tracking-widest">End of Chapter</button>
              <button onClick={() => { setSleepTimerActive(false); setShowSleepMenu(false); }} className="col-span-2 bg-neutral-950 border border-red-900/30 text-red-500 p-4 rounded-3xl text-[10px] font-black uppercase">Cancel Timer</button>
            </div>
          </div>
        </div>
      )}

      {showChapters && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 p-6 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black uppercase tracking-tight text-purple-500">Chapters</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-3 rounded-2xl text-[10px] font-black tracking-widest">CLOSE</button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {chapters.length > 0 ? chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) audioRef.current.currentTime = ch.start; setShowChapters(false); }}
                className={`w-full text-left p-5 rounded-3xl border transition-all active:scale-[0.98] ${
                  currentTime >= ch.start && (i === chapters.length - 1 || currentTime < chapters[i+1].start)
                  ? 'bg-purple-600/10 border-purple-600/40 text-white shadow-lg' 
                  : 'bg-neutral-950 border-white/5 text-neutral-500'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold truncate pr-4">{ch.title || `Chapter ${i + 1}`}</span>
                  <span className="text-[10px] font-black tabular-nums opacity-60">{formatTime(ch.start)}</span>
                </div>
              </button>
            )) : (
              <div className="h-full flex items-center justify-center text-neutral-600 font-black uppercase text-[10px] tracking-widest">No Chapters Found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
