import { api } from './api';
import type { Post, Comment, MediaFile } from '../types';
import { compressImage } from '../utils/imageCompressor';

export const feedService = {
    getPosts: async (page = 1, limit = 10) => {
        return api.get<{ posts: Post[]; pagination: any }>(`/api/SocialFeed/posts?page=${page}&limit=${limit}`);
    },

    uploadFile: async (file: File) => {
        // Compress image before uploading (reduces 5-12MB phone photos to ~300KB)
        const processedFile = await compressImage(file);

        const formData = new FormData();
        formData.append('file', processedFile);
        return api.post<{ url: string; fileName: string; size: number; type: string }>('/api/Upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000, // 120 seconds timeout for file uploads
        });
    },

    getUserPosts: async (userId: string) => {
        return api.get<Post[]>(`/api/SocialFeed/users/${userId}/posts`);
    },

    updatePost: async (postId: string, content: string) => {
        return api.put<{ message: string }>(`/api/SocialFeed/posts/${postId}`, { content });
    },

    createPost: async (
        content: string,
        privacy: string = 'Public',
        mediaFiles: MediaFile[] = [],
        category: string = 'General',
        type: string = 'Text',
        allowedRoles: string[] = [],
        allowedDepartments: string[] = [],
        isUrgent: boolean = false,
        urgentReason?: string,
        pollOptions?: string[],
        multipleChoice: boolean = false,
        pollDurationDays?: number
    ) => {
        const response = await api.post<Post>('/api/SocialFeed/posts', {
            content,
            privacy,
            mediaFiles,
            category,
            type,
            allowedRoles,
            allowedDepartments,
            isUrgent,
            urgentReason,
            pollOptions,
            multipleChoice,
            pollDurationDays
        });
        return response;
    },

    likePost: async (postId: string) => {
        return api.post<{ liked: boolean; likeCount: number }>(`/api/SocialFeed/posts/${postId}/like`);
    },

    savePost: async (postId: string) => {
        return api.post<{ saved: boolean }>(`/api/SocialFeed/posts/${postId}/save`);
    },

    pinPost: async (postId: string) => {
        return api.post<{ pinned: boolean }>(`/api/SocialFeed/posts/${postId}/pin`);
    },

    reportPost: async (postId: string, reason: string) => {
        return api.post<{ message: string }>(`/api/SocialFeed/posts/${postId}/report`, { reason });
    },

    hidePost: async (postId: string) => {
        return api.post<{ message: string }>(`/api/SocialFeed/posts/${postId}/hide`);
    },

    reactToPost: async (postId: string, type: string) => {
        return api.post<{ success: boolean; reactions: Record<string, string[]> }>(`/api/SocialFeed/posts/${postId}/react`, { type });
    },

    votePoll: async (postId: string, optionIndex: number) => {
        return api.post<{ success: boolean; pollOptions: any[] }>(`/api/SocialFeed/posts/${postId}/vote`, optionIndex);
    },

    getComments: async (postId: string) => {
        return api.get<Comment[]>(`/api/SocialFeed/posts/${postId}/comments`);
    },

    addComment: async (postId: string, content: string, parentCommentId?: string) => {
        return api.post<Comment>(`/api/SocialFeed/posts/${postId}/comments`, { content, parentCommentId });
    },

    reactToComment: async (commentId: string, type: string) => {
        return api.post<{ success: boolean; reactions: Record<string, string[]> }>(
            `/api/SocialFeed/comments/${commentId}/react`, { type }
        );
    },

    deletePost: async (postId: string) => {
        return api.delete(`/api/SocialFeed/posts/${postId}`);
    },

    // Reports
    getReports: async () => {
        return api.get<any[]>('/api/SocialFeed/reports');
    }
};
