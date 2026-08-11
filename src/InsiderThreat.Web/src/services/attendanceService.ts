import { api } from './api';

export interface AttendanceConfig {
    id?: string;
    configType: string;
    allowedIPs: string;
    updatedAt: string;
    updatedBy: string;
}

export interface CanCheckInResponse {
    canCheckIn: boolean;
    currentIp: string;
    restrictionEnabled: boolean;
}

export interface ActiveNetwork {
    id: string;
    name: string;
    ipAddress: string;
    prefix: string;
}

export interface FaceCheckInResult {
    message: string;
    time: string;
    matchConfidence: number;
    livenessVerified: boolean;
}

export const attendanceService = {
    getConfig: async (): Promise<AttendanceConfig> => {
        return api.get<AttendanceConfig>('/api/attendance/config');
    },

    updateConfig: async (config: { allowedIPs: string }): Promise<void> => {
        return api.post('/api/attendance/config', config);
    },

    checkCanCheckIn: async (): Promise<CanCheckInResponse> => {
        return api.get<CanCheckInResponse>('/api/attendance/can-checkin');
    },

    getActiveNetworks: async (): Promise<ActiveNetwork[]> => {
        return api.get<ActiveNetwork[]>('/api/attendance/active-networks');
    },

    /**
     * Zero Trust Face Check-in
     * Sends face descriptor to server for verification
     */
    faceCheckIn: async (
        descriptor: number[],
        nonce: string,
        livenessVerified: boolean
    ): Promise<FaceCheckInResult> => {
        return api.post<FaceCheckInResult>('/api/attendance/face-checkin', {
            descriptor,
            nonce,
            timestamp: Date.now(),
            livenessVerified,
        });
    },
};

