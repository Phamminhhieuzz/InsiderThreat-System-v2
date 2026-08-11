import { api } from './api';
import type { User } from '../types';

export const userService = {
    // Get all users
    async getAllUsers(): Promise<User[]> {
        const response = await api.get<User[]>('/api/users');
        return response;
    },

    // Get currently online users
    async getOnlineUsers(): Promise<string[]> {
        try {
            const response = await api.get<string[]>('/api/users/online');
            return response;
        } catch (error) {
            console.error('Failed to get online users', error);
            return [];
        }
    },

    // Update user profile
    async updateUser(id: string, userData: Partial<User>): Promise<void> {
        await api.put(`/api/users/${id}`, userData);
    },

    // Get activity logs
    async getActivityLogs(userId: string): Promise<any[]> {
        const response = await api.get<any[]>(`/api/users/${userId}/logs`);
        return response;
    },

    // Get user by ID
    async getUserById(userId: string): Promise<User> {
        const response = await api.get<User>(`/api/users/${userId}`);
        return response;
    }
};
