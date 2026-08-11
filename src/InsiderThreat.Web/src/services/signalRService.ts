import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from './api';

type NotificationCallback = (notification: any) => void;

class SignalRService {
    private connection: signalR.HubConnection | null = null;
    private callbacks: NotificationCallback[] = [];

    async connect(token: string) {
        // Ngăn chặn tạo nhiều connection (đặc biệt trong React 18 Strict Mode gọi useEffect 2 lần)
        if (this.connection) return;

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE_URL}/hubs/notifications`, {
                accessTokenFactory: () => token,
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // Lắng nghe thông báo mới từ server
        this.connection.on('NewNotification', (notification: any) => {
            this.callbacks.forEach(cb => cb(notification));
        });

        this.connection.onreconnected(() => {
            console.log('[SignalR] Reconnected to notification hub');
        });

        try {
            await this.connection.start();
            console.log('[SignalR] Connected to notification hub');
        } catch (err) {
            console.error('[SignalR] Connection error:', err);
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.stop();
            this.connection = null;
        }
    }

    onNotification(cb: NotificationCallback) {
        this.callbacks.push(cb);
    }

    offNotification(cb: NotificationCallback) {
        this.callbacks = this.callbacks.filter(fn => fn !== cb);
    }

    getState() {
        return this.connection?.state ?? signalR.HubConnectionState.Disconnected;
    }

    getConnection() {
        return this.connection;
    }
}

// Singleton — dùng chung toàn app
export const signalRService = new SignalRService();
