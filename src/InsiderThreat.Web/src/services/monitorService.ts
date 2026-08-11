import api from './api';

export interface MonitorLog {
    id?: string;
    logType: string;
    severity: string;
    severityScore: number;
    message: string;
    computerName: string;
    ipAddress: string;
    actionTaken: string;
    detectedKeyword?: string;
    messageContext?: string;
    applicationName?: string;
    windowTitle?: string;
    computerUser?: string;
    timestamp: string;
}

export interface MonitorLogsResponse {
    data: MonitorLog[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface MonitorSummary {
    totalToday: number;
    criticalToday: number;
    screenshotsToday: number;
    keywordsToday: number;
    disconnectsToday: number;
}

export const monitorService = {
    getLogs: async (params: {
        computerName?: string;
        computerUser?: string;
        logType?: string;
        minSeverity?: number;
        page?: number;
        pageSize?: number;
    } = {}) => {
        return await api.get<MonitorLogsResponse>('/api/threat-monitor', { params });
    },

    getSummary: async () => {
        return await api.get<MonitorSummary>('/api/threat-monitor/summary');
    },

    archiveLogs: async (params: { computerName?: string, computerUser?: string, clearLogs?: boolean } = {}) => {
        return await api.get<any>('/api/threat-monitor/export-archive', { 
            params,
            responseType: 'blob' 
        });
    }
};
