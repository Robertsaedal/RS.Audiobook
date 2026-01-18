
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

  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [sleepChapters, setSleepChapters] = useState(0); 

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

  const currentChapterIndex = useMemo(() => {
    if (!chapters.length) return -1;
    return chapters.findIndex((ch, i) => 
      currentTime >= ch.start && (i === chapters.length - 1 || currentTime < chapters[i+1].start)
    );
  }, [chapters, currentTime]);

  const currentChapter = useMemo(() => {
    return currentChapterIndex !== -1 ? chapters[currentChapterIndex] : null;
  }, [chapters, currentChapterIndex]);

  const chapterElapsed = currentChapter ? currentTime - currentChapter.start : 0;
  const chapterDuration = currentChapter ? currentChapter.end - currentChapter.start : 0;
  const chapterRemaining = currentChapter ? currentChapter.end - currentTime : 0;
  const chapterProgress = chapterDuration > 0 ? (chapterElapsed / chapterDuration) * 100 : 0;

  const sleepTargetTime = useMemo(() => {
    if (sleepChapters <= 0 || !chapters.length || currentChapterIndex === -1) return null;
    const targetIdx = Math.min(chapters.length - 1, currentChapterIndex + sleepChapters - 1);
    return chapters[targetIdx].end;
  }, [sleepChapters, chapters, currentChapterIndex]);

  const totalSleepRemaining = sleepTargetTime ? sleepTargetTime - currentTime : 0;

  useEffect(() => {
    isMounted.current = true;
    const initData = async () => {
      setIsLoading(true);
      try {
        const [details, progress] = await Promise.all([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id).catch(() => null)
        ]);
        
        if (isMounted.current) {
          if (details) {
            setDetailedItem(details);
            if (details.media.chapters) setChapters(details.media.chapters);
          }

          let startAt = 0;
          if (progress && progress.currentTime > 0) {
            startAt = progress.currentTime;
          } else {
            const localBackup = localStorage.getItem(`rs_pos_${item.id}`);
            if (localBackup) {
              startAt = parseFloat(localBackup);
            }
          }

          if (startAt > 0) {
            setSavedStartTime(startAt);
            setCurrentTime(startAt);
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

  const saveCurrentProgress = useCallback(() => {
    if (audioRef.current && isMounted.current && audioRef.current.currentTime > 0) {
      const currentPos = audioRef.current.currentTime;
      absService.saveProgress(item.id, currentPos, duration);
      localStorage.setItem(`rs_pos_${item.id}`, currentPos.toString());
    }
  }, [item.id, duration, absService]);

  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current = window.setInterval(saveCurrentProgress, 10000);
    }
    return () => { 
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); 
      saveCurrentProgress(); 
    };
  }, [isPlaying, saveCurrentProgress]);

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
        saveCurrentProgress();
      }
    } catch (e) {
      console.error("Playback Error:", e);
      setIsPlaying(false);
    } finally {
      playPromiseRef.current = null;
    }
  }, [saveCurrentProgress]);

  const performInitialSeek = useCallback(() => {
    if (audioRef.current && !initialSeekDone && savedStartTime > 0) {
      audioRef.current.currentTime = savedStartTime;
      setCurrentTime(savedStartTime);
      setInitialSeekDone(true);
    }
  }, [initialSeekDone, savedStartTime]);

  const formatTime = (s: number) => {
    if (isNaN(s) || s < 0) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-black">
        <div className="w-10 h-10 border-2 border-purple-600/20 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-black text-white overflow-hidden md:max-w-[450px] md:mx-auto md:border-x md:border-white/10 flex flex-col relative">
      <audio
        ref={audioRef}
        src={audioUrl || ''}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={performInitialSeek}
        onCanPlay={performInitialSeek}
        onEnded={() => setIsPlaying(false)}
        preload="auto"
      />

      {/* FIXED HEADER */}
      <header className="px-8 pt-10 pb-4 flex justify-between items-center z-10 shrink-0">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors">
          Library
        </button>
        <span className="text-[10px] tracking-[0.4em] font-black uppercase text-neutral-800">Aether Hub</span>
        <button onClick={() => setShowChapters(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500">
          Chapters
        </button>
      </header>

      {/* RESPONSIVE FLEX CONTAINER */}
      <div className="flex-1 flex flex-col items-center justify-between px-8 py-4 overflow-hidden">
        
        {/* DYNAMIC SCALING COVER ART: Shrinks first when screen is short */}
        <div className="flex-1 min-h-0 w-full flex items-center justify-center mb-6">
          <div className="relative group max-h-full">
            <img 
              src={coverUrl} 
              alt="Cover" 
              className="max-h-[40vh] aspect-square object-cover rounded-[48px] shadow-[0_40px_80px_-20px_rgba(157,80,187,0.4)] border border-white/5"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-[48px]" />
            {!isPlaying && (
              <button onClick={togglePlay} className="absolute inset-0 m-auto w-16 h-16 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 active:scale-90 transition-all">
                <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* METADATA & TIMER AREA */}
        <div className="w-full space-y-4 shrink-0">
          <div className="text-center">
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-1 px-4 leading-tight truncate">{item.media.metadata.title}</h1>
            <p className="text-neutral-500 text-[9px] font-black uppercase tracking-[0.3em] mb-3">{item.media.metadata.authorName}</p>
            {currentChapter && (
              <div className="inline-block bg-neutral-950 px-4 py-1.5 rounded-full border border-white/5 text-[8px] font-black uppercase tracking-widest text-purple-400">
                {currentChapter.title || `Chapter ${currentChapterIndex + 1}`}
              </div>
            )}
          </div>

          <div className="text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-1">Time Remaining</p>
            <div className="text-4xl md:text-5xl font-black tabular-nums tracking-tighter text-purple-500 shadow-aether-glow">
              {formatTime(chapterRemaining)}
            </div>
          </div>

          {/* PROGRESS BAR */}
          <div className="w-full px-2">
            <div 
              className="h-1.5 w-full bg-neutral-900 rounded-full cursor-pointer relative"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                if (audioRef.current && currentChapter) {
                  audioRef.current.currentTime = currentChapter.start + (pos * chapterDuration);
                }
              }}
            >
              <div className="absolute h-full gradient-aether rounded-full" style={{ width: `${chapterProgress}%` }}>
                 <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_15px_white] -mr-1.5" />
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(chapterElapsed)}</span>
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(chapterDuration)}</span>
            </div>
          </div>

          {/* MAIN CONTROLS */}
          <div className="flex items-center justify-between w-full max-w-[340px] mx-auto py-2">
            <button onClick={() => {
              if (currentChapterIndex > 0 && audioRef.current) {
                audioRef.current.currentTime = chapters[currentChapterIndex - 1].start;
              }
            }} className="p-2 text-neutral-600 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
            </button>
            
            <button onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)} className="p-2 text-neutral-500 hover:text-white transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>

            <button onClick={togglePlay} className="w-16 h-16 gradient-aether rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(157,80,187,0.3)] active:scale-95 transition-all">
              {isPlaying ? (
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-7 h-7 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>

            <button onClick={() => audioRef.current && (audioRef.current.currentTime += 30)} className="p-2 text-neutral-500 hover:text-white transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
            </button>

            <button onClick={() => {
              if (currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 && audioRef.current) {
                audioRef.current.currentTime = chapters[currentChapterIndex + 1].start;
              }
            }} className="p-2 text-neutral-600 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* SECONDARY CONTROLS (SPEED / SLEEP) */}
          <div className="grid grid-cols-2 gap-4 w-full pb-8">
            <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[28px] p-4 flex flex-col items-center">
              <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">Speed</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setPlaybackSpeed(s => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))} className="p-1 text-neutral-500 hover:text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4"/></svg>
                </button>
                <span className="text-base font-black text-purple-500 tabular-nums w-10 text-center">{playbackSpeed.toFixed(1)}x</span>
                <button onClick={() => setPlaybackSpeed(s => Math.min(3.0, Math.round((s + 0.1) * 10) / 10))} className="p-1 text-neutral-500 hover:text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>

            <div className="bg-neutral-900/40 backdrop-blur-md border border-white/5 rounded-[28px] p-4 flex flex-col items-center">
              <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">Sleep</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setSleepChapters(c => Math.max(0, c - 1))} className="p-1 text-neutral-500 hover:text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4"/></svg>
                </button>
                <span className="text-base font-black text-purple-500 tabular-nums w-8 text-center">{sleepChapters}</span>
                <button onClick={() => setSleepChapters(c => Math.min(20, c + 1))} className="p-1 text-neutral-500 hover:text-white">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CHAPTERS OVERLAY */}
      {showChapters && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl z-50 p-8 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black uppercase tracking-tight text-purple-500">Book Index</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-4 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 active:scale-95">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) audioRef.current.currentTime = ch.start; setShowChapters(false); }}
                className={`w-full text-left p-6 rounded-[32px] border transition-all active:scale-[0.98] flex justify-between items-center ${
                  currentChapterIndex === i 
                  ? 'bg-purple-600/10 border-purple-600/40 text-white shadow-[0_0_20px_rgba(157,80,187,0.1)]' 
                  : 'bg-neutral-950 border-white/5 text-neutral-500 hover:border-white/10'
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
