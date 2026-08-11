import { Avatar } from 'antd';
import {
    UserOutlined,
    TeamOutlined,
    MessageOutlined,
    VideoCameraOutlined,
    AppstoreOutlined,
    ClockCircleOutlined,
    UsbOutlined,
    ScheduleOutlined,
    CheckSquareOutlined,
    ClusterOutlined,
    TableOutlined,
    UsergroupAddOutlined,
    CalendarOutlined,
    FileProtectOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import styles from './LeftSidebar.module.css';

const LeftSidebar = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const menuItems = [
        { icon: <UserOutlined />, label: user.fullName || 'Your Profile', path: '/profile', avatar: true },
        { icon: <TeamOutlined />, label: 'Friends', path: '/friends' },
        { icon: <UsergroupAddOutlined />, label: 'Groups', path: '/groups' },
        { icon: <MessageOutlined />, label: 'Messages', path: '/messages', badge: 3 },
        { icon: <VideoCameraOutlined />, label: 'Video Calls', path: '/video' },
        { icon: <CalendarOutlined />, label: 'Events', path: '/events' },
        { icon: <ClockCircleOutlined />, label: 'Memories', path: '/memories' },
        { type: 'divider' },
        { icon: <ScheduleOutlined />, label: 'Nghỉ phép của tôi', path: '/my-leave' },
        { icon: <CheckSquareOutlined />, label: 'Duyệt nghỉ phép', path: '/leave-approvals', manager: true },
        { icon: <TableOutlined />, label: 'Bảng công (HR)', path: '/timesheet', admin: true },
        { type: 'divider' },
        { icon: <UsbOutlined />, label: 'USB Monitoring', path: '/usb-monitor', admin: true },
        { icon: <FileProtectOutlined />, label: 'Documents', path: '/documents', admin: true },
        { icon: <AppstoreOutlined />, label: 'Analytics', path: '/dashboard', admin: true },
        { icon: <ClusterOutlined />, label: 'Sơ đồ tổ chức', path: '/org-chart' }
    ];

    return (
        <div className={styles.sidebar}>
            <div className={styles.menu}>
                {menuItems.map((item, index) => {
                    if (item.type === 'divider') {
                        return <div key={index} className={styles.divider} />;
                    }

                    if (item.admin && user.role !== 'Admin') {
                        return null;
                    }

                    if (item.manager && user.role !== 'Admin' && user.role !== 'Manager' && user.role !== 'Giám đốc' && user.role !== 'Giam doc') {
                        return null;
                    }

                    return (
                        <div
                            key={index}
                            className={styles.menuItem}
                            onClick={() => navigate(item.path!)}
                        >
                            {item.avatar ? (
                                <Avatar size={36} icon={<UserOutlined />} />
                            ) : (
                                <div className={styles.icon}>{item.icon}</div>
                            )}
                            <span className={styles.label}>{item.label}</span>
                            {item.badge && <span className={styles.badge}>{item.badge}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LeftSidebar;
