
import { ABSUser, ABSLibraryItem, ABSSeries, ABSProgress } from '../types';

export class ABSService {
  private serverUrl: string;
  private token: string;
  private libraryId: string | null = null;

  constructor(serverUrl: string, token: string) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    this.serverUrl = cleanUrl;
    this.token = token;
  }

  static async login(serverUrl: string, username: string, password: string): Promise<any> {
    let baseUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }

    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: username.trim(), 
        password: password 
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown Error');
      throw new Error(`Login failed: ${errorText}`);
    }

    return response.json();
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}, silent404 = false) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.serverUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        credentials: 'omit',
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
    } catch (e) {
      if (!silent404) console.debug("API Fetch Warning:", e);
      return null;
    }
  }

  async ensureLibraryId(): Promise<string> {
    if (this.libraryId) return this.libraryId;
    
    const data = await this.fetchApi('/api/libraries');
    const libraries = data?.libraries || data || [];
    const audioLibrary = libraries.find((l: any) => l.mediaType === 'audiobook') || libraries[0];
    
    if (!audioLibrary) throw new Error("No libraries found on server");
    this.libraryId = audioLibrary.id;
    return this.libraryId!;
  }

  async getLibraryItems(): Promise<ABSLibraryItem[]> {
    const libId = await this.ensureLibraryId();
    // Added include=series to ensure we have series metadata for grouping
    const data = await this.fetchApi(`/api/libraries/${libId}/items?include=series,progress`);
    return data?.results || data || [];
  }

  async getItemDetails(id: string): Promise<ABSLibraryItem> {
    return this.fetchApi(`/api/items/${id}`);
  }

  async getSeries(): Promise<ABSSeries[]> {
    const libId = await this.ensureLibraryId();
    const data = await this.fetchApi(`/api/libraries/${libId}/series`);
    return data?.results || (Array.isArray(data) ? data : []);
  }

  async getProgress(id: string): Promise<any> {
    return this.fetchApi(`/api/users/me/progress/${id}`, {}, true);
  }

  async saveProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const url = `${this.serverUrl}/api/users/me/progress/${itemId}`;
    fetch(url, {
      method: 'PATCH',
      mode: 'cors',
      credentials: 'omit',
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
      keepalive: true
    }).catch(() => {});
  }

  getAudioUrl(itemId: string, audioFileId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/file/${audioFileId}?token=${this.token}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this.serverUrl}/api/items/${itemId}/cover?token=${this.token}`;
  }
}
