
import React, { useEffect, useState, useMemo } from 'react';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import { Home, Book, Layers, Search, LogOut, ChevronRight, Play, Clock } from 'lucide-react';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

interface SeriesStack {
  name: string;
  items: ABSLibraryItem[];
  coverUrl: string;
}

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOME' | 'BOOKS' | 'SERIES'>('HOME');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<SeriesStack | null>(null);
  
  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  const fetchData = async () => {
    try {
      const libraryItems = await absService.getLibraryItems();
      setItems(libraryItems);
    } catch (e) {
      console.error("Library sync failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    absService.onProgressUpdate((updated: ABSProgress) => {
      setItems(prev => prev.map(item => item.id === updated.itemId ? { ...item, userProgress: updated } : item));
    });
    absService.onLibraryUpdate(() => fetchData());
    return () => absService.disconnect();
  }, [absService]);

  const resumeHero = useMemo(() => {
    return items
      .filter(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0)
      .sort((a, b) => (b.userProgress?.lastUpdate || 0) - (a.userProgress?.lastUpdate || 0))[0];
  }, [items]);

  const recentlyAdded = useMemo(() => {
    return [...items].sort((a, b) => {
      return absService.normalizeDate(b.addedDate) - absService.normalizeDate(a.addedDate);
    }).slice(0, 10);
  }, [items, absService]);

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
      return { 
        name, 
        items: sorted, 
        coverUrl: absService.getCoverUrl(sorted[0].id) 
      } as SeriesStack;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, absService]);

  const filteredBooks = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(i => 
      i.media.metadata.title.toLowerCase().includes(term) || 
      i.media.metadata.authorName.toLowerCase().includes(term)
    ).sort((a, b) => a.media.metadata.title.localeCompare(b.media.metadata.title));
  }, [items, searchTerm]);

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black h-[100dvh]">
      <div className="w-12 h-12 border-4 border-aether-purple/20 border-t-aether-purple rounded-full animate-spin mb-6" />
      <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-800 animate-pulse">Syncing Archive</h2>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col safe-top overflow-hidden bg-black h-[100dvh]">
      <div className="px-6 pt-10 pb-4 space-y-6 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black tracking-tighter text-aether-purple drop-shadow-aether-glow">AETHER</h2>
            <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-700 font-black">Sync Protocol Active</p>
          </div>
          <button onClick={onLogout} className="bg-neutral-900/50 p-3 rounded-2xl border border-white/5 active:scale-90 transition-all text-neutral-500 hover:text-red-500">
            <LogOut size={18} />
          </button>
        </div>

        <div className="relative group">
          <input
            type="text"
            placeholder="Search archive..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border-none rounded-2xl py-5 pl-14 pr-6 text-xs text-white placeholder-neutral-800 transition-all focus:ring-1 focus:ring-aether-purple/40 outline-none"
          />
          <Search className="w-5 h-5 text-neutral-800 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-aether-purple transition-colors" />
        </div>
      </div>

      <nav className="flex px-6 gap-8 shrink-0 border-b border-white/5 bg-black/50 backdrop-blur-md">
        {[
          { id: 'HOME', icon: Home, label: 'Home' },
          { id: 'BOOKS', icon: Book, label: 'Books' },
          { id: 'SERIES', icon: Layers, label: 'Series' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setSelectedSeries(null); }}
            className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative py-5 ${activeTab === tab.id && !selectedSeries ? 'text-white' : 'text-neutral-700'}`}
          >
            <tab.icon size={14} className={activeTab === tab.id ? 'text-aether-purple' : ''} />
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && !selectedSeries && <div className="absolute bottom-[-1px] left-0 w-full h-1 gradient-aether shadow-aether-glow" />}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar scroll-container pb-32 touch-pan-y">
        <div className="animate-fade-in">
          
          {selectedSeries ? (
            <div className="space-y-10 animate-slide-up">
              <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5">
                <ChevronRight className="rotate-180" size={14} />
                Back to Stacks
              </button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">{selectedSeries.name}</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{selectedSeries.items.length} Volume Collection</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
                {selectedSeries.items.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                ))}
              </div>
            </div>
          ) : activeTab === 'HOME' ? (
            <div className="space-y-16">
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-neutral-800">
                  <Clock size={12} />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Currently Resuming</h3>
                </div>
                {resumeHero ? (
                  <div 
                    onClick={() => onSelectItem(resumeHero)}
                    className="relative group w-full aspect-[16/9] bg-neutral-950 rounded-[40px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
                  >
                    <img src={absService.getCoverUrl(resumeHero.id)} className="w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-[4s]" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-8 flex flex-col justify-end">
                      <h4 className="text-3xl font-black uppercase tracking-tighter text-white mb-1 truncate leading-none">{resumeHero.media.metadata.title}</h4>
                      <p className="text-[10px] font-black text-aether-purple uppercase tracking-[0.2em] mb-6">{resumeHero.media.metadata.authorName}</p>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                        <div className="absolute inset-0 h-full gradient-aether shadow-aether-glow transition-all duration-1000" style={{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }} />
                      </div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10 backdrop-blur-lg border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="text-white fill-current" size={24} />
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900/20 rounded-[40px] p-20 text-center border border-dashed border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">Archive selection required</p>
                  </div>
                )}
              </section>

              <section className="space-y-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">Recently Discovered</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-10">
                  {recentlyAdded.map(item => (
                    <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                  ))}
                </div>
              </section>
            </div>
          ) : activeTab === 'BOOKS' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
              {filteredBooks.map(item => (
                <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-8 gap-y-16">
              {seriesStacks.map(stack => (
                <div key={stack.name} onClick={() => setSelectedSeries(stack)} className="relative cursor-pointer group active:scale-95 transition-all">
                  <div className="absolute inset-0 bg-neutral-800/40 rounded-[36px] translate-x-3 -translate-y-3 border border-white/5 z-0 transition-transform group-hover:translate-x-4 group-hover:-translate-y-4" />
                  <div className="absolute inset-0 bg-neutral-900/60 rounded-[36px] translate-x-1.5 -translate-y-1.5 border border-white/5 z-10 transition-transform group-hover:translate-x-2 group-hover:-translate-y-2" />
                  
                  <div className="relative aspect-square bg-neutral-950 rounded-[36px] overflow-hidden border border-white/10 shadow-2xl group-hover:border-aether-purple/50 z-20 transition-all">
                    <img src={stack.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                    <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl">
                      <span className="text-[10px] font-black text-white uppercase tracking-tighter">{stack.items.length} PCS</span>
                    </div>
                  </div>
                  <h3 className="text-center mt-6 text-[12px] font-black uppercase tracking-tight text-white group-hover:text-aether-purple transition-colors truncate px-2">{stack.name}</h3>
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
      <div className="aspect-square w-full bg-neutral-900 rounded-[36px] overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/40 transition-all">
        <img src={coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt="" loading="lazy" />
        {progress > 0 && !isFinished && (
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/60">
            <div className="h-full gradient-aether shadow-aether-glow" style={{ width: `${progress}%` }} />
          </div>
        )}
        {isFinished && (
          <div className="absolute top-3 right-3 bg-green-500 w-7 h-7 rounded-full flex items-center justify-center border-2 border-black/30 shadow-2xl z-10">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}
      </div>
      <h3 className="text-[11px] font-black line-clamp-1 text-white/90 uppercase tracking-tight mb-1">{item.media.metadata.title}</h3>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-700 truncate">{item.media.metadata.authorName}</p>
    </button>
  );
};

export default Library;
