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
  const [isPopping, setIsPopping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [chapters, setChapters] = useState<ABSChapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);
  const duration = item.media.duration || 0;

  // 1. DYNAMIC AUDIO URL CONSTRUCTION
  const audioUrl = useMemo(() => {
    // Check if we have audio files in the item object
    const audioFiles = item.media.audioFiles || [];
    
    if (audioFiles.length > 0) {
      const fileId = audioFiles[0].id;
      const url = `${auth.serverUrl}/api/items/${item.id}/file/${fileId}?token=${auth.user?.token}`;
      console.log("✅ Audio URL Generated:", url);
      return url;
    } 
    
    // Fallback logic if audioFiles array is missing but we have the ID
    console.warn("⚠️ No audioFiles found in item object, using fallback ID logic");
    return `${auth.serverUrl}/api/items/${item.id}/file/${item.id}?token=${auth.user?.token}`;
  }, [item, auth]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item, absService]);

  // 2. INITIALIZATION & PROGRESS FETCH
  useEffect(() => {
    isMounted.current = true;
    const initPlayer = async () => {
      setIsLoading(true);
      try {
        console.log("initPlayer: Fetching details and progress for", item.id);
        const [detailsResult, progressResult] = await Promise.allSettled([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (isMounted.current) {
          if (detailsResult.status === 'fulfilled' && detailsResult.value.media.chapters) {
            setChapters(detailsResult.value.media.chapters);
          }
          
          if (progressResult.status === 'fulfilled' && progressResult.value && audioRef.current) {
            const savedTime = progressResult.value.currentTime || 0;
            console.log("✅ Progress found, resuming at:", savedTime);
            audioRef.current.currentTime = savedTime;
            setCurrentTime(savedTime);
          } else {
            console.log("ℹ️ No progress found (404 is normal here). Starting at 0.");
          }
        }
      } catch (e) {
        console.error("Player init error:", e);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
