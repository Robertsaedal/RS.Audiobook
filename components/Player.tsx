import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthState, ABSLibraryItem, ABSChapter } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Timer, Info, X, Activity, Plus, Minus, AlertCircle } from 'lucide-react';

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
  const [showInfo, setShowInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  
  const [sleepChapters, setSleepChapters] = useState<number>(0);

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

  const timeUntilSleep = useMemo(() => {
    if (sleepChapters <= 0 || !chapters.length || currentChapterIndex === -1) return null;
    const targetChapterIdx = Math.min(chapters.length - 1, currentChapterIndex + (sleepChapters - 1));
    const targetEndTime = chapters[targetChapterIdx].end;
    return Math.max(0, targetEndTime - currentTime);
  }, [sleepChapters, chapters, currentChapterIndex, currentTime]);

  useEffect(() => {
    if (sleepChapters > 0 && timeUntilSleep !== null && timeUntilSleep <= 0.5) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
        setSleepChapters(0);
      }
    }
  }, [timeUntilSleep, sleepChapters]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || isLoading || error) return;
    try {
      if (audioRef.current.paused) {
        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("Playback toggle failed", err);
    }
  }, [isLoading, error]);

  const skipChapter = useCallback((direction: number) => {
    if (!chapters.length || !audioRef.current) return;
    const targetIdx = Math.max(0, Math.min(chapters.length - 1, currentChapterIndex + direction));
    audioRef.current.currentTime = chapters[targetIdx].start;
    setCurrentTime(chapters[targetIdx].start);
  }, [chapters, currentChapterIndex]);

  const setupMediaSession = useCallback(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.media.metadata.title,
        artist: item.media.metadata.authorName,
        album: item.media.metadata.seriesName || 'R.S Audio',
        artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/png' }]
      });

      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('seekbackward', () => { if(audioRef.current) audioRef.current.currentTime -= 15; });
      navigator.mediaSession.setActionHandler('seekforward', () => { if(audioRef.current) audioRef.current.currentTime += 30; });
      navigator.mediaSession.setActionHandler('previoustrack', () => skipChapter(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => skipChapter(1));
    }
  }, [item, coverUrl, togglePlay, skipChapter]);

  useEffect(() => {
    isMounted.current = true;
    const init = async () => {
      setError(null);
      setIsLoading(true);
      try {
        const [details, playbackSession] = await Promise.all([
          absService.getItemDetails(item.id),
          absService.startPlaybackSession(item.id)
        ]);

        if (!isMounted.current) return;

        if (!details || !playbackSession) {
          throw new Error("Failed to initialize playback session. Check server connection.");
        }

        setChapters(details.media.chapters || []);
        const progress = details.userProgress || await absService.getProgress(item.id);
        const startAt = progress?.currentTime || 0;

        if (audioRef.current) {
          const hlsUrl = `${auth.serverUrl}/api/items/${item.id}/play/${playbackSession.id}/hls/m3u8?token=${auth.user?.token}`;
          
          if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();
            hlsRef.current = new Hls({ 
              enableWorker: true,
              maxBufferLength: 20,
              maxMaxBufferLength: 40,
              startPosition: startAt,
              autoStartLoad: true,
              lowLatencyMode: true,
              backBufferLength: 60
            });
            
            hlsRef.current.attachMedia(audioRef.current);
            hlsRef.current.on(Hls.Events.MEDIA_ATTACHED, () => {
              hlsRef.current?.loadSource(hlsUrl);
            });
            
            hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
              if (isMounted.current) {
                setIsLoading(false);
              }
            });

            hlsRef.current.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                console.error("Fatal HLS Error:", data.type);
                if (isMounted.current) {
                  setError("Stream encounterd a fatal error. Reconnecting...");
                  hlsRef.current?.destroy();
                }
              }
            });
          } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS (iOS/Safari)
            audioRef.current.src = hlsUrl;
            audioRef.current.addEventListener('loadedmetadata', () => {
              if (audioRef.current && isMounted.current) {
                audioRef.current.currentTime = startAt;
                setCurrentTime(startAt);
                setIsLoading(false);
              }
            }, { once: true });
            
            audioRef.current.addEventListener('error', () => {
              if (isMounted.current) setError("Native audio link failed.");
            }, { once: true });
          } else {
            throw new Error("HLS playback is not supported in this browser.");
          }

          setupMediaSession();
        }
      } catch (e: any) { 
        console.error("Player initialization error", e);
        if (isMounted.current) {
          setError(e.message || "Archive link failed.");
          setIsLoading(false);
        }
      }
    };

    init();
    return () => { 
      isMounted.current = false;
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [item.id, absService, auth]);

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

  const formatTime = (s: number) => {
    if (isNaN(s)) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isLoading) return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-black gap-4 z-50">
      <div className="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">Establishing Archive Link...</p>
      <button onClick={onBack} className="mt-8 text-[10px] font-black uppercase tracking-widest text-neutral-500 underline">Abort Sync</button>
    </div>
  );

  if (error) return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-black p-10 gap-6 text-center">
      <AlertCircle size={48} className="text-red-500 animate-pulse" />
      <div className="space-y-2">
        <h2 className="text-lg font-black uppercase tracking-tighter text-white">Archive Link Severed</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{error}</p>
      </div>
      <button 
        onClick={() => window.location.reload()} 
        className="px-10 py-4 bg-purple-600 rounded-full font-black uppercase text-[10px] tracking-[0.3em] active:scale-95 transition-all"
      >
        Re-establish Connection
      </button>
      <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-neutral-700">Return to Library</button>
    </div>
  );

  return (
    <div className="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none">
      <audio 
        ref={audioRef} 
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)} 
        preload="auto"
        crossOrigin="anonymous"
      />
      
      <header className="px-8 pt-10 pb-4 flex justify-between items-center z-20 shrink-0">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 bg-neutral-900/40 px-4 py-2 rounded-full border border-white/5 active:scale-95 transition-all">Archive Exit</button>
        <button onClick={() => setShowChapters(true)} className="flex items-center gap-2 bg-neutral-900/60 px-4 py-2 rounded-full border border-white/5 group active:scale-95 transition-all max-w-[50%]">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-500 truncate">
            {currentChapter?.title || 'Index'}
          </span>
          <ChevronDown size={14} className="text-purple-500 flex-shrink-0" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-between px-8 py-4 overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center mb-6 relative">
          <button 
            onClick={() => setShowInfo(true)}
            className="aspect-square w-full max-w-[320px] relative group active:scale-95 transition-all shadow-2xl"
          >
            <img src={coverUrl} className="w-full h-full object-cover rounded-[56px] border border-white/10" alt="" />
            <div className="absolute top-6 right-6 p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <Info size={18} className="text-white" />
            </div>
            {sleepChapters > 0 && (
               <div className="absolute top-6 left-6 flex items-center gap-2 bg-purple-600/90 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl">
                 <Timer size={14} className="text-white" />
                 <span className="text-[10px] font-black font-mono text-white">
                   {formatTime(timeUntilSleep || 0)}
                 </span>
               </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[56px]" />
          </button>
        </div>

        <div className="w-full space-y-6 shrink-0 pb-8 max-w-xl mx-auto">
          <div className="flex flex-col items-center justify-center text-center w-full px-4 space-y-2">
            {item.media.metadata.seriesName && (
              <div className="px-3 py-1 rounded-full bg-neutral-900 border border-white/10 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                  {item.media.metadata.seriesName} #{item.media.metadata.sequence}
                </span>
              </div>
            )}
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter leading-tight line-clamp-1 w-full">{item.media.metadata.title}</h1>
            <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em]">{item.media.metadata.authorName}</p>
          </div>

          <div className="flex justify-between items-center px-4">
             <div className="flex flex-col items-start">
               <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest mb-1">Chapter End</span>
               <span className="text-xs font-mono font-bold text-purple-500">-{formatTime(chapterRemaining)}</span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest mb-1">Total Rem.</span>
               <span className="text-xs font-mono font-bold text-neutral-500">{formatTime(duration - currentTime)}</span>
             </div>
          </div>

          <div className="px-2">
            <div className="h-1.5 w-full bg-neutral-900 rounded-full relative overflow-hidden">
              <div className="h-full gradient-aether shadow-aether-glow transition-all duration-300" style={{ width: `${chapterProgress}%` }} />
            </div>
            <div className="flex justify-between mt-3 px-1">
              <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest truncate max-w-[70%]">{currentChapter?.title || 'Reading...'}</span>
              <span className="text-[9px] font-black text-neutral-700 tabular-nums">{Math.round(chapterProgress)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 md:gap-10 w-full py-4">
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 15; }} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-75">
              <SkipBack size={32} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="w-20 h-20 md:w-24 md:h-24 gradient-aether rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
              {isPlaying ? <Pause size={38} className="text-white fill-current" /> : <Play size={38} className="text-white fill-current translate-x-1" />}
            </button>
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 30; }} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-75">
              <SkipForward size={32} fill="currentColor" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-2">
            <div className="bg-neutral-900/40 rounded-[32px] p-5 flex flex-col items-center justify-center border border-white/5 backdrop-blur-md">
              <span className="text-[8px] font-black text-neutral-700 uppercase tracking-[0.2em] mb-3">Sync Speed</span>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setPlaybackSpeed(s => Math.max(0.5, s - 0.1))} 
                  className="w-10 h-10 flex items-center justify-center bg-black/40 rounded-full text-neutral-400 hover:text-white active:scale-90 transition-all border border-white/5"
                >
                  <Minus size={16} />
                </button>
                <span className="text-xs font-black text-purple-500 tracking-widest font-mono">{playbackSpeed.toFixed(1)}x</span>
                <button 
                  onClick={() => setPlaybackSpeed(s => Math.min(2.5, s + 0.1))} 
                  className="w-10 h-10 flex items-center justify-center bg-black/40 rounded-full text-neutral-400 hover:text-white active:scale-90 transition-all border border-white/5"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className={`bg-neutral-900/40 rounded-[32px] p-5 flex flex-col items-center justify-center border transition-all backdrop-blur-md ${sleepChapters > 0 ? 'border-purple-600/40 bg-purple-600/5' : 'border-white/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Timer size={10} className={sleepChapters > 0 ? 'text-purple-500' : 'text-neutral-700'} />
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${sleepChapters > 0 ? 'text-purple-500' : 'text-neutral-700'}`}>
                  {sleepChapters > 0 ? 'Archive Suspension' : 'Suspension'}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setSleepChapters(s => Math.max(0, s - 1))} 
                  className="w-10 h-10 flex items-center justify-center bg-black/40 rounded-full text-neutral-400 hover:text-white active:scale-90 transition-all border border-white/5"
                >
                  <Minus size={16} />
                </button>
                <div className="flex flex-col items-center justify-center min-w-[50px]">
                  <span className="text-xs font-black text-white tracking-widest font-mono">
                    {sleepChapters === 0 ? 'OFF' : `${sleepChapters} Ch`}
                  </span>
                  {sleepChapters > 0 && (
                    <span className="text-[7px] font-black text-purple-500 uppercase tracking-widest mt-0.5">
                      {formatTime(timeUntilSleep || 0)}
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setSleepChapters(s => Math.min(10, s + 1))} 
                  className="w-10 h-10 flex items-center justify-center bg-black/40 rounded-full text-neutral-400 hover:text-white active:scale-90 transition-all border border-white/5"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showChapters && (
        <div className="fixed inset-0 z-[100] animate-fade-in flex flex-col bg-black">
          <header className="px-8 pt-10 pb-6 border-b border-white/5 flex justify-between items-center shrink-0">
            <h2 className="text-xl font-black uppercase tracking-widest text-purple-500">Archive Index</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-2.5 rounded-full text-neutral-500 active:scale-90"><X size={20}/></button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar max-w-2xl mx-auto w-full">
            {chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) { audioRef.current.currentTime = ch.start; setCurrentTime(ch.start); setShowChapters(false); }}}
                className={`w-full flex items-center justify-between p-6 rounded-[32px] mb-3 transition-all ${currentChapterIndex === i ? 'bg-purple-600/10 border border-purple-600/30' : 'hover:bg-neutral-900 border border-transparent'}`}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className={`text-sm font-black uppercase tracking-tight text-left ${currentChapterIndex === i ? 'text-purple-500' : 'text-neutral-300'}`}>{ch.title}</span>
                  <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest">{formatTime(ch.end - ch.start)} Entry</span>
                </div>
                {currentChapterIndex === i ? <Activity size={16} className="text-purple-500 animate-pulse" /> : <span className="text-[10px] font-mono text-neutral-800">{formatTime(ch.start)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-[100] animate-fade-in flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl">
          <div className="bg-neutral-900 w-full max-w-xl rounded-[56px] border border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
             <div className="p-10 space-y-8 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-start">
                   <div className="space-y-2">
                     <h3 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">{item.media.metadata.title}</h3>
                     <p className="text-purple-500 text-[11px] font-black uppercase tracking-[0.4em]">{item.media.metadata.authorName}</p>
                   </div>
                   <button onClick={() => setShowInfo(false)} className="p-3 bg-black/40 rounded-full text-neutral-500 active:scale-90"><X size={24}/></button>
                </div>
                <div className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-700">Archive Notes</h4>
                   <p className="text-[13px] text-neutral-400 font-medium leading-relaxed uppercase tracking-wide">
                      {item.media.metadata.description || 'No archive description available.'}
                   </p>
                </div>
                <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-10">
                   <div className="space-y-2">
                      <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest">Total Duration</span>
                      <p className="text-sm font-black text-white font-mono">{formatTime(duration)}</p>
                   </div>
                   <div className="space-y-2">
                      <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest">Archive Depth</span>
                      <p className="text-sm font-black text-white font-mono">{chapters.length} Records</p>
                   </div>
                </div>
             </div>
             <button onClick={() => setShowInfo(false)} className="w-full py-8 bg-white/5 text-[11px] font-black uppercase tracking-[0.6em] text-neutral-500 hover:bg-white/10 transition-colors border-t border-white/5">Close Portal</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;