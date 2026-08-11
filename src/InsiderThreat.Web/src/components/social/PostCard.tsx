import { Card, Avatar, Dropdown, message as antdMessage } from 'antd';
import type { MenuProps } from 'antd';
import {
    UserOutlined,
    MoreOutlined,
    LikeOutlined,
    LikeFilled,
    CommentOutlined,
    ShareAltOutlined,
    GlobalOutlined
} from '@ant-design/icons';
import { useState } from 'react';
import api from '../../services/api';
import { authService } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { feedService } from '../../services/feedService';
import styles from './PostCard.module.css';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, 
    Tooltip
} from 'recharts';

interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    authorAvatarUrl?: string;
    content: string;
    privacy: string;
    likedBy: string[];
    commentCount: number;
    shareCount: number;
    createdAt: string;
    type?: string;
    category?: string;
    pollOptions?: { text: string; voterIds: string[] }[];
    multipleChoice?: boolean;
    pollEndsAt?: string;
}

interface PostCardProps {
    post: Post;
    onPostDeleted?: (postId: string) => void;
    onPostUpdated?: (postId: string, post: Post) => void;
}

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'];
const PostCard: React.FC<PostCardProps> = ({ post, onPostDeleted, onPostUpdated }) => {
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const currentUser = authService.getCurrentUser();
    const userId = currentUser?.id || '';
    const userRole = currentUser?.role?.toLowerCase() || '';
    const isAdmin = userRole.includes('admin') || userRole.includes('giám đốc') || userRole.includes('director') || currentUser?.username?.toLowerCase() === 'admin';

    const [liked, setLiked] = useState(post.likedBy?.includes(userId) || false);
    const [likeCount, setLikeCount] = useState(post.likedBy?.length || 0);
    const [loading, setLoading] = useState(false);
    const [showChart, setShowChart] = useState(true);

    const handleLike = async () => {
        if (loading) return;
        try {
            setLoading(true);
            const result = await feedService.likePost(post.id);
            setLiked(result.liked);
            setLikeCount(result.likeCount);
        } catch (error: any) {
            console.error('Error liking post:', error);
            antdMessage.error('Không thể thích bài viết');
        } finally {
            setLoading(false);
        }
    };

    const handleVote = async (optionIndex: number) => {
        if (loading) return;
        
        const hasVotedAny = post.pollOptions!.some(o => o.voterIds?.includes(userId));
        const isClosed = post.pollEndsAt && new Date(post.pollEndsAt) < new Date();

        if (isClosed) {
            antdMessage.warning('Bình chọn này đã kết thúc');
            return;
        }

        if (hasVotedAny && !isAdmin) {
            antdMessage.info('Bạn đã tham gia bình chọn này rồi');
            return;
        }

        try {
            setLoading(true);
            const res = await feedService.votePoll(post.id, optionIndex);
            
            if (res.success) {
                antdMessage.success('Cảm ơn bạn đã bình chọn! 🚀');
                if (onPostUpdated) {
                    const updatedPost = { ...post, pollOptions: res.pollOptions };
                    onPostUpdated(post.id, updatedPost);
                }
            }
        } catch (error: any) {
            console.error('Error voting:', error);
            antdMessage.error(error.response?.data?.message || 'Lỗi khi bình chọn');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete<void>(`/api/socialfeed/posts/${post.id}`);
            if (onPostDeleted) {
                onPostDeleted(post.id);
            }
        } catch (error: any) {
            console.error('Error deleting post:', error);
            antdMessage.error(error.response?.data?.message || 'Failed to delete post');
        }
    };

    const menuItems: MenuProps['items'] = [
        { key: '1', label: 'Save post' },
        ...(post.authorId === userId || currentUser?.role === 'Admin'
            ? [
                { key: '2', label: 'Edit post' },
                { key: '3', label: 'Delete post', onClick: handleDelete, danger: true },
            ]
            : []),
        { key: '4', label: 'Report post' },
    ];

    const getTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (isNaN(date.getTime())) return 'unknown time';

        if (seconds < 60) return 'vừa xong';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
        return `${Math.floor(seconds / 86400)} ngày trước`;
    };

    // Prepare chart data
    const chartData = post.pollOptions?.map((opt, index) => ({
        name: opt.text,
        value: opt.voterIds?.length || 0,
        color: CHART_COLORS[index % CHART_COLORS.length]
    })) || [];

    const totalVotes = post.pollOptions?.reduce((sum, o) => sum + (o.voterIds?.length || 0), 0) || 0;

    return (
        <Card className={styles.card}>
            {/* Post Header */}
            <div className={styles.header}>
                <div className={styles.userInfo}>
                    <Avatar size={40} src={post.authorAvatarUrl} icon={<UserOutlined />} />
                    <div className={styles.info}>
                        <div className={styles.name}>{post.authorName}</div>
                        <div className={styles.meta}>
                            <span>{getTimeAgo(post.createdAt)}</span>
                            <span className={styles.dot}>·</span>
                            <GlobalOutlined style={{ fontSize: 12 }} />
                            {post.category && <span className="ml-2 text-blue-500 font-medium">#{post.category}</span>}
                        </div>
                    </div>
                </div>
                <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
                    <div className={styles.moreBtn}>
                        <MoreOutlined />
                    </div>
                </Dropdown>
            </div>

            {/* Post Content */}
            <div className={styles.content}>
                <div 
                    className="mb-5 text-[18px] font-black leading-relaxed" 
                >
                    {post.content}
                </div>
                
                {/* ADVANCED POLL UI */}
                {post.type === 'Poll' && post.pollOptions && (
                    <div className="poll-container-premium">
                        <div className="flex justify-between items-center mb-4">
                            <div className="text-[13px] font-bold text-blue-600 flex items-center gap-2 uppercase tracking-tight">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                📊 Khảo sát nhân viên
                            </div>
                            {isAdmin && (
                                <button 
                                    className="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                                    onClick={() => setShowChart(!showChart)}
                                >
                                    {showChart ? 'Ẩn biểu đồ' : 'Hiện biểu đồ'}
                                </button>
                            )}
                        </div>

                        {/* Admin Analytics Chart */}
                        {isAdmin && showChart && totalVotes > 0 && (
                            <div className={`admin-poll-analytics mb-6 p-4 rounded-2xl border shadow-sm ${isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white/50 border-blue-100 backdrop-blur-md'}`}>
                                <div className="text-[12px] font-semibold text-slate-500 mb-2 text-center uppercase tracking-widest">Tỉ lệ phản hồi</div>
                                <div style={{ width: '100%', height: 180 }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={45}
                                                outerRadius={70}
                                                paddingAngle={5}
                                                dataKey="value"
                                                animationDuration={1500}
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
                                    {chartData.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                                            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{item.name}: {item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Poll Options UI */}
                        <div className="space-y-3">
                            {post.pollOptions.map((opt, index) => {
                                const myVote = opt.voterIds?.includes(userId);
                                const hasVotedAny = post.pollOptions!.some(o => o.voterIds?.includes(userId));
                                const percentage = totalVotes > 0 ? Math.round(((opt.voterIds?.length || 0) / totalVotes) * 100) : 0;
                                const isClosed = post.pollEndsAt && new Date(post.pollEndsAt) < new Date();
                                const showResult = hasVotedAny || isClosed || isAdmin;

                                return (
                                    <div key={index} className="relative cursor-pointer group" onClick={() => handleVote(index)}>
                                        {showResult ? (
                                            <div className={`poll-result-bar ${myVote ? 'voted' : ''}`}>
                                                    <div 
                                                        className="poll-progress-liquid"
                                                        style={{ 
                                                            width: `${percentage}%`,
                                                            background: myVote 
                                                                ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' 
                                                                : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'linear-gradient(90deg, #e2e8f0, #f1f5f9)')
                                                        }}
                                                    />
                                                    <div className="relative z-10 flex justify-between items-center text-sm px-4 h-11">
                                                        <span className={`font-bold flex items-center gap-2 ${myVote ? (isDarkMode ? 'text-blue-300' : 'text-blue-800') : (isDarkMode ? 'text-slate-200' : 'text-slate-900')}`}>
                                                            {opt.text} {myVote && <span className={`${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'} rounded-full px-2 py-0.5 text-[10px] font-black`}>BẠN ĐÃ CHỌN</span>}
                                                        </span>
                                                        <span className={`${isDarkMode ? 'text-slate-100' : 'text-slate-900'} font-extrabold`}>{percentage}%</span>
                                                    </div>
                                            </div>
                                        ) : (
                                            <div className="poll-option-interactive">
                                                <div className={`w-5 h-5 rounded-full border-2 ${isDarkMode ? 'border-slate-600' : 'border-slate-300'} group-hover:border-blue-500 flex items-center justify-center transition-all`}>
                                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 scale-0 group-hover:scale-100 transition-all" />
                                                </div>
                                                <span className={`text-[14px] font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{opt.text}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <div className="flex -space-x-2 overflow-hidden">
                                <span className="text-xs text-slate-500 font-medium">✨ {totalVotes} nhân viên đã tham gia</span>
                            </div>
                            {post.pollEndsAt && (
                                <div className="text-[11px] text-slate-400 font-medium">
                                    Hết hạn: {new Date(post.pollEndsAt).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Post Stats */}
            <div className={styles.stats}>
                <div className={styles.likes}>
                    {likeCount > 0 && (
                        <>
                            <span className={styles.likeIcon}>👍</span>
                            <span>{likeCount}</span>
                        </>
                    )}
                </div>
                <div className={styles.interactions}>
                    {post.commentCount > 0 && <span>{post.commentCount} comments</span>}
                    {post.shareCount > 0 && <span>{post.shareCount} shares</span>}
                </div>
            </div>

            <div className={styles.divider} />

            {/* Post Actions */}
            <div className={styles.actions}>
                <div
                    className={`${styles.action} ${liked ? styles.liked : ''}`}
                    onClick={handleLike}
                    style={{ pointerEvents: loading ? 'none' : 'auto' }}
                >
                    {liked ? <LikeFilled style={{ color: 'var(--primary-blue)' }} /> : <LikeOutlined />}
                    <span>Like</span>
                </div>
                <div className={styles.action}>
                    <CommentOutlined />
                    <span>Comment</span>
                </div>
                <div className={styles.action}>
                    <ShareAltOutlined />
                    <span>Share</span>
                </div>
            </div>
        </Card>
    );
};

export default PostCard;
