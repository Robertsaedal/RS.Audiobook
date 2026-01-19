
import React, { useState } from 'react';
import { AuthState } from '../types';
import { ABSService } from '../services/absService';
import { ShieldAlert, Link as LinkIcon, User, Lock, Activity } from 'lucide-react';

interface LoginProps {
  onLogin: (auth: AuthState) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // PRE-FILLED: Replace 'YOUR_SUBDOMAIN' with your actual DuckDNS name
  const [serverUrl, setServerUrl] = useState('https://YOUR_SUBDOMAIN.duckdns.org');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await ABSService.login(serverUrl, username, password);
      
      let finalUrl = serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
      if (!finalUrl.startsWith('http')) {
        finalUrl = `${window.location.protocol === 'https:' ? 'https://' : 'http://'}${finalUrl}`;
      }

      onLogin({
        serverUrl: finalUrl,
        user: { id: data.user.id, username: data.user.username, token: data.user.token }
      });
    } catch (err: any) {
      if (err.message === 'CORS_ERROR') {
        setError(
          <div className="space-y-2">
            <p className="text-red-400 font-black uppercase text-[10px] tracking-widest">Connection Blocked (CORS)</p>
            <p className="text-neutral-500 text-[9px] leading-relaxed uppercase font-bold">
              Your server must allow this origin. Go to <span className="text-white">Settings &gt; General &gt; Allowed Origins</span> in Audiobookshelf and add:
              <br />
              <span className="text-aether-purple break-all mt-1 block font-mono">{window.location.origin}</span>
            </p>
          </div>
        );
      } else {
        setError(err.message || 'Connection failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black h-[100dvh] overflow-hidden">
      <div className="w-full max-w-md space-y-12 animate-fade-in relative">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-aether-purple/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="text-center relative">
          <h1 className="text-6xl font-black tracking-tighter text-aether-purple mb-2 drop-shadow-aether-glow">AETHER</h1>
          <div className="flex items-center justify-center gap-2">
            <Activity size={10} className="text-neutral-700" />
            <p className="text-neutral-700 uppercase tracking-[0.5em] text-[10px] font-black">Secure Link Portal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative">
          <div className="relative group">
            <LinkIcon size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-aether-purple transition-colors" />
            <input
              type="text"
              placeholder="SERVER ENDPOINT"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-aether-purple/40 transition-all"
              required
            />
          </div>

          <div className="relative group">
            <User size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-aether-purple transition-colors" />
            <input
              type="text"
              placeholder="USERNAME"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-aether-purple/40 transition-all"
              required
            />
          </div>

          <div className="relative group">
            <Lock size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-800 group-focus-within:text-aether-purple transition-colors" />
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-900 border-none py-5 pl-14 pr-6 rounded-[24px] text-white placeholder-neutral-800 font-black text-xs tracking-widest outline-none focus:ring-1 focus:ring-aether-purple/40 transition-all"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-[24px] text-center animate-shake">
              <div className="flex justify-center mb-2">
                <ShieldAlert size={20} className="text-red-500" />
              </div>
              <div className="text-red-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {error}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-aether py-6 rounded-[24px] font-black text-lg tracking-[0.2em] shadow-aether-glow active:scale-95 transition-all text-white mt-4 disabled:opacity-50 disabled:scale-100"
          >
            {loading ? 'INITIALIZING LINK...' : 'CONNECT'}
          </button>
        </form>

        <div className="text-center pt-8">
          <p className="text-[8px] font-black text-neutral-800 uppercase tracking-[0.4em]">Proprietary Archive Technology • V3.2</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
