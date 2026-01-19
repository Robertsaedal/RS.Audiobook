
export interface ABSUser {
  id: string;
  username: string;
  token: string;
}

export interface ABSChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface ABSAudioFile {
  id?: string;
  ino?: string;
  index: number;
  duration: number;
  metadata?: any;
}

export interface ABSLibraryItem {
  id: string;
  addedDate: number | string;
  mediaType: string;
  media: {
    metadata: {
      title: string;
      authorName: string;
      description?: string;
      seriesName?: string;
      sequence?: string;
    };
    duration: number;
    chapters: ABSChapter[];
    audioFiles: ABSAudioFile[];
    coverPath?: string;
  };
  userProgress?: ABSProgress;
}

export interface ABSProgress {
  itemId: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
}

/**
 * Interface representing a playback session in Audiobookshelf.
 * Required by Player.tsx for managing the streaming session state.
 */
export interface ABSPlaybackSession {
  id: string;
}

export interface AuthState {
  user: ABSUser | null;
  serverUrl: string;
}

export enum AppScreen {
  LOGIN = 'LOGIN',
  LIBRARY = 'LIBRARY',
  PLAYER = 'PLAYER'
}
