import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import { attendanceService } from '../services/attendanceService';
import styles from './BottomNavigation.module.css';

interface NavItem {
    icon: string;
    label: string;
    path?: string;
    key?: string;
    special?: boolean;
    onClick?: () => void;
}

interface BottomNavigationProps {
    items?: NavItem[];
    activeKey?: string;
}

export default function BottomNavigation({ items, activeKey }: BottomNavigationProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const navRef = useRef<HTMLElement>(null);

    const [user, setUser] = useState(authService.getCurrentUser());

    useEffect(() => {
        const handleUserUpdate = (e: any) => {
            setUser(e.detail);
        };
        window.addEventListener('auth-user-updated', handleUserUpdate as EventListener);
        return () => window.removeEventListener('auth-user-updated', handleUserUpdate as EventListener);
    }, []);

    // Auto-scroll active item into view when current page changes
    useEffect(() => {
        const timer = setTimeout(() => {
            if (navRef.current) {
                const activeEl = navRef.current.querySelector(`.${styles.active}`);
                if (activeEl) {
                    activeEl.scrollIntoView({
                        behavior: 'smooth',
                        inline: 'center',
                        block: 'nearest'
                    });
                }
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [location.pathname, activeKey, user]);

    const isAdmin = user?.role?.toLowerCase().includes('admin') ||
        user?.role?.toLowerCase() === 'giám đốc' ||
        user?.role?.toLowerCase() === 'director' ||
        user?.username?.toLowerCase() === 'admin';

    const isManagerial = isAdmin || 
        user?.role?.toLowerCase().includes('manager') || 
        user?.role?.toLowerCase().includes('quản lý') ||
        user?.role?.toLowerCase().includes('director') ||
        user?.role?.toLowerCase().includes('giám đốc') ||
        user?.position?.toLowerCase().includes('trưởng phòng');

    const defaultItems: NavItem[] = [
        { icon: 'space_dashboard', label: t('nav.workspace', 'Làm việc'), path: '/workspace' },
        ...(isAdmin ? [{ icon: 'monitoring', label: t('nav.admin_dashboard', 'Dashboard'), path: '/dashboard' }] : []),
        { icon: 'dynamic_feed', label: t('nav.feed', 'Bảng tin'), path: '/feed' },
        { icon: 'poll', label: t('nav.surveys', 'Khảo sát'), path: '/surveys' },
        ...(isManagerial ? [{ icon: 'fact_check', label: t('nav.leave_approvals', 'Duyệt phép'), path: '/leave-approvals' }] : []),
        { icon: 'forum', label: t('nav.messenger', 'Messenger'), path: '/chat' },
        { icon: 'mail', label: t('nav.inbox', 'Inbox'), path: '/inbox' },
        { icon: 'people', label: t('nav.staff', 'Nhân sự'), path: '/staff' },
        { icon: 'folder_shared', label: t('nav.library', 'Tài liệu'), path: '/library' },
        { icon: 'rocket_launch', label: t('nav.projects', 'Dự án'), path: '/projects' },
        { icon: 'groups', label: t('nav.groups', 'Cộng đồng'), path: '/groups' },
        { icon: 'videocam', label: t('nav.meet', 'Họp'), path: '/meet' },
        { icon: 'event_available', label: t('nav.attendance', 'Chấm công'), path: '/attendance', special: true },
        ...(isAdmin ? [{ icon: 'security', label: t('nav.monitor_logs', 'Hệ thống'), path: '/monitor-logs' }] : []),
        { icon: 'person', label: t('nav.profile', 'Cá nhân'), path: '/profile' },
    ];

    const displayItems = items || defaultItems;

    const isItemActive = (item: NavItem) => {
        if (activeKey && item.key) return activeKey === item.key;
        if (item.path) return location.pathname === item.path;
        return false;
    };

    return (
        <nav ref={navRef} className={`${styles.bottomNav} ${items ? styles.dashboardBottomNav : ''}`}>
            {displayItems.map((item, index) => (
                <button
                    key={index}
                    className={`${styles.navItem} ${isItemActive(item) ? styles.active : ''}`}
                    onClick={async () => {
                        if ((item as any).special && item.path === '/attendance') {
                            try {
                                const res = await attendanceService.checkCanCheckIn();
                                if (!res.canCheckIn) {
                                    message.warning("Bạn phải kết nối vào mạng WiFi (IP) được chỉ định để chấm công");
                                    return;
                                }
                            } catch (e) {
                                message.error("Lỗi khi kiểm tra kết nối mạng");
                                return;
                            }
                        }

                        if (item.onClick) item.onClick();
                        else if (item.path) navigate(item.path);
                    }}
                >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                </button>
            ))}
        </nav>
    );
}
