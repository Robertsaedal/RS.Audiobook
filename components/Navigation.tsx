
import React from 'react';
import { Home, Book, Layers, LogOut, Activity } from 'lucide-react';

export type NavTab = 'HOME' | 'BOOKS' | 'SERIES';

interface NavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, onLogout }) => {
  const navItems = [
    { id: 'HOME' as NavTab, icon: Home, label: 'Home' },
    { id: 'BOOKS' as NavTab, icon: Book, label: 'Books' },
    { id: 'SERIES' as NavTab, icon: Layers, label: 'Series' },
  ];

  return (
    <>
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-neutral-950 border-r border-white/5 z-50 p-8">
        <div className="mb-12">
          <h2 className="text-2xl font-black tracking-tighter text-aether-purple drop-shadow-aether-glow">R.S AUDIO</h2>
          <div className="flex items-center gap-2 mt-1">
            <Activity size={8} className="text-neutral-700" />
            <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-700 font-black">Spec V4.0</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest ${
                activeTab === item.id 
                  ? 'bg-aether-purple/10 text-white border border-aether-purple/20' 
                  : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
              }`}
            >
              <item.icon size={18} className={activeTab === item.id ? 'text-aether-purple' : ''} />
              {item.label}
            </button>
          ))}
        </nav>

        <button 
          onClick={onLogout}
          className="flex items-center gap-4 px-6 py-4 rounded-2xl text-neutral-600 hover:text-red-500 transition-colors font-black text-[11px] uppercase tracking-widest mt-auto border border-transparent hover:border-red-500/20"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      {/* Bottom Bar - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-neutral-950/90 backdrop-blur-xl border-t border-white/5 flex justify-around items-center px-6 z-50 safe-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === item.id ? 'text-aether-purple' : 'text-neutral-600'
            }`}
          >
            <div className={`p-2 rounded-xl transition-all ${activeTab === item.id ? 'bg-aether-purple/10' : ''}`}>
              <item.icon size={22} />
            </div>
            <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
        <button onClick={onLogout} className="flex flex-col items-center gap-1 text-neutral-600">
          <div className="p-2">
            <LogOut size={22} />
          </div>
          <span className="text-[8px] font-black uppercase tracking-tighter">Exit</span>
        </button>
      </nav>
    </>
  );
};

export default Navigation;
