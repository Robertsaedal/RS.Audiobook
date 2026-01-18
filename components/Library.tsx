
import React, { useEffect, useState, useMemo } from 'react';
import { AuthState, ABSLibraryItem, ABSSeries } from '../types';
import { ABSService } from '../services/absService';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [series, setSeries] = useState<ABSSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RECENT' | 'SERIES' | 'HISTORY'>('RECENT');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<any | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [libraryItems, seriesList] = await Promise.all([
          absService.getLibraryItems(),
          absService.getSeries()
        ]);
        setItems(libraryItems);
        setSeries(seriesList);
      } catch (e) {
        console.error("Fetch failed", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [absService]);

  const historyItems = useMemo(() => {
    const savedHistory = JSON.parse(localStorage.getItem('rs_history') || '[]');
    return items.filter(book => savedHistory.includes(book.id))
      .sort((a, b) => savedHistory.indexOf(b.id) - savedHistory.indexOf(a.id));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.media?.metadata?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.media?.metadata?.authorName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  // Comprehensive Series Grouping Logic
  const processedSeries = useMemo(() => {
    const groups: Record<string, any> = {};
    
    // Helper to add book to group
    const addToGroup = (seriesName: string, itemId: string) => {
      const name = seriesName || 'Standalone';
      if (!groups[name]) {
        groups[name] = {
          id: `series-${name}`,
          name: name,
          libraryItemIds: [],
          isStandalone: name === 'Standalone'
        };
      }
      if (!groups[name].libraryItemIds.includes(itemId)) {
        groups[name].libraryItemIds.push(itemId);
      }
    };

    // 1. Try to use API series data if available
    if (series.length > 0) {
      series.forEach(s => {
        s.libraryItemIds.forEach(id => addToGroup(s.name, id));
      });
    }

    // 2. Scan library items for metadata series names (covers gaps in API)
    items.forEach(item => {
      if (item.media.metadata.seriesName) {
        addToGroup(item.media.metadata.seriesName, item.id);
      } else {
        addToGroup('Standalone', item.id);
      }
    });

    // Post-process groups: Sort books by sequence and get cover
    return Object.values(groups).map(g => {
      const gItems = items.filter(i => g.libraryItemIds.includes(i.id))
        .sort((a, b) => {
          const seqA = parseFloat(a.media.metadata.sequence || '0');
          const seqB = parseFloat(b.media.metadata.sequence || '0');
          return seqA - seqB;
        });
      
      return {
        ...g,
        libraryItemIds: gItems.map(i => i.id),
        coverUrl: gItems.length > 0 ? absService.getCoverUrl(gItems[0].id) : '',
        bookCount: gItems.length
      };
    }).sort((a, b) => {
      if (a.name === 'Standalone') return 1;
      if (b.name === 'Standalone') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [series, items, absService]);

  // Filtered series for search
  const filteredSeriesList = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return processedSeries.filter(s => {
      // Matches series name
      if (s.name.toLowerCase().includes(term)) return true;
      // OR matches any book inside the series
      return s.libraryItemIds.some(id => {
        const item = items.find(i => i.id === id);
        return item?.media?.metadata?.title?.toLowerCase().includes(term);
      });
    });
  }, [processedSeries, searchTerm, items]);

  const seriesItems = useMemo(() => {
    if (!selectedSeries) return [];
    return items.filter(item => selectedSeries.libraryItemIds.includes(item.id))
      .sort((a, b) => {
        const seqA = parseFloat(a.media.metadata.sequence || '0');
        const seqB = parseFloat(b.media.metadata.sequence || '0');
        return seqA - seqB;
      });
  }, [selectedSeries, items]);

  const handleBookSelect = (item: ABSLibraryItem) => {
    const savedHistory = JSON.parse(localStorage.getItem('rs_history') || '[]');
    const newHistory = [item.id, ...savedHistory.filter((id: string) => id !== item.id)].slice(0, 20);
    localStorage.setItem('rs_history', JSON.stringify(newHistory));
    onSelectItem(item);
  };

  return (
    <div className="flex-1 flex flex-col safe-top overflow-hidden bg-black">
      <div className="px-6 pt-4 space-y-4 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-aether-purple drop-shadow-aether-glow">R.S AUDIOBOOKS</h2>
            <p className="text-[8px] uppercase tracking-[0.4em] text-neutral-600 font-black">Digital Audiobookshelf</p>
          </div>
          <button onClick={onLogout} className="text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:text-white transition-colors">
            Logout
          </button>
        </div>

        <div className="relative group">
          <input
            type="text"
            placeholder="Search title, author, or series..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900/60 border border-white/5 focus:border-aether-purple/50 focus:bg-neutral-900 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder-neutral-700 transition-all"
          />
          <svg className="w-4 h-4 text-aether-purple absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <nav className="flex px-6 py-6 gap-6 shrink-0 border-b border-white/5">
        {[
          { id: 'RECENT', label: 'Library' },
          { id: 'SERIES', label: 'Series' },
          { id: 'HISTORY', label: 'History' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setSelectedSeries(null); }}
            className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all relative pb-2 whitespace-nowrap ${activeTab === tab.id ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 gradient-aether shadow-aether-glow animate-pulse" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar scroll-container">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-[2/3] bg-neutral-900/50 rounded-2xl animate-pulse border border-white/5" />)}
          </div>
        ) : (
          <>
            {activeTab === 'RECENT' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {filteredItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} />
                ))}
              </div>
            )}

            {activeTab === 'HISTORY' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                {historyItems.length > 0 ? historyItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} isHistory coverUrl={absService.getCoverUrl(item.id)} />
                )) : <EmptyState message="No History Yet" />}
              </div>
            )}

            {activeTab === 'SERIES' && (
              <>
                {selectedSeries ? (
                  <div className="animate-fade-in">
                    <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple mb-6 text-[10px] font-black uppercase tracking-widest active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                      Back to Series
                    </button>
                    <div className="mb-10">
                      <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight mb-2">{selectedSeries.name}</h3>
                      <p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">Collection of {selectedSeries.bookCount} Books</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                      {seriesItems.map(item => (
                        <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} showSequence />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                    {filteredSeriesList.map(s => (
                      <SeriesCard key={s.id} series={s} onClick={() => setSelectedSeries(s)} />
                    ))}
                  </div>
                )}
              </>
            )}

            {!loading && filteredItems.length === 0 && activeTab === 'RECENT' && <EmptyState message="No items found" sub="Check your server connection or library" />}
          </>
        )}
      </div>
    </div>
  );
};

const BookCard: React.FC<{ item: ABSLibraryItem, onClick: () => void, coverUrl: string, isHistory?: boolean, showSequence?: boolean }> = ({ item, onClick, coverUrl, isHistory, showSequence }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
    <div className="aspect-[2/3] w-full bg-neutral-900 rounded-3xl overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all">
      <img src={coverUrl} alt={item.media.metadata.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
      
      {/* Sequence Badge */}
      {item.media.metadata.sequence && (
        <div className="absolute top-3 left-3 bg-aether-purple px-2 py-0.5 rounded-lg border border-white/20 shadow-xl z-10">
          <span className="text-[9px] font-black text-white">#{item.media.metadata.sequence}</span>
        </div>
      )}

      {/* Series View Specific Label */}
      {showSequence && item.media.metadata.sequence && (
        <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/5">
          <p className="text-[8px] font-black text-aether-purple uppercase tracking-[0.2em] text-center">Book {item.media.metadata.sequence}</p>
        </div>
      )}
    </div>
    <h3 className="text-[13px] font-bold line-clamp-1 mb-0.5 group-hover:text-aether-purple transition-colors leading-tight uppercase tracking-tight">{item.media.metadata.title}</h3>
    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 truncate">{item.media.metadata.authorName}</p>
  </button>
);

const SeriesCard: React.FC<{ series: any, onClick: () => void }> = ({ series, onClick }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
    <div className="aspect-[2/3] w-full bg-neutral-900 rounded-3xl overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all">
      {series.coverUrl ? (
        <img src={series.coverUrl} alt={series.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-neutral-800">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
      )}
      
      {/* Book Count Badge */}
      <div className="absolute top-3 right-3 bg-white/10 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-lg">
        <p className="text-[8px] font-black text-white uppercase tracking-widest">{series.bookCount} {series.bookCount === 1 ? 'Book' : 'Books'}</p>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-5">
        <h3 className="text-[12px] font-black line-clamp-2 uppercase tracking-tight text-white leading-tight mb-1">{series.name}</h3>
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-aether-purple drop-shadow-sm">{series.isStandalone ? 'Miscellaneous' : 'Collection'}</p>
      </div>
    </div>
  </button>
);

const EmptyState = ({ message, sub }: { message: string, sub?: string }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center animate-fade-in">
    <div className="w-16 h-16 rounded-full bg-neutral-950 border border-neutral-900 flex items-center justify-center mb-6 text-neutral-800">
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
    <h3 className="text-sm font-black text-neutral-600 uppercase tracking-[0.2em]">{message}</h3>
    {sub && <p className="text-[10px] font-black uppercase text-neutral-800 tracking-widest mt-2">{sub}</p>}
  </div>
);

export default Library;
