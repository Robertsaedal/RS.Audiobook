
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOME' | 'BOOKS' | 'SERIES'>('HOME');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeriesName, setSelectedSeriesName] = useState<string | null>(null);
  
  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const libraryItems = await absService.getLibraryItems();
      setItems(libraryItems);
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    absService.onProgressUpdate((updatedProgress: ABSProgress) => {
      setItems(prev => prev.map(item => item.id === updatedProgress.itemId ? { ...item, userProgress: updatedProgress } : item));
    });
    return () => absService.disconnect();
  }, [absService]);

  // LOGIC: Hero - Single most recent unfinished item
  const resumeHero = useMemo(() => {
    return items
      .filter(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0)
      .sort((a, b) => (b.userProgress?.lastUpdate || 0) - (a.userProgress?.lastUpdate || 0))[0];
  }, [items]);

  // LOGIC: Recently Added - Sorted by milliseconds
  const recentlyAdded = useMemo(() => {
    return [...items].sort((a, b) => {
      return absService.normalizeDate(b.addedDate) - absService.normalizeDate(a.addedDate);
    }).slice(0, 12);
  }, [items, absService]);

  // LOGIC: Filtered Books for Search/Tab
  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.media?.metadata?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.media?.metadata?.authorName?.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.media.metadata.title.localeCompare(b.media.metadata.title));
  }, [items, searchTerm]);

  // LOGIC: Series Grouping
  const seriesStacks = useMemo(() => {
    const groups: Record<string, ABSLibraryItem[]> = {};
    items.forEach(item => {
      const sName = item.media.metadata.seriesName;
      if (sName) {
        if (!groups[sName]) groups[sName] = [];
        groups[sName].push(item);
      }
    });

    return Object.entries(groups).map(([name, groupItems]) => {
      const sorted = groupItems.sort((a, b) => 
        parseFloat(a.media.metadata.sequence || '0') - parseFloat(b.media.metadata.sequence || '0')
      );
      return { name, items: sorted, coverUrl: absService.getCoverUrl(sorted[0].id) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, absService]);

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black">
      <div className="w-10 h-10 border-2 border-aether-purple/20 border-t-aether-purple rounded-full animate-spin mb-4" />
      <p className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-700">Syncing Library</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col safe-top overflow-hidden bg-black h-[100dvh]">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 space-y-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tighter text-aether-purple drop-shadow-aether-glow">AETHER HUB</h2>
            <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-600 font-black">Official Spec v3.1</p>
          </div>
          <button onClick={onLogout} className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-white/5 active:scale-90 transition-transform">
            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search the archive..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border-none rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder-neutral-700 transition-all focus:ring-1 focus:ring-aether-purple/40"
          />
          <svg className="w-4 h-4 text-aether-purple absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex px-6 py-2 gap-8 shrink-0 overflow-x-auto no-scrollbar">
        {['HOME', 'BOOKS', 'SERIES'].map(id => (
          <button 
            key={id}
            onClick={() => { setActiveTab(id as any); setSelectedSeriesName(null); }}
            className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all relative py-4 ${activeTab === id && !selectedSeriesName ? 'text-white' : 'text-neutral-600'}`}
          >
            {id}
            {activeTab === id && !selectedSeriesName && <div className="absolute bottom-0 left-0 w-full h-1 gradient-aether shadow-aether-glow" />}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar scroll-container pb-24 touch-pan-y">
        <div className="animate-fade-in space-y-12">
          
          {selectedSeriesName ? (
            <div className="space-y-8 animate-slide-up">
              <button onClick={() => setSelectedSeriesName(null)} className="flex items-center gap-2 text-aether-purple text-[10px] font-black uppercase tracking-widest">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                Back to Stacks
              </button>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">{selectedSeriesName}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {seriesStacks.find(s => s.name === selectedSeriesName)?.items.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                ))}
              </div>
            </div>
          ) : activeTab === 'HOME' ? (
            <>
              {/* Resume Hero */}
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-700">Continue Journey</h3>
                {resumeHero ? (
                  <div 
                    onClick={() => onSelectItem(resumeHero)}
                    className="relative group w-full aspect-[16/9] bg-neutral-900 rounded-[32px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
                  >
                    <img src={absService.getCoverUrl(resumeHero.id)} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-[2s]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-6 flex flex-col justify-end">
                      <h4 className="text-2xl font-black uppercase tracking-tighter text-white mb-1 truncate">{resumeHero.media.metadata.title}</h4>
                      <p className="text-[10px] font-bold text-aether-purple uppercase tracking-[0.2em] mb-4">{resumeHero.media.metadata.authorName}</p>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full gradient-aether" style={{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900/40 rounded-[32px] p-12 text-center border border-dashed border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-700">Archive exploration recommended</p>
                  </div>
                )}
              </section>

              {/* Recently Added */}
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-700">Recently Added</h3>
                <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
                  {recentlyAdded.map(item => (
                    <div key={item.id} className="w-40 shrink-0">
                      <BookCard item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : activeTab === 'BOOKS' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-10">
              {filteredItems.map(item => (
                <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-12">
              {seriesStacks.map(stack => (
                <div key={stack.name} onClick={() => setSelectedSeriesName(stack.name)} className="relative cursor-pointer group active:scale-95 transition-all">
                  {/* Stack Effect */}
                  <div className="absolute inset-0 bg-neutral-800 rounded-[32px] translate-x-2 -translate-y-2 border border-white/5 opacity-40" />
                  <div className="absolute inset-0 bg-neutral-900 rounded-[32px] translate-x-1 -translate-y-1 border border-white/5 opacity-60" />
                  <div className="relative aspect-square bg-neutral-950 rounded-[32px] overflow-hidden border border-white/10 shadow-2xl group-hover:border-aether-purple/50">
                    <img src={stack.coverUrl} className="w-full h-full object-cover" />
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                      <span className="text-[10px] font-black text-white">{stack.items.length}</span>
                    </div>
                  </div>
                  <h3 className="text-center mt-4 text-[12px] font-black uppercase tracking-tight text-white/80 group-hover:text-aether-purple truncate">{stack.name}</h3>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BookCard = ({ item, onClick, coverUrl }: { item: ABSLibraryItem, onClick: () => void, coverUrl: string }) => {
  const isFinished = item.userProgress?.isFinished;
  const progress = (item.userProgress?.progress || 0) * 100;

  return (
    <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 w-full">
      <div className="aspect-square w-full bg-neutral-900 rounded-[32px] overflow-hidden mb-3 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/40 transition-all">
        <img src={coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
        {progress > 0 && !isFinished && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-black/40">
            <div className="h-full gradient-aether shadow-aether-glow" style={{ width: `${progress}%` }} />
          </div>
        )}
        {isFinished && (
          <div className="absolute top-2 right-2 bg-green-500 w-6 h-6 rounded-full flex items-center justify-center border-2 border-black/20 shadow-xl z-10">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}
      </div>
      <h3 className="text-[11px] font-black line-clamp-1 text-white/90 uppercase tracking-tight mb-0.5">{item.media.metadata.title}</h3>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-600 truncate">{item.media.metadata.authorName}</p>
    </button>
  );
};

export default Library;
