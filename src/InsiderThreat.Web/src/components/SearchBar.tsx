import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchService, type SearchPostsParams } from '../services/searchService';
import type { Post } from '../types';

// Simple inline SVG icons
const SearchIcon = ({ size = 20, className = "" }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
    </svg>
);

const CloseIcon = ({ size = 20, className = "" }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

export default function SearchBar() {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [quickResults, setQuickResults] = useState<Post[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Keyboard shortcut: Ctrl+K or Cmd+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Debounced search
    useEffect(() => {
        if (!query.trim()) {
            setQuickResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const params: SearchPostsParams = { q: query };
                const response = await searchService.searchPosts(params);
                setQuickResults(response.posts.slice(0, 5)); // Limit to 5 quick results
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleViewAll = () => {
        navigate(`/search?q=${encodeURIComponent(query)}`);
        setIsOpen(false);
        setQuery('');
    };

    const handleResultClick = (postId: string) => {
        navigate(`/feed#${postId}`);
        setIsOpen(false);
        setQuery('');
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-dark-surface)] text-[var(--color-text-muted)] rounded-lg hover:bg-[var(--color-dark-surface-lighter)] transition-colors border border-[var(--color-border)]"
            >
                <SearchIcon size={18} />
                <span className="text-sm">Search...</span>
                <kbd className="hidden md:inline-block px-2 py-0.5 text-xs bg-[var(--color-dark-bg)] rounded border border-[var(--color-border)]">
                    Ctrl+K
                </kbd>
            </button>
        );
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => {
                    setIsOpen(false);
                    setQuery('');
                }}
            />

            {/* Search Modal */}
            <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 px-4">
                <div className="bg-[var(--color-dark-surface)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden">
                    {/* Search Input */}
                    <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)]">
                        <SearchIcon size={20} className="text-[var(--color-text-muted)]" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && query.trim()) {
                                    handleViewAll();
                                }
                            }}
                            placeholder="Search posts, users..."
                            className="flex-1 bg-transparent text-white placeholder-[var(--color-text-muted)] outline-none text-base"
                            autoFocus
                        />
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                setQuery('');
                            }}
                            className="text-[var(--color-text-muted)] hover:text-white transition-colors p-1 rounded hover:bg-[var(--color-dark-surface-lighter)]"
                        >
                            <CloseIcon size={20} className="pointer-events-none" />
                        </button>
                    </div>

                    {/* Quick Results */}
                    {query.trim() && (
                        <div className="max-h-96 overflow-y-auto">
                            {isSearching ? (
                                <div className="p-8 text-center text-[var(--color-text-muted)]">
                                    Searching...
                                </div>
                            ) : quickResults.length > 0 ? (
                                <>
                                    {quickResults.map((post) => (
                                        <div
                                            key={post.id}
                                            onClick={() => handleResultClick(post.id!)}
                                            className="p-4 hover:bg-[var(--color-dark-surface-lighter)] cursor-pointer transition-colors border-b border-[var(--color-border)] last:border-b-0"
                                        >
                                            <div className="font-medium text-white mb-1">{post.authorName}</div>
                                            <div className="text-sm text-[var(--color-text-muted)] line-clamp-2">
                                                {post.content}
                                            </div>
                                            <div className="text-xs text-[var(--color-text-muted)] mt-2">
                                                {new Date(post.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}

                                    {/* View All Button */}
                                    <button
                                        onClick={handleViewAll}
                                        className="w-full p-4 text-center text-[var(--color-primary)] hover:bg-[var(--color-dark-surface-lighter)] transition-colors font-medium"
                                    >
                                        View All Results →
                                    </button>
                                </>
                            ) : (
                                <div className="p-8 text-center text-[var(--color-text-muted)]">
                                    No results found
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
