
import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';

export class ABSService {
  private serverUrl: string;
  private token: string;

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/$/, '');
    // Ensure https if not specified (crucial for DuckDNS/SSL setups)
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      ...options,
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
    const data = await this.fetchApi('/api/items');
    return data.results || data;
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}`);
  }

  async getSeries(): Promise<ABSSeries[]> {
    const data = await this.fetchApi('/api/series');
    return data.results || data;
  }

  async getProgress(itemId: string): Promise<ABSProgress | null> {
    try {
      return await this.fetchApi(`/api/me/progress/${itemId}`);
    } catch (e) {
      return null;
    }
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/api/me/progress/${itemId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
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
    return `${this.serverUrl}/api/items/${itemId}/audio/${audioFileId}?token=${this.token}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }
}
