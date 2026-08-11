import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { signalRService } from '../services/signalRService';
import { notificationService, type Notification } from '../services/notificationService';

interface NotificationContextValue {
    notifications: Notification[];
    unreadCount: number;
    unreadMessageCount: number;
    unreadSocialCount: number;
    toastQueue: Notification[];
    dismissToast: (id: string) => void;
    markAsRead: (id: string) => void;
    markAllRead: () => void;
    refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
    notifications: [],
    unreadCount: 0,
    unreadMessageCount: 0,
    unreadSocialCount: 0,
    toastQueue: [],
    dismissToast: () => { },
    markAsRead: () => { },
    markAllRead: () => { },
    refreshNotifications: async () => { },
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [toastQueue, setToastQueue] = useState<Notification[]>([]);
    const handlerRef = useRef<((n: Notification) => void) | null>(null);

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const unreadMessageCount = notifications.filter(n => !n.isRead && n.type === 'Message').length;
    const unreadSocialCount = notifications.filter(n => !n.isRead && n.type !== 'Message').length;

    const refreshNotifications = useCallback(async () => {
        try {
            const data = await notificationService.getNotifications();
            setNotifications(data);
        } catch (e) {
            console.error('Failed to load notifications', e);
        }
    }, []);

    // Kết nối SignalR khi component mount (user đã login)
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // 🛡️ YÊU CẦU QUYỀN THÔNG BÁO TRÌNH DUYỆT
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        // Load lịch sử thông báo ban đầu
        refreshNotifications();

        // Kết nối SignalR
        signalRService.connect(token);

        // Handler nhận thông báo mới
        handlerRef.current = (notification: Notification) => {
            setNotifications(prev => [notification, ...prev]);
            setToastQueue(prev => [...prev, notification]);

            // 🚀 BẮN THÔNG BÁO HỆ THỐNG (Hiện lên điện thoại/máy tính)
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification((notification as any).title || "Cảnh báo InsiderThreat", {
                    body: notification.message,
                    icon: "/favicon.ico"
                });
            }
        };
        signalRService.onNotification(handlerRef.current);

        return () => {
            if (handlerRef.current) {
                signalRService.offNotification(handlerRef.current);
            }
        };
    }, [refreshNotifications]);

    const dismissToast = useCallback((id: string) => {
        setToastQueue(prev => prev.filter(n => n.id !== id));
    }, []);

    const markAsRead = useCallback(async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
        } catch (e) {
            console.error(e);
        }
    }, []);

    const markAllRead = useCallback(async () => {
        const unread = notifications.filter(n => !n.isRead);
        await Promise.all(unread.map(n => notificationService.markAsRead(n.id)));
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }, [notifications]);

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            unreadMessageCount,
            unreadSocialCount,
            toastQueue,
            dismissToast,
            markAsRead,
            markAllRead,
            refreshNotifications,
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationContext);
}
