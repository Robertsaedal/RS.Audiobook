
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthState, ABSLibraryItem, ABSChapter, ABSPlaybackSession } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';

interface PlayerProps {
  auth: AuthState;
  item: ABSLibraryItem;
  onBack: () => void;
}

const Player: React.FC<PlayerProps> = ({ auth, item, onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [session, setSession] = useState<ABSPlaybackSession | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item.id, absService]);

  const currentChapterIndex = useMemo(() => {
    if (!chapters.length) return -1;
    return chapters.findIndex((ch, i) => 
      currentTime >= ch.start && (i === chapters.length - 1 || currentTime < (chapters[i+1]?.start || ch.end))
    );
  }, [chapters, currentTime]);

  const currentChapter = useMemo(() => currentChapterIndex !== -1 ? chapters[currentChapterIndex] : null, [chapters, currentChapterIndex]);
  const chapterRemaining = currentChapter ? Math.max(0, currentChapter.end - currentTime) : 0;
  const chapterProgress = currentChapter ? ((currentTime - currentChapter.start) / (currentChapter.end - currentChapter.start)) * 100 : 0;

  // Media Session Setup
  const setupMediaSession = useCallback(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        album: item.media.metadata.seriesName || 'Audiobook',
        artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/png' }]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('seekbackward', () => { if(audioRef.current) audioRef.current.currentTime -= 15; });
      navigator.mediaSession.setActionHandler('seekforward', () => { if(audioRef.current) audioRef.current.currentTime += 30; });
    }
  }, [item, coverUrl]);

  useEffect(() => {
    isMounted.current = true;
    const init = async () => {
      try {
        const [details, playbackSession] = await Promise.all([
          absService.getItemDetails(item.id),
          absService.startPlaybackSession(item.id)
        ]);

        if (isMounted.current && details) {
          setChapters(details.media.chapters || []);
          setSession(playbackSession);
          
          const progress = details.userProgress || await absService.getProgress(item.id);
          const startAt = progress?.currentTime || 0;

          if (audioRef.current) {
            // HLS Logic
            const hlsUrl = `${auth.serverUrl}/api/items/${item.id}/play/${playbackSession.id}/hls/m3u8?token=${auth.user?.token}`;
            if (Hls.isSupported()) {
              hlsRef.current = new Hls();
              hlsRef.current.loadSource(hlsUrl);
              hlsRef.current.attachMedia(audioRef.current);
            } else {
              audioRef.current.src = hlsUrl;
            }

            audioRef.current.currentTime = startAt;
            setCurrentTime(startAt);
            setupMediaSession();
          }
        }
      } catch (e) { console.error(e); }
      finally { if (isMounted.current) setIsLoading(false); }
    };
    init();
    return () => { 
      isMounted.current = false;
      hlsRef.current?.destroy();
    };
  }, [item.id, absService, setupMediaSession, auth]);

  const saveProgress = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 0) {
      absService.saveProgress(item.id, audioRef.current.currentTime, duration);
    }
  }, [item.id, duration, absService]);

  useEffect(() => {
    if (isPlaying) syncIntervalRef.current = window.setInterval(saveProgress, 15000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); saveProgress(); };
  }, [isPlaying, saveProgress]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

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
      <audio ref={audioRef} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onEnded={() => setIsPlaying(false)} preload="auto" />
      
      <header className="px-8 pt-10 pb-4 flex justify-between items-center z-10 shrink-0">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Back</button>
        <button onClick={() => setShowChapters(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-aether-purple">Index</button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-between px-8 py-4 overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center mb-8">
          <div className="aspect-square w-full max-w-[320px] relative">
            <img src={coverUrl} className="w-full h-full object-cover rounded-[48px] shadow-2xl border border-white/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[48px]" />
          </div>
        </div>

        <div className="w-full space-y-6 shrink-0">
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
            <div className="text-2xl font-black font-mono-timer text-aether-purple">{formatTime(chapterRemaining)}</div>
          </div>

          <div className="px-2">
            <div className="h-1.5 w-full bg-neutral-900 rounded-full relative">
              <div className="h-full gradient-aether rounded-full" style={{ width: `${chapterProgress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-2xl -mr-2" />
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(currentTime)}</span>
              <span className="text-[9px] font-black text-neutral-600 tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between w-full max-w-[320px] mx-auto py-2">
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 15; }} className="p-3 text-neutral-500 hover:text-white transition-all active:scale-90">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            <button onClick={togglePlay} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
              {isPlaying ? <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-8 h-8 text-white translate-x-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 30; }} className="p-3 text-neutral-500 hover:text-white transition-all active:scale-90">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-12">
            <div className="bg-neutral-900/40 rounded-[28px] p-4 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">Transcoding Active</span>
              <div className="flex items-center gap-4">
                <button onClick={() => setPlaybackSpeed(s => Math.max(0.5, s - 0.1))} className="text-neutral-500 font-bold p-1">-</button>
                <span className="text-base font-black text-aether-purple">{playbackSpeed.toFixed(1)}x</span>
                <button onClick={() => setPlaybackSpeed(s => Math.min(2.0, s + 0.1))} className="text-neutral-500 font-bold p-1">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Player;
