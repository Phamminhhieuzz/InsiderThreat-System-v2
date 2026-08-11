import { useEffect, useState } from 'react';
import { message } from 'antd';
import PostComposer from './PostComposer';
import PostCard from './PostCard';
import api from '../../services/api';
import styles from './FeedCenter.module.css';

interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    content: string;
    privacy: string;
    mediaFiles: any[];
    likedBy: string[];
    reactions: Record<string, string[]>;
    commentCount: number;
    shareCount: number;
    createdAt: string;
    updatedAt?: string;
}

const FeedCenter = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);
    const [page] = useState(1);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const data = await api.get<{ posts: Post[] }>(`/api/posts?page=${page}&pageSize=10`);
            setPosts(data.posts || []);
        } catch (error: any) {
            console.error('Error fetching posts:', error);
            message.error(error.response?.data?.message || 'Failed to load posts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();
    }, [page]);

    const handlePostCreated = (newPost: Post) => {
        setPosts([newPost, ...posts]);
        message.success('Post created successfully!');
    };

    const handlePostDeleted = (postId: string) => {
        setPosts(posts.filter(p => p.id !== postId));
        message.success('Post deleted successfully!');
    };

    const handlePostUpdated = (postId: string, updatedPost: Post) => {
        setPosts(posts.map(p => p.id === postId ? updatedPost : p));
    };

    return (
        <div className={styles.feed}>
            <PostComposer onPostCreated={handlePostCreated} />

            {loading && <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>}

            <div className={styles.posts}>
                {posts.length === 0 && !loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No posts yet. Be the first to share something!
                    </div>
                )}
                {posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        onPostDeleted={handlePostDeleted}
                    />
                ))}
            </div>
        </div>
    );
};

export default FeedCenter;
