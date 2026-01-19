import React, { useEffect, useState, useMemo } from 'react';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';
import Navigation, { NavTab } from './Navigation';
import { Search, ChevronRight, Clock, ArrowRight, Play } from 'lucide-react';

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
  const [viewingAll, setViewingAll] = useState(false);
  
  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  const fetchData = async () => {
    try {
      const libraryItems = await absService.getLibraryItems();
      setItems(libraryItems || []);
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

  const sortedAllItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const dateA = absService.normalizeDate(a.addedDate);
      const dateB = absService.normalizeDate(b.addedDate);
      return dateB - dateA;
    });
  }, [items, absService]);

  const resumeHero = useMemo(() => {
    return items
      .filter(i => i.userProgress && !i.userProgress.isFinished && i.userProgress.progress > 0)
      .sort((a, b) => (b.userProgress?.lastUpdate || 0) - (a.userProgress?.lastUpdate || 0))[0];
  }, [items]);

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
    if (!searchTerm) return sortedAllItems;
    const term = searchTerm.toLowerCase();
    return sortedAllItems.filter(i => 
      i.media.metadata.title.toLowerCase().includes(term) || 
      i.media.metadata.authorName.toLowerCase().includes(term)
    );
  }, [sortedAllItems, searchTerm]);

  const getSeriesTotal = (seriesName: string) => {
    return seriesStacks.find(s => s.name === seriesName)?.totalCount || 0;
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black h-[100dvh]">
      <div className="w-12 h-12 border-4 border-purple-600/20 border-t-purple-600 rounded-full animate-spin mb-6" />
      <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-800 animate-pulse">Establishing Archive</h2>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-black min-h-[100dvh]">
      <Navigation 
        activeTab={activeTab} 
        onTabChange={(tab) => { setActiveTab(tab); setSelectedSeries(null); setViewingAll(false); }} 
        onLogout={onLogout} 
      />

      <main className="flex-1 md:ml-64 pb-24 md:pb-8 safe-top overflow-x-hidden">
        <div className="px-6 pt-10 pb-4 space-y-6 shrink-0 md:px-12">
          <div className="md:hidden flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-lg" />
              <h2 className="text-lg font-black tracking-tighter text-purple-500 drop-shadow-aether-glow">R.S AUDIOBOOK PLAYER</h2>
            </div>
          </div>

          <div className="relative group max-w-2xl">
            <input
              type="text"
              placeholder="Query library archive..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900/50 border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white placeholder-neutral-800 transition-all focus:ring-1 focus:ring-purple-600/40 outline-none backdrop-blur-sm"
            />
            <Search className="w-5 h-5 text-neutral-800 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-purple-500 transition-colors" />
          </div>
        </div>

        <div className="px-6 py-4 md:px-12 animate-fade-in max-w-[1600px] mx-auto">
          {selectedSeries ? (
            <div className="space-y-10">
              <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-purple-500 text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5 active:scale-95">
                <ChevronRight className="rotate-180" size={14} />
                Back to Archives
              </button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">{selectedSeries.name}</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{selectedSeries.totalCount} VOLUME COLLECTION</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
                {selectedSeries.items.map(item => (
                  <BookCard 
                    key={item.id} 
                    item={item} 
                    onClick={() => onSelectItem(item)} 
                    coverUrl={absService.getCoverUrl(item.id)} 
                    totalInSeries={selectedSeries.totalCount}
                  />
                ))}
              </div>
            </div>
          ) : viewingAll ? (
            <div className="space-y-10">
              <button onClick={() => setViewingAll(false)} className="flex items-center gap-2 text-purple-500 text-[10px] font-black uppercase tracking-widest bg-neutral-900/40 px-5 py-2.5 rounded-full border border-white/5 active:scale-95">
                <ChevronRight className="rotate-180" size={14} />
                Back to Dashboard
              </button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Full Library</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">{items.length} TITLES ACCESSIBLE</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
                {filteredItems.map(item => (
                  <BookCard 
                    key={item.id} 
                    item={item} 
                    onClick={() => onSelectItem(item)} 
                    coverUrl={absService.getCoverUrl(item.id)} 
                    totalInSeries={getSeriesTotal(item.media.metadata.seriesName || '')}
                  />
                ))}
              </div>
            </div>
          ) : activeTab === 'HOME' ? (
            <div className="space-y-12">
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-neutral-800">
                  <Play size={12} />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Current Entry</h3>
                </div>
                {resumeHero ? (
                  <div className="md:flex justify-center">
                    <div 
                      onClick={() => onSelectItem(resumeHero)}
                      className="relative group w-full md:max-w-4xl aspect-[21/9] bg-neutral-950 rounded-[40px] overflow-hidden border border-white/5 cursor-pointer shadow-2xl active:scale-[0.98] transition-all"
                    >
                      <img src={absService.getCoverUrl(resumeHero.id)} className="w-full h-full object-cover opacity-50 transition-opacity" alt="" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-8 md:p-12 flex flex-col justify-end">
                        <h4 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-1 truncate leading-none">{resumeHero.media.metadata.title}</h4>
                        <p className="text-[10px] md:text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-6">
                          {resumeHero.media.metadata.seriesName ? `${resumeHero.media.metadata.seriesName}: Book ${resumeHero.media.metadata.sequence}` : resumeHero.media.metadata.authorName}
                        </p>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                          <div className="absolute inset-0 h-full gradient-aether shadow-aether-glow transition-all" style={{ width: `${(resumeHero.userProgress?.progress || 0) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900/5 rounded-[40px] p-16 text-center border border-dashed border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-800">No active sync found</p>
                  </div>
                )}
              </section>

              <section className="space-y-8">
                <button 
                  onClick={() => setViewingAll(true)}
                  className="w-full flex items-center justify-between group text-left"
                >
                  <div className="flex items-center gap-2 text-neutral-800 group-hover:text-purple-500 transition-colors">
                    <Clock size={12} />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Recent Archive Addition</h3>
                    <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                  <span className="text-[10px] font-black text-neutral-700 uppercase tracking-widest group-hover:text-white transition-colors">Expand Library</span>
                </button>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-12">
                  {recentlyAdded.map(item => (
                    <BookCard 
                      key={item.id} 
                      item={item} 
                      onClick={() => onSelectItem(item)} 
                      coverUrl={absService.getCoverUrl(item.id)} 
                      totalInSeries={getSeriesTotal(item.media.metadata.seriesName || '')}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-2">
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Series Archives</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-700">Multi-Volume Collections</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-12 gap-y-16">
                {seriesStacks.map(stack => (
                  <div key={stack.name} onClick={() => setSelectedSeries(stack)} className="relative cursor-pointer group active:scale-95 transition-all pt-6">
                    <div className="series-cover-container">
                      <img src={stack.coverUrl} loading="lazy" alt="" />
                      <div className="series-badge">{stack.totalCount} VOLUMES</div>
                    </div>
                    <h3 className="text-center mt-6 text-[11px] font-black uppercase tracking-tight text-white group-hover:text-purple-500 transition-colors truncate px-2">{stack.name}</h3>
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

const BookCard = ({ item, onClick, coverUrl, totalInSeries }: { item: ABSLibraryItem, onClick: () => void, coverUrl: string, totalInSeries: number }) => {
  const isFinished = item.userProgress?.isFinished;
  const progress = (item.userProgress?.progress || 0) * 100;
  const { seriesName, sequence, authorName, title } = item.media.metadata;

  return (
    <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 w-full">
      <div className={`w-full mb-4 relative ${seriesName ? 'series-cover-container' : 'aspect-[2/3] bg-neutral-900 rounded-[24px] overflow-hidden border border-white/5'}`}>
        <img src={coverUrl} loading="lazy" className={`${seriesName ? '' : 'w-full h-full object-cover rounded-[24px]'} group-hover:scale-105 transition-transform duration-500`} alt="" />
        {progress > 0 && !isFinished && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-black/60 z-20">
            <div className="h-full gradient-aether shadow-aether-glow" style={{ width: `${progress}%` }} />
          </div>
        )}
        {isFinished && (
          <div className="absolute top-3 right-3 bg-green-500 w-6 h-6 rounded-full flex items-center justify-center border-2 border-black/30 shadow-2xl z-30">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}
      </div>
      <h3 className="text-[10px] font-black line-clamp-1 text-white/90 uppercase tracking-tight mb-0.5">{title}</h3>
      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-neutral-700 truncate mb-1">
        {seriesName ? `${seriesName}: Book ${sequence} of ${totalInSeries}` : authorName}
      </p>
    </button>
  );
};

export default Library;