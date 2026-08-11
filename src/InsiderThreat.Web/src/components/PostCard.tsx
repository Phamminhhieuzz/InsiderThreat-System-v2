import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { feedService } from '../services/feedService';
import { API_BASE_URL } from '../services/api';
import type { Post, Comment, User } from '../types';

interface PostCardProps {
    post: Post;
    currentUser: User | null;
    onPostUpdated: (updatedPost: Post) => void;
    onPostDeleted: (postId: string) => void;
}

const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHrs = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHrs < 24) return `${diffHrs} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
};

const formatDateTime = (dateString: string) => {
    const d = new Date(dateString);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${mm} · ${dd}/${mo}/${yyyy}`;
};

const getPrivacyIcon = (privacy?: string) => {
    switch (privacy) {
        case 'Public': return <span className="material-symbols-outlined text-[10px]">public</span>;
        case 'Private': return <span className="material-symbols-outlined text-[10px]">lock</span>;
        default: return <span className="material-symbols-outlined text-[10px]">group</span>;
    }
};

// SVG Reaction Icons (Facebook-style)
const ReactionSVGs: Record<string, React.ReactElement> = {
    like: (
        <svg viewBox="0 0 24 24" fill="#1877f2" width="22" height="22">
            <path d="M14.5 2.25c-.69 0-1.375.275-1.875.825L7.75 8.25H4.5c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h14.25c.9 0 1.675-.6 1.925-1.475l2-7.5c.325-1.2-.575-2.375-1.925-2.375H15.5V4.25c0-1.1-.9-2-2-2h-1zm-8 18H5v-9h1.5v9z" />
        </svg>
    ),
    love: (
        <svg viewBox="0 0 24 24" fill="#f63b4f" width="22" height="22">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    ),
    haha: (
        <svg viewBox="0 0 24 24" fill="#f7b928" width="22" height="22">
            <circle cx="12" cy="12" r="10" />
            <path fill="#fff" d="M8.5 10.5c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm7 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm-3.5 6c2.3 0 4.3-1.5 5-3.5H7c.7 2 2.7 3.5 5 3.5z" />
        </svg>
    ),
    wow: (
        <svg viewBox="0 0 24 24" fill="#f7b928" width="22" height="22">
            <circle cx="12" cy="12" r="10" />
            <path fill="#fff" d="M8.5 10c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm7 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm-3.5 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
    ),
    sad: (
        <svg viewBox="0 0 24 24" fill="#f7b928" width="22" height="22">
            <circle cx="12" cy="12" r="10" />
            <path fill="#fff" d="M8.5 10c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm7 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm-3.5 7c2.3 0 4.3-1.5 5-3.5H7c.7 2 2.7 3.5 5 3.5z" transform="rotate(180 12 14)" />
        </svg>
    ),
    angry: (
        <svg viewBox="0 0 24 24" fill="#e66c24" width="22" height="22">
            <circle cx="12" cy="12" r="10" />
            <path fill="#fff" d="M7 9l2.5 1.5m5-1.5L12 10.5M9 16c.7-1 2-1.5 3-1.5s2.3.5 3 1.5H9z" />
        </svg>
    ),
};
const reactionLabelsVI: Record<string, string> = { like: 'Thích', love: 'Yêu thích', haha: 'Haha', wow: 'Wow', sad: 'Buồn', angry: 'Phẫn nộ' };

export default function PostCard({ post, currentUser, onPostUpdated, onPostDeleted }: PostCardProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isLikeAnimating, setIsLikeAnimating] = useState(false);
    const [localPost, setLocalPost] = useState(post);

    // Reaction Users Modal
    const [showReactionsModal, setShowReactionsModal] = useState(false);
    const [reactionUsers, setReactionUsers] = useState<{ id: string; name: string; avatar: string; department?: string; reactionType: string }[]>([]);
    const [reactionFilter, setReactionFilter] = useState<string>('all');

    // Comment image
    const commentFileRef = useRef<HTMLInputElement>(null);
    const commentInputRef = useRef<HTMLInputElement>(null);
    const [commentFile, setCommentFile] = useState<File | null>(null);
    const [commentPreviewUrl, setCommentPreviewUrl] = useState<string | null>(null);
    const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
    const [replyToAuthorName, setReplyToAuthorName] = useState<string>('');

    // Comment reactions: { [commentId]: { [type]: count } }
    const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
    const [myCommentReactions, setMyCommentReactions] = useState<Record<string, string>>({}); // commentId -> reactionType

    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalPost(post);
    }, [post]);

    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getAvatarUrl = (userOrUrl?: any) => {
        if (!userOrUrl) return `https://i.pravatar.cc/150?u=user`;
        const url = typeof userOrUrl === 'string' ? userOrUrl : userOrUrl.authorAvatarUrl || userOrUrl.avatarUrl;
        if (!url) return `https://i.pravatar.cc/150?u=${localPost.authorName}`;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    };

    // Determine my current reaction
    const myReaction = useMemo(() => {
        // Check new reactions dict
        if (localPost.reactions) {
            const found = Object.keys(localPost.reactions).find(key => localPost.reactions![key].includes(currentUser?.id || ''));
            if (found) return found;
        }
        // Fallback to legacy likedBy
        if (localPost.likedBy?.includes(currentUser?.id || '')) return 'like';
        return null;
    }, [localPost, currentUser]);

    const handleLike = async () => {
        if (isLikeAnimating) return;
        setIsLikeAnimating(true);

        // If has reaction -> remove (toggle off). If no reaction -> add 'like'
        const typeToSet = myReaction ? '' : 'like';

        try {
            const res = await feedService.reactToPost(localPost.id, typeToSet);
            if (res.success) {
                const updatedReactions = res.reactions;

                // We also need to ensure legacy likedBy is cleared locally if we are moving away
                let updatedLikedBy = localPost.likedBy || [];
                if (currentUser?.id) {
                    updatedLikedBy = updatedLikedBy.filter(id => id !== currentUser.id);
                }

                const updatedPost = {
                    ...localPost,
                    reactions: updatedReactions,
                    likedBy: updatedLikedBy
                };

                setLocalPost(updatedPost);
                onPostUpdated(updatedPost);
            }
        } catch (error) {
            console.error("Failed to react", error);
        } finally {
            setTimeout(() => setIsLikeAnimating(false), 500);
        }
    };

    const handleSave = async () => {
        try {
            const result = await feedService.savePost(localPost.id);
            const isSaved = result.saved;
            let newSavedBy = localPost.savedBy ? [...localPost.savedBy] : [];
            if (isSaved && !newSavedBy.includes(currentUser?.id || '')) {
                newSavedBy.push(currentUser?.id || '');
            } else if (!isSaved) {
                newSavedBy = newSavedBy.filter(id => id !== currentUser?.id);
            }
            const updated = { ...localPost, savedBy: newSavedBy };
            setLocalPost(updated);
            onPostUpdated(updated);
        } catch (error) {
            console.error("Save failed", error);
        }
    };

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this post?")) {
            try {
                await feedService.deletePost(localPost.id);
                onPostDeleted(localPost.id);
            } catch (error) {
                console.error("Delete failed", error);
                alert("Failed to delete post");
            }
        }
    };

    const handleEditSave = async () => {
        try {
            await feedService.updatePost(localPost.id, editContent);
            const updated = { ...localPost, content: editContent, updatedAt: new Date().toISOString() };
            setLocalPost(updated);
            onPostUpdated(updated);
            setIsEditing(false);
            setIsMenuOpen(false);
        } catch (error) {
            console.error("Update failed", error);
            alert("Failed to update post");
        }
    };

    const handleReport = () => {
        setIsMenuOpen(false);
        setShowReportModal(true);
    };

    const submitReport = async () => {
        if (!reportReason.trim()) return;

        try {
            await feedService.reportPost(localPost.id, reportReason);
            setShowReportModal(false);
            setReportReason('');
            // Show success feedback
            alert("Report submitted. Thank you for keeping our community safe.");
        } catch (error) {
            console.error("Report failed", error);
            alert("Failed to submit report. Please try again.");
        }
    };

    const handleHide = async () => {
        if (window.confirm("Hide this post (Admin)?")) {
            try {
                await feedService.hidePost(localPost.id);
                // Treat as deleted for UI purposes (remove from feed)
                onPostDeleted(localPost.id);
            } catch (error) {
                console.error("Hide failed", error);
            }
        }
    };

    const handleVote = async (index: number) => {
        const hasVotedAny = localPost.pollOptions?.some(o => o.voterIds?.includes(currentUser?.id || ''));
        if (hasVotedAny && currentUser?.role !== 'Admin') {
            alert("Bạn đã bình chọn rồi!");
            return;
        }

        try {
            const res = await feedService.votePoll(localPost.id, index);
            if (res.success) {
                const updated = { ...localPost, pollOptions: res.pollOptions };
                setLocalPost(updated);
                onPostUpdated(updated);
                alert("Bình chọn thành công! 🚀");
            }
        } catch (error: any) {
            console.error("Vote failed", error);
            alert("Lỗi khi bình chọn: " + (error.response?.data?.message || error.message));
        }
    };

    const toggleComments = async () => {
        setShowComments(!showComments);
        if (!showComments && comments.length === 0) {
            try {
                const fetched = await feedService.getComments(localPost.id);
                setComments(fetched);
                // Init reaction state from server data
                const rMap: Record<string, Record<string, number>> = {};
                const myMap: Record<string, string> = {};
                fetched.forEach(c => {
                    if (c.reactions) {
                        rMap[c.id] = Object.fromEntries(
                            Object.entries(c.reactions).map(([t, ids]) => [t, ids.length])
                        );
                        const found = Object.entries(c.reactions).find(([, ids]) => ids.includes(currentUser?.id || ''));
                        if (found) myMap[c.id] = found[0];
                    }
                });
                setCommentReactions(rMap);
                setMyCommentReactions(myMap);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() && !commentFile) return;
        try {
            let content = newComment;
            if (commentFile) {
                try {
                    const uploadResult = await feedService.uploadFile(commentFile);
                    content = newComment ? `${newComment}\n![img](${uploadResult.url})` : `![img](${uploadResult.url})`;
                } catch { /* ignore upload error, send text only */ }
            }
            const added = await feedService.addComment(localPost.id, content, replyToCommentId || undefined);
            const updatedComments = [...comments, added];
            setComments(updatedComments);
            setNewComment('');
            setCommentFile(null);
            setCommentPreviewUrl(null);
            setReplyToCommentId(null);
            setReplyToAuthorName('');

            const updatedPost = { ...localPost, commentCount: localPost.commentCount + 1 };
            setLocalPost(updatedPost);
            onPostUpdated(updatedPost);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCommentReact = async (commentId: string, type: string) => {
        const currentType = myCommentReactions[commentId];
        const newType = currentType === type ? '' : type;
        // Optimistic update
        setMyCommentReactions(prev => ({ ...prev, [commentId]: newType }));
        setCommentReactions(prev => {
            const curr = { ...(prev[commentId] || {}) };
            if (currentType) curr[currentType] = Math.max(0, (curr[currentType] || 1) - 1);
            if (newType) curr[newType] = (curr[newType] || 0) + 1;
            return { ...prev, [commentId]: curr };
        });
        try {
            const res = await feedService.reactToComment(commentId, newType);
            if (res.success) {
                const serverCount = Object.fromEntries(
                    Object.entries(res.reactions).map(([t, ids]) => [t, (ids as string[]).length])
                );
                setCommentReactions(prev => ({ ...prev, [commentId]: serverCount }));
                const myR = Object.entries(res.reactions).find(([, ids]) => (ids as string[]).includes(currentUser?.id || ''));
                setMyCommentReactions(prev => ({ ...prev, [commentId]: myR?.[0] || '' }));
            }
        } catch (e) {
            console.error('Comment react failed', e);
        }
    };


    const handleReply = (comment: Comment) => {
        setReplyToCommentId(comment.parentCommentId ? comment.parentCommentId : comment.id);
        setReplyToAuthorName(comment.authorName);
        const text = `@${comment.authorName} `;
        setNewComment(text);
        setTimeout(() => {
            const input = commentInputRef.current;
            if (input) {
                input.focus();
                input.setSelectionRange(text.length, text.length);
            }
        }, 50);
    };

    const handleCommentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCommentFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setCommentPreviewUrl(reader.result as string);
        reader.readAsDataURL(file);
    };

    const fetchReactionUsers = async () => {
        // Build list from reactions dict using authorId stored in post
        const entries: { id: string; name: string; avatar: string; department?: string; reactionType: string }[] = [];
        const reactions = localPost.reactions || {};
        // We can map locally since we only have IDs — show what we have
        for (const [type, ids] of Object.entries(reactions)) {
            for (const id of ids) {
                entries.push({ id, name: id, avatar: `https://i.pravatar.cc/40?u=${id}`, reactionType: type });
            }
        }
        // Try to fetch actual user info
        try {
            const resp = await fetch(`${API_BASE_URL}/api/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            const users: any[] = await resp.json();
            const mapped = entries.map(e => {
                const u = users.find((u: any) => u.id === e.id || u._id === e.id);
                return u ? { ...e, name: u.fullName || u.username, avatar: u.avatarUrl ? `${API_BASE_URL}${u.avatarUrl}` : e.avatar, department: u.department } : e;
            });
            setReactionUsers(mapped);
        } catch {
            setReactionUsers(entries);
        }
        setShowReactionsModal(true);
        setReactionFilter('all');
    };

    const isSaved = localPost.savedBy?.includes(currentUser?.id || '');
    const isOwner = currentUser?.id === localPost.authorId;

    const reactionIcons: Record<string, string> = { 'like': '👍', 'love': '❤️', 'haha': '😂', 'wow': '😮', 'sad': '😢', 'angry': '😡' };
    const reactionColors: Record<string, string> = { 'like': 'text-[#137fec]', 'love': 'text-[#f63b4f]', 'haha': 'text-[#f7b928]', 'wow': 'text-[#f7b928]', 'sad': 'text-[#f7b928]', 'angry': 'text-[#e66c24]' };
    const reactionLabels: Record<string, string> = { 'like': 'Like', 'love': 'Love', 'haha': 'Haha', 'wow': 'Wow', 'sad': 'Sad', 'angry': 'Angry' };

    const CurrentReactionIcon = myReaction ? reactionIcons[myReaction] : 'thumb_up';
    const CurrentReactionLabel = myReaction ? (reactionLabels[myReaction] || 'Liked') : 'Like';
    // If not specific reaction but standard like (from myReaction logic being 'like'), it falls into generic blue.
    // However, for consistency, if myReaction is set, use the specialized color.
    const CurrentReactionColor = myReaction ? (reactionColors[myReaction] || 'text-[#137fec]') : 'text-slate-500 hover:text-slate-800';

    // Icon Logic for Button:
    // If has reaction -> show that emoji. If no reaction -> show generic thumb_up icon (material symbol).
    // Note: Standard 'Like' reaction also maps to 👍 emoji in my dictionary. 
    // Standard UI usually shows "Thumb Up" SVG for "Like" state, but emoji for others.
    // For simplicity, let's use Emoji for all ACTIVE states, and Material Icon for INACTIVE.

    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-500 group/card">
            {/* ── HEADER: Avatar + Name + Meta ── */}
            <div className="flex justify-between items-start px-4 pt-4 pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-slate-100 ring-2 ring-[var(--color-surface-lighter)] overflow-hidden flex-shrink-0 shadow-sm transition-transform group-hover/card:scale-105 duration-500">
                        <img src={getAvatarUrl(localPost.authorAvatarUrl)} alt={localPost.authorName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <Link to={`/profile/${localPost.authorId}`} className="font-bold text-[16px] text-[var(--color-text-main)] hover:text-[var(--color-primary)] transition-colors leading-tight">
                            {localPost.authorName}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[12px] text-[var(--color-text-muted)] font-medium" title={formatDateTime(localPost.createdAt)}>
                                {formatTimeAgo(localPost.createdAt)}
                            </span >
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[var(--color-text-muted)] flex items-center">{getPrivacyIcon(localPost.privacy)}</span>
                            
                            {localPost.category && localPost.category !== 'General' && (
                                <>
                                    <span className="text-[10px] text-slate-300">•</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                        localPost.category === 'Security' ? 'bg-red-50 text-red-500 border border-red-100' :
                                        localPost.category === 'Announcement' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                        'bg-blue-50 text-blue-500 border border-blue-100'
                                    }`}>
                                        {localPost.category}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="relative" ref={menuRef}>
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors">
                        <span className="material-symbols-outlined text-[22px]">more_horiz</span>
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-20 w-44 py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
                            {currentUser?.role === 'Admin' && (
                                <>
                                    <button onClick={async () => {
                                        await feedService.pinPost(localPost.id);
                                        const updated = { ...localPost, isPinned: !localPost.isPinned };
                                        setLocalPost(updated);
                                        onPostUpdated(updated);
                                        setIsMenuOpen(false);
                                    }} className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">push_pin</span> {localPost.isPinned ? 'Bỏ ghim' : 'Ghim bài viết'}
                                    </button>
                                    <button onClick={handleHide} className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">visibility_off</span> Ẩn bài viết
                                    </button>
                                </>
                            )}
                            {isOwner && (
                                <>
                                    <button onClick={() => { setIsEditing(true); setIsMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">edit</span> Chỉnh sửa
                                    </button>
                                    <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-[13px] font-medium text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">delete</span> Xóa bài
                                    </button>
                                </>
                            )}
                            <button onClick={handleReport} className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">flag</span> Báo cáo nội dung
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── BODY: Content Text ── */}
            <div className="px-4 pb-4">
                {localPost.isUrgent && (
                    <div className="flex items-center gap-3 text-xs bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4 font-bold border border-red-100 shadow-sm animate-pulse-subtle">
                        <span className="material-symbols-outlined text-[20px] fill-current">error</span>
                        <div className="flex-1 uppercase tracking-wider">KHẨN CẤP / QUAN TRỌNG</div>
                    </div>
                )}
                
                <div className="text-[15px] text-slate-700 leading-[1.6] whitespace-pre-wrap">
                    {isEditing ? (
                        <div className="flex flex-col gap-3 mt-1">
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[15px] text-slate-800 w-full outline-none focus:border-[var(--color-primary)] ring-offset-2 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                                rows={4}
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { setIsEditing(false); setEditContent(localPost.content); }} className="px-4 py-1.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Hủy</button>
                                <button onClick={handleEditSave} className="px-4 py-1.5 text-[13px] font-semibold bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] shadow-sm">Lưu</button>
                            </div>
                        </div>
                    ) : (
                        <p>{localPost.content}</p>
                    )}
                </div>

                {/* Poll Rendering */}
                {localPost.type === 'Poll' && localPost.pollOptions && (
                    <div className="mt-4 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl shadow-inner">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-500 text-[20px]">ballot</span>
                                Bình chọn
                            </h4>
                            {localPost.pollEndsAt && (
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    HẾT HẠN: {formatDateTime(localPost.pollEndsAt)}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-2.5">
                            {localPost.pollOptions.map((option, idx) => {
                                const totalVotes = localPost.pollOptions!.reduce((acc, opt) => acc + (opt.voterIds?.length || 0), 0);
                                const vCount = option.voterIds?.length || 0;
                                const percentage = totalVotes > 0 ? Math.round((vCount / totalVotes) * 100) : 0;
                                const hasVoted = option.voterIds?.includes(currentUser?.id || '');
                                const isExpired = localPost.pollEndsAt ? new Date(localPost.pollEndsAt) < new Date() : false;

                                return (
                                    <button
                                        key={idx}
                                        disabled={isExpired}
                                        onClick={() => handleVote(idx)}
                                        className={`relative w-full text-left p-3.5 rounded-xl border transition-all overflow-hidden group/poll ${hasVoted ? 'border-primary/30 bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'
                                            } ${isExpired ? 'cursor-not-allowed opacity-85' : ''}`}
                                    >
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out ${hasVoted ? 'bg-[var(--color-primary)]/10' : 'bg-slate-50'}`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                        <div className="relative z-10 flex justify-between items-center">
                                            <div className="flex items-center gap-2.5">
                                                {hasVoted ? <span className="material-symbols-outlined text-[var(--color-primary)] fill-current text-[20px]">check_circle</span> : <div className="w-5 h-5 rounded-full border-2 border-slate-200 group-hover/poll:border-primary/40 transition-colors" />}
                                                <span className={`text-[14px] font-semibold ${hasVoted ? 'text-[var(--color-primary)]' : 'text-slate-700'}`}>{option.text}</span>
                                            </div>
                                            <div className="text-[13px] font-bold text-slate-500">
                                                {percentage}%
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── MEDIA: Full width below text ── */}
            {localPost.mediaFiles && localPost.mediaFiles.length > 0 && (
                <div className="border-t border-slate-50">
                    {localPost.mediaFiles.map((media, idx) => {
                        const fileUrl = getAvatarUrl(media.url);
                        if (media.type === 'video' || (localPost.type === 'Video' && idx === 0)) {
                            return (
                                <div key={idx} className="w-full bg-black relative aspect-video">
                                    <video src={fileUrl} controls className="w-full h-full object-contain" />
                                </div>
                            );
                        } else if (media.type === 'image' || (localPost.type === 'Image' && idx === 0) || !media.type) {
                            return (
                                <div key={idx} className="w-full bg-slate-50 overflow-hidden flex items-center justify-center">
                                    <img
                                        src={fileUrl}
                                        alt="post media"
                                        className="w-full h-auto object-cover max-h-[600px] transition-transform duration-700 group-hover/card:scale-[1.02]"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                </div>
                            );
                        } else {
                            return (
                                <div key={idx} className="px-4 py-3">
                                    <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-200 group/file">
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover/file:border-primary/30 transition-colors">
                                            <span className="material-symbols-outlined text-blue-500 text-[28px]">description</span>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="text-sm font-bold text-slate-800 truncate">{media.fileName || 'Tài liệu đính kèm'}</div>
                                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{media.fileSize ? `${(media.fileSize / 1024).toFixed(1)} KB` : 'Tải về'}</div>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-400 group-hover/file:text-primary transition-colors">download</span>
                                    </a>
                                </div>
                            );
                        }
                    })}
                </div>
            )}

            {/* Link Preview Rendering */}
            {localPost.linkInfo && (
                <div className="px-4 pb-4">
                    <a href={localPost.linkInfo.url} target="_blank" rel="noreferrer" className="block bg-slate-50/50 rounded-2xl overflow-hidden hover:bg-slate-100/80 transition-all border border-slate-100 group/link shadow-sm">
                        {localPost.linkInfo.imageUrl && (
                            <img src={localPost.linkInfo.imageUrl} alt="" className="w-full h-48 object-cover border-b border-slate-100 group-hover/link:opacity-90 transition-opacity" />
                        )}
                        <div className="p-4">
                            <div className="text-[14px] font-bold text-slate-800 group-hover:text-primary mb-1.5 line-clamp-2 transition-colors">{localPost.linkInfo.title}</div>
                            {localPost.linkInfo.description && <div className="text-[12px] text-slate-500 line-clamp-2 mb-2 leading-relaxed">{localPost.linkInfo.description}</div>}
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                {new URL(localPost.linkInfo.url).hostname}
                            </div>
                        </div>
                    </a>
                </div>
            )}

            {/* ── STATS: Minimalist row ── */}
            <div className="px-4 py-3 flex justify-between items-center text-[13px] text-slate-500 border-t border-slate-50">
                <div className="flex items-center gap-4">
                    {/* Reactions & Likes */}
                    <button className="flex items-center gap-1.5 group/stat hover:text-slate-800 transition-colors" onClick={fetchReactionUsers}>
                        <div className="flex -space-x-1.5 items-center">
                            {(() => {
                                const types = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
                                const activeStats = types
                                    .map(t => ({ type: t, count: localPost.reactions?.[t]?.length || 0 }))
                                    .filter(x => x.count > 0)
                                    .sort((a, b) => b.count - a.count);
                                
                                if (activeStats.length > 0) {
                                    return activeStats.slice(0, 3).map(stat => (
                                        <div key={stat.type} className="w-5 h-5 flex items-center justify-center bg-white rounded-full ring-2 ring-white z-10 shadow-sm border border-slate-50">
                                            {ReactionSVGs[stat.type]}
                                        </div>
                                    ));
                                } else if (localPost.likedBy && localPost.likedBy.length > 0) {
                                    return (
                                        <div className="w-5 h-5 flex items-center justify-center bg-white rounded-full ring-2 ring-white z-10 shadow-sm border border-slate-50">
                                            {ReactionSVGs.like}
                                        </div>
                                    );
                                }
                                return <span className="material-symbols-outlined text-[18px] text-slate-300">favorite</span>;
                            })()}
                        </div>
                        <span className="font-bold ml-0.5">
                            {Object.values(localPost.reactions || {}).flat().length || localPost.likedBy?.length || 0}
                        </span>
                    </button>

                    {/* Comments Count */}
                    <button onClick={toggleComments} className="flex items-center gap-1.5 hover:text-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-[18px] text-slate-400">mode_comment</span>
                        <span className="font-bold">{localPost.commentCount || 0}</span>
                    </button>
                    
                    {/* Sharing Stats (Placeholder) */}
                    <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">share</span>
                    </div>
                </div>

                {/* Bookmark Toggle (Far right) */}
                <button onClick={handleSave} className={`flex items-center transition-all duration-300 ${isSaved ? 'text-amber-500 scale-110' : 'text-slate-300 hover:text-slate-500'}`}>
                    <span className={`material-symbols-outlined text-[20px] ${isSaved ? 'fill-current' : ''}`}>bookmark</span>
                </button>
            </div>

            {/* ── ACTIONS: Clean Pill-style buttons ── */}
            <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                <div className="group relative">
                    <button
                        onClick={handleLike}
                        className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[14px] font-bold transition-all ${
                            myReaction 
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' 
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                        {myReaction
                            ? <span className="w-5 h-5 flex items-center">{ReactionSVGs[myReaction]}</span>
                            : <span className="material-symbols-outlined text-[20px] font-light">thumb_up</span>
                        }
                        <span>{myReaction ? reactionLabelsVI[myReaction] : 'Thích'}</span>
                    </button>
                    
                    {/* Floating Reaction Picker */}
                    <div className="absolute bottom-full left-0 pb-2 hidden group-hover:flex animate-in fade-in slide-in-from-bottom-2 duration-300 z-30">
                        <div className="flex bg-white rounded-full px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-slate-100 gap-1.5 items-center">
                            {(['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const).map(type => (
                                <button
                                    key={type}
                                    title={reactionLabelsVI[type]}
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        const res = await feedService.reactToPost(localPost.id, type);
                                        if (res.success) {
                                            const updatedLikedBy = (localPost.likedBy || []).filter(id => id !== currentUser?.id);
                                            setLocalPost({ ...localPost, reactions: res.reactions, likedBy: updatedLikedBy });
                                            onPostUpdated({ ...localPost, reactions: res.reactions, likedBy: updatedLikedBy });
                                        }
                                    }}
                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-50 hover:scale-125 transition-all duration-200"
                                >
                                    <div className="w-7 h-7">{ReactionSVGs[type]}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={toggleComments} className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-[14px] font-bold transition-all">
                    <span className="material-symbols-outlined text-[20px] font-light">chat_bubble</span>
                    <span>Phản hồi</span>
                </button>

                <button className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-[14px] font-bold transition-all">
                    <span className="material-symbols-outlined text-[20px] font-light">share</span>
                    <span>Chia sẻ</span>
                </button>
            </div>

            {showComments && (() => {
                const rootComments = comments.filter(c => !c.parentCommentId);
                const getReplies = (cid: string) => comments.filter(c => c.parentCommentId === cid);

                const renderComment = (comment: Comment, isReply = false) => {
                    const myRType = myCommentReactions[comment.id];
                    const reactions = commentReactions[comment.id] || {};
                    const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
                    const topReactionTypes = Object.entries(reactions).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
                    const replies = getReplies(comment.id);

                    return (
                        <div key={comment.id} className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden flex-shrink-0 shadow-sm">
                                <img src={getAvatarUrl(comment.authorAvatarUrl || '')} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                {/* Comment bubble */}
                                <div className="relative inline-block max-w-[95%]">
                                    <div className="bg-white rounded-2xl px-4 py-2.5 border border-slate-100 shadow-sm group/bubble">
                                        <Link to={`/profile/${comment.authorId || ''}`} className="font-bold text-[13px] text-slate-900 hover:text-primary block mb-0.5 transition-colors">{comment.authorName}</Link>
                                        {comment.content.includes('![img](') ? (
                                            <>
                                                <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-line">{comment.content.replace(/\n?!\[img\]\([^)]+\)/g, '').trim()}</p>
                                                {(() => {
                                                    const match = comment.content.match(/!\[img\]\(([^)]+)\)/);
                                                    return match ? (
                                                        <div className="mt-2 rounded-xl overflow-hidden border border-slate-100 shadow-sm max-w-[240px]">
                                                            <img src={`${API_BASE_URL}${match[1]}`} alt="" className="w-full h-auto object-cover max-h-48" />
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </>
                                        ) : (
                                            <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-line">{comment.content}</p>
                                        )}
                                    </div>
                                    {/* Reaction count badge on bubble */}
                                    {totalReactions > 0 && (
                                        <div className="absolute -bottom-2.5 right-0 flex items-center gap-1 bg-white border border-slate-100 rounded-full px-1.5 py-0.5 shadow-md scale-90 origin-right transition-transform hover:scale-100">
                                            <div className="flex -space-x-1">
                                                {topReactionTypes.map(t => <span key={t} className="w-4 h-4 ring-1 ring-white rounded-full bg-white">{ReactionSVGs[t]}</span>)}
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-500 ml-0.5">{totalReactions}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Actions */}
                                <div className="flex items-center gap-4 mt-1.5 ml-1 animate-in fade-in slide-in-from-top-1 duration-300">
                                    <span className="text-[11px] text-slate-400 font-medium">{formatTimeAgo(comment.createdAt)}</span>
                                    <div className="group relative">
                                        {(() => {
                                            const rColors: Record<string, string> = { like: 'text-primary', love: 'text-[#f63b4f]', haha: 'text-[#f7b928]', wow: 'text-[#f7b928]', sad: 'text-[#f7b928]', angry: 'text-[#e66c24]' };
                                            return (
                                                <button
                                                    className={`flex items-center gap-1 text-[11px] font-bold transition-all ${myRType ? (rColors[myRType] || 'text-primary') : 'text-slate-500 hover:text-primary'}`}
                                                    onClick={() => handleCommentReact(comment.id, myRType ? '' : 'like')}
                                                >
                                                    {myRType ? (reactionLabelsVI[myRType] || 'Thích') : 'Thích'}
                                                </button>
                                            );
                                        })()}
                                        {/* Mini reaction popup */}
                                        <div className="absolute bottom-full left-0 pb-2 hidden group-hover:flex z-30 animate-in fade-in zoom-in duration-150">
                                            <div className="flex bg-white rounded-full px-1.5 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-slate-50 gap-1.5 ring-1 ring-black/5">
                                                {(['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const).map(type => (
                                                    <button key={type} title={reactionLabelsVI[type]}
                                                        onClick={() => handleCommentReact(comment.id, type)}
                                                        className="hover:scale-125 transition-all duration-150 w-7 h-7 flex items-center justify-center">
                                                        <span className="w-5 h-5">{ReactionSVGs[type]}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        className="text-[11px] text-slate-500 hover:text-primary font-bold transition-colors"
                                        onClick={() => handleReply(comment)}
                                    >
                                        Phản hồi
                                    </button>
                                </div>

                                {/* Nested replies */}
                                {replies.length > 0 && (
                                    <div className="mt-4 flex flex-col gap-4 pl-2 border-l-2 border-slate-100/80">
                                        {replies.map(r => renderComment(r, true))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                };

                return (
                    <div className="px-4 py-5 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-6">
                        {/* Comment Input */}
                        <div className="flex flex-col gap-3">
                            {replyToCommentId && (
                                <div className="flex items-center gap-2 bg-blue-50 text-blue-600 text-[12px] px-3 py-2 rounded-xl border border-blue-100 shadow-sm animate-in slide-in-from-left-2 duration-300">
                                    <span className="material-symbols-outlined text-[18px]">reply</span>
                                    <span>Đang phản hồi <strong>{replyToAuthorName}</strong></span>
                                    <button onClick={() => { setReplyToCommentId(null); setReplyToAuthorName(''); setNewComment(''); }} className="ml-auto w-5 h-5 flex items-center justify-center rounded-full hover:bg-blue-100 transition-colors">×</button>
                                </div>
                            )}
                            
                            {commentPreviewUrl && (
                                <div className="p-2.5 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm animate-in zoom-in duration-300 w-fit">
                                    <div className="relative w-20 h-20 rounded-xl overflow-hidden group">
                                        <img src={commentPreviewUrl} alt="preview" className="w-full h-full object-cover" />
                                        <button onClick={() => { setCommentFile(null); setCommentPreviewUrl(null); }}
                                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow-md hover:bg-black transition-colors">
                                            ×
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 items-start">
                                <div className="w-9 h-9 rounded-full bg-slate-100 overflow-hidden flex-shrink-0 shadow-sm mt-0.5">
                                    <img src={getAvatarUrl(currentUser)} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 relative flex items-center group">
                                    <textarea
                                        ref={commentInputRef as any}
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleAddComment();
                                            }
                                        }}
                                        placeholder={replyToCommentId ? `Phản hồi cho ${replyToAuthorName}...` : 'Bạn đang nghĩ gì về bài viết này?'}
                                        className="w-full bg-white border border-slate-200 rounded-2xl pl-4 pr-12 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all resize-none min-h-[44px] max-h-32"
                                        rows={1}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                                        }}
                                    />
                                    <div className="absolute right-2 flex items-center gap-1">
                                        <input type="file" ref={commentFileRef} onChange={handleCommentFileSelect} accept="image/*" className="hidden" />
                                        <button onClick={() => commentFileRef.current?.click()} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary rounded-full transition-all">
                                            <span className="material-symbols-outlined text-[20px]">image</span>
                                        </button>
                                        <button 
                                            onClick={handleAddComment} 
                                            disabled={!newComment.trim() && !commentFile} 
                                            className="w-8 h-8 flex items-center justify-center text-primary disabled:text-slate-200 rounded-full hover:bg-primary/10 transition-all disabled:hover:bg-transparent"
                                        >
                                            <span className="material-symbols-outlined text-[22px] fill-current">send</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Threaded Comments List */}
                        <div className="flex flex-col gap-6">
                            {rootComments.length > 0 ? (
                                rootComments.map(c => renderComment(c, false))
                            ) : (
                                <div className="py-2 text-center">
                                    <p className="text-[13px] text-slate-400 font-medium italic">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Reaction Users Modal — Premium Overhaul */}
            {showReactionsModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setShowReactionsModal(false)} />
                    <div className="relative bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-400 flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
                            <h3 className="font-bold text-slate-900 text-[17px]">Cảm xúc về bài viết</h3>
                            <button onClick={() => setShowReactionsModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        
                        {/* Reaction Filter Tabs */}
                        <div className="flex gap-2 px-6 py-3 overflow-x-auto no-scrollbar border-b border-slate-50 bg-slate-50/30">
                            {['all', 'like', 'love', 'haha', 'wow', 'sad', 'angry'].map(f => {
                                const count = f === 'all' ? reactionUsers.length : reactionUsers.filter(u => u.reactionType === f).length;
                                if (count === 0 && f !== 'all') return null;
                                return (
                                    <button 
                                        key={f} 
                                        onClick={() => setReactionFilter(f)}
                                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all whitespace-nowrap border shadow-sm ${
                                            reactionFilter === f 
                                            ? 'bg-white border-primary/20 text-primary ring-2 ring-primary/5' 
                                            : 'bg-white border-transparent text-slate-500 hover:border-slate-200'
                                        }`}
                                    >
                                        {f !== 'all' && <div className="w-4 h-4">{ReactionSVGs[f]}</div>}
                                        {f === 'all' ? 'Tất cả' : ''} {count}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar">
                            {reactionUsers.filter(u => reactionFilter === 'all' || u.reactionType === reactionFilter).map((u, i) => (
                                <div key={i} className="flex items-center gap-4 py-3.5 border-b border-slate-50 last:border-0 group/u">
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-full overflow-hidden shadow-sm ring-2 ring-slate-100 group-hover/u:ring-primary/20 transition-all">
                                            <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full shadow-md border border-slate-50 flex items-center justify-center scale-90">
                                            <div className="w-4 h-4">{ReactionSVGs[u.reactionType]}</div>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-900 text-[15px] truncate">{u.name}</div>
                                        {u.department && <div className="text-[12px] text-slate-400 font-medium truncate">{u.department}</div>}
                                    </div>
                                    <Link 
                                        to={`/profile/${u.id}`} 
                                        onClick={() => setShowReactionsModal(false)}
                                        className="px-4 py-1.5 text-[12px] font-bold text-primary bg-primary/5 rounded-full hover:bg-primary hover:text-white transition-all shadow-sm"
                                    >
                                        Hồ sơ
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Report Modal — Premium UI */}
            {showReportModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowReportModal(false)} />
                    <div className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-8 duration-500" onClick={e => e.stopPropagation()}>
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
                                    <span className="material-symbols-outlined text-[28px]">report_problem</span>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Báo cáo bài viết</h3>
                                    <p className="text-[13px] text-slate-500 font-medium mt-0.5">Giúp chúng tôi hiểu điều gì đang xảy ra.</p>
                                </div>
                            </div>
                            
                            <textarea
                                value={reportReason}
                                onChange={(e) => setReportReason(e.target.value)}
                                placeholder="Hãy mô tả lý do bạn báo cáo bài viết này (Spam, nội dung không phù hợp, quấy rối...)"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/5 transition-all resize-none mb-6 min-h-[120px]"
                            />
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setShowReportModal(false); setReportReason(''); }}
                                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    onClick={submitReport}
                                    disabled={!reportReason.trim()}
                                    className="flex-1 px-6 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                                >
                                    Gửi báo cáo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
