
import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';
import { io, Socket } from 'socket.io-client';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private libraryId: string | null = null;
  private socket: Socket | null = null;
  private syncQueueKey = 'abs_sync_queue';

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
    this.initSocket();
    this.processSyncQueue();
  }

  private initSocket() {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => console.log('ABS WebSocket Connected'));
    this.socket.on('connect_error', (err) => console.error('Socket Error:', err));
  }

  onProgressUpdate(callback: (progress: ABSProgress) => void) {
    this.socket?.on('user_item_progress_updated', (data) => {
      // Data shape varies based on ABS version, usually includes progress object
      if (data && data.itemId) {
        callback(data);
      }
    });
  }

  onLibraryUpdate(callback: () => void) {
    this.socket?.on('item_added', callback);
    this.socket?.on('item_removed', callback);
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    let baseUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (baseUrl && !baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }

    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown Error');
      throw new Error(`Login failed: ${errorText}`);
    }

    return response.json();
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.serverUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ABS API Error (${response.status})`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async getMeProgress(): Promise<any> {
    // Optimized endpoint for populating Home screen
    return this.fetchApi('/api/me/progress');
  }

  // Added getProgress method to resolve error in Player.tsx line 72
  async getProgress(itemId: string): Promise<ABSProgress | null> {
    return this.fetchApi(`/api/me/progress/${itemId}`);
  }

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    const data = await this.fetchApi('/api/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    if (!audioLibrary) throw new Error("No library found");
    this.libraryId = audioLibrary.id;
    return this.libraryId!;
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    const data = await this.fetchApi(`/api/libraries/${libId}/items?include=progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}?include=progress`);
  }

  async startPlaybackSession(itemId: string): Promise<any> {
    // Mandatory for tracking and HLS
    return this.fetchApi(`/api/items/${itemId}/play`, { method: 'POST' });
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const progressData = {
      currentTime,
      duration,
      progress: duration > 0 ? currentTime / duration : 0,
      isFinished: currentTime >= duration - 5 && duration > 0,
      lastUpdate: Date.now()
    };

    localStorage.setItem(`rs_pos_${itemId}`, currentTime.toString());

    if (!navigator.onLine) {
      this.addToSyncQueue(itemId, progressData);
      return;
    }

    try {
      await fetch(`${this.serverUrl}/api/users/me/progress/${itemId}`, {
        method: 'PATCH',
        mode: 'cors',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progressData),
        keepalive: true
      });
    } catch (e) {
      this.addToSyncQueue(itemId, progressData);
    }
  }

  private addToSyncQueue(itemId: string, data: any) {
    const queue = JSON.parse(localStorage.getItem(this.syncQueueKey) || '{}');
    queue[itemId] = data;
    localStorage.setItem(this.syncQueueKey, JSON.stringify(queue));
  }

  private async processSyncQueue() {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem(this.syncQueueKey) || '{}');
    const itemIds = Object.keys(queue);
    if (itemIds.length === 0) return;

    for (const id of itemIds) {
      try {
        await fetch(`${this.serverUrl}/api/users/me/progress/${id}`, {
          method: 'PATCH',
          mode: 'cors',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(queue[id]),
        });
        delete queue[id];
      } catch (e) { break; }
    }
    localStorage.setItem(this.syncQueueKey, JSON.stringify(queue));
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
