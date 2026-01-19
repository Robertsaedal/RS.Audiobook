
import React, { useState } from 'react';
import { AuthState } from '../types';
import { ABSService } from '../services/absService';

interface LoginProps {
  onLogin: (auth: AuthState) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let cleanUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
      if (!cleanUrl) throw new Error('Server URL is required');
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = `https://${cleanUrl}`;
      }

      const data = await ABSService.login(cleanUrl, username, password);
      onLogin({
        serverUrl: cleanUrl,
        user: { id: data.user.id, username: data.user.username, token: data.user.token }
      });
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black h-screen">
      <div className="w-full max-w-md space-y-12 animate-fade-in">
        <div className="text-center">
          <h1 className="text-6xl font-black tracking-tighter text-purple-600 mb-2 drop-shadow-[0_0_20px_rgba(157,80,187,0.4)] shadow-aether-glow">AETHER</h1>
          <p className="text-neutral-700 uppercase tracking-[0.5em] text-[10px] font-black">Secure Link Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="SERVER ENDPOINT"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full bg-neutral-900 border-none p-5 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest"
            required
          />
          <input
            type="text"
            placeholder="USERNAME"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-neutral-900 border-none p-5 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest"
            required
          />
          <input
            type="password"
            placeholder="PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-neutral-900 border-none p-5 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest"
            required
          />

          {error && <p className="text-red-500 text-[10px] font-black text-center uppercase tracking-widest">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-aether p-5 rounded-[24px] font-black text-lg tracking-[0.2em] shadow-aether-glow active:scale-95 transition-all text-white mt-4"
          >
            {loading ? 'CONNECTING...' : 'INITIALIZE'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
