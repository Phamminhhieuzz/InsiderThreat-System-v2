import React, { useState } from 'react';
import { Layout, Input, Badge, Avatar, Dropdown } from 'antd';
import {
    HomeOutlined,
    TeamOutlined,
    MessageOutlined,
    VideoCameraOutlined,
    BellOutlined,
    SearchOutlined,
    PlusOutlined,
    AppstoreOutlined,
    BulbOutlined,
    BulbFilled,
    GlobalOutlined,
    UserOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import styles from './SocialHeader.module.css';

const { Header } = Layout;

const SocialHeader = () => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const { unreadMessageCount, unreadSocialCount } = useNotifications();
    const [lang, setLang] = useState('vi');

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Profile',
            onClick: () => navigate('/profile')
        },
        {
            key: 'settings',
            icon: <AppstoreOutlined />,
            label: 'Settings',
            onClick: () => navigate('/settings')
        },
        {
            type: 'divider'
        },
        {
            key: 'theme',
            icon: theme === 'dark' ? <BulbFilled /> : <BulbOutlined />,
            label: theme === 'dark' ? 'Light Mode' : 'Dark Mode',
            onClick: toggleTheme
        },
        {
            key: 'language',
            icon: <GlobalOutlined />,
            label: lang === 'vi' ? '🇬🇧 English' : '🇻🇳 Tiếng Việt',
            onClick: () => setLang(lang === 'vi' ? 'en' : 'vi')
        },
        {
            type: 'divider'
        },
        {
            key: 'logout',
            label: 'Logout',
            onClick: () => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                navigate('/login');
            }
        }
    ];

    return (
        <Header className={styles.header}>
            <div className={styles.container}>
                {/* Left Section */}
                <div className={styles.left}>
                    <div className={styles.logo} onClick={() => navigate('/')}>
                        <AppstoreOutlined style={{ fontSize: 40, color: 'var(--primary-blue)' }} />
                    </div>
                    <Input
                        className={styles.search}
                        prefix={<SearchOutlined />}
                        placeholder="Search InsiderThreat"
                        variant="borderless"
                    />
                </div>

                {/* Center Navigation */}
                <div className={styles.center}>
                    <div className={`${styles.navItem} ${styles.active}`}>
                        <HomeOutlined />
                    </div>
                    <div className={styles.navItem} onClick={() => navigate('/friends')}>
                        <TeamOutlined />
                    </div>
                    <div className={styles.navItem} onClick={() => navigate('/messages')}>
                        <Badge count={unreadMessageCount} size="small">
                            <MessageOutlined />
                        </Badge>
                    </div>
                    <div className={styles.navItem} onClick={() => navigate('/video')}>
                        <VideoCameraOutlined />
                    </div>
                </div>

                {/* Right Section */}
                <div className={styles.right}>
                    <div className={styles.iconBtn}>
                        <PlusOutlined />
                    </div>
                    <div className={styles.iconBtn}>
                        <Badge count={unreadSocialCount} size="small">
                            <BellOutlined />
                        </Badge>
                    </div>
                    <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                        <Avatar className={styles.avatar} icon={<UserOutlined />} />
                    </Dropdown>
                </div>
            </div>
        </Header>
    );
};

export default SocialHeader;
