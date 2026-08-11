import api from './api';
import type { Post, User } from '../types';

export interface SearchPostsParams {
    q?: string;
    category?: string;
    department?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface SearchPostsResponse {
    posts: Post[];
    total: number;
    query?: string;
}

export interface SearchUsersParams {
    q?: string;
    department?: string;
    role?: string;
}

export const searchService = {
    // Search posts with filters
    searchPosts: async (params: SearchPostsParams): Promise<SearchPostsResponse> => {
        const queryParams = new URLSearchParams();
        if (params.q) queryParams.append('q', params.q);
        if (params.category) queryParams.append('category', params.category);
        if (params.department) queryParams.append('department', params.department);
        if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
        if (params.dateTo) queryParams.append('dateTo', params.dateTo);

        const response = await api.get<SearchPostsResponse>(
            `/api/socialfeed/search/posts?${queryParams.toString()}`
        );
        return response;
    },

    // Search users
    searchUsers: async (params: SearchUsersParams): Promise<User[]> => {
        const queryParams = new URLSearchParams();
        if (params.q) queryParams.append('q', params.q);
        if (params.department) queryParams.append('department', params.department);
        if (params.role) queryParams.append('role', params.role);

        const response = await api.get<User[]>(
            `/api/users/search?${queryParams.toString()}`
        );
        return response;
    }
};
