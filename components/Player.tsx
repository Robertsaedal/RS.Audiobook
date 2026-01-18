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

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    const audioFiles = item.media.audioFiles || [];
    const url = audioFiles.length > 0 
      ? `${auth.serverUrl}/api/items/${item.id}/file/${audioFiles[0].id}?token=${auth.user?.token}`
      : `${auth.serverUrl}/api/items/${item.id}/file/${item.id}?token=${auth.user?.token}`;
    console.log("✅ Audio URL:", url);
    return url;
  }, [item, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item, absService]);

  useEffect(() => {
    isMounted.current = true;
    const initPlayer = async () => {
      setIsLoading(true);
      try {
        const [details, progress] = await Promise.allSettled([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (isMounted.current) {
          if (details.status === 'fulfilled' && details.value.media.chapters) {
            setChapters(details.value.media.chapters);
          }
          if (progress.status === 'fulfilled' && progress.value && audioRef.current) {
            const savedTime = progress.value.currentTime || 0;
            audioRef.current.currentTime = savedTime;
            setCurrentTime(savedTime);
          }
        }
      } catch (e) { console.error("Init error", e); }
      finally { if (isMounted.current) setIsLoading(false); }
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
    if (!audioRef.current) return;
    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (audioRef.current.readyState === 0) audioRef.current.load();
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (e) { console.error("Playback failed", e); }
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center bg-black text-purple-500 font-black">LOADING...</div>;

  return (
    <div className="flex-1 flex flex-col bg-black text-white h-full overflow-hidden relative">
      <audio
        key={audioUrl}
        ref={audioRef}
        src={audioUrl}
        playsInline
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <header className="px-6 py-4 flex justify-between items-center">
        <button onClick={onBack} className="text-neutral-400 p-2">BACK</button>
        <span className="text-[10px] tracking-widest font-black uppercase">R.S Audiobooks</span>
        <button onClick={() => setShowChapters(true)} className="text-purple-500 p-2">CH</button>
      </header>

      <div className="flex-1 flex flex-col items-center px-8">
        <div className="w-full aspect-square max-w-[300px] rounded-3xl overflow-hidden mb-8 border border-white/10 shadow-2xl">
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-black uppercase truncate max-w-[280px]">{item.media.metadata.title}</h1>
          <p className="text-neutral-500 text-xs font-bold uppercase">{item.media.metadata.authorName}</p>
        </div>

        <div className="w-full mb-10 text-center">
          <div className="text-5xl font-bold tabular-nums mb-4">{formatTime(currentTime)}</div>
          <div className="h-1.5 w-full bg-neutral-900 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 transition-all" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-12">
          <button onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)} className="text-neutral-400">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
          </button>
          <button onClick={togglePlay} className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center shadow-xl">
            {isPlaying ? <span className="text-3xl">II</span> : <span className="text-3xl ml-1">▶</span>}
          </button>
          <button onClick={() => audioRef.current && (audioRef.current.currentTime += 30)} className="text-neutral-400">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
          </button>
        </div>
      </div>

      {showChapters && (
        <div className="fixed inset-0 bg-neutral-950 z-50 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black uppercase">Chapters</h2>
            <button onClick={() => setShowChapters(false)}>CLOSE</button>
          </div>
          {chapters.map((ch, i) => (
            <button key={i} onClick={() => { if(audioRef.current) audioRef.current.currentTime = ch.start; setShowChapters(false); }}
              className="w-full text-left p-4 mb-2 bg-neutral-900 rounded-xl border border-white/5 text-sm">
              {ch.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Player;
