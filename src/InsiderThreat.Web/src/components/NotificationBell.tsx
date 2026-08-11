import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import type { Notification } from '../services/notificationService';

const ICONS: Record<string, string> = {
    Like: '❤️', Comment: '💬', Mention: '@',
    Report: '🚨', Global: '📢', Message: '✉️', NewPost: '📝',
};

function formatTime(dateString: string) {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const m = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMs / 3600000);
    const d = Math.floor(diffMs / 86400000);
    if (m < 1) return 'Vừa xong';
    if (m < 60) return `${m} phút trước`;
    if (h < 24) return `${h} giờ trước`;
    if (d < 7) return `${d} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const { notifications, unreadSocialCount, markAsRead, markAllRead } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClick = async (n: Notification) => {
        if (!n.isRead) await markAsRead(n.id);
        if (n.link) {
            navigate(n.link);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-600 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                title="Thông báo"
            >
                <span className="material-symbols-outlined text-[22px]">notifications</span>
                {unreadSocialCount > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-0.5 border-2 border-white animate-pulse">
                        {unreadSocialCount > 9 ? '9+' : unreadSocialCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">Thông báo</h3>
                        {unreadSocialCount > 0 && (
                            <button
                                onClick={() => { markAllRead(); setIsOpen(false); }} className="text-xs text-blue-600 hover:underline"
                            >
                                Đánh dấu tất cả đã đọc
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
                        {notifications.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <span className="material-symbols-outlined text-4xl block mb-2">notifications_off</span>
                                <p className="text-sm">Chưa có thông báo</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    onClick={() => handleClick(n)}
                                    className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors
                                        ${!n.isRead ? 'bg-blue-50/60' : ''}`}
                                >
                                    <span className="text-2xl flex-shrink-0 mt-0.5">{ICONS[n.type] || '🔔'}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                                            {n.message}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">{formatTime(n.createdAt)}</p>
                                    </div>
                                    {!n.isRead && (
                                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
