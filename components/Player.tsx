
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [detailedItem, setDetailedItem] = useState<ABSLibraryItem | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    if (!detailedItem || !detailedItem.media || !detailedItem.media.audioFiles) return null;
    const audioFiles = detailedItem.media.audioFiles;
    if (audioFiles.length === 0) return null;
    
    // Sort by index to play the first file
    const sortedFiles = [...audioFiles].sort((a, b) => (a.index || 0) - (b.index || 0));
    const firstFile = sortedFiles[0];
    
    // ABS uses 'ino' or 'id' for the file endpoint
    const fileId = firstFile.id || firstFile.ino;
    
    if (!fileId) {
      console.warn("No file identifier (id or ino) found for audio file");
      return null;
    }
    
    return `${auth.serverUrl}/api/items/${item.id}/file/${fileId}?token=${auth.user?.token}`;
  }, [detailedItem, item.id, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item.id, absService]);

  useEffect(() => {
    isMounted.current = true;
    const initPlayer = async () => {
      setIsLoading(true);
      try {
        const [detailsResult, progressResult] = await Promise.allSettled([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (isMounted.current) {
          if (detailsResult.status === 'fulfilled' && detailsResult.value) {
            setDetailedItem(detailsResult.value);
            if (detailsResult.value.media.chapters) {
              setChapters(detailsResult.value.media.chapters);
            }
          }
          
          if (progressResult.status === 'fulfilled' && progressResult.value && audioRef.current) {
            const savedTime = progressResult.value.currentTime || 0;
            // Only set if valid number
            if (!isNaN(savedTime) && savedTime > 0) {
              audioRef.current.currentTime = savedTime;
              setCurrentTime(savedTime);
            }
          }
        }
      } catch (e) { 
        console.error("Init player error:", e); 
      } finally { 
        if (isMounted.current) setIsLoading(false); 
      }
    };

    initPlayer();
    return () => { isMounted.current = false; };
  }, [item.id, absService]);

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

  const togglePlay = async () => {
    if (!audioRef.current || !audioUrl) return;
    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
    } catch (e) { 
      console.error("Playback toggle failed:", e); 
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const formatTime = (s: number) => {
    if (s === undefined || s === null || isNaN(s)) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin mb-4" />
        <p className="text-purple-500 font-black tracking-widest text-[10px] uppercase">Buffering Hub...</p>
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
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">Error: No playable audio file found</p>
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
