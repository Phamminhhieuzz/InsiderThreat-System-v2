import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Spin, Card, Avatar, Drawer, Input, Space, Divider, Typography } from 'antd';
import { UserOutlined, ClusterOutlined, MailOutlined, PhoneOutlined, IdcardOutlined } from '@ant-design/icons';
import BottomNavigation from '../../components/BottomNavigation';
import './OrgChartPage.css';


interface UserNode {
    id: string;
    fullName: string;
    role: string;
    department: string;
    position: string;
    avatarUrl?: string;
    managerId?: string;
    children?: UserNode[];
}

export default function OrgChartPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [treeData, setTreeData] = useState<UserNode[]>([]);
    const [allUsers, setAllUsers] = useState<UserNode[]>([]);
    
    // Search & Interactive State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserNode | null>(null);
    const [isDrawerVisible, setIsDrawerVisible] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchHierarchy = async () => {
            try {
                const users = await api.get<UserNode[]>('/api/users/hierarchy');
                setAllUsers(users);
                const tree = buildTree(users);
                setTreeData(tree);
            } catch (error) {
                console.error('Failed to fetch hierarchy', error);
            } finally {
                setLoading(false);
            }
        };
        fetchHierarchy();
    }, []);

    const toggleNode = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedNodes(newExpanded);
    };

    const buildTree = (users: UserNode[]): UserNode[] => {
        const map: Record<string, UserNode> = {};
        const admins: UserNode[] = [];
        const directors: UserNode[] = [];
        const managers: UserNode[] = [];
        const employees: UserNode[] = [];

        // Pre-process categories
        users.forEach(u => {
            const roleAndPos = (u.position || u.role || '').toLowerCase();
            const node = { ...u, children: [] };
            map[u.id] = node;

            if (roleAndPos.includes('admin') || roleAndPos.includes('ceo')) {
                admins.push(node);
            } else if (roleAndPos.includes('giám đốc') || roleAndPos.includes('director')) {
                directors.push(node);
            } else if (roleAndPos.includes('quản lý') || roleAndPos.includes('manager') || roleAndPos.includes('trưởng phòng')) {
                managers.push(node);
            } else {
                employees.push(node);
            }
        });

        // Link Employees to Managers
        employees.forEach(emp => {
            if (emp.managerId && map[emp.managerId]) {
                map[emp.managerId].children?.push(emp);
            } else if (managers.length > 0) {
                const sameDeptManager = managers.find(m => m.department === emp.department);
                (sameDeptManager || managers[0]).children?.push(emp);
            }
        });

        // Link Managers to Directors
        managers.forEach(mgr => {
            if (mgr.managerId && map[mgr.managerId]) {
                map[mgr.managerId].children?.push(mgr);
            } else if (directors.length > 0) {
                const sameDeptDirector = directors.find(d => d.department === mgr.department);
                (sameDeptDirector || directors[0]).children?.push(mgr);
            }
        });

        // Link Directors to Admins
        directors.forEach(dir => {
            if (dir.managerId && map[dir.managerId]) {
                map[dir.managerId].children?.push(dir);
            } else if (admins.length > 0) {
                admins[0].children?.push(dir);
            }
        });

        const roots = users
            .filter(u => {
                const node = map[u.id];
                const isChildOfAny = users.some(other => map[other.id].children?.some(c => c.id === u.id));
                return !isChildOfAny;
            })
            .map(u => map[u.id]);

        // Auto-expand top 2 levels
        if (expandedNodes.size === 0 && roots.length > 0) {
            const initialExpanded = new Set<string>();
            roots.forEach(r => {
                initialExpanded.add(r.id);
                r.children?.forEach(c => initialExpanded.add(c.id));
            });
            setExpandedNodes(initialExpanded);
        }

        return roots;
    };

    const renderNode = (node: UserNode) => {
        const isMatch = searchQuery && (
            node.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (node.role && node.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (node.department && node.department.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);

        return (
            <li key={node.id}>
                <div className="flex items-center">
                    {hasChildren && (
                        <div className="node-toggle-btn" onClick={(e) => toggleNode(node.id, e)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                                {isExpanded ? 'remove_circle_outline' : 'add_circle_outline'}
                            </span>
                        </div>
                    )}
                    {!hasChildren && <div style={{ width: '28px' }} />}
                    
                    <div className="node-content">
                        <Card 
                            className={`user-node-card ${isMatch ? 'highlight-node' : ''}`} 
                            bordered={false}
                            onClick={() => {
                                setSelectedUser(node);
                                setIsDrawerVisible(true);
                            }}
                        >
                            <div className="user-node-info">
                                <Avatar 
                                    src={node.avatarUrl} 
                                    icon={<UserOutlined />} 
                                    size={40} 
                                    style={{ flexShrink: 0 }}
                                />
                                <div className="user-details">
                                    <div className="user-name">{node.fullName}</div>
                                    <div className="user-role">{node.position || node.role}</div>
                                    <div className="user-dept">{node.department}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
                
                {hasChildren && isExpanded && node.children && (
                    <ul>
                        {node.children.map(child => renderNode(child))}
                    </ul>
                )}
            </li>
        );
    };

    const getManagerName = (managerId?: string) => {
        if (!managerId) return 'Không có';
        const manager = allUsers.find(u => u.id === managerId);
        return manager ? manager.fullName : 'Không rõ';
    };

    if (loading) return <div className="loading-container"><Spin size="large" tip="Đang tải sơ đồ tổ chức..." /></div>;

    return (
        <div className="org-chart-page animate-in" style={{ padding: '20px' }}>
            {/* Liquid Shine Title Banner */}
            <div className="org-chart-title-banner">
                <div className="org-chart-title-container">
                    <h2 className="org-chart-title-text">Sơ đồ tổ chức phân quyền</h2>
                </div>
            </div>

            <div className="page-header" style={{ justifyContent: 'space-between', padding: '0 40px', marginBottom: '30px' }}>
                <div className="flex items-center gap-4">

                    <div className="header-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                        <ClusterOutlined />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{t('nav.staff_chart', 'Quản lý Nhân sự')}</h1>
                    </div>
                </div>
                <div className="header-actions">
                    <Input.Search 
                        placeholder="Tìm nhân viên..." 
                        allowClear
                        enterButton 
                        size="middle"
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: 260 }}
                    />
                </div>
            </div>

            <div className="org-chart-wrapper hide-scrollbar">
                <div className="tree">
                    <ul>
                        {treeData.map(root => renderNode(root))}
                    </ul>
                </div>
            </div>

            {/* User Drawer */}
            <Drawer
                title={
                    <div className="flex items-center gap-3">
                        <Avatar src={selectedUser?.avatarUrl} icon={<UserOutlined />} size={48} className="border-2 border-blue-500 shadow-lg" />
                        <div>
                            <div className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-teal-400">
                                {selectedUser?.fullName}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {selectedUser?.position || selectedUser?.role}
                            </div>
                        </div>
                    </div>
                }
                placement="right"
                onClose={() => setIsDrawerVisible(false)}
                open={isDrawerVisible}
                width={400}
                className="dark:bg-[#1a1c23] dark:text-white glass-drawer"
            >
                {selectedUser && (
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-[#20222a] p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 mb-4 tracking-wider">Thông tin công việc</h3>
                            
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                                        <ClusterOutlined />
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Phòng ban</div>
                                        <div className="font-medium">{selectedUser.department || 'Chưa cập nhật'}</div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0">
                                        <IdcardOutlined />
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Người quản lý</div>
                                        <div className="font-medium cursor-pointer hover:text-blue-500 transition-colors" 
                                            onClick={() => {
                                                if (selectedUser.managerId) {
                                                    const managerNode = allUsers.find(u => u.id === selectedUser.managerId);
                                                    if (managerNode) setSelectedUser(managerNode);
                                                }
                                            }}>
                                            {getManagerName(selectedUser.managerId)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-[#20222a] p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 mb-4 tracking-wider">Liên hệ nội bộ</h3>
                            <p className="text-sm text-gray-500">Người dùng có thể liên hệ trực tiếp thông qua hệ thống Chat hoặc Email (Đang phát triển).</p>
                        </div>
                    </div>
                )}
            </Drawer>
            {window.innerWidth < 1024 && (
                <BottomNavigation 
                    activeKey="staff"
                    items={[
                        { icon: 'newspaper', label: t('dashboard.nav_feed', 'Feed'), path: '/feed' },
                        { icon: 'person_search', label: t('dashboard.menu_users', 'User Management'), path: '/dashboard?tab=users' },
                        { icon: 'forum', label: t('dashboard.menu_posts', 'Post Management'), path: '/dashboard?tab=posts' },
                        { icon: 'report_problem', label: t('dashboard.menu_reports', 'Báo cáo vi phạm'), path: '/dashboard?tab=reports' },
                        { icon: 'usb', label: t('dashboard.menu_usb', 'USB Management'), path: '/dashboard?tab=usb' },
                        { icon: 'folder_managed', label: t('dashboard.menu_documents', 'Document Logs'), path: '/dashboard?tab=documents' },
                        { icon: 'fact_check', label: t('dashboard.menu_attendance', 'Attendance'), path: '/dashboard?tab=attendance' },
                        { icon: 'monitoring', label: t('dashboard.menu_monitor', 'Giám sát Hành vi'), path: '/monitor-logs' },
                        { icon: 'security', label: t('dashboard.menu_watchdog', 'Watchdog'), path: '/watchdog' },
                    ]}
                />
            )}
        </div>
    );
}
