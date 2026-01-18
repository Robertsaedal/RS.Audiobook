import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private libraryId = 'a5706742-ccbf-452a-8b7d-822988dd5f63';

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
  }

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
      headers: { 'Content-Type': 'application/json' },
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
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      // If it's a 404 for progress, don't throw, just return null
      if (response.status === 404) return null;
      const errorText = await response.text().catch(() => 'Error');
      throw new Error(`ABS API Error (${response.status}): ${errorText}`);
    }

    // Safely handle empty responses or non-JSON responses
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const data = await this.fetchApi(`/api/libraries/${this.libraryId}/items?include=progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}`);
  }

  async getSeries(): Promise<ABSSeries[]> {
    const data = await this.fetchApi(`/api/libraries/${this.libraryId}/series`);
    return data?.results || (Array.isArray(data) ? data : []);
  }

  async getProgress(id: string): Promise<any> {
    try {
      // fetchApi now handles the 404 internally
      return await this.fetchApi(`/api/users/me/progress/${id}`);
    } catch (e) {
      console.warn("Could not fetch progress:", e);
      return null;
    }
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const url = `${this.serverUrl}/api/users/me/progress/${itemId}`;
    
    // We use a "fire and forget" approach for progress updates to keep the UI snappy
    fetch(url, {
      method: 'PATCH',
      mode: 'cors',
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
      keepalive: true // Helps save progress even if the user closes the tab
    }).catch(err => console.error("Sync error:", err));
  }

  getAudioUrl(itemId: string, audioFileId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/file/${audioFileId}?token=${this.token}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }
}
