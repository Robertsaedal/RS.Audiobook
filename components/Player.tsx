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
  const wakeLockRef = useRef<any>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  
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

  // We append the token directly to the URL to ensure the browser can stream the file
  const audioUrl = useMemo(() => {
    if (item.media.audioFiles && item.media.audioFiles.length > 0) {
      return `${auth.serverUrl}/api/items/${item.id}/file/${item.media.audioFiles[0].id}?token=${auth.user?.token}`;
    }
    return '';
  }, [item, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item, absService]);

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
          if (detailsResult.status === 'fulfilled' && detailsResult.value.media.chapters) {
            setChapters(detailsResult.value.media.chapters);
          }
          
          // HANDLE 404/EMPTY PROGRESS: If it fails, we stay at 0
          if (progressResult.status === 'fulfilled' && progressResult.value && audioRef.current) {
            const savedTime = progressResult.value.currentTime || 0;
            audioRef.current.currentTime = savedTime;
            setCurrentTime(savedTime);
          } else {
            setCurrentTime(0);
          }
        }
      } catch (e) {
        console.warn("Player init partial failure (this is usually fine)", e);
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
    } else {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    }
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [isPlaying, item.id, duration, absService]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    
    // If the audio hasn't loaded a source yet, force it
    if (audioRef.current.readyState === 0) {
      audioRef.current.load();
    }

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error("Playback failed:", error);
      // This is where the browser usually blocks the request
      alert("Browser blocked playback. Please click the Lock icon in the URL bar and 'Allow Insecure Content'.");
      setIsPlaying(false);
    }
  };

  const skip = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime += seconds;
  };

  const jumpChapter = (direction: number) => {
    if (!audioRef.current || chapters.length === 0) return;
    const currentChapterIndex = chapters.findIndex(c => currentTime >= c.start && currentTime < c.end);
    const targetIndex = Math.max(0, Math.min(chapters.length - 1, (currentChapterIndex === -1 ? 0 : currentChapterIndex) + direction));
    audioRef.current.currentTime = chapters[targetIndex].start;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-black text-purple-500 font-black animate-pulse">LOADING...</div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-black safe-top safe-bottom h-full overflow-hidden relative">
      <audio
        ref={audioRef}
        src={audioUrl}
        playsInline
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <header className="px-6 py-4 flex items-center justify-between shrink-0">
        <button onClick={onBack} className="p-2 text-neutral-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-[10px] tracking-[0.3em] text-neutral-600 font-black uppercase">R.S Audiobooks</span>
        <button onClick={() => setShowChapters(true)} className="p-2 text-purple-500">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center px-8 pb-8 overflow-y-auto no-scrollbar">
        <div className="w-full aspect-square max-w-[300px] rounded-[40px] overflow-hidden mb-8 shadow-2xl border border-white/5">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-black uppercase tracking-tight line-clamp-1">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 font-bold text-[10px] tracking-widest uppercase">{item.media.metadata.authorName}</p>
        </div>

        <div className="w-full mb-10">
          <div className="text-5xl font-bold text-center mb-4 tabular-nums">
            {formatTime(currentTime)}
          </div>
          <div className="relative w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
            <div 
              className="absolute h-full bg-purple-600 transition-all duration-300" 
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between w-full max-w-[280px]">
          <button onClick={() => skip(-15)} className="text-neutral-500 p-2"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg></button>
          <button onClick={togglePlay} className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all">
            {isPlaying ? <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <button onClick={() => skip(30)} className="text-neutral-500 p-2"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg></button>
        </div>
      </div>
      
      {/* Chapter Overlay could go here - simplified for space */}
    </div>
  );
};

export default Player;
