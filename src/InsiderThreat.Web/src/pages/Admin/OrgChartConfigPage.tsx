import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { userService } from '../../services/userService';
import { Table, Select, Avatar, Tag, Card, message, Space, Breadcrumb, Input } from 'antd';
import { ClusterOutlined, UserOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import type { User } from '../../types';
import BottomNavigation from '../../components/BottomNavigation';


export default function OrgChartConfigPage() {
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.getAllUsers();
            setUsers(data);
        } catch (error) {
            message.error('Không thể tải danh sách nhân sự');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleUpdateManager = async (userId: string, managerId: string | null) => {
        try {
            await userService.updateUser(userId, { managerId: managerId || "" });
            message.success('Đã cập nhật người quản lý');
            fetchUsers(); // Reload to reflect changes
        } catch (error) {
            message.error('Lỗi khi cập nhật người quản lý');
        }
    };

    const getRoleTag = (role?: string) => {
        if (!role) return <Tag>Nhân viên</Tag>;
        const r = role.toLowerCase();
        if (r.includes('admin')) return <Tag color="red">Admin</Tag>;
        if (r.includes('giám đốc') || r.includes('director')) return <Tag color="blue">Giám đốc</Tag>;
        if (r.includes('quản lý') || r.includes('manager') || r.includes('trưởng phòng')) return <Tag color="green">Quản lý</Tag>;
        return <Tag>Nhân viên</Tag>;
    };

    // Auto-assign Director -> first Admin on load
    useEffect(() => {
        if (users.length === 0) return;
        const adminUser = users.find(u => u.role?.toLowerCase().includes('admin'));
        if (!adminUser) return;

        const directors = users.filter(u =>
            u.role?.toLowerCase() === 'giám đốc' || u.role?.toLowerCase() === 'director'
        );
        directors.forEach(async (director) => {
            if (director.managerId !== adminUser.id) {
                try {
                    await userService.updateUser(director.id || '', { managerId: adminUser.id || '' });
                    fetchUsers(); // refresh after patch
                } catch { /* silently ignore */ }
            }
        });
    }, [users]);

    // Filter potential managers based on hierarchy rules
    const getPotentialManagers = (user: User) => {
        const role = (user.position || user.role || '').toLowerCase();
        if (role.includes('quản lý') || role.includes('manager') || role.includes('trưởng phòng')) {
            // Managers report to Directors
            return users.filter(u => (u.role?.toLowerCase() === 'giám đốc' || u.role?.toLowerCase() === 'director') && u.id !== user.id);
        } else {
            // Staff report to Managers
            return users.filter(u => (u.role?.toLowerCase().includes('quản lý') || u.role?.toLowerCase().includes('manager') || u.role?.toLowerCase().includes('trưởng phòng')) && u.id !== user.id);
        }
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u => 
            u.fullName?.toLowerCase().includes(searchText.toLowerCase()) || 
            u.username?.toLowerCase().includes(searchText.toLowerCase()) ||
            u.department?.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [users, searchText]);

    const columns = [
        {
            title: 'Nhân sự',
            key: 'user',
            render: (user: User) => (
                <Space>
                    <Avatar src={user.avatarUrl} icon={<UserOutlined />} />
                    <div>
                        <div className="font-bold">{user.fullName || user.username}</div>
                        <div className="text-xs text-gray-400">{user.department}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Chức vụ',
            dataIndex: 'role',
            key: 'role',
            render: (role: string, record: User) => getRoleTag(record.position || role),
        },
        {
            title: 'Quản lý trực tiếp',
            key: 'manager',
            render: (user: User) => {
                const role = (user.position || user.role || '').toLowerCase();
                const isAdmin = role.includes('admin');
                const isDirector = role === 'giám đốc' || role === 'director';

                if (isAdmin) {
                    return (
                        <Tag color="red" style={{ padding: '4px 12px', borderRadius: 8 }}>
                            🏛️ Không phụ thuộc (Cấp cao nhất)
                        </Tag>
                    );
                }

                if (isDirector) {
                    const adminUser = users.find(u => u.role?.toLowerCase().includes('admin'));
                    return (
                        <Tag color="gold" style={{ padding: '4px 12px', borderRadius: 8 }}>
                            👑 Báo cáo Admin: {adminUser?.fullName || 'Administrator'}
                        </Tag>
                    );
                }

                const potentials = getPotentialManagers(user);
                return (
                    <Select
                        placeholder="Chọn người quản lý"
                        style={{ width: '100%' }}
                        value={user.managerId || null}
                        onChange={(value) => handleUpdateManager(user.id || '', value)}
                        allowClear
                    >
                        {potentials.map(m => (
                            <Select.Option key={m.id} value={m.id}>
                                {m.fullName || m.username} ({m.position || m.role})
                            </Select.Option>
                        ))}
                    </Select>
                );
            },
        }
    ];

    return (
        <div className={`${isMobile ? 'p-4' : 'p-8'} max-w-6xl mx-auto animate-in`} style={{ paddingBottom: isMobile ? 100 : 32 }}>
            {!isMobile && (
                <Breadcrumb className="mb-6">
                    <Breadcrumb.Item>Cài đặt</Breadcrumb.Item>
                    <Breadcrumb.Item>Cấu hình Sơ đồ Tổ chức</Breadcrumb.Item>
                </Breadcrumb>
            )}

            <div className={`flex ${isMobile ? 'flex-col gap-4' : 'justify-between items-center'} mb-8`}>
                <div>
                    <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-extrabold flex items-center gap-3`}>
                        <ClusterOutlined className="text-blue-500" />
                        {isMobile ? 'Sơ đồ tổ chức' : 'Quản lý Sơ đồ Tổ chức'}
                    </h1>
                    {!isMobile && <p className="text-gray-500">Thiết lập mối quan hệ báo cáo giữa các cấp bậc (Admin - Giám đốc - Quản lý - Nhân viên)</p>}
                </div>
                <Input.Search 
                    placeholder="Tìm kiếm nhân viên..." 
                    style={{ width: isMobile ? '100%' : 300 }} 
                    onSearch={setSearchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="shadow-sm rounded-xl"
                />
            </div>

            {!isMobile ? (
                <Card className="shadow-lg border-0 rounded-2xl overflow-hidden glass-effect">
                    <Table 
                        dataSource={filteredUsers} 
                        columns={columns} 
                        loading={loading}
                        rowKey="id"
                        pagination={{ pageSize: 15 }}
                    />
                </Card>
            ) : (
                <div className="flex flex-col gap-4">
                    {loading ? (
                        <div className="flex justify-center p-12"><ClusterOutlined spin className="text-4xl text-blue-500" /></div>
                    ) : filteredUsers.length > 0 ? (
                        filteredUsers.map(user => {
                            const role = (user.position || user.role || '').toLowerCase();
                            const isAdmin = role.includes('admin');
                            const isDirector = role === 'giám đốc' || role === 'director';
                            const potentials = getPotentialManagers(user);

                            return (
                                <Card key={user.id} className="shadow-sm border-0 rounded-2xl overflow-hidden glass-effect-subtle">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex justify-between items-start">
                                            <Space>
                                                <Avatar size={48} src={user.avatarUrl} icon={<UserOutlined />} className="border-2 border-blue-100" />
                                                <div>
                                                    <div className="font-bold text-lg">{user.fullName || user.username}</div>
                                                    <div className="text-xs text-gray-400">{user.department}</div>
                                                </div>
                                            </Space>
                                            {getRoleTag(user.position || user.role)}
                                        </div>

                                        <div className="bg-gray-50 p-4 rounded-xl">
                                            <div className="text-xs font-semibold text-gray-400 uppercase mb-2 tracking-wider">Người quản lý trực tiếp</div>
                                            {isAdmin ? (
                                                <div className="text-red-500 font-medium flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">castle</span>
                                                    Cấp cao nhất
                                                </div>
                                            ) : isDirector ? (
                                                <div className="text-amber-600 font-medium flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">crown</span>
                                                    Báo cáo Admin
                                                </div>
                                            ) : (
                                                <Select
                                                    placeholder="Chọn người quản lý"
                                                    style={{ width: '100%' }}
                                                    value={user.managerId || null}
                                                    onChange={(value) => handleUpdateManager(user.id || '', value)}
                                                    allowClear
                                                    className="org-config-select"
                                                >
                                                    {potentials.map(m => (
                                                        <Select.Option key={m.id} value={m.id}>
                                                            {m.fullName || m.username} ({m.position || m.role})
                                                        </Select.Option>
                                                    ))}
                                                </Select>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            );
                        })
                    ) : (
                        <div className="text-center p-12 text-gray-400">Không tìm thấy nhân sự</div>
                    )}
                </div>
            )}

            {isMobile && <BottomNavigation />}
        </div>
    );
}
