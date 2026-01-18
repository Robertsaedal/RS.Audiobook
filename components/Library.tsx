
import React, { useEffect, useState, useMemo } from 'react';
import { AuthState, ABSLibraryItem } from '../types';
import { ABSService } from '../services/absService';

interface LibraryProps {
  auth: AuthState;
  onSelectItem: (item: ABSLibraryItem) => void;
  onLogout: () => void;
}

const Library: React.FC<LibraryProps> = ({ auth, onSelectItem, onLogout }) => {
  const [items, setItems] = useState<ABSLibraryItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RECENT' | 'SERIES' | 'HISTORY'>('RECENT');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<any | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [libraryItems, userHistory] = await Promise.all([
        absService.getLibraryItems(),
        absService.getUserHistory()
      ]);
      setItems(libraryItems);
      setHistory(userHistory);
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [absService]);

  // CONTINUE LISTENING: Find the most recent unfinished book
  const continueListeningItem = useMemo(() => {
    return items
      .filter(item => {
        const progress = (item as any).userProgress;
        return progress && !progress.isFinished && progress.currentTime > 0;
      })
      .sort((a, b) => {
        const progA = (a as any).userProgress?.lastUpdate || 0;
        const progB = (b as any).userProgress?.lastUpdate || 0;
        return progB - progA;
      })[0];
  }, [items]);

  // HISTORY ITEMS: Populate from server history mapping to library items
  const historyItems = useMemo(() => {
    if (!history.length) return [];
    // Map history sessions to our actual library items
    const itemMap = new Map(items.map(i => [i.id, i]));
    const uniqueIds = new Set();
    return history
      .map(session => itemMap.get(session.libraryItemId || session.itemId))
      .filter(item => {
        if (!item || uniqueIds.has(item.id)) return false;
        uniqueIds.add(item.id);
        return true;
      }) as ABSLibraryItem[];
  }, [history, items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.media?.metadata?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.media?.metadata?.authorName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  const seriesGroups = useMemo(() => {
    const grouped = items.reduce((acc: Record<string, ABSLibraryItem[]>, item) => {
      const sName = item.media.metadata.seriesName;
      if (!sName) return acc;

      const key = sName.trim();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});

    return Object.entries(grouped).map(([name, groupItems]) => {
      const sorted = [...groupItems].sort((a, b) => {
        const seqA = parseInt(a.media.metadata.sequence || '0', 10);
        const seqB = parseInt(b.media.metadata.sequence || '0', 10);
        return seqA - seqB;
      });

      const book1 = sorted.find(i => parseInt(i.media.metadata.sequence || '0', 10) === 1) || sorted[0];

      return {
        id: `series-${name}`,
        name: name,
        items: sorted,
        bookCount: sorted.length,
        coverUrl: absService.getCoverUrl(book1.id)
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, absService]);

  const filteredSeries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return seriesGroups;
    return seriesGroups.filter(g => g.name.toLowerCase().includes(term));
  }, [seriesGroups, searchTerm]);

  const handleBookSelect = (item: ABSLibraryItem) => {
    onSelectItem(item);
  };

  return (
    <div className="flex-1 flex flex-col safe-top overflow-hidden bg-black min-h-screen">
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
            placeholder="Search library..."
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

      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar scroll-container pb-24">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-[2/3] bg-neutral-900/50 rounded-2xl animate-pulse border border-white/5" />)}
          </div>
        ) : (
          <>
            {activeTab === 'RECENT' && (
              <div className="space-y-10">
                {/* CONTINUE LISTENING SECTION */}
                {!searchTerm && continueListeningItem && (
                  <div className="animate-fade-in">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-6">Continue Listening</h3>
                    <div 
                      onClick={() => handleBookSelect(continueListeningItem)}
                      className="group relative w-full aspect-[21/9] bg-neutral-900 rounded-[32px] overflow-hidden border border-white/5 cursor-pointer hover:border-aether-purple/50 transition-all active:scale-[0.98] shadow-2xl"
                    >
                      <img 
                        src={absService.getCoverUrl(continueListeningItem.id)} 
                        alt="Resume" 
                        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
                      <div className="absolute inset-y-0 left-0 p-8 flex flex-col justify-center max-w-[70%]">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-aether-purple mb-2">RESUME SESSION</span>
                        <h4 className="text-xl font-black uppercase tracking-tight text-white mb-1 line-clamp-1">{continueListeningItem.media.metadata.title}</h4>
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{continueListeningItem.media.metadata.authorName}</p>
                      </div>
                      <div className="absolute right-8 top-1/2 -translate-y-1/2 w-14 h-14 gradient-aether rounded-full flex items-center justify-center shadow-aether-glow">
                        <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </div>
                )}

                <div className="animate-fade-in">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-6">Your Library</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                    {filteredItems.map(item => (
                      <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'HISTORY' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                {historyItems.length > 0 ? historyItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} isHistory coverUrl={absService.getCoverUrl(item.id)} />
                )) : <EmptyState message="No History Found" />}
              </div>
            )}

            {activeTab === 'SERIES' && (
              <>
                {selectedSeries ? (
                  <div className="animate-fade-in">
                    <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple mb-6 text-[10px] font-black uppercase tracking-widest active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                      All Series
                    </button>
                    <div className="mb-10">
                      <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight mb-2">{selectedSeries.name}</h3>
                      <p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">{selectedSeries.bookCount} Volumes</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                      {selectedSeries.items.map((item: ABSLibraryItem) => (
                        <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} showSequence />
                      ))}
                    </div>
                  </div>
                ) : (
                  <SeriesGrid groups={filteredSeries} onSelect={setSelectedSeries} />
                )}
              </>
            )}

            {!loading && activeTab === 'RECENT' && filteredItems.length === 0 && <EmptyState message="No items found" />}
            {!loading && activeTab === 'SERIES' && filteredSeries.length === 0 && <EmptyState message="No series found" sub="Check your metadata" />}
          </>
        )}
      </div>
    </div>
  );
};

const SeriesGrid: React.FC<{ groups: any[], onSelect: (group: any) => void }> = ({ groups, onSelect }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-12">
    {groups.map(group => (
      <SeriesStackCard key={group.id} group={group} onClick={() => onSelect(group)} />
    ))}
  </div>
);

const SeriesStackCard: React.FC<{ group: any, onClick: () => void }> = ({ group, onClick }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in relative">
    <div className="aspect-[2/3] w-full mb-4 relative">
      {group.bookCount > 1 && (
        <>
          <div 
            className="absolute inset-0 bg-neutral-800 rounded-3xl border border-white/5 opacity-40" 
            style={{ transform: 'translate(8px, -8px)', zIndex: 1 }} 
          />
          <div 
            className="absolute inset-0 bg-neutral-800 rounded-3xl border border-white/5 opacity-70" 
            style={{ transform: 'translate(4px, -4px)', zIndex: 2 }} 
          />
        </>
      )}
      <div className="absolute inset-0 bg-neutral-900 rounded-3xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-white/5 group-hover:border-aether-purple/50 transition-all z-10">
        <img 
          src={group.coverUrl} 
          alt={group.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
          loading="lazy" 
        />
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
             <p className="text-[8px] font-black uppercase tracking-[0.2em] text-aether-purple drop-shadow-sm">COLLECTION</p>
        </div>
      </div>
      <div className="absolute -top-2 -right-2 bg-[#b28a47] w-9 h-9 flex items-center justify-center rounded-full shadow-2xl z-20 border border-black/30 transform translate-x-1 -translate-y-1">
        <p className="text-[14px] font-black text-black leading-none">{group.bookCount}</p>
      </div>
    </div>
    <div className="px-1 text-center mt-2">
      <h3 className="text-[14px] font-bold line-clamp-1 group-hover:text-aether-purple transition-colors leading-tight text-white/90 uppercase tracking-tight">{group.name}</h3>
    </div>
  </button>
);

const BookCard: React.FC<{ item: ABSLibraryItem, onClick: () => void, coverUrl: string, isHistory?: boolean, showSequence?: boolean }> = ({ item, onClick, coverUrl, isHistory, showSequence }) => {
  // Check progress for "Finished" status
  const isFinished = (item as any).userProgress?.isFinished === true;

  return (
    <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
      <div className="aspect-[2/3] w-full bg-neutral-900 rounded-3xl overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all">
        <img src={coverUrl} alt={item.media.metadata.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
        
        {/* FINISHED BADGE */}
        {isFinished && (
          <div className="absolute top-3 right-3 bg-green-500 w-6 h-6 rounded-full flex items-center justify-center border border-black/20 shadow-xl z-10 animate-pulse">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7"/></svg>
          </div>
        )}

        {item.media.metadata.sequence && (
          <div className="absolute top-3 left-3 bg-aether-purple px-2 py-0.5 rounded-lg border border-white/20 shadow-xl z-10">
            <span className="text-[9px] font-black text-white">#{item.media.metadata.sequence}</span>
          </div>
        )}
      </div>
      <div className="px-1">
          <h3 className="text-[13px] font-bold line-clamp-1 mb-0.5 group-hover:text-aether-purple transition-colors leading-tight uppercase tracking-tight">{item.media.metadata.title}</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 truncate">{item.media.metadata.authorName}</p>
          {showSequence && item.media.metadata.sequence && (
              <p className="text-[9px] font-black text-aether-purple uppercase tracking-[0.2em] mt-1">Volume {item.media.metadata.sequence}</p>
          )}
      </div>
    </button>
  );
};

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
