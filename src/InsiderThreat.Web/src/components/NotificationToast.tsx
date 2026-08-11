import { useEffect, useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../services/notificationService';

const ICONS: Record<string, string> = {
    Like: '❤️', Comment: '💬', Mention: '@', Report: '🚨',
    Global: '📢', Message: '✉️', NewPost: '📝',
};

const COLORS: Record<string, string> = {
    Like: 'border-l-rose-400', Comment: 'border-l-blue-400', Mention: 'border-l-purple-400',
    Global: 'border-l-amber-400', Message: 'border-l-green-400', NewPost: 'border-l-indigo-400',
    Report: 'border-l-red-500',
};

export default function NotificationToast() {
    const { toastQueue, dismissToast } = useNotifications();
    const navigate = useNavigate();

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
            {toastQueue.map(notification => (
                <ToastItem
                    key={notification.id}
                    notification={notification}
                    onDismiss={() => dismissToast(notification.id)}
                    onNavigate={() => {
                        if (notification.link) navigate(notification.link);
                        dismissToast(notification.id);
                    }}
                />
            ))}
        </div>
    );
}

function ToastItem({ notification, onDismiss, onNavigate }: {
    notification: Notification;
    onDismiss: () => void;
    onNavigate: () => void;
}) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Slide in
        requestAnimationFrame(() => setVisible(true));

        // Auto dismiss after 5s
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(onDismiss, 300); // wait for slide-out
        }, 5000);

        return () => clearTimeout(timer);
    }, []);

    const icon = ICONS[notification.type] || '🔔';
    const colorClass = COLORS[notification.type] || 'border-l-slate-400';

    if (notification.type === 'DocumentLeakAlert') {
        const playSiren = () => {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();
            
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(600, context.currentTime);
            oscillator.frequency.linearRampToValueAtTime(800, context.currentTime + 0.3);
            oscillator.frequency.linearRampToValueAtTime(600, context.currentTime + 0.6);
            
            oscillator.connect(gainNode);
            gainNode.connect(context.destination);
            
            gainNode.gain.setValueAtTime(0.5, context.currentTime);
            oscillator.start();
            oscillator.stop(context.currentTime + 1.5); // Play for 1.5 seconds
        };

        useEffect(() => {
            if (visible) playSiren();
            // Start flashing interval
            const interval = setInterval(playSiren, 2000);
            return () => clearInterval(interval);
        }, [visible]);

        return (
            <div className={`fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 pointer-events-auto transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
                <div className="bg-red-600 w-full max-w-2xl rounded-2xl p-8 shadow-[0_0_100px_rgba(220,38,38,0.7)] text-center animate-pulse border-4 border-red-400 relative">
                    <div className="text-8xl mb-4">🚨</div>
                    <h1 className="text-4xl font-extrabold text-white mb-2 uppercase tracking-wide">Cảnh báo An ninh Nghiêm trọng</h1>
                    <h2 className="text-2xl font-bold text-red-200 mb-6 uppercase tracking-wider">Phát hiện Hành vi Rò rỉ Tài liệu Mật</h2>
                    <div className="bg-black/50 p-6 rounded-xl mb-8">
                        <p className="text-xl text-white font-mono leading-relaxed">{notification.message}</p>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setVisible(false); setTimeout(onDismiss, 300); }}
                            className="px-8 py-3 bg-red-900/50 hover:bg-red-800 text-red-100 rounded-xl font-bold text-lg transition-colors border border-red-500/30"
                        >
                            Đã Rõ, Bỏ qua
                        </button>
                        <button 
                            onClick={() => { onNavigate(); setTimeout(onDismiss, 300); }}
                            className="px-8 py-3 bg-white hover:bg-red-50 text-red-700 rounded-xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                        >
                            Đến Trang Quản lý &gt;
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`pointer-events-auto flex items-start gap-3 w-80 bg-white border border-slate-200 border-l-4 ${colorClass} 
                rounded-xl shadow-2xl px-4 py-3 cursor-pointer
                transition-all duration-300 ease-out
                ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
            onClick={onNavigate}
        >
            {/* Icon */}
            <div className="flex-shrink-0 text-2xl leading-none mt-0.5">{icon}</div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {notification.actorName && (
                    <p className="text-xs font-semibold text-slate-600 mb-0.5">{notification.actorName}</p>
                )}
                <p className="text-sm text-slate-800 leading-snug line-clamp-2">{notification.message}</p>
                <p className="text-xs text-slate-400 mt-1">Vừa xong</p>
            </div>

            {/* Close */}
            <button
                onClick={e => { e.stopPropagation(); setVisible(false); setTimeout(onDismiss, 300); }}
                className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors text-lg leading-none"
            >
                ×
            </button>
        </div>
    );
}
