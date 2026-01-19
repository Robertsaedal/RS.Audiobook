
import { ABSUser, ABSLibraryItem, ABSProgress } from '../types';
import { io, Socket } from 'socket.io-client';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private libraryId: string | null = null;
  private socket: Socket | null = null;

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
    this.initSocket();
  }

  private initSocket() {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      autoConnect: true,
    });
  }

  onProgressUpdate(callback: (progress: ABSProgress) => void) {
    this.socket?.on('user_item_progress_updated', (data) => {
      if (data && data.itemId) callback(data);
    });
  }

  onLibraryUpdate(callback: () => void) {
    this.socket?.on('item_added', callback);
    this.socket?.on('item_removed', callback);
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    let baseUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    if (!response.ok) throw new Error(`Login failed: ${await response.text()}`);
    return response.json();
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const url = `${this.serverUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const response = await fetch(url, {
      ...options,
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) return null;
    return response.json();
  }

  normalizeDate(date: string | number | undefined): number {
    if (!date) return 0;
    if (typeof date === 'number') return date;
    const parsed = Date.parse(date);
    return isNaN(parsed) ? (parseInt(date, 10) || 0) : parsed;
  }

  async getMeProgress(): Promise<any> {
    return this.fetchApi('/api/me/progress');
  }

  async getProgress(itemId: string): Promise<ABSProgress | null> {
    return this.fetchApi(`/api/me/progress/${itemId}`);
  }

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    const data = await this.fetchApi('/api/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    this.libraryId = audioLibrary?.id;
    return this.libraryId!;
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    // Use official include=progress to get accurate local progress state
    const data = await this.fetchApi(`/api/libraries/${libId}/items?include=progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}?include=progress`);
  }

  async startPlaybackSession(itemId: string): Promise<any> {
    return this.fetchApi(`/api/items/${itemId}/play`, { method: 'POST' });
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progressData = {
      currentTime,
      duration,
      progress: duration > 0 ? currentTime / duration : 0,
      isFinished: currentTime >= duration - 10 && duration > 0,
      lastUpdate: Date.now()
    };
    try {
      await fetch(`${this.serverUrl}/api/users/me/progress/${itemId}`, {
        method: 'PATCH',
        mode: 'cors',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progressData),
      });
    } catch (e) {
      console.warn("Sync failed");
    }
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
