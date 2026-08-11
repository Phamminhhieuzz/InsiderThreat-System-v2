import { useState, useEffect } from 'react';
import { userService } from '../../services/userService';
import { authService } from '../../services/auth';
import { API_BASE_URL } from '../../services/api';
import { useTranslation } from 'react-i18next';
import type { User } from '../../types';
import styles from './ChatSidebar.module.css';

interface ChatSidebarProps {
    onContactClick: (user: User) => void;
}

export default function ChatSidebar({ onContactClick }: ChatSidebarProps) {
    const currentUser = authService.getCurrentUser();
    const { t } = useTranslation();
    const [contacts, setContacts] = useState<User[]>([]);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const users = await userService.getAllUsers();
                setContacts(users.filter(u => u.username !== currentUser?.username));
            } catch (error) {
                console.error('Failed to fetch contacts', error);
            }
        };
        fetchContacts();
    }, [currentUser]);

    const getAvatarUrl = (user: User) => {
        if (!user.avatarUrl) return '';
        if (user.avatarUrl.startsWith('http')) return user.avatarUrl;
        return `${API_BASE_URL}${user.avatarUrl}`;
    };

    function getInitials(name: string) {
        return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    }

    const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#d97706'];
    const getColor = (name: string) => {
        let h = 0; for (const c of name) h = (h + c.charCodeAt(0)) % COLORS.length;
        return COLORS[h];
    };

    const getRoleClass = (roleOrPosition?: string) => {
        if (!roleOrPosition) return styles.roleStaff;
        const r = roleOrPosition.toLowerCase();
        if (r.includes('admin')) return styles.roleAdmin;
        if (r.includes('quản lý') || r.includes('manager') || r.includes('trưởng phòng') || r.includes('phó phòng')) return styles.roleManager;
        if (r.includes('giám đốc') || r.includes('director')) return styles.roleDirector;
        return styles.roleStaff;
    };

    if (collapsed) {
        return (
            <aside className={styles.chatSidebarCollapsed}>
                <button
                    className={styles.collapseBtn}
                    onClick={() => setCollapsed(false)}
                    title={t('chat_sidebar.suggestions_tooltip', 'Gợi ý liên hệ')}
                >
                    <span className="material-symbols-outlined">people</span>
                </button>
            </aside>
        );
    }

    return (
        <aside className={styles.chatSidebar}>
            <div className={styles.sidebarHeader}>
                <span className={styles.sidebarTitle}>{t('chat_sidebar.suggestions_title', 'GỢI Ý LIÊN HỆ')}</span>
                <button className={styles.collapseBtn} onClick={() => setCollapsed(true)} title={t('chat_sidebar.collapse', 'Thu gọn')}>
                    <span className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>
            <div className={styles.contactsList}>
                {contacts.map(contact => {
                    const url = getAvatarUrl(contact);
                    const name = contact.fullName || contact.username || 'User';
                    // Randomly simulate online/offline
                    const isOnline = contact.username ? (contact.username.charCodeAt(0) % 3 !== 0) : true;
                    return (
                        <div
                            key={contact.id || contact.username}
                            className={`${styles.contactItem} dark:hover:bg-darkCard group`}
                            onClick={() => onContactClick(contact)}
                        >
                            <div
                                className={styles.contactAvatar}
                                style={url
                                    ? { backgroundImage: `url(${url})`, backgroundColor: 'transparent' }
                                    : { background: getColor(name) }
                                }
                            >
                                {!url && <span className={styles.initials}>{getInitials(name)}</span>}
                                <div className={`${styles.statusDot} ${isOnline ? styles.online : styles.offline} dark:border-[#1e1e1e] group-hover:dark:border-[#2d2d2d]`} />
                            </div>
                            <div className={styles.contactInfo}>
                                <div className={styles.nameRow}>
                                    <div className={`${styles.contactName} dark:text-slate-200`}>{name}</div>
                                    {(contact.position || contact.role) && (
                                        <span className={`${styles.roleBadge} ${getRoleClass(contact.position || contact.role)}`}>
                                            {contact.position || contact.role}
                                        </span>
                                    )}
                                </div>
                                <div className={`${styles.statusLabel} ${isOnline ? styles.onlineLabel : styles.offlineLabel} dark:text-slate-400`}>
                                    {isOnline ? t('chat_sidebar.online', 'Đang online') : t('chat_sidebar.offline', 'Ngoại tuyến')}
                                </div>
                            </div>
                            <button className="material-symbols-outlined ml-auto text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-600 dark:hover:text-blue-400" title={t('chat_sidebar.add_friend', 'Kết bạn')}>
                                person_add
                            </button>
                        </div>
                    );
                })}
            </div>

        </aside>
    );
}
