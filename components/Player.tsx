
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

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    if (!detailedItem?.media?.audioFiles?.length) return null;
    
    const audioFiles = detailedItem.media.audioFiles;
    const sortedFiles = [...audioFiles].sort((a, b) => (a.index || 0) - (b.index || 0));
    const firstFile = sortedFiles[0];
    
    // Fallback chain for ABS file identifiers
    const fileId = firstFile.id || firstFile.ino;
    
    if (!fileId) return null;
    
    return `${auth.serverUrl}/api/items/${item.id}/file/${fileId}?token=${auth.user?.token}`;
  }, [detailedItem, item.id, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item.id, absService]);

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
        console.error("Failed to fetch book details:", e);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };

    initData();
    return () => { isMounted.current = false; };
  }, [item.id, absService]);

  // Handle initial seek once audio is ready
  const handleLoadedMetadata = () => {
    if (audioRef.current && !initialSeekDone && savedStartTime > 0) {
      audioRef.current.currentTime = savedStartTime;
      setCurrentTime(savedStartTime);
      setInitialSeekDone(true);
    }
  };

  // Sync progress to server
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
      // If there is an existing play promise, wait for it to resolve/reject first
      if (playPromiseRef.current) {
        await playPromiseRef.current;
      }

      if (audioRef.current.paused) {
        playPromiseRef.current = audioRef.current.play();
        await playPromiseRef.current;
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } catch (e) {
      console.error("Playback error:", e);
      setIsPlaying(false);
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const formatTime = (s: number) => {
    if (isNaN(s) || s === null) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin mb-4" />
        <p className="text-purple-500 font-black tracking-widest text-[10px] uppercase">Accessing Hub...</p>
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
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          preload="auto"
        />
      )}

      <header className="px-6 py-4 flex justify-between items-center safe-top">
        <button onClick={onBack} className="text-neutral-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
          Library
        </button>
        <span className="text-[10px] tracking-[0.4em] font-black uppercase text-neutral-600">R.S Audio</span>
        <button onClick={() => setShowChapters(true)} className="text-purple-500 font-black text-[10px] uppercase tracking-widest">
          Chapters
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center px-8 pt-4">
        <div className="w-full aspect-square max-w-[320px] rounded-[40px] overflow-hidden mb-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] border border-white/5 relative group">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <div className="text-center mb-10 w-full">
          <h1 className="text-2xl font-black uppercase truncate px-4 tracking-tight leading-tight">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">{item.media.metadata.authorName}</p>
        </div>

        {!audioUrl ? (
          <div className="w-full p-6 bg-red-900/10 border border-red-900/20 rounded-3xl text-center">
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">Wait: Resolving Media...</p>
          </div>
        ) : (
          <>
            <div className="w-full mb-12">
              <div className="text-6xl font-black tabular-nums mb-6 tracking-tighter text-center">
                {formatTime(currentTime)}
              </div>
              <div 
                className="h-2 w-full bg-neutral-900/50 rounded-full overflow-hidden cursor-pointer relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  if (audioRef.current) audioRef.current.currentTime = pos * duration;
                }}
              >
                <div 
                  className="h-full gradient-aether shadow-[0_0_15px_rgba(157,80,187,0.5)] transition-all duration-300 ease-out" 
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} 
                />
              </div>
              <div className="flex justify-between mt-3 px-1">
                <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(currentTime)}</span>
                <span className="text-[9px] font-black text-neutral-600 tabular-nums">-{formatTime(duration - currentTime)}</span>
              </div>
            </div>

            <div className="flex items-center gap-10">
              <button 
                onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)} 
                className="text-neutral-500 hover:text-white active:scale-90 transition-all p-4"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
              </button>
              
              <button 
                onClick={togglePlay} 
                className="w-24 h-24 gradient-aether rounded-full flex items-center justify-center shadow-[0_20px_40px_rgba(157,80,187,0.3)] active:scale-95 transition-all"
              >
                {isPlaying ? (
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>

              <button 
                onClick={() => audioRef.current && (audioRef.current.currentTime += 30)} 
                className="text-neutral-500 hover:text-white active:scale-90 transition-all p-4"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
              </button>
            </div>
          </>
        )}
      </div>

      {showChapters && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 p-6 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black uppercase tracking-tight text-purple-500">Chapters</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-3 rounded-2xl text-[10px] font-black">CLOSE</button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {chapters.length > 0 ? chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) audioRef.current.currentTime = ch.start; setShowChapters(false); }}
                className={`w-full text-left p-5 rounded-3xl border transition-all active:scale-[0.98] ${
                  currentTime >= ch.start && (i === chapters.length - 1 || currentTime < chapters[i+1].start)
                  ? 'bg-purple-600/20 border-purple-600/50 text-white' 
                  : 'bg-neutral-950 border-white/5 text-neutral-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold truncate pr-4">{ch.title || `Chapter ${i + 1}`}</span>
                  <span className="text-[10px] font-black tabular-nums opacity-60">{formatTime(ch.start)}</span>
                </div>
              </button>
            )) : (
              <div className="h-full flex items-center justify-center text-neutral-600 font-black uppercase text-[10px] tracking-widest">No Chapter Data</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
