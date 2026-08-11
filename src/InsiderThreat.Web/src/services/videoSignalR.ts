import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from './api';

class VideoSignalRService {
    private connection: signalR.HubConnection | null = null;

    async connect(token: string): Promise<signalR.HubConnection> {
        if (this.connection) {
            await this.disconnect();
        }

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/video`, {
                accessTokenFactory: () => token,
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        await this.connection.start();
        console.log('[VideoSignalR] Connected');
        return this.connection;
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.stop();
            this.connection = null;
            console.log('[VideoSignalR] Disconnected');
        }
    }

    getConnection() {
        return this.connection;
    }
}

export const videoSignalRService = new VideoSignalRService();
