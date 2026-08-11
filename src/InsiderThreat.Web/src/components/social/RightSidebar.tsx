import { Avatar, Badge } from 'antd';
import { UserOutlined, SearchOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api, { API_BASE_URL } from '../../services/api';
import styles from './RightSidebar.module.css';

interface User {
    id: string;
    username: string;
    fullName: string;
    role: string;
    department: string;
    avatarUrl?: string; // Add avatarUrl field
}

interface RightSidebarProps {
    onContactClick?: (user: any) => void;
}

const RightSidebar = ({ onContactClick }: RightSidebarProps) => {
    const { t } = useTranslation();
    const [contacts, setContacts] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const userStr = localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : {};
    const currentUserId = currentUser._id || currentUser.id || '';

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const users = await api.get<User[]>('/api/users');
            // Filter out current user and limit to 10 contacts
            const filteredUsers = users
                .filter((u: User) => u.id !== currentUserId)
                .slice(0, 10);
            setContacts(filteredUsers);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const getRoleBadge = (role: string) => {
        const r = role?.toUpperCase() || 'NHÂN VIÊN';
        if (r.includes('GIÁM ĐỐC') || r.includes('DIRECTOR') || r.includes('ADMIN')) {
            return { text: 'GIÁM ĐỐC', style: styles.badgeDirector };
        }
        if (r.includes('QUẢN LÝ') || r.includes('MANAGER')) {
            return { text: 'QUẢN LÝ', style: styles.badgeManager };
        }
        return { text: 'NHÂN VIÊN', style: styles.badgeStaff };
    };

    const getAvatarUrl = (url?: string) => {
        if (!url) return `https://i.pravatar.cc/150?u=user`;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <h3 className={styles.title}>{t('sidebar.suggestions', 'GỢI Ý KẾT NỐI')}</h3>
                <div className={styles.actions}>
                    <button className={styles.iconBtn} title="Search">
                        <SearchOutlined style={{ fontSize: 16 }} />
                    </button>
                    <button className={styles.iconBtn} title="Expand">
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
                    </button>
                </div>
            </div>

            <div className={styles.contactList}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        {t('common.loading', 'Đang tải...')}
                    </div>
                )}
                {!loading && contacts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        {t('sidebar.no_suggestions', 'Không có gợi ý')}
                    </div>
                )}
                {!loading && contacts.length > 0 && (
                    contacts.map((contact) => {
                        const badge = getRoleBadge(contact.role);
                        return (
                            <div 
                                key={contact.id} 
                                className={styles.contact}
                                onClick={() => onContactClick?.({
                                    id: contact.id,
                                    name: contact.fullName,
                                    avatar: '', // You can add avatar logic here
                                    status: 'online'
                                })}
                                style={{ cursor: onContactClick ? 'pointer' : 'default' }}
                            >
                                <div className={styles.avatarWrapper}>
                                    <Avatar 
                                        size={44} 
                                        src={getAvatarUrl(contact.avatarUrl)}
                                        icon={!contact.avatarUrl && <UserOutlined />}
                                        style={{ backgroundColor: contact.avatarUrl ? 'transparent' : '#2563eb' }}
                                    />
                                    <span className={styles.onlineDot}></span>
                                </div>
                                <div className={styles.contactInfo}>
                                    <div className={styles.nameRow}>
                                        <span className={styles.name}>{contact.fullName}</span>
                                        <span className={`${styles.badge} ${badge.style}`}>
                                            {badge.text}
                                        </span>
                                    </div>
                                    <div className={styles.statusRow}>
                                        <span className={styles.statusText}>ĐANG ONLINE</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default RightSidebar;
