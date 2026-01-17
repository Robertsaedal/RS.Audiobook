import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';

export class ABSService {
  private serverUrl: string;
  private token: string;

  constructor(serverUrl: string, token: string) {
    // Robustly clean the server URL: trim whitespace and remove ALL trailing slashes
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    
    // Enforce HTTPS if not explicitly provided as HTTP
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
  }

  /**
   * Static login method configured to bypass preflight blocks and handle CORS.
   * Endpoint: https://rs-audio-server.duckdns.org/api/login
   */
  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    // If the provided serverUrl is empty or default, we ensure the correct production endpoint
    let baseUrl = serverUrl.trim().replace(/\/+$/, '');
    if (!baseUrl || baseUrl === 'rs-audio-server.duckdns.org') {
      baseUrl = 'https://rs-audio-server.duckdns.org';
    }
    
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }

    const endpoint = `${baseUrl}/api/login`;

    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',           // Explicitly set CORS mode
      credentials: 'include', // Include credentials/cookies for cross-origin requests
      headers: {
        'Content-Type': 'application/json' // Simple standard header
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
    return `${this.serverUrl}/api/items/${itemId}/audio/${audioFileId}?token=${this.token}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }
}
