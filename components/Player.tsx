
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuthState, ABSLibraryItem, ABSChapter, ABSPlaybackSession } from '../types';
import { ABSService } from '../services/absService';
import Hls from 'hls.js';
// Added Clock to the imports from lucide-react
import { ChevronDown, Play, Pause, RotateCcw, RotateCw, SkipBack, SkipForward, Timer, Info, X, Clock } from 'lucide-react';

interface PlayerProps {
  auth: AuthState;
  item: ABSLibraryItem;
  onBack: () => void;
}

const Player: React.FC<PlayerProps> = ({ auth, item, onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isMounted = useRef(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [session, setSession] = useState<ABSPlaybackSession | null>(null);
  const [sleepTimeRemaining, setSleepTimeRemaining] = useState<number | null>(null);

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

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

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
      navigator.mediaSession.setActionHandler('previoustrack', () => skipChapter(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => skipChapter(1));
    }
  }, [item, coverUrl, togglePlay]);

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
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
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

  const skipChapter = (direction: number) => {
    if (!chapters.length || !audioRef.current) return;
    const targetIdx = Math.max(0, Math.min(chapters.length - 1, currentChapterIndex + direction));
    audioRef.current.currentTime = chapters[targetIdx].start;
    setCurrentTime(chapters[targetIdx].start);
  };

  const startSleepTimer = (minutes: number | 'end_chapter') => {
    if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    setShowSleep(false);

    if (minutes === 'end_chapter') {
      const remaining = chapterRemaining;
      setSleepTimeRemaining(remaining);
      sleepTimerRef.current = window.setInterval(() => {
        setSleepTimeRemaining(prev => {
          if (prev && prev <= 1) {
            audioRef.current?.pause();
            setIsPlaying(false);
            clearInterval(sleepTimerRef.current!);
            return null;
          }
          return (prev || 0) - 1;
        });
      }, 1000);
    } else {
      let seconds = minutes * 60;
      setSleepTimeRemaining(seconds);
      sleepTimerRef.current = window.setInterval(() => {
        setSleepTimeRemaining(prev => {
          if (prev && prev <= 1) {
            audioRef.current?.pause();
            setIsPlaying(false);
            clearInterval(sleepTimerRef.current!);
            return null;
          }
          return (prev || 0) - 1;
        });
      }, 1000);
    }
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
    <div className="h-[100dvh] w-full bg-black text-white flex flex-col relative overflow-hidden font-sans select-none">
      <audio 
        ref={audioRef} 
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)} 
        preload="auto" 
      />
      
      <header className="px-8 pt-10 pb-4 flex justify-between items-center z-20 shrink-0">
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Close</button>
        <button onClick={() => setShowChapters(true)} className="flex items-center gap-2 bg-neutral-900/60 px-4 py-2 rounded-full border border-white/5">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-aether-purple">Chapters</span>
          <ChevronDown size={14} className="text-aether-purple" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-between px-8 py-4 overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center mb-8 relative">
          <button 
            onClick={() => setShowInfo(true)}
            className="aspect-square w-full max-w-[340px] relative group active:scale-95 transition-all shadow-2xl"
          >
            <img src={coverUrl} className="w-full h-full object-cover rounded-[56px] border border-white/10 group-hover:opacity-80 transition-opacity" />
            <div className="absolute top-6 right-6 p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <Info size={18} className="text-white" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[56px]" />
          </button>
        </div>

        <div className="w-full space-y-8 shrink-0 pb-10">
          <div className="flex flex-col items-center justify-center text-center w-full px-4 space-y-2">
            {item.media.metadata.seriesName && (
              <div className="px-3 py-1 rounded-full bg-neutral-900 border border-white/10 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                  {item.media.metadata.seriesName} #{item.media.metadata.sequence || '1'}
                </span>
              </div>
            )}
            <h1 className="text-2xl font-black uppercase tracking-tight leading-tight line-clamp-2 w-full">{item.media.metadata.title}</h1>
            <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em]">{item.media.metadata.authorName}</p>
          </div>

          <div className="flex justify-between items-center px-4">
             <div className="flex flex-col items-start">
               <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest mb-1">Chapter Time</span>
               <span className="text-xs font-mono font-bold text-aether-purple">-{formatTime(chapterRemaining)}</span>
             </div>
             {sleepTimeRemaining && (
               <div className="flex items-center gap-2 bg-aether-purple/10 px-3 py-1 rounded-full border border-aether-purple/20">
                 <Timer size={10} className="text-aether-purple" />
                 <span className="text-[9px] font-black font-mono text-aether-purple">{formatTime(sleepTimeRemaining)}</span>
               </div>
             )}
             <div className="flex flex-col items-end">
               <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest mb-1">Total Time</span>
               <span className="text-xs font-mono font-bold text-neutral-500">{formatTime(duration - currentTime)}</span>
             </div>
          </div>

          <div className="px-2">
            <div className="h-1 w-full bg-neutral-900 rounded-full relative group">
              <div className="h-full gradient-aether rounded-full shadow-aether-glow" style={{ width: `${chapterProgress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-2xl -mr-2" />
              </div>
            </div>
            <div className="flex justify-between mt-3 px-1">
              <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest">{currentChapter?.title || 'Chapter'}</span>
              <span className="text-[9px] font-black text-neutral-700 tabular-nums">{Math.round(chapterProgress)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 w-full py-4">
            <button onClick={() => startSleepTimer('end_chapter')} className={`p-4 rounded-2xl transition-all ${sleepTimeRemaining ? 'text-aether-purple bg-aether-purple/10' : 'text-neutral-600 hover:text-white'}`} title="Chapter Timer">
              <Timer size={20} />
            </button>
            <button onClick={() => skipChapter(-1)} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-90">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 15; }} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-90">
              <RotateCcw size={28} />
            </button>
            <button onClick={togglePlay} className="w-20 h-20 gradient-aether rounded-full flex items-center justify-center shadow-aether-glow active:scale-95 transition-all">
              {isPlaying ? <Pause size={32} className="text-white fill-current" /> : <Play size={32} className="text-white fill-current translate-x-1" />}
            </button>
            <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 30; }} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-90">
              <RotateCw size={28} />
            </button>
            <button onClick={() => skipChapter(1)} className="p-4 text-neutral-400 hover:text-white transition-all active:scale-90">
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button onClick={() => setShowSleep(true)} className="p-4 text-neutral-600 hover:text-white transition-all">
              <Clock size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-4">
            <div className="bg-neutral-900/40 rounded-[32px] p-5 flex flex-col items-center justify-center border border-white/5 backdrop-blur-md">
              <span className="text-[8px] font-black text-neutral-700 uppercase tracking-[0.2em] mb-3">Playback Speed</span>
              <div className="flex items-center gap-6">
                <button onClick={() => setPlaybackSpeed(s => Math.max(0.5, s - 0.1))} className="text-neutral-500 font-black text-xl hover:text-white">-</button>
                <span className="text-sm font-black text-aether-purple tracking-widest">{playbackSpeed.toFixed(1)}X</span>
                <button onClick={() => setPlaybackSpeed(s => Math.min(2.5, s + 0.1))} className="text-neutral-500 font-black text-xl hover:text-white">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chapter Sheet Overlay */}
      {showChapters && (
        <div className="fixed inset-0 z-[100] animate-fade-in flex flex-col bg-black">
          <header className="px-8 pt-10 pb-6 border-b border-white/5 flex justify-between items-center shrink-0">
            <h2 className="text-xl font-black uppercase tracking-widest text-aether-purple">Index</h2>
            <button onClick={() => setShowChapters(false)} className="bg-neutral-900 p-2.5 rounded-full text-neutral-500"><X size={20}/></button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            {chapters.map((ch, i) => (
              <button 
                key={i} 
                onClick={() => { if(audioRef.current) { audioRef.current.currentTime = ch.start; setCurrentTime(ch.start); setShowChapters(false); }}}
                className={`w-full flex items-center justify-between p-5 rounded-[24px] mb-2 transition-all ${currentChapterIndex === i ? 'bg-aether-purple/10 border border-aether-purple/30' : 'hover:bg-neutral-900 border border-transparent'}`}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className={`text-[11px] font-black uppercase tracking-tight text-left ${currentChapterIndex === i ? 'text-aether-purple' : 'text-neutral-300'}`}>{ch.title}</span>
                  <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Starts at {formatTime(ch.start)}</span>
                </div>
                {currentChapterIndex === i && <Play size={12} className="text-aether-purple fill-current" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-[100] animate-fade-in flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
          <div className="bg-neutral-900 w-full max-w-lg rounded-[48px] border border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
             <div className="p-8 space-y-6 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-start">
                   <div>
                     <h3 className="text-2xl font-black uppercase tracking-tighter text-white">{item.media.metadata.title}</h3>
                     <p className="text-aether-purple text-[11px] font-black uppercase tracking-[0.3em] mt-1">{item.media.metadata.authorName}</p>
                   </div>
                   <button onClick={() => setShowInfo(false)} className="text-neutral-500"><X size={24}/></button>
                </div>
                <div className="space-y-4">
                   <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-neutral-700">Description</h4>
                   <p className="text-xs text-neutral-400 font-medium leading-relaxed uppercase">
                      {item.media.metadata.description || 'No archive notes available for this title.'}
                   </p>
                </div>
                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-8">
                   <div className="space-y-1">
                      <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest">Duration</span>
                      <p className="text-[10px] font-black text-white">{formatTime(duration)}</p>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[8px] font-black text-neutral-700 uppercase tracking-widest">Chapters</span>
                      <p className="text-[10px] font-black text-white">{chapters.length}</p>
                   </div>
                </div>
             </div>
             <button onClick={() => setShowInfo(false)} className="w-full py-6 bg-white/5 text-[10px] font-black uppercase tracking-[0.5em] text-neutral-500 hover:bg-white/10 transition-colors border-t border-white/5">Close Record</button>
          </div>
        </div>
      )}

      {/* Sleep Timer Overlay */}
      {showSleep && (
        <div className="fixed inset-0 z-[100] animate-fade-in flex items-end justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-950 w-full max-w-md rounded-t-[48px] p-10 space-y-8 animate-slide-up border-t border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-600">Archive Suspension</h3>
              <button onClick={() => setShowSleep(false)} className="text-neutral-500"><X size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[15, 30, 45, 60].map(mins => (
                <button 
                  key={mins} 
                  onClick={() => startSleepTimer(mins)}
                  className="bg-neutral-900 py-6 rounded-[28px] text-[10px] font-black uppercase tracking-widest hover:bg-aether-purple/20 transition-all border border-white/5"
                >
                  {mins} Minutes
                </button>
              ))}
              <button 
                onClick={() => startSleepTimer('end_chapter')}
                className="col-span-2 bg-aether-purple/10 py-6 rounded-[28px] text-[10px] font-black uppercase tracking-widest hover:bg-aether-purple/30 transition-all border border-aether-purple/20 text-aether-purple"
              >
                End of Current Chapter
              </button>
            </div>
            {sleepTimeRemaining && (
               <button 
                 onClick={() => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); setSleepTimeRemaining(null); setShowSleep(false); }}
                 className="w-full py-4 text-[9px] font-black text-red-500 uppercase tracking-widest"
               >
                 Cancel Active Timer
               </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;
