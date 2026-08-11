import { api } from './api';

export interface Notification {
    id: string;
    type: string; // "Global", "Like", "Comment", "Mention", "Report"
    message: string;
    targetUserId?: string;
    actorUserId?: string;
    actorName?: string;
    link?: string;
    relatedId?: string;
    isRead: boolean;
    createdAt: string;
}

export const notificationService = {
    // Get all notifications for current user
    async getNotifications(): Promise<Notification[]> {
        const response = await api.get<Notification[]>('/api/notifications');
        return response;
    },

    // Get unread count
    async getUnreadCount(): Promise<number> {
        const response = await api.get<{ count: number }>('/api/notifications/unread-count');
        return response.count;
    },

    // Mark notification as read
    async markAsRead(notificationId: string): Promise<void> {
        await api.put(`/api/notifications/${notificationId}/read`, {});
    },

    // Create notification (Admin only)
    async createNotification(notification: Partial<Notification>): Promise<Notification> {
        return await api.post('/api/notifications', notification);
    }
};
