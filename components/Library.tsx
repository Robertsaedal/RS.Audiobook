
import React, { useEffect, useState, useMemo } from 'react';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import Navigation, { NavTab } from './Navigation';
import { Search, ChevronRight, Clock, ArrowRight } from 'lucide-react';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

interface SeriesStack {
  name: string;
  items: ABSLibraryItem[];
  coverUrl: string;
  totalCount: number;
}

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
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

  const sortedAllItems = useMemo(() => {
    return [...items].sort((a, b) => {
      return absService.normalizeDate(b.addedDate) - absService.normalizeDate(a.addedDate);
    });
  }, [items, absService]);

  const recentlyAdded = useMemo(() => sortedAllItems.slice(0, 10), [sortedAllItems]);

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
        coverUrl: absService.getCoverUrl(sorted[0].id),
        totalCount: sorted.length
      } as SeriesStack;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, absService]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return sortedAllItems.filter(i => 
      i.media.metadata.title.toLowerCase().includes(term) || 
      i.media.metadata.authorName.toLowerCase().includes(term)
    );
  }, [sortedAllItems, searchTerm]);

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black h-[100dvh]">
      <div className="w-12 h-12 border-4 border-aether-purple/20 border-t-aether-purple rounded-full animate-spin mb-6" />
      <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-800 animate-pulse">Syncing Archive</h2>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-black min-h-[100dvh]">
      <Navigation 
        activeTab={activeTab} 
        onTabChange={(tab) => { setActiveTab(tab); setSelectedSeries(null); }} 
        onLogout={onLogout} 
      />

      <main className="flex-1 md:ml-64 pb-24 md:pb-8 safe-top overflow-x-hidden">
        {/* Header - Sticky on Mobile */}
        <div className="px-6 pt-10 pb-4 space-y-6 shrink-0 md:px-12">
          <div className="md:hidden flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black tracking-tighter text-aether-purple drop-shadow-aether-glow">R.S AUDIO</h2>
          </div>

          <div className="relative group max-w-2xl">
            <input
              type="text"
              placeholder="Search archive..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border-none rounded-3xl py-4 pl-14 pr-6 text-sm text-white placeholder-neutral-800 transition-all focus:ring-1 focus:ring-aether-purple/40 outline-none"
            />
            <Search className="w-5 h-5 text-neutral-800 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-aether-purple transition-colors" />
          </div>
        </div>

        <div className="px-6 py-8 md:px-12 animate-fade-in max-w-[1600px] mx-auto">
          {selectedSeries ? (
            <div className="space-y-10 animate-slide-up">
              <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5">
                <ChevronRight className="rotate-180" size={14} />
                Back to Stacks
              </button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">{selectedSeries.name}</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{selectedSeries.totalCount} VOLUME COLLECTION</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
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
                  <div className="md:flex justify-center">
                    <div 
                      onClick={() => onSelectItem(resumeHero)}
                      className="relative group w-full md:max-w-4xl aspect-[21/9] bg-neutral-950 rounded-[40px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
                    >
                      <img src={absService.getCoverUrl(resumeHero.id)} className="w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-[4s]" alt="" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-8 md:p-12 flex flex-col justify-end">
                        <h4 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-1 truncate leading-none">{resumeHero.media.metadata.title}</h4>
                        <p className="text-[10px] md:text-xs font-black text-aether-purple uppercase tracking-[0.2em] mb-6">{resumeHero.media.metadata.authorName}</p>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                          <div className="absolute inset-0 h-full gradient-aether shadow-aether-glow transition-all duration-1000" style={{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900/20 rounded-[40px] p-20 text-center border border-dashed border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">No active sessions</p>
                  </div>
                )}
              </section>

              <section className="space-y-8">
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-2 text-neutral-800">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Recently Added</h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
                  {recentlyAdded.map(item => (
                    <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                  ))}
                </div>
              </section>
            </div>
          ) : activeTab === 'BOOKS' ? (
            <div className="space-y-10">
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Archive Collection</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{items.length} TITLES TOTAL</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
                {filteredItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Series Stacks</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">Multi-volume entries</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-10 gap-y-16">
                {seriesStacks.map(stack => (
                  <div key={stack.name} onClick={() => setSelectedSeries(stack)} className="relative cursor-pointer group active:scale-95 transition-all pt-6">
                    <div className="absolute inset-0 bg-neutral-800/40 rounded-[32px] -translate-y-4 scale-90 border border-white/5 z-0" />
                    <div className="absolute inset-0 bg-neutral-900/60 rounded-[32px] -translate-y-2 scale-95 border border-white/5 z-10" />
                    <div className="relative aspect-square bg-neutral-950 rounded-[32px] overflow-hidden border border-white/10 shadow-2xl group-hover:border-aether-purple/50 z-20 transition-all">
                      <img src={stack.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                      <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl">
                        <span className="text-[10px] font-black text-white uppercase tracking-tighter">{stack.totalCount} BOOKS</span>
                      </div>
                    </div>
                    <h3 className="text-center mt-6 text-[11px] font-black uppercase tracking-tight text-white group-hover:text-aether-purple transition-colors truncate px-2">{stack.name}</h3>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const BookCard = ({ item, onClick, coverUrl }: { item: ABSLibraryItem, onClick: () => void, coverUrl: string }) => {
  const isFinished = item.userProgress?.isFinished;
  const progress = (item.userProgress?.progress || 0) * 100;
  return (
    <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 w-full">
      <div className="aspect-[2/3] w-full bg-neutral-900 rounded-3xl overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/40 transition-all">
        <img src={coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt="" loading="lazy" />
        {progress > 0 && !isFinished && (
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/60">
            <div className="h-full gradient-aether shadow-aether-glow" style={{ width: `${progress}%` }} />
          </div>
        )}
        {isFinished && (
          <div className="absolute top-3 right-3 bg-green-500 w-6 h-6 rounded-full flex items-center justify-center border-2 border-black/30 shadow-2xl z-10">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}
      </div>
      <h3 className="text-[10px] font-black line-clamp-1 text-white/90 uppercase tracking-tight mb-0.5">{item.media.metadata.title}</h3>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-700 truncate">{item.media.metadata.authorName}</p>
    </button>
  );
};

export default Library;
