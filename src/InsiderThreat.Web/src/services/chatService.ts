import { api } from './api';
import { compressImage } from '../utils/imageCompressor';

// Types
export interface Message {
    id?: string;
    senderId: string;
    receiverId: string;
    content: string; // E2EE: Encrypted for Receiver (Base64)
    senderContent?: string; // E2EE: Encrypted for Sender (Base64) — so sender can read own history
    timestamp: string;
    isRead: boolean;
    attachmentUrl?: string;
    attachmentType?: string;
    attachmentName?: string;
    isEdited?: boolean;
}

export const chatService = {
    // Send Message (client sends already-encrypted content + senderContent)
    sendMessage: async (message: Omit<Message, 'id' | 'timestamp' | 'isRead'>) => {
        return await api.post<Message>('/api/messages', message);
    },

    // Upload File
    uploadFile: async (file: File) => {
        // Compress image before uploading
        const processedFile = await compressImage(file);

        const formData = new FormData();
        formData.append('file', processedFile);
        return await api.post<{ url: string, originalName: string }>('/api/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: 120000, // 120 seconds for file uploads
        });
    },

    // Get Messages (returns E2EE encrypted messages — client decrypts locally)
    getMessages: async (otherUserId: string, currentUserId: string) => {
        return await api.get<Message[]>(`/api/messages/${otherUserId}?currentUserId=${currentUserId}`);
    },

    // Get Group Messages (returns plaintext messages — group chats are public)
    getGroupMessages: async (groupId: string) => {
        return await api.get<Message[]>(`/api/messages/group/${groupId}`);
    },

    // Get Conversations (recent chat list with unread counts)
    getConversations: async (userId: string) => {
        return await api.get<any[]>(`/api/messages/conversations?userId=${userId}`);
    },

    // Mark Messages as Read
    markMessagesAsRead: async (senderId: string) => {
        return await api.put(`/api/messages/read/${senderId}`);
    },

    // Upload Public Key to server
    uploadPublicKey: async (userId: string, publicKey: string) => {
        return await api.put(`/api/users/${userId}/public-key`, publicKey);
    },

    // Delete message for everyone
    deleteForEveryone: async (messageId: string) => {
        return await api.delete(`/api/messages/${messageId}/for-everyone`);
    },

    // Delete message for me
    deleteForMe: async (messageId: string) => {
        return await api.delete(`/api/messages/${messageId}/for-me`);
    },

    // Edit message (client sends already-encrypted content + senderContent)
    editMessage: async (messageId: string, content: string, senderContent?: string) => {
        return await api.put(`/api/messages/${messageId}/edit`, { content, senderContent });
    },

    // Get User Public Key
    getUserPublicKey: async (userId: string) => {
        const user = await api.get<any>(`/api/users/${userId}`);
        return user.publicKey as string | undefined;
    }
};
