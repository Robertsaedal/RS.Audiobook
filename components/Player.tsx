
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
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [detailedItem, setDetailedItem] = useState<ABSLibraryItem | null>(null);
  const [initialSeekDone, setInitialSeekDone] = useState(false);
  const [savedStartTime, setSavedStartTime] = useState(0);

  // Aether Features
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [sleepMinutesLeft, setSleepMinutesLeft] = useState(0);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [sleepAtEndOfChapter, setSleepAtEndOfChapter] = useState(false);

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

  const currentChapter = useMemo(() => {
    if (!chapters.length) return null;
    return chapters.find((ch, i) => 
      currentTime >= ch.start && (i === chapters.length - 1 || currentTime < chapters[i+1].start)
    );
  }, [chapters, currentTime]);

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

  // Media Session
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
    }
  }, [item, coverUrl]);

  // Speed and Sleep Timers
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    if (sleepTimerActive && sleepMinutesLeft > 0 && isPlaying) {
      const timer = setInterval(() => {
        setSleepMinutesLeft(prev => {
          if (prev <= 1) {
            audioRef.current?.pause();
            setSleepTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [sleepTimerActive, sleepMinutesLeft, isPlaying]);

  useEffect(() => {
    if (sleepAtEndOfChapter && isPlaying && currentChapter) {
      if (currentTime >= currentChapter.end - 1) {
        audioRef.current?.pause();
        setSleepAtEndOfChapter(false);
      }
    }
  }, [currentTime, sleepAtEndOfChapter, isPlaying, currentChapter]);

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
      console.error("Playback Error:", e);
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

  const formatTimeLeft = (s: number) => {
    if (isNaN(s) || s <= 0) return "0H 0M LEFT";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}H ${m}M LEFT`;
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && !initialSeekDone && savedStartTime > 0) {
      audioRef.current.currentTime = savedStartTime;
      setCurrentTime(savedStartTime);
      setInitialSeekDone(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black">
        <div className="w-10 h-10 border-2 border-purple-600/20 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black text-white h-full overflow-hidden safe-top safe-bottom">
      <audio
        ref={audioRef}
        src={audioUrl || ''}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        preload="auto"
      />

      {/* Header */}
      <header className="px-8 py-6 flex justify-between items-center">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors">
          Library
        </button>
        <span className="text-[10px] tracking-[0.4em] font-black uppercase text-neutral-700">Aether Player</span>
        <button onClick={() => setShowChapters(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500">
          Chapters
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center px-8 overflow-y-auto no-scrollbar">
        {/* Album Art Container */}
        <div className="w-full aspect-square max-w-[320px] rounded-[48px] overflow-hidden mb-10 shadow-[0_40px_80px_-20px_rgba(157,80,187,0.3)] relative group border border-white/5">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {!isPlaying && (
            <button onClick={togglePlay} className="absolute inset-0 m-auto w-20 h-20 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 active:scale-90 transition-all">
              <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}
        </div>

        {/* Metadata */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black uppercase tracking-tight mb-2 px-4 leading-tight">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">{item.media.metadata.authorName}</p>
          {currentChapter && (
            <div className="inline-block bg-neutral-900 px-4 py-1.5 rounded-full border border-white/5 text-[9px] font-black uppercase tracking-widest text-purple-400">
              {currentChapter.title || `Chapter ${chapters.indexOf(currentChapter) + 1}`}
            </div>
          )}
        </div>

        {/* Glowing Timer */}
        <div className="text-center mb-10">
          <div className="text-6xl font-black tabular-nums tracking-tighter text-white shadow-aether-glow mb-1">
            -{formatTime(duration - currentTime)}
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500/80">
            {formatTimeLeft(duration - currentTime)}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full mb-12">
          <div 
            className="h-1.5 w-full bg-neutral-900 rounded-full cursor-pointer relative"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) audioRef.current.currentTime = pos * duration;
            }}
          >
            <div className="absolute h-full gradient-aether rounded-full" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}>
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white] -mr-2" />
            </div>
          </div>
          <div className="flex justify-between mt-4 px-1">
            <span className="text-[10px] font-black text-neutral-600 tabular-nums">{formatTime(currentTime)}</span>
            <span className="text-[10px] font-black text-neutral-600 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls Row */}
        <div className="flex items-center justify-between w-full max-w-[340px] mb-12">
          <button onClick={() => {
            const idx = chapters.indexOf(currentChapter!);
            if (idx > 0 && audioRef.current) audioRef.current.currentTime = chapters[idx - 1].start;
          }} className="text-neutral-600 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
          </button>
          
          <button onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)} className="text-neutral-500 hover:text-white active:scale-90 transition-all">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
          </button>

          <button onClick={togglePlay} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(157,80,187,0.4)] active:scale-95 transition-all">
            {isPlaying ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          <button onClick={() => audioRef.current && (audioRef.current.currentTime += 30)} className="text-neutral-500 hover:text-white active:scale-90 transition-all">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
          </button>

          <button onClick={() => {
            const idx = chapters.indexOf(currentChapter!);
            if (idx >= 0 && idx < chapters.length - 1 && audioRef.current) audioRef.current.currentTime = chapters[idx + 1].start;
          }} className="text-neutral-600 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
          </button>
        </div>

        {/* Bottom Cards Row */}
        <div className="grid grid-cols-2 gap-4 w-full mb-8">
          {/* SPEED CARD */}
          <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[32px] p-6 flex flex-col items-center">
            <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-4">Speed</span>
            <div className="flex items-center gap-4">
              <button onClick={() => setPlaybackSpeed(s => Math.max(0.5, s - 0.25))} className="p-2 text-neutral-500 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4"/></svg>
              </button>
              <span className="text-lg font-black text-purple-500 tabular-nums w-12 text-center">{playbackSpeed.toFixed(1)}x</span>
              <button onClick={() => setPlaybackSpeed(s => Math.min(3, s + 0.25))} className="p-2 text-neutral-500 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
          </div>

          {/* SLEEP CARD */}
          <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[32px] p-6 flex flex-col items-center relative overflow-hidden">
            <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest mb-4">Sleep</span>
            <div className="flex items-center gap-4">
              <button onClick={() => {
                setSleepMinutesLeft(m => Math.max(0, m - 15));
                setSleepTimerActive(true);
              }} className="p-2 text-neutral-500 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4"/></svg>
              </button>
              <span className="text-lg font-black text-purple-500 tabular-nums w-12 text-center" onClick={() => setSleepAtEndOfChapter(!sleepAtEndOfChapter)}>
                {sleepAtEndOfChapter ? 'CH' : sleepMinutesLeft}
              </span>
              <button onClick={() => {
                setSleepMinutesLeft(m => m + 15);
                setSleepTimerActive(true);
                setSleepAtEndOfChapter(false);
              }} className="p-2 text-neutral-500 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapters Overlay */}
      {showChapters && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl z-50 p-8 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black uppercase tracking-tight text-purple-500">Chapters</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-4 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) audioRef.current.currentTime = ch.start; setShowChapters(false); }}
                className={`w-full text-left p-6 rounded-[32px] border transition-all active:scale-[0.98] flex justify-between items-center ${
                  currentChapter === ch 
                  ? 'bg-purple-600/10 border-purple-600/40 text-white shadow-[0_0_20px_rgba(157,80,187,0.1)]' 
                  : 'bg-neutral-950 border-white/5 text-neutral-500'
                }`}
              >
                <span className="text-sm font-bold truncate pr-4">{ch.title || `Chapter ${i + 1}`}</span>
                <span className="text-[10px] font-black tabular-nums opacity-60 tracking-widest">{formatTime(ch.start)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
