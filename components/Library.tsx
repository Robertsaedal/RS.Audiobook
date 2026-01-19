
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AuthState, ABSLibraryItem, ABSProgress } from '../types';
import { ABSService } from '../services/absService';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

type SortOption = 'RECENT' | 'ALPHA';

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'HOME' | 'BOOKS' | 'SERIES'>('HOME');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<any | null>(null);
  
  const [bookSort, setBookSort] = useState<SortOption>('RECENT');
  const [bookSortDesc, setBookSortDesc] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const libraryItems = await absService.getLibraryItems();
      setItems(libraryItems);
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // WebSocket Listeners for real-time sync
    absService.onProgressUpdate((updatedProgress: ABSProgress) => {
      setItems(prevItems => prevItems.map(item => {
        if (item.id === updatedProgress.itemId) {
          return { ...item, userProgress: updatedProgress };
        }
        return item;
      }));
    });

    absService.onLibraryUpdate(() => {
      fetchData(true);
    });

    return () => absService.disconnect();
  }, [absService]);

  // Use /api/me/progress logic to find currently playing
  const currentlyPlayingBook = useMemo(() => {
    const unfinished = items.filter(item => {
      const p = item.userProgress;
      return p && !p.isFinished && (p.currentTime > 0 || p.progress > 0);
    });
    
    if (unfinished.length === 0) return null;

    return [...unfinished].sort((a, b) => {
      const tA = Number(a.userProgress?.lastUpdate || 0);
      const tB = Number(b.userProgress?.lastUpdate || 0);
      return tB - tA;
    })[0];
  }, [items]);

  const sortedItems = useMemo(() => {
    let result = items.filter(item => 
      item.media?.metadata?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.media?.metadata?.authorName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (bookSort === 'RECENT') {
      result.sort((a, b) => {
        const dA = Number(a.addedDate);
        const dB = Number(b.addedDate);
        return bookSortDesc ? dB - dA : dA - dB;
      });
    } else {
      result.sort((a, b) => {
        const tA = (a.media.metadata.title || '').toLowerCase();
        const tB = (b.media.metadata.title || '').toLowerCase();
        return bookSortDesc ? tB.localeCompare(tA) : tA.localeCompare(tB);
      });
    }
    return result;
  }, [items, searchTerm, bookSort, bookSortDesc]);

  const seriesGroups = useMemo(() => {
    const grouped = items.reduce((acc: Record<string, ABSLibraryItem[]>, item) => {
      const sName = item.media.metadata.seriesName;
      if (!sName) return acc;
      const key = sName.trim();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    return Object.entries(grouped).map(([name, groupItems]) => {
      const sortedBySeq = [...groupItems].sort((a, b) => {
        const sA = parseFloat(a.media.metadata.sequence || '0');
        const sB = parseFloat(b.media.metadata.sequence || '0');
        return sA - sB;
      });
      const book1 = sortedBySeq[0];
      return {
        id: `series-${name}`,
        name: name,
        items: sortedBySeq,
        bookCount: groupItems.length,
        coverUrl: absService.getCoverUrl(book1.id),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, absService]);

  const filteredSeries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return seriesGroups;
    return seriesGroups.filter(g => g.name.toLowerCase().includes(term));
  }, [seriesGroups, searchTerm]);

  return (
    <div className="flex-1 flex flex-col safe-top overflow-hidden bg-black h-[100dvh]">
      <div className="px-6 pt-6 pb-2 space-y-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-aether-purple drop-shadow-aether-glow">AETHER HUB</h2>
            <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-600 font-black">WebSocket Stream Active</p>
          </div>
          <button onClick={onLogout} className="text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:text-white transition-colors">
            Logout
          </button>
        </div>

        <div className="relative group">
          <input
            type="text"
            placeholder="Search audiobooks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900/40 border border-white/5 focus:border-aether-purple/50 focus:bg-neutral-900 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder-neutral-700 transition-all"
          />
          <svg className="w-4 h-4 text-aether-purple absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <nav className="flex px-6 py-6 gap-6 shrink-0 border-b border-white/5">
        {['HOME', 'BOOKS', 'SERIES'].map(id => (
          <button 
            key={id}
            onClick={() => { setActiveTab(id as any); setSelectedSeries(null); }}
            className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all relative pb-2 ${activeTab === id ? 'text-white' : 'text-neutral-600'}`}
          >
            {id}
            {activeTab === id && <div className="absolute bottom-0 left-0 w-full h-0.5 gradient-aether shadow-aether-glow" />}
          </button>
        ))}
      </nav>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar scroll-container pb-24 touch-pan-y">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-square bg-neutral-900/50 rounded-2xl animate-pulse border border-white/5" />)}
          </div>
        ) : (
          <div className="animate-fade-in space-y-12">
            {refreshing && (
              <div className="flex justify-center -mt-4 mb-4">
                <div className="w-5 h-5 border-2 border-aether-purple border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {activeTab === 'HOME' && !searchTerm && (
              <>
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">Resume Listening</h3>
                  {currentlyPlayingBook ? (
                    <div 
                      onClick={() => onSelectItem(currentlyPlayingBook)}
                      className="group relative w-full bg-neutral-900/40 rounded-[32px] overflow-hidden border border-white/10 cursor-pointer hover:border-aether-purple/50 transition-all active:scale-[0.99] flex flex-row items-stretch shadow-2xl"
                    >
                      <div className="w-1/3 aspect-square shrink-0 relative overflow-hidden">
                        <img src={absService.getCoverUrl(currentlyPlayingBook.id)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                      <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-aether-purple mb-1">In Sync</span>
                        <h4 className="text-xl font-black uppercase tracking-tight text-white leading-tight truncate">{currentlyPlayingBook.media.metadata.title}</h4>
                        <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-4 truncate">{currentlyPlayingBook.media.metadata.authorName}</p>
                        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full gradient-aether shadow-aether-glow transition-all duration-500" style={{ width: `${(currentlyPlayingBook.userProgress?.progress || 0) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-neutral-900/20 rounded-[32px] p-12 text-center border border-dashed border-white/10">
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-700">No active sessions.</p>
                    </div>
                  )}
                </section>

                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">Recent Discoveries</h3>
                    <button onClick={() => setActiveTab('BOOKS')} className="text-[10px] font-black uppercase tracking-widest text-aether-purple">Explore All</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                    {sortedItems.slice(0, 6).map(item => (
                      <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'BOOKS' && (
              <section className="space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">The Collection</h3>
                  <div className="flex items-center bg-neutral-900 rounded-lg pr-2">
                    <select 
                      value={bookSort} 
                      onChange={(e) => setBookSort(e.target.value as any)}
                      className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white border-none py-2 px-3 appearance-none cursor-pointer"
                    >
                      <option value="RECENT">Added</option>
                      <option value="ALPHA">Name</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-y-10 gap-x-6">
                  {sortedItems.map(item => (
                    <BookCard key={item.id} item={item} onClick={() => onSelectItem(item)} coverUrl={absService.getCoverUrl(item.id)} />
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'SERIES' && (
              <section className="space-y-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-y-12 gap-x-6">
                  {filteredSeries.map(group => (
                    <SeriesCard key={group.id} group={group} onClick={() => setSelectedSeries(group)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const BookCard = ({ item, onClick, coverUrl }: { item: ABSLibraryItem, onClick: () => void, coverUrl: string }) => {
  const isFinished = item.userProgress?.isFinished === true;
  return (
    <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
      <div className="aspect-square w-full bg-neutral-900 rounded-[32px] overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all">
        <img src={coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
        {isFinished && (
          <div className="absolute top-3 right-3 bg-green-500 w-7 h-7 rounded-full flex items-center justify-center border-2 border-black/20 shadow-xl z-10">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}
      </div>
      <h3 className="text-[13px] font-bold line-clamp-1 text-white/90 uppercase tracking-tight mb-0.5">{item.media.metadata.title}</h3>
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 truncate">{item.media.metadata.authorName}</p>
    </button>
  );
};

const SeriesCard = ({ group, onClick }: { group: any, onClick: () => void }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in relative">
    <div className="aspect-square w-full mb-4 relative">
      <div className="absolute inset-0 bg-neutral-800 rounded-[32px] border border-white/5 opacity-40 translate-x-2 -translate-y-2 z-0" />
      <div className="absolute inset-0 bg-neutral-900 rounded-[32px] overflow-hidden shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all z-10">
        <img src={group.coverUrl} className="w-full h-full object-cover" loading="lazy" />
      </div>
    </div>
    <h3 className="text-[14px] font-bold text-center text-white/90 uppercase tracking-tight truncate px-1">{group.name}</h3>
  </button>
);

export default Library;
