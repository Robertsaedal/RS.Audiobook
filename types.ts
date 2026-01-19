
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

export interface ABSSeries {
  id: string;
  name: string;
  libraryItemIds: string[];
  items?: ABSLibraryItem[];
}

export interface ABSProgress {
  itemId: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
}

export interface ABSPlaybackSession {
  id: string;
  userId: string;
  libraryItemId: string;
  displayTitle: string;
  displayAuthor: string;
  duration: number;
  playMethod: number; // 0=Direct, 1=HLS
  mediaMetadata: any;
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
