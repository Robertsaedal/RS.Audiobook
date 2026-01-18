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

  const audioUrl = useMemo(() => {
    if (item.media.audioFiles && item.media.audioFiles.length > 0) {
      return absService.getAudioUrl(item.id, item.media.audioFiles[0].id);
    }
    return '';
  }, [item, absService]);
  
  const coverUrl = useMemo(() => absService.getCoverUrl(item.id), [item, absService]);

  // Initial Data Fetch & Resume Logic
  useEffect(() => {
    const initPlayer = async () => {
      setIsLoading(true);
      try {
        const [detailsResult, progressResult] = await Promise.allSettled([
          absService.getItemDetails(item.id),
          absService.getProgress(item.id)
        ]);
        
        if (detailsResult.status === 'fulfilled' && detailsResult.value.media.chapters) {
          setChapters(detailsResult.value.media.chapters);
        }
        
        if (progressResult.status === 'fulfilled' && progressResult.value && audioRef.current) {
          const savedTime = progressResult.value.currentTime;
          audioRef.current.currentTime = savedTime;
          setCurrentTime(savedTime);
        }
      } catch (e) {
        console.warn("Player init partial failure", e);
      } finally {
        setIsLoading(false);
      }
    };
    initPlayer();
  }, [item.id, absService]);

  // Periodic Progress Sync
  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current
