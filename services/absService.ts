import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';

export class ABSService {
  private serverUrl: string;
  private token: string;

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
  }

  /**
   * Static login method - WORKING WITHOUT /API
   */
  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    const envUrl = (import.meta as any).env?.VITE_ABS_URL;
    let baseUrl = (serverUrl || envUrl || 'rs-audio-server.duckdns.org').trim().replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }

    const endpoint = `${baseUrl}/login`;

    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        username: username.trim(), 
        password: password 
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown Error');
      throw new Error(`Login failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.serverUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ABS API Error (${response.status}): ${errorText || response.statusText}`);
    }

    return response.json();
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    // Added /api back here
    const data = await this.fetchApi('/api/items');
    return data.results || data;
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    // Added /api back here
    return this.fetchApi(`/api/items/${id}`);
  }

  async getSeries(): Promise<ABSSeries[]> {
    // Added /api back here
    const data = await this.fetchApi('/api/series');
    return data.results || data;
  }

  async getProgress(itemId: string): Promise<ABSProgress | null> {
    try {
      // Added /api back here
      return await this.fetchApi(`/api/me/progress/${itemId}`);
    } catch (e) {
      return null;
    }
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    try {
      // Added /api back here
      await this.fetchApi(`/api/me/progress/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          currentTime,
          duration,
          progress: duration > 0 ? currentTime / duration : 0,
          isFinished: currentTime >= duration - 10 && duration > 0,
        }),
      });
    } catch (e) {
      console.error("Failed to sync progress to server", e);
    }
  }

  getAudioUrl(itemId: string, audioFileId: string): string {
    // Added /api back here
    return `${this.serverUrl}/api/items/${itemId}/audio/${audioFileId}?token=${this.token}`;
  }

  getCoverUrl(itemId: string): string {
    // Added /api back here
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }
}
