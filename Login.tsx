
import React, { useState } from 'react';
import { AuthState } from '../types';

interface LoginProps {
  onLogin: (auth: AuthState) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // Use VITE_ABS_URL from import.meta.env as requested
  const [serverUrl, setServerUrl] = useState((import.meta as any).env?.VITE_ABS_URL || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let cleanUrl = serverUrl.trim().replace(/\/$/, '');
      if (!cleanUrl) throw new Error('Server URL is required');
      
      // Ensure https prefix to resolve ERR_SSL_UNRECOGNIZED_NAME_ALERT issues
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = `https://${cleanUrl}`;
      }

      // Explicitly using credentials: 'include' and ensuring exact payload keys
      console.log("Current Clean URL is:", cleanUrl);
      const response = await fetch(`${cleanUrl}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password 
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Invalid credentials or server URL';
        try {
          const data = await response.json();
          errorMsg = data.message || errorMsg;
        } catch (e) {
          // If response isn't JSON
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      onLogin({
        serverUrl: cleanUrl,
        user: {
          id: data.user.id,
          username: data.user.username,
          token: data.user.token,
        }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 safe-top bg-black h-screen">
      <div className="w-full max-w-md space-y-12">
        <div className="text-center">
          <h1 className="text-6xl font-black tracking-tighter text-aether-purple mb-2 drop-shadow-[0_0_20px_rgba(157,80,187,0.4)]">R.S AUDIOBOOKS</h1>
          <p className="text-neutral-600 uppercase tracking-[0.5em] text-[10px] font-black">Authentication required</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-neutral-600 ml-4 tracking-widest">Server Endpoint</label>
            <input
              type="text"
              placeholder="your-server.duckdns.org"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white placeholder-neutral-700 transition-all shadow-inner"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-neutral-600 ml-4 tracking-widest">Credentials</label>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white placeholder-neutral-700 transition-all mb-2 shadow-inner"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-900 focus:border-aether-purple p-5 rounded-[24px] text-white placeholder-neutral-700 transition-all shadow-inner"
              required
            />
          </div>

          {error && (
            <div className="bg-red-900/10 border border-red-900/20 p-4 rounded-2xl">
              <p className="text-red-500 text-[11px] font-bold text-center uppercase tracking-wider">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-aether p-5 rounded-[24px] font-black text-lg tracking-widest hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 mt-4 shadow-[0_10px_30px_rgba(157,80,187,0.3)]"
          >
            {loading ? 'CONNECTING...' : 'LOGIN TO HUB'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
