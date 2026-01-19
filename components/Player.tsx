
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
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [chaptersToWait, setChaptersToWait] = useState(0);
  const lastChapterRef = useRef<number>(-1);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  const audioUrl = useMemo(() => {
    const sorted = [...(item.media.audioFiles || [])].sort((a, b) => (a.index || 0) - (b.index || 0));
    if (!sorted.length) return null;
    const fileId = sorted[0].id || sorted[0].ino;
    return `${auth.serverUrl}/api/items/${item.id}/file/${fileId}?token=${auth.user?.token}`;
  }, [item, auth]);

  const currentChapterIndex = useMemo(() => {
    if (!chapters.length) return -1;
    return chapters.findIndex((ch, i) => 
      currentTime >= ch.start && (i === chapters.length - 1 || currentTime < (chapters[i+1]?.start || ch.end))
    );
  }, [chapters, currentTime]);

  const currentChapter = useMemo(() => currentChapterIndex !== -1 ? chapters[currentChapterIndex] : null, [chapters, currentChapterIndex]);
  
  // OFFICIAL LOGIC: Precise chapter math
  const chapterRemaining = currentChapter ? Math.max(0, currentChapter.end - currentTime) : 0;
  const chapterElapsed = currentChapter ? Math.max(0, currentTime - currentChapter.start) : 0;
  const chapterDuration = currentChapter ? currentChapter.end - currentChapter.start : 1;
  const chapterProgress = (chapterElapsed / chapterDuration) * 100;

  useEffect(() => {
    isMounted.current = true;
    const init = async () => {
      try {
        const details = await absService.getItemDetails(item.id);
        if (isMounted.current && details) {
          setChapters(details.media.chapters || []);
          const progress = details.userProgress || await absService.getProgress(item.id);
          const startAt = progress?.currentTime || parseFloat(localStorage.getItem(`rs_pos_${item.id}`) || '0');
          if (audioRef.current) {
            audioRef.current.currentTime = startAt;
            setCurrentTime(startAt);
          }
        }
      } catch (e) { console.error(e); }
      finally { if (isMounted.current) setIsLoading(false); }
    };
    init();
    return () => { isMounted.current = false; };
  }, [item.id, absService]);

  const saveProgress = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 0) {
      absService.saveProgress(item.id, audioRef.current.currentTime, duration);
    }
  }, [item.id, duration, absService]);

  useEffect(() => {
    // Official spec: Periodic sync every 15 seconds while playing
    if (isPlaying) syncIntervalRef.current = window.setInterval(saveProgress, 15000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); saveProgress(); };
  }, [isPlaying, saveProgress]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    if (chaptersToWait > 0 && currentChapterIndex > lastChapterRef.current) {
      const wait = chaptersToWait - (currentChapterIndex - lastChapterRef.current);
      setChaptersToWait(Math.max(0, wait));
      if (wait <= 0 && audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
    lastChapterRef.current = currentChapterIndex;
  }, [currentChapterIndex, chaptersToWait]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) return (
    <div className="h-[100dvh] flex items-center justify-center bg-black">
      <div className="w-12 h-12 border-4 border-aether-purple/20 border-t-aether-purple rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans">
      <audio ref={audioRef} src={audioUrl || ''} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onEnded={() => setIsPlaying(false)} preload="auto" />
      
      <header className="px-8 pt-10 pb-4 flex justify-between items-center z-10 shrink-0">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Close</button>
        <span className="text-[10px] tracking-[0.4em] font-black uppercase text-neutral-800">ABS Link Active</span>
        <button onClick={() => setShowChapters(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-aether-purple">Chapters</button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-between px-8 py-4 overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center mb-8">
          <div className="aspect-square w-full max-w-[320px] relative group">
            <img src={absService.getCoverUrl(item.id)} className="w-full h-full object-cover rounded-[48px] shadow-[0_40px_80px_rgba(157,80,187,0.4)] border border-white/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[48px]" />
            {!isPlaying && (
              <div className="absolute inset-0 m-auto w-16 h-16 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 pointer-events-none">
                <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            )}
          </div>
        </div>

        <div className="w-full space-y-6 shrink-0">
          {/* REWRITE: Properly anchored series badge logic */}
          <div className="flex flex-col items-center justify-center text-center w-full px-4 space-y-2">
            {item.media.metadata.seriesName && (
              <div className="px-3 py-1 rounded-full bg-neutral-900 border border-white/10 shadow-lg">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                  {item.media.metadata.seriesName} {item.media.metadata.sequence ? `#${item.media.metadata.sequence}` : ''}
                </span>
              </div>
            )}
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight leading-tight truncate w-full">{item.media.metadata.title}</h1>
            <p className="text-neutral-500 text-[9px] font-black uppercase tracking-[0.3em]">{item.media.metadata.authorName}</p>
          </div>

          <div className="text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-2">Chapter Remaining</p>
            <div className="text-2xl font-black font-mono-timer text-aether-purple shadow-aether-glow">{formatTime(chapterRemaining)}</div>
          </div>

          <div className="px-2">
            <div className="h-1.5 w-full bg-neutral-900 rounded-full relative">
              <div className="h-full gradient-aether rounded-full" style={{ width: `${chapterProgress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-2xl -mr-2" />
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(chapterElapsed)}</span>
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(currentChapter?.end ? currentChapter.end - currentChapter.start : 0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between w-full max-w-[320px] mx-auto py-2">
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 15; }} className="p-3 text-neutral-500 hover:text-white transition-all active:scale-90">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            <button onClick={togglePlay} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(157,80,187,0.4)] active:scale-95 transition-all">
              {isPlaying ? <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 30; }} className="p-3 text-neutral-500 hover:text-white transition-all active:scale-90">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-12">
            <div className="bg-neutral-900/40 rounded-[28px] p-4 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">Speed (0.5x-2.0x)</span>
              <div className="flex items-center gap-4">
                <button onClick={() => setPlaybackSpeed(s => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))} className="text-neutral-500 font-bold p-1 hover:text-white">-</button>
                <span className="text-base font-black text-aether-purple tabular-nums">{playbackSpeed.toFixed(1)}x</span>
                <button onClick={() => setPlaybackSpeed(s => Math.min(2.0, Math.round((s + 0.1) * 10) / 10))} className="text-neutral-500 font-bold p-1 hover:text-white">+</button>
              </div>
            </div>
            <div className="bg-neutral-900/40 rounded-[28px] p-4 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">Timer (Chapters)</span>
              <div className="flex items-center gap-4">
                <button onClick={() => setChaptersToWait(c => Math.max(0, c - 1))} className="text-neutral-500 font-bold p-1 hover:text-white">-</button>
                <span className={`text-base font-black tabular-nums ${chaptersToWait > 0 ? 'text-aether-purple' : 'text-neutral-800'}`}>{chaptersToWait}</span>
                <button onClick={() => setChaptersToWait(c => Math.min(10, c + 1))} className="text-neutral-500 font-bold p-1 hover:text-white">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showChapters && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-50 p-8 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black uppercase text-aether-purple">Book Index</h2>
            <button onClick={() => setShowChapters(false)} className="text-[10px] font-black uppercase tracking-widest text-white px-6 py-3 bg-neutral-900 rounded-2xl active:scale-95 transition-transform">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-8">
            {chapters.map((ch, i) => (
              <button key={i} onClick={() => { if(audioRef.current) { audioRef.current.currentTime = ch.start; setCurrentTime(ch.start); } setShowChapters(false); }} className={`w-full text-left p-6 rounded-[32px] border transition-all active:scale-[0.98] ${currentChapterIndex === i ? 'bg-aether-purple/10 border-aether-purple/40 text-white' : 'bg-neutral-950 border-white/5 text-neutral-500 hover:border-white/10'}`}>
                <span className="text-sm font-bold truncate pr-4 block">{ch.title || `Chapter ${i + 1}`}</span>
                <span className="text-[10px] font-black opacity-60 tracking-widest tabular-nums">{formatTime(ch.start)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
