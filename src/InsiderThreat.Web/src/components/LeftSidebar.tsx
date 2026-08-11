import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { message, Modal, Avatar, List, Checkbox, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import { attendanceService } from '../services/attendanceService';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { api } from '../services/api';
import styles from './LeftSidebar.module.css';

interface LeftSidebarProps {
    defaultCollapsed?: boolean;
}

export default function LeftSidebar({ defaultCollapsed = false }: LeftSidebarProps = {}) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();

    const [user, setUser] = useState(authService.getCurrentUser());
    const [allProjects, setAllProjects] = useState<any[]>([]);
    const [isFavouriteExpanded, setIsFavouriteExpanded] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const fetchedProjects = await api.get<any[]>('/api/groups?isProject=true');
            setAllProjects(fetchedProjects);
        } catch (error) {
            console.error('Failed to fetch projects for sidebar', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        const handleUserUpdate = (e: any) => {
            setUser(e.detail);
        };
        window.addEventListener('auth-user-updated', handleUserUpdate as EventListener);
        return () => window.removeEventListener('auth-user-updated', handleUserUpdate as EventListener);
    }, []);

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

    const mainNavItems = [
        { icon: 'space_dashboard', label: t('nav.workspace', 'Không gian làm việc'), path: '/workspace' },
        ...(isAdmin ? [{ icon: 'monitoring', label: t('nav.admin_dashboard', 'Dashboard'), path: '/dashboard' }] : []),
        { icon: 'dynamic_feed', label: t('nav.feed', 'Bảng tin'), path: '/feed' },
        { icon: 'poll', label: t('nav.surveys', 'Khảo sát'), path: '/surveys' },
        ...(isManagerial ? [{ icon: 'fact_check', label: t('nav.leave_approvals', 'Duyệt nghỉ phép'), path: '/leave-approvals' }] : []),
        { icon: 'forum', label: t('nav.messenger', 'Messenger'), path: '/chat' },
        { icon: 'mail', label: t('nav.inbox', 'Inbox'), path: '/inbox', badge: 5 },
        { icon: 'people', label: t('nav.staff', 'Nhân sự'), path: '/staff' },
        { icon: 'folder_shared', label: t('nav.library', 'Kho tài liệu'), path: '/library' },
        { icon: 'rocket_launch', label: t('nav.projects', 'Dự án'), path: '/projects' },
        { icon: 'groups', label: t('nav.groups', 'Cộng đồng'), path: '/groups' },
        { icon: 'videocam', label: t('nav.meet', 'Họp trực tuyến'), path: '/meet' },
        { icon: 'event_available', label: t('nav.attendance', 'Chấm công'), path: '/attendance', special: true },
        ...(isAdmin ? [{ icon: 'security', label: t('nav.monitor_logs', 'Agent System'), path: '/monitor-logs' }] : []),
    ];

    const favouriteItems = allProjects.filter((p: any) => p.isPriority).map((p: any) => ({
        id: p.id,
        icon: 'list',
        label: p.name,
        path: `/projects/${p.id}`
    }));

    const togglePriority = async (projectId: string, currentStatus: boolean) => {
        try {
            await api.patch(`/api/groups/${projectId}`, { isPriority: !currentStatus });
            // Update local state to reflect change immediately
            setAllProjects((prev: any[]) => prev.map((p: any) => 
                p.id === projectId ? { ...p, isPriority: !currentStatus } : p
            ));
            message.success(t('nav.priority_updated', 'Đã cập nhật dự án ưu tiên'));
        } catch (err) {
            console.error('Failed to toggle priority', err);
            message.error(t('nav.priority_error', 'Lỗi khi cập nhật trạng thái ưu tiên'));
        }
    };

    const handleNavigation = async (item: any) => {
        if (item.special && item.path === '/attendance') {
            try {
                const res = await attendanceService.checkCanCheckIn();
                if (!res.canCheckIn) {
                    message.warning(t('nav.attendance_warning', "Bạn phải kết nối vào mạng WiFi (IP) được chỉ định để chấm công"));
                    return;
                }
            } catch (e) {
                message.error(t('nav.attendance_error', "Lỗi khi kiểm tra kết nối mạng"));
                return;
            }
        }
        navigate(item.path);
    };

    return (
        <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            
            {/* User Profile Section (Top Left) */}
            <div className={styles.userProfileSection}>
                <Avatar src={user?.avatarUrl} size={40}>{user?.fullName?.charAt(0)}</Avatar>
                {!isCollapsed && (
                    <div className={styles.userInfo}>
                        <div className={styles.userName}>{user?.fullName || 'User'}</div>
                        <div className={styles.userEmail}>{user?.username}@mail.com</div>
                    </div>
                )}
                <button className={styles.toggleCollapseBtn} onClick={() => setIsCollapsed(!isCollapsed)}>
                    <span className="material-symbols-outlined">
                        {isCollapsed ? 'menu_open' : 'view_sidebar'}
                    </span>
                </button>
            </div>

            {/* Create Project Button */}
            <div className={styles.createTaskWrapper}>
                <button className={styles.createTaskBtn} onClick={() => navigate('/projects')}>
                    <span className="material-symbols-outlined">add</span>
                    {!isCollapsed && <span>Tạo Dự Án</span>}
                </button>
            </div>

            {/* Main Navigation */}
            <nav className={styles.nav}>
                <div className={styles.navSectionScroll}>
                    {mainNavItems.map(item => {
                        const isActive = location.pathname.startsWith(item.path.split('?')[0]) ||
                            (item.path === '/feed' && location.pathname === '/');
                        return (
                            <button
                                key={item.path}
                                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                onClick={() => handleNavigation(item)}
                            >
                                <div className={styles.iconWrapper}>
                                    <span className={`material-symbols-outlined ${styles.navIcon}`}>{item.icon}</span>
                                    {item.badge && item.badge > 0 && (
                                        <span className={styles.notificationBadgeOverlay}>{item.badge}</span>
                                    )}
                                </div>
                                {!isCollapsed && <span className={styles.navLabel}>{item.label}</span>}
                                {!isCollapsed && item.badge && !['mail', 'inbox'].includes(item.icon) && (
                                    <span className={styles.navBadge}>{item.badge}</span>
                                )}
                            </button>
                        );
                    })}

                    {!isCollapsed && (
                        <>
                            <div className={styles.sectionHeader} onClick={() => setIsFavouriteExpanded(!isFavouriteExpanded)} style={{ cursor: 'pointer' }}>
                                <span>
                                    <span className={`material-symbols-outlined ${styles.toggleIcon} ${!isFavouriteExpanded ? styles.rotated : ''}`} style={{fontSize: 14}}>
                                        expand_less
                                    </span> 
                                    Dự án ưu tiên
                                </span>
                                <span 
                                    className="material-symbols-outlined" 
                                    style={{fontSize: 16, cursor: 'pointer'}}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsModalOpen(true);
                                    }}
                                    title="Chọn dự án ưu tiên"
                                >
                                    add
                                </span>
                            </div>
                            <div className={`${styles.favouriteList} ${!isFavouriteExpanded ? styles.collapsedList : ''}`}>
                                {favouriteItems.length === 0 ? (
                                    <div className={styles.emptyPriorityTip}>
                                        Chưa có dự án ưu tiên nào.
                                    </div>
                                ) : (
                                    favouriteItems.map((item: any) => (
                                        <button
                                            key={item.path}
                                            className={`${styles.navItem} ${styles.favouriteItem}`}
                                            onClick={() => handleNavigation(item)}
                                        >
                                            <div className={styles.iconWrapper}>
                                                <span className={`material-symbols-outlined ${styles.navIcon}`}>{item.icon}</span>
                                            </div>
                                            <span className={styles.navLabel}>{item.label}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </nav>

            <Modal
                title="Chọn Dự Án Ưu Tiên"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={500}
                className={styles.priorityModal}
            >
                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px 0' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}><Spin /></div>
                    ) : (
                        <List
                            dataSource={allProjects}
                            renderItem={(item: any) => (
                                <List.Item
                                    actions={[
                                        <Checkbox 
                                            checked={item.isPriority} 
                                            onChange={() => togglePriority(item.id, !!item.isPriority)}
                                        />
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={<Avatar icon={<span className="material-symbols-outlined">rocket_launch</span>} />}
                                        title={item.name}
                                        description={item.description || "Không có mô tả"}
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </div>
            </Modal>

            {/* Settings & Help Center & Logout */}
            <div className={styles.sidebarFooter}>
                <div className={styles.settingsRow}>
                    <div className={styles.settingsItem}>
                        <ThemeToggle />
                        {!isCollapsed && <span className={styles.settingsLabel}>{t('nav.theme', 'Giao diện')}</span>}
                    </div>
                    <div className={styles.settingsItem}>
                        <LanguageToggle />
                        {!isCollapsed && <span className={styles.settingsLabel}>{t('nav.language', 'Ngôn ngữ')}</span>}
                    </div>
                </div>

                <div className={styles.footerActions}>
                    <button className={styles.footerBtn}>
                        {!isCollapsed && <span>Help Center</span>}
                        <span className="material-symbols-outlined">help</span>
                    </button>
                    <button 
                        className={`${styles.footerBtn} ${styles.logoutBtn}`}
                        onClick={() => {
                            if (window.confirm(t('nav.logout_confirm', 'Bạn có chắc chắn muốn đăng xuất?'))) {
                                authService.logout();
                                navigate('/login');
                            }
                        }}
                    >
                        {!isCollapsed && <span>{t('nav.logout', 'Đăng xuất')}</span>}
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
