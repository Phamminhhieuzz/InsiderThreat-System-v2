import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/auth';
import api, { API_BASE_URL } from '../services/api';
import SearchBar from './SearchBar';
import type { Notification } from '../services/notificationService';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import Logo from './Logo';
import styles from './NavigationBar.module.css';

interface NavigationBarProps {
    onChatClick?: () => void;
    hideSearch?: boolean;
}

export default function NavigationBar({ onChatClick, hideSearch = false }: NavigationBarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState(authService.getCurrentUser());

    useEffect(() => {
        const handleUserUpdate = (e: any) => {
            setUser(e.detail);
        };
        window.addEventListener('auth-user-updated', handleUserUpdate as EventListener);
        return () => window.removeEventListener('auth-user-updated', handleUserUpdate as EventListener);
    }, []);

    // Admin detection: check role (case-insensitive) or if username is 'admin'
    const isAdmin = user?.role?.toLowerCase().includes('admin') ||
        user?.username?.toLowerCase() === 'admin';

    const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const { theme, toggleTheme } = useTheme();
    const { t } = useTranslation();
    const isDarkMode = theme === 'dark';

    const avatarRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
                setShowAvatarDropdown(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch notifications
    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const notifs = await api.get<Notification[]>('/api/notifications');
                setNotifications(notifs);
                setUnreadCount(notifs.length);
            } catch (error) {
                console.error('Failed to fetch notifications', error);
            }
        };

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000); // Poll every minute
        return () => clearInterval(interval);
    }, []);

    const getAvatarUrl = () => {
        if (!user?.avatarUrl) return `https://i.pravatar.cc/150?u=${user?.username || 'user'}`;
        if (user.avatarUrl.startsWith('http')) return user.avatarUrl;
        return `${API_BASE_URL}${user.avatarUrl}`;
    };

    const handleLogout = () => {
        if (window.confirm(t('nav.logout_confirm', 'Are you sure you want to logout?'))) {
            authService.logout();
            navigate('/login');
        }
    };

    const handleNotificationClick = (notification: Notification) => {
        if (notification.link) {
            navigate(notification.link);
        }
        setShowNotifications(false);
    };

    const isActive = (path: string) => location.pathname === path;

    return (
        <nav className={styles.navbar}>
            <div className={styles.leftSection}>
                {/* Logo */}
                <div className={styles.logo} onClick={() => navigate('/feed')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <Logo width={40} height={40} showText={true} />
                </div>
            </div>

            {/* Search Bar */}
            {!hideSearch && (
                <div className={styles.searchContainer}>
                    <SearchBar />
                </div>
            )}

            {/* Right Section */}
            <div className={styles.rightSection}>
                {/* Workspace / Home Link */}
                <button
                    className={`${styles.iconButton} ${isActive('/workspace') ? styles.active : ''}`}
                    onClick={() => navigate('/workspace')}
                    title={t('nav.workspace', 'Không gian làm việc')}
                >
                    <div className={styles.actionIcon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                        </svg>
                    </div>
                </button>

                {/* Feed Link */}
                <button
                    className={`${styles.iconButton} ${isActive('/feed') ? styles.active : ''}`}
                    onClick={() => navigate('/feed')}
                    title={t('nav.feed', 'Bảng tin')}
                >

                    <div className={styles.actionIcon}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                            <path d="M11.1 2.8a1.5 1.5 0 011.8 0l8.9 6.7a1.5 1.5 0 01.6 1.2V20a2 2 0 01-2 2h-4a1 1 0 01-1-1v-5h-4v5a1 1 0 01-1 1H5a2 2 0 01-2-2v-9.3a1.5 1.5 0 01.6-1.2l8.9-6.7z" />
                        </svg>
                    </div>
                </button>

                {/* Survey Link */}
                <button
                    className={`${styles.iconButton} ${isActive('/surveys') ? styles.active : ''}`}
                    onClick={() => navigate('/surveys')}
                    title={t('nav.surveys', 'Khảo sát')}
                >
                    <div className={styles.actionIcon}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                        </svg>
                    </div>
                </button>

                {/* Chat Link */}
                <button
                    className={`${styles.iconButton} ${isActive('/chat') ? styles.active : ''}`}
                    onClick={onChatClick || (() => navigate('/chat'))}
                    title="Chat"
                >
                    <div className={styles.actionIcon}>
                        {/* Twin Bubble Messenger SVG */}
                        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                            <path d="M15.5 4.5c3.59 0 6.5 2.5 6.5 5.58 0 1.48-.68 2.83-1.8 3.87l.59 2.36a.5.5 0 01-.68.59l-2.43-1.21a7.48 7.48 0 01-2.18.33c-3.59 0-6.5-2.5-6.5-5.58s2.91-5.58 6.5-5.58z" />
                            <path className={styles.chatBubbleStroke} strokeWidth="2.5" strokeLinejoin="round" d="M9.5 8.5C4.8 8.5 1 11.85 1 16c0 1.9.85 3.63 2.25 4.95l-.65 2.62a.5.5 0 00.67.61l2.88-1.44A8.47 8.47 0 009.5 23.5c4.7 0 8.5-3.35 8.5-7.5S14.2 8.5 9.5 8.5z" />
                        </svg>
                        <div className={styles.messageBadge}>2</div>
                    </div>
                </button>

                {/* Notifications */}
                <div style={{ position: 'relative' }} ref={notificationRef}>
                    <button
                        className={`${styles.iconButton} ${showNotifications ? styles.active : ''}`}
                        onClick={() => setShowNotifications(!showNotifications)}
                    >
                        <div className={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                                <path d="M21 19h-1.5v-6.5c0-3.69-2.58-6.79-6-7.4v-.85c0-.97-.78-1.75-1.75-1.75S10 3.28 10 4.25v.85c-3.42.61-6 3.71-6 7.4V19H2.5A1.5 1.5 0 001 20.5 1.5 1.5 0 002.5 22h19a1.5 1.5 0 001.5-1.5A1.5 1.5 0 0021 19zM12 24c1.38 0 2.5-1.12 2.5-2.5h-5c0 1.38 1.12 2.5 2.5 2.5z" />
                            </svg>
                            {unreadCount > 0 && <span className={styles.notificationDot}></span>}
                        </div>
                    </button>

                    {showNotifications && (
                        <div className={styles.notificationDropdown}>
                            <div className={styles.notificationHeader}>
                                {t('nav.notifications', 'Notifications')}
                            </div>
                            {notifications.length > 0 ? (
                                notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        className={styles.notificationItem}
                                        onClick={() => handleNotificationClick(notif)}
                                    >
                                        <div className={styles.notificationMessage}>
                                            {notif.message}
                                        </div>
                                        <div className={styles.notificationMeta}>
                                            {notif.actorName && `${notif.actorName} • `}
                                            {new Date(notif.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyNotifications}>
                                    {t('nav.no_notifications', 'No new notifications')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Avatar with Dropdown */}
                <div className={styles.avatarContainer} ref={avatarRef}>
                    <div
                        className={styles.avatar}
                        style={{ backgroundImage: `url(${getAvatarUrl()})` }}
                        onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
                    />

                    {showAvatarDropdown && (
                        <div className={styles.dropdownMenu}>
                            <div className={styles.dropdownHeader}>
                                <div className={styles.dropdownUserName}>
                                    {user?.fullName || user?.username}
                                </div>
                                <div className={styles.dropdownUserEmail}>
                                    {user?.email || user?.username}
                                </div>
                            </div>

                            <button
                                className={styles.dropdownItem}
                                onClick={() => {
                                    navigate('/profile');
                                    setShowAvatarDropdown(false);
                                }}
                            >
                                <span className="material-symbols-outlined">person</span>
                                <span>{t('nav.profile', 'Profile')}</span>
                            </button>

                            {user?.role === 'Admin' && (
                                <button
                                    className={styles.dropdownItem}
                                    onClick={() => {
                                        navigate('/dashboard');
                                        setShowAvatarDropdown(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined">admin_panel_settings</span>
                                    <span>{t('nav.admin_dashboard', 'Admin Dashboard')}</span>
                                </button>
                            )}

                            <div
                                className={styles.dropdownItem}
                                style={{ justifyContent: 'space-between', cursor: 'default', paddingRight: '8px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span>{isDarkMode ? t('nav.theme_dark', 'Giao diện: Tối') : t('nav.theme_light', 'Giao diện: Sáng')}</span>
                                <div style={{ transform: 'scale(0.65)', transformOrigin: 'right center', display: 'flex' }}>
                                    <ThemeToggle />
                                </div>
                            </div>
                            
                            <div
                                className={styles.dropdownItem}
                                style={{ justifyContent: 'space-between', cursor: 'default', paddingRight: '8px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span>{t('nav.language', 'Ngôn ngữ')} / Lang</span>
                                <div style={{ transform: 'scale(0.85)', transformOrigin: 'right center', display: 'flex' }}>
                                    <LanguageToggle />
                                </div>
                            </div>

                            <button
                                className={`${styles.dropdownItem} ${styles.danger}`}
                                onClick={handleLogout}
                            >
                                <span className="material-symbols-outlined">logout</span>
                                <span>{t('nav.logout', 'Logout')}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
