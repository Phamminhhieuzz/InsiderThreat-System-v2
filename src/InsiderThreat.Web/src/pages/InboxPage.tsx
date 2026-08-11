import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Avatar, Badge, Button, Tag, Space, Typography, Spin, Empty, App } from 'antd';
import { 
    BellOutlined, CheckCircleOutlined, MessageOutlined, 
    RocketOutlined, ClockCircleOutlined, MailOutlined,
    ArrowRightOutlined, DeleteOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api } from '../services/api';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import './InboxPage.css';


dayjs.extend(relativeTime);
const { Title, Text } = Typography;

interface Notification {
    id: string;
    type: string;
    message: string;
    actorName?: string;
    actorUserId?: string;
    link?: string;
    isRead: boolean;
    createdAt: string;
}

export default function InboxPage() {
    const navigate = useNavigate();
    const { message: antdMessage } = App.useApp();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [activeFilter, setActiveFilter] = useState('all');

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const res = await api.get<Notification[]>('/api/notifications');
            setNotifications(res || []);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const markAsRead = async (id: string, link?: string) => {
        try {
            await api.put(`/api/notifications/${id}/read`, {});
            setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
            if (link) navigate(link);
        } catch (error) {
            console.error('Failed to mark as read', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/api/notifications/read-all', {});
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            antdMessage.success('Đã đánh dấu tất cả là đã đọc');
        } catch (error) {
            antdMessage.error('Thao tác thất bại');
        }
    };

    const deleteReadNotifications = async () => {
        try {
            await api.delete('/api/notifications/read');
            setNotifications(notifications.filter(n => !n.isRead));
            antdMessage.success('Đã xóa tất cả thông báo đã đọc');
        } catch (error) {
            antdMessage.error('Xóa thất bại');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'TaskAssignment': return <RocketOutlined style={{ color: '#3b82f6' }} />;
            case 'TaskStatusChange': return <CheckCircleOutlined style={{ color: '#10b981' }} />;
            case 'TaskComment': return <MessageOutlined style={{ color: '#f59e0b' }} />;
            default: return <BellOutlined style={{ color: '#6366f1' }} />;
        }
    };

    const filteredNotifications = notifications.filter(n => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'unread') return !n.isRead;
        if (activeFilter === 'tasks') return n.type === 'TaskAssignment' || n.type === 'TaskStatusChange';
        if (activeFilter === 'discussion') return n.type === 'TaskComment';
        return true;
    });

    return (
        <div className="inbox-container inbox-page">
            {!isMobile && <LeftSidebar defaultCollapsed={true} />}
            
            <div className="inbox-main-wrapper">
                <main className="inbox-content animate-in">
                    <header className="inbox-header">
                        <div className="header-left">
                            <Title level={2} className="inbox-title">Inbox</Title>
                            <Text type="secondary" className="inbox-subtitle">
                                Luôn cập nhật những thay đổi mới nhất trong các dự án của bạn.
                            </Text>
                        </div>
                        <div className="header-right">
                            <Space>
                                <Button 
                                    type="text" 
                                    icon={<CheckCircleOutlined />} 
                                    onClick={markAllAsRead}
                                    className="action-btn"
                                >
                                    Đánh dấu đã đọc hết
                                </Button>
                                <Button 
                                    danger
                                    type="text" 
                                    icon={<DeleteOutlined />} 
                                    onClick={deleteReadNotifications}
                                    className="action-btn delete-btn"
                                >
                                    Xóa hết đã đọc
                                </Button>
                            </Space>
                        </div>
                    </header>

                    <div className="inbox-filter-bar">
                        <Space size="middle">
                            <Badge count={activeFilter === 'all' ? notifications.filter(n => !n.isRead).length : 0} offset={[10, 0]}>
                                <Tag 
                                    className={`filter-tag ${activeFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setActiveFilter('all')}
                                >
                                    Tất cả
                                </Tag>
                            </Badge>
                            <Tag 
                                className={`filter-tag ${activeFilter === 'unread' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('unread')}
                            >
                                Chưa đọc
                            </Tag>
                            <Tag 
                                className={`filter-tag ${activeFilter === 'tasks' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('tasks')}
                            >
                                Giao việc
                            </Tag>
                            <Tag 
                                className={`filter-tag ${activeFilter === 'discussion' ? 'active' : ''}`}
                                onClick={() => setActiveFilter('discussion')}
                            >
                                Thảo luận
                            </Tag>
                        </Space>
                    </div>

                    <div className="inbox-list-wrapper">
                        {loading ? (
                            <div className="loading-state"><Spin size="large" tip="Đang tải thông báo..." /></div>
                        ) : filteredNotifications.length === 0 ? (
                            <Empty 
                                image={<MailOutlined style={{ fontSize: 64, color: 'var(--color-border)' }} />}
                                description={
                                    activeFilter === 'unread' ? "Không có thông báo chưa đọc" :
                                    activeFilter === 'tasks' ? "Không có nhiệm vụ nào" :
                                    activeFilter === 'discussion' ? "Không có thảo luận nào" :
                                    "Hộp thư của bạn đang trống"
                                }
                                className="empty-inbox"
                            />
                        ) : (
                            <div className="notification-list">
                                <AnimatePresence mode="popLayout">
                                    {filteredNotifications.map((n, index) => (
                                        <motion.div 
                                            key={n.id || index}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className={`notification-card ${n.isRead ? 'read' : 'unread'}`}
                                            onClick={() => markAsRead(n.id, n.link)}
                                        >
                                            <div className="card-icon">
                                                {getIcon(n.type)}
                                            </div>
                                            <div className="card-body">
                                                <div className="card-header">
                                                    <Text strong className="actor-name">{n.actorName || 'Hệ thống'}</Text>
                                                    <Text className="time-stamp">{dayjs(n.createdAt).fromNow()}</Text>
                                                </div>
                                                <div className="card-message">
                                                    {n.message}
                                                </div>
                                                {!n.isRead && <div className="unread-dot" />}
                                            </div>
                                            <div className="card-actions">
                                                <Button type="text" icon={<ArrowRightOutlined />} className="view-btn" />
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            
            {/* Floating 'Tin nhắn' Button */}
            <div className="inbox-chat-button" onClick={() => navigate('/chat')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="chat-button-icon">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
                </svg>
                <span>Tin nhắn</span>
            </div>

            {isMobile && <BottomNavigation />}
        </div>
    );
}
