
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RECENT' | 'SERIES' | 'HISTORY'>('RECENT');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<any | null>(null);

  const absService = useMemo(() => new ABSService(auth.serverUrl, auth.user?.token || ''), [auth]);

  useEffect(() => {
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

  // DATA TRANSFORMATION: THE 'STACK' LOGIC
  const seriesGroups = useMemo(() => {
    const map: Record<string, { name: string, items: ABSLibraryItem[] }> = {};
    
    items.forEach(item => {
      // Primary key: seriesName from metadata. Fallback: series array first entry.
      const sName = item.media.metadata.seriesName || (item as any).series?.[0]?.name;
      
      // Filter: Only show books that belong to a series in this tab
      if (!sName) return;

      // Normalize key to ensure "All the Skills" and "all the skills" merge
      const key = sName.trim().toLowerCase();
      if (!map[key]) {
        map[key] = { name: sName.trim(), items: [] };
      }
      map[key].items.push(item);
    });

    // Process mapped groups into final stack objects
    const finalGroups: Record<string, any> = {};
    Object.entries(map).forEach(([key, data]) => {
      // Internal Sorting: Books arranged by sequence number
      const sorted = [...data.items].sort((a, b) => {
        const seqA = parseFloat(a.media.metadata.sequence || '0');
        const seqB = parseFloat(b.media.metadata.sequence || '0');
        return seqA - seqB;
      });

      finalGroups[key] = {
        id: `group-${key}`,
        name: data.name,
        items: sorted,
        bookCount: sorted.length,
        // The Visual: Main front cover comes from Sequence 1
        coverUrl: absService.getCoverUrl(sorted[0].id)
      };
    });

    return finalGroups;
  }, [items, absService]);

  // Derived array for searching/sorting the stacks
  const filteredSeriesArray = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const values = Object.values(seriesGroups);
    if (!term) return values.sort((a, b) => a.name.localeCompare(b.name));
    return values
      .filter(g => g.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [seriesGroups, searchTerm]);

  const handleBookSelect = (item: ABSLibraryItem) => {
    const savedHistory = JSON.parse(localStorage.getItem('rs_history') || '[]');
    const newHistory = [item.id, ...savedHistory.filter((id: string) => id !== item.id)].slice(0, 20);
    localStorage.setItem('rs_history', JSON.stringify(newHistory));
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

      <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar scroll-container pb-24">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-[2/3] bg-neutral-900/50 rounded-2xl animate-pulse border border-white/5" />)}
          </div>
        ) : (
          <>
            {activeTab === 'RECENT' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                {filteredItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} />
                ))}
              </div>
            )}

            {activeTab === 'HISTORY' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-10">
                {historyItems.length > 0 ? historyItems.map(item => (
                  <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} isHistory coverUrl={absService.getCoverUrl(item.id)} />
                )) : <EmptyState message="No History Yet" />}
              </div>
            )}

            {activeTab === 'SERIES' && (
              <>
                {selectedSeries ? (
                  // DRILL-DOWN: THE SERIES DETAIL VIEW
                  <div className="animate-fade-in">
                    <button onClick={() => setSelectedSeries(null)} className="flex items-center gap-2 text-aether-purple mb-6 text-[10px] font-black uppercase tracking-widest active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                      Back to Series
                    </button>
                    <div className="mb-10">
                      <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight mb-2">{selectedSeries.name}</h3>
                      <p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">{selectedSeries.bookCount} {selectedSeries.bookCount === 1 ? 'Volume' : 'Volumes'} in collection</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                      {selectedSeries.items.map((item: ABSLibraryItem) => (
                        <BookCard key={item.id} item={item} onClick={() => handleBookSelect(item)} coverUrl={absService.getCoverUrl(item.id)} showSequence />
                      ))}
                    </div>
                  </div>
                ) : (
                  // SERIES GRID: THE STACKED VIEW
                  <SeriesGrid groups={filteredSeriesArray} onSelect={setSelectedSeries} />
                )}
              </>
            )}

            {!loading && activeTab === 'RECENT' && filteredItems.length === 0 && <EmptyState message="No items found" sub="Check your search or library" />}
            {!loading && activeTab === 'SERIES' && filteredSeriesArray.length === 0 && <EmptyState message="No series found" sub="Check your metadata" />}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * SeriesGrid Component
 * Maps over Object.values(seriesGroups) to display folder stacks
 */
const SeriesGrid: React.FC<{ groups: any[], onSelect: (group: any) => void }> = ({ groups, onSelect }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-12">
    {groups.map(group => (
      <SeriesStackCard key={group.id} group={group} onClick={() => onSelect(group)} />
    ))}
  </div>
);

/**
 * SeriesStackCard Component
 * Displays the folder stack visual with a book count badge
 */
const SeriesStackCard: React.FC<{ group: any, onClick: () => void }> = ({ group, onClick }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
    <div className="aspect-[2/3] w-full mb-4 relative">
      
      {/* Visual Folder Stack: layered backgrounds */}
      {group.bookCount > 1 && (
        <>
          <div className="absolute inset-0 bg-neutral-800/40 rounded-3xl translate-x-3 -translate-y-2 border border-white/5" />
          <div className="absolute inset-0 bg-neutral-800/70 rounded-3xl translate-x-1.5 -translate-y-1 border border-white/5" />
        </>
      )}

      {/* Main Front Cover Container */}
      <div className="absolute inset-0 bg-neutral-900 rounded-3xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-white/5 group-hover:border-aether-purple/50 transition-all z-10">
        <img src={group.coverUrl} alt={group.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
        
        {/* Branding Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
             <p className="text-[8px] font-black uppercase tracking-[0.2em] text-aether-purple drop-shadow-sm">COLLECTION</p>
        </div>
      </div>
      
      {/* Circular Gold/Orange Book Count Badge (Top Right) */}
      <div className="absolute -top-1 -right-1 bg-[#b28a47] w-8 h-8 flex items-center justify-center rounded-full shadow-2xl z-20 border border-black/20 transform translate-x-1 -translate-y-1">
        <p className="text-[13px] font-black text-black leading-none">{group.bookCount}</p>
      </div>
    </div>

    {/* The Label: Series Name below the card */}
    <div className="px-1 text-center mt-2">
      <h3 className="text-[14px] font-bold line-clamp-1 group-hover:text-aether-purple transition-colors leading-tight text-white/90 uppercase tracking-tight">{group.name}</h3>
    </div>
  </button>
);

const BookCard: React.FC<{ item: ABSLibraryItem, onClick: () => void, coverUrl: string, isHistory?: boolean, showSequence?: boolean }> = ({ item, onClick, coverUrl, isHistory, showSequence }) => (
  <button onClick={onClick} className="flex flex-col text-left group transition-all active:scale-95 animate-fade-in">
    <div className="aspect-[2/3] w-full bg-neutral-900 rounded-3xl overflow-hidden mb-4 relative shadow-2xl border border-white/5 group-hover:border-aether-purple/50 transition-all">
      <img src={coverUrl} alt={item.media.metadata.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
      
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
