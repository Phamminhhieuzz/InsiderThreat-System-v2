import { api } from './api';
import type { LeaveRequest } from '../types';

export const leaveService = {
    createRequest: async (data: Partial<LeaveRequest>) => {
        return api.post<{ message: string; requestId: string; conflicts: any[] }>('/api/LeaveRequests', data);
    },

    getMyRequests: async () => {
        return api.get<LeaveRequest[]>('/api/LeaveRequests/my');
    },

    getPendingApprovals: async () => {
        return api.get<LeaveRequest[]>('/api/LeaveRequests/pending');
    },

    approveRequest: async (id: string) => {
        return api.post<{ message: string }>(`/api/LeaveRequests/${id}/approve`);
    },

    rejectRequest: async (id: string, reason: string) => {
        return api.post<{ message: string }>(`/api/LeaveRequests/${id}/reject`, reason);
    }
};
