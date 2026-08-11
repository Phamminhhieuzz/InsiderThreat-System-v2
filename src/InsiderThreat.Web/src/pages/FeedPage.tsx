import { useState, useEffect, useRef } from 'react';
import { message } from 'antd';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import { API_BASE_URL } from '../services/api';
import { feedService } from '../services/feedService';
import type { User, Post } from '../types';
import PostCard from '../components/PostCard';
import NavigationBar from '../components/NavigationBar';
import LeftSidebar from '../components/LeftSidebar';
import FloatingChat from '../components/chat/FloatingChat';
import RightSidebar from '../components/social/RightSidebar';
import BottomNavigation from '../components/BottomNavigation';

import CreatePostModal from '../components/social/CreatePostModal';
import { POST_CATEGORIES } from '../constants';
import './FeedPage.css';



export default function FeedPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = authService.getCurrentUser();
    const { t } = useTranslation();
    const [openChats, setOpenChats] = useState<User[]>([]); // Max 3 chat windows

    // Helper function to open a chat window
    const handleOpenChat = (chatUser: User) => {
        // Check if already open
        if (openChats.some(u => u.id === chatUser.id || u.username === chatUser.username)) {
            return; // Already open
        }
        // Check max limit
        if (openChats.length >= 3) {
            message.warning(t('feed.max_chat_windows', 'Maximum 3 chat windows allowed'));
            return;
        }
        setOpenChats(prev => [...prev, chatUser]);
    };

    // Function to close a chat window
    const handleCloseChat = (chatUserId: string) => {
        setOpenChats(prev => prev.filter(u => (u.id || u.username) !== chatUserId));
    };

    // Feed State
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showPostModal, setShowPostModal] = useState(false);

    const [searchParams] = useSearchParams();

    // Filter State
    const [filterCategory, setFilterCategory] = useState<string>(searchParams.get('category') || 'All');
    const [filterDate, setFilterDate] = useState<string>('All');

    // Highlighted Post State
    const highlightedPostId = searchParams.get('postId');

    // Focused Post State (from notification hash)
    const [focusedPostId, setFocusedPostId] = useState<string | null>(null);

    // Detect hash for focused post (from notification)
    useEffect(() => {
        const hash = location.hash.slice(1); // Remove #
        if (hash) {
            setFocusedPostId(hash);
            // Scroll to post after small delay
            setTimeout(() => {
                const element = document.getElementById(`post-${hash}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        } else {
            setFocusedPostId(null);
        }
    }, [location.hash, posts]); // Re-run when hash or posts change

    // Initial Data Fetch
    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const postsData = await feedService.getPosts();
                // Sort: Pinned first, then by Date descending
                const sortedPosts = postsData.posts.sort((a, b) => {
                    if (a.isPinned === b.isPinned) {
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    }
                    return a.isPinned ? -1 : 1;
                });
                setPosts(sortedPosts);
            } catch (error) {
                console.error("Error loading feed data", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user?.username, navigate]);

    const getAvatarUrl = (userOrUrl?: any) => {
        if (!userOrUrl) return `https://i.pravatar.cc/150?u=user`;
        const url = typeof userOrUrl === 'string' ? userOrUrl : userOrUrl.avatarUrl;
        if (!url) return `https://i.pravatar.cc/150?u=${userOrUrl.username || 'user'}`;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    };

    const handleCreatedPost = (newPost: Post) => {
        setPosts([newPost, ...posts]);
    };

    const handlePostUpdated = (updatedPost: Post) => {
        setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    };

    const handlePostDeleted = (postId: string) => {
        setPosts(prev => prev.filter(p => p.id !== postId));
    };

    // Filter Logic
    const filteredPosts = posts.filter(post => {
        // If highlightedPostId is present, only show that specific post
        if (highlightedPostId && post.id !== highlightedPostId) {
            return false;
        }

        // Category filter
        if (filterCategory !== 'All' && post.category !== filterCategory) {
            return false;
        }

        // Date filter
        if (filterDate !== 'All') {
            const postDate = new Date(post.createdAt);
            const now = new Date();

            if (filterDate === 'Today') {
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (postDate < today) return false;
            } else if (filterDate === 'Week') {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                if (postDate < weekAgo) return false;
            } else if (filterDate === 'Month') {
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                if (postDate < monthAgo) return false;
            }
        }

        return true;
    });

    return (
        <div className="flex min-h-screen w-full flex-col bg-[var(--color-bg)] text-[var(--color-text-main)]">
            {/* New Navigation Bar */}
            <NavigationBar onChatClick={() => navigate('/chat')} hideSearch={true} />

            <div className="social-layout">
                {/* Left Navigation Sidebar */}
                <LeftSidebar />

                {/* Main Feed Content */}
                <div className="feed-wrapper">
                    <div className="feed-container">

                        {/* Create Post — Premium Trigger */}
                        <div className="post-composer-trigger">
                            <div className="post-composer-input-row" onClick={() => setShowPostModal(true)}>
                                <div className="post-composer-avatar" style={{
                                    backgroundImage: `url(${getAvatarUrl(user)})`,
                                }} />
                                <div className="post-composer-placeholder">
                                    {t('feed.post_placeholder', { name: user?.fullName?.split(' ').pop() || user?.username, defaultValue: `${user?.fullName?.split(' ').pop() || user?.username} ơi, bạn đang nghĩ gì?` })}
                                </div>
                            </div>
                            <div className="post-composer-divider" />
                            <div className="post-composer-actions">
                                <button className="post-composer-action-btn" onClick={() => setShowPostModal(true)}>
                                    <span className="material-symbols-outlined" style={{ color: '#4ade80', fontSize: 20 }}>image</span>
                                    <span>{t('feed.media_btn', 'Ảnh/Video')}</span>
                                </button>
                                <button className="post-composer-action-btn" onClick={() => setShowPostModal(true)}>
                                    <span className="material-symbols-outlined" style={{ color: '#facc15', fontSize: 20 }}>mood</span>
                                    <span>{t('feed.feeling_btn', 'Cảm xúc')}</span>
                                </button>
                                <button className="post-composer-submit-btn" onClick={() => setShowPostModal(true)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit_square</span>
                                    {t('feed.post_btn', 'Đăng bài')}
                                </button>
                            </div>
                        </div>

                        {/* Post Creation Modal — Premium Component */}
                        {showPostModal && (
                            <CreatePostModal
                                user={user}
                                onClose={() => setShowPostModal(false)}
                                onPostCreated={handleCreatedPost}
                            />
                        )}

                        {/* Premium Filter Bar */}
                        <div className="feed-filter-bar">
                            <div className="feed-filter-section">
                                <span className="feed-filter-label">{t('feed.filter_period', 'Thời gian')}:</span>
                                <div className="feed-filter-pills hide-scrollbar">
                                    {['All', 'Today', 'Week', 'Month'].map(period => (
                                        <button
                                            key={period}
                                            onClick={() => setFilterDate(period)}
                                            className={`feed-filter-pill ${filterDate === period ? 'active' : ''}`}
                                        >
                                            {period === 'All' ? t('feed.period_all', 'Tất cả') : period === 'Today' ? t('feed.period_today', 'Hôm nay') : period === 'Week' ? t('feed.period_week', 'Tuần này') : t('feed.period_month', 'Tháng này')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="feed-filter-divider" />

                            <div className="feed-filter-section">
                                <span className="feed-filter-label">{t('feed.filter_category', 'Danh mục')}:</span>
                                <div className="feed-filter-pills hide-scrollbar">
                                    <button
                                        onClick={() => setFilterCategory('All')}
                                        className={`feed-filter-pill ${filterCategory === 'All' ? 'active' : ''}`}
                                    >
                                        {t('feed.all_categories', 'Tất cả')}
                                    </button>
                                    {POST_CATEGORIES.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setFilterCategory(cat)}
                                            className={`feed-filter-pill ${filterCategory === cat ? 'active' : ''}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Survey Module Banner — Refined to be clearly separate */}
                        {filterCategory === 'Surveys' && (
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 mb-2 shadow-lg border border-white/20">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl border border-white/30">📊</div>
                                    <div>
                                        <h1 className="text-xl font-bold text-white leading-tight">Trung tâm Khảo sát</h1>
                                        <p className="text-blue-50/70 text-xs font-medium">Lắng nghe ý kiến, cùng nhau phát triển doanh nghiệp 🚀</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Posts */}
                        {isLoading ? (
                            <div className="flex justify-center items-center py-20">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
                            </div>
                        ) : (
                            <>
                                {/* Show "View All Posts" button when in focused mode */}
                                {focusedPostId && (
                                    <div className="mb-4 p-4 bg-[var(--color-dark-surface)] rounded-xl border border-[var(--color-border)] flex items-center justify-between">
                                        <p className="text-[var(--color-text-muted)] text-sm">
                                            {t('feed.viewing_single', 'Viewing single post from notification')}
                                        </p>
                                        <button
                                            onClick={() => {
                                                setFocusedPostId(null);
                                                window.history.pushState({}, '', '/feed');
                                            }}
                                            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors text-sm font-medium"
                                        >
                                            {t('feed.view_all', 'View All Posts')}
                                        </button>
                                    </div>
                                )}

                                {(focusedPostId ? filteredPosts.filter(p => p.id === focusedPostId) : filteredPosts).map(post => (
                                    <div
                                        key={post.id}
                                        id={`post-${post.id}`}
                                        style={{
                                            border: highlightedPostId === post.id ? '3px solid #ff4d4f' : 'none',
                                            borderRadius: '8px',
                                            padding: highlightedPostId === post.id ? '8px' : '0',
                                            backgroundColor: highlightedPostId === post.id ? 'rgba(255, 77, 79, 0.05)' : 'transparent'
                                        }}
                                    >
                                        {highlightedPostId === post.id && (
                                            <div style={{
                                                backgroundColor: '#ff4d4f',
                                                color: 'white',
                                                padding: '8px 12px',
                                                borderRadius: '4px',
                                                marginBottom: '8px',
                                                fontWeight: 600,
                                                textAlign: 'center'
                                            }}>
                                                {t('feed.reported_post', '📌 Bài viết được báo cáo')}
                                            </div>
                                        )}
                                        <PostCard
                                            key={post.id}
                                            post={post}
                                            currentUser={user}
                                            onPostUpdated={handlePostUpdated}
                                            onPostDeleted={handlePostDeleted}
                                        />
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Right Sidebar - Suggestions */}
                <RightSidebar onContactClick={handleOpenChat} />
            </div>

            {/* Floating Chat Windows - Render up to 3 */}
            {openChats.map((chatUser, index) => (
                <FloatingChat
                    key={chatUser.id || chatUser.username}
                    chatUser={chatUser}
                    windowIndex={index}
                    onClose={() => handleCloseChat(chatUser.id || chatUser.username)}
                />
            ))}

            <BottomNavigation />
        </div>
    );
}
