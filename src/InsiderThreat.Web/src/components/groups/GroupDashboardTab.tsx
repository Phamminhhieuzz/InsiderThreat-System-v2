import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { App, Modal, Form, Input, Select, DatePicker, Button, Avatar, Progress, Typography, Row, Col, Space } from 'antd';
import { EditOutlined, TeamOutlined, PlusOutlined, DeleteOutlined, EllipsisOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { 
    BarChart, Bar, 
    PieChart, Pie, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import TaskDetailDrawer from './TaskDetailDrawer';
import ProjectMobileTabs from './ProjectMobileTabs';
import './GroupDashboardTab.css';
import './ProjectMobileTabs.css';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { Option } = Select;

// --- Interfaces ---
interface Member {
    id: string;
    fullName: string;
    username: string;
    avatarUrl?: string;
    role?: string;
}

interface ProjectTask {
    id: string;
    title: string;
    description: string;
    status: 'Todo' | 'InProgress' | 'InReview' | 'WaitingApproval' | 'Done';
    priority: 'Low' | 'Medium' | 'High';
    assignedTo?: string;
    progress: number;
    startDate?: string;
    deadline?: string;
}

interface GroupInfo {
    id: string;
    name: string;
    description: string;
    adminIds?: string[];
    projectStartDate?: string;
    projectEndDate?: string;
}

interface GroupDashboardTabProps {
    onInviteClick?: () => void;
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

export default function GroupDashboardTab({ onInviteClick, activeTab, onTabChange }: GroupDashboardTabProps = {}) {
    const { id: groupId } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const { message } = App.useApp();
    const currentUser = authService.getCurrentUser();

    // Data States
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [prodStats, setProdStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // UI States
    const [taskDrawerVisible, setTaskDrawerVisible] = useState(false);
    const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
    const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
    const [taskForm] = Form.useForm();

    const currentUserIsAdmin = group?.adminIds?.includes(currentUser?.id || '') || false;

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]);

    const fetchData = async () => {
        if (!groupId) return;
        try {
            setLoading(true);
            const [gRes, mRes, tRes, pRes] = await Promise.all([
                api.get<GroupInfo>(`/api/groups/${groupId}`),
                api.get<Member[]>(`/api/groups/${groupId}/members-details`),
                api.get<ProjectTask[]>(`/api/groups/${groupId}/tasks`),
                api.get<any>(`/api/groups/${groupId}/productivity`)
            ]);
            setGroup(gRes);
            setMembers(mRes || []);
            setTasks(tRes || []);
            setProdStats(pRes);
        } catch (err) {
            console.error('Data sync failed', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTask = async (values: any) => {
        try {
            const taskData = {
                ...values,
                startDate: values.startDate?.toISOString(),
                deadline: values.deadline?.toISOString()
            };
            await api.post(`/api/groups/${groupId}/tasks`, taskData);
            message.success(t('project_detail.mytasks.add_success', { defaultValue: 'Đã tạo nhiệm vụ' }));
            setIsTaskModalVisible(false);
            taskForm.resetFields();
            fetchData();
        } catch (error) {
            message.error('Lỗi khi tạo nhiệm vụ');
        }
    };

    const openTaskDrawer = (task: ProjectTask) => {
        setSelectedTask(task);
        setTaskDrawerVisible(true);
    };

    // Derived Statistics
    const stats = useMemo(() => {
        let inProgress = 0;
        let done = 0;
        let assignedToMe = 0;
        
        tasks.forEach(t => {
            if (t.status === 'Done') done++;
            else if (t.status === 'InProgress') inProgress++;
            if (t.assignedTo === currentUser?.id) assignedToMe++;
        });

        return {
            totalTasks: tasks.length,
            inProgress,
            done,
            assignedToMe
        };
    }, [tasks, currentUser]);

    // Status Distribution Data
    const statusData = useMemo(() => {
        const counts = {
            'Todo': 0,
            'InProgress': 0,
            'InReview': 0,
            'WaitingApproval': 0,
            'Done': 0
        };
        tasks.forEach(t => {
            if (counts[t.status] !== undefined) counts[t.status]++;
        });

        return [
            { name: t('project_detail.mytasks.todo'), value: counts['Todo'], color: '#9ca3af' },
            { name: t('project_detail.mytasks.in_progress'), value: counts['InProgress'], color: '#3b82f6' },
            { name: t('project_detail.mytasks.in_review'), value: counts['InReview'], color: '#f59e0b' },
            { name: t('project_detail.mytasks.waiting_approval'), value: counts['WaitingApproval'], color: '#f97316' },
            { name: t('project_detail.mytasks.done'), value: counts['Done'], color: '#10b981' }
        ].filter(d => d.value > 0);
    }, [tasks, t]);

    // Team Productivity (Radar) Data
    const productivityData = useMemo(() => {
        return members.slice(0, 5).map(m => {
            const userTasks = tasks.filter(t => t.assignedTo === m.id);
            const done = userTasks.filter(t => t.status === 'Done').length;
            const open = userTasks.length - done;
            
            return {
                subject: m.fullName.split(' ')[0],
                Done: done,
                Active: open,
                fullMark: Math.max(userTasks.length, 5)
            };
        });
    }, [members, tasks]);

    // Roadmap Dynamic Data
    const roadmapData = useMemo(() => {
        const today = dayjs();
        const start = group?.projectStartDate ? dayjs(group.projectStartDate) : today.subtract(3, 'day');
        
        const daysInRange = [];
        for (let i = 0; i < 7; i++) {
            daysInRange.push(start.add(i, 'day'));
        }

        return daysInRange.map(d => {
            const count = tasks.filter(t => {
                if (!t.deadline) return false;
                return dayjs(t.deadline).isSame(d, 'day');
            }).length;

            return {
                label: d.format('DD/MM'),
                fullLabel: d.format('dddd, DD MMM'),
                value: count,
                isToday: d.isSame(today, 'day')
            };
        });
    }, [tasks, group]);

    if (loading) return <div className="loading-state">{t('library.loading')}</div>;

    return (
        <div className="synchro-dashboard-wrapper">
            
            <div className="dashboard-header-block">
                <div>
                    <Title level={4} style={{ margin: 0 }}>{t('project_detail.dashboard.overview')}</Title>
                    <Text type="secondary">{t('project_detail.dashboard.overview_subtitle')}</Text>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button icon={<TeamOutlined />} onClick={onInviteClick}>{t('project_detail.team.invite')}</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsTaskModalVisible(true)}>
                        {t('project_detail.dashboard.create_task')}
                    </Button>
                </div>
            </div>

            {/* Mobile Tabs Relocated Below Search Bar */}
            {activeTab && onTabChange && (
                <ProjectMobileTabs activeTab={activeTab} onTabChange={onTabChange} />
            )}

            {/* Top Stat Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <Text type="secondary">{t('project_detail.dashboard.total_projects')}</Text>
                    <Title level={2} style={{ margin: "4px 0" }}>1 (Current)</Title>
                    <Text type="success">+0%</Text>
                </div>
                <div className="stat-card">
                    <Text type="secondary">{t('project_detail.dashboard.active_tasks')}</Text>
                    <Title level={2} style={{ margin: "4px 0" }}>{stats.totalTasks}</Title>
                    <Text type="success">+12%</Text>
                </div>
                <div className="stat-card">
                    <Text type="secondary">{t('project_detail.dashboard.assigned_to_me')}</Text>
                    <Title level={2} style={{ margin: "4px 0" }}>{stats.assignedToMe}</Title>
                    <Text type="warning">Requires attention</Text>
                </div>
                <div className="stat-card">
                    <Text type="secondary">{t('project_detail.dashboard.completed')}</Text>
                    <Title level={2} style={{ margin: "4px 0" }}>{stats.done}</Title>
                    <Text type="success">Good pacing</Text>
                </div>
                {prodStats?.OverdueCount > 0 && (
                    <div className="stat-card warning">
                        <Text type="secondary">Nhiệm vụ Quá hạn</Text>
                        <Title level={2} style={{ margin: "4px 0", color: '#ef4444' }}>{prodStats.OverdueCount}</Title>
                        <Text type="danger">Cần xử lý ngay</Text>
                    </div>
                )}
            </div>

            {/* Main Content Split: Left (Charts) / Right (Widgets) */}
            <div className="dashboard-main-split">
                
                <div className="dashboard-left-col">
                    <div className="chart-panel">
                        <div className="panel-header">
                            <Title level={5} style={{ margin: 0 }}>{t('project_detail.dashboard.roadmap')}</Title>
                            <Button type="text" icon={<EllipsisOutlined />} />
                        </div>
                        <div className="chart-container" style={{ height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={roadmapData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: '#f9fafb' }} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {roadmapData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.isToday ? '#2563eb' : '#e5e7eb'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="charts-row">
                        <div className="chart-panel status-donut">
                            <div className="panel-header">
                                <Title level={5} style={{ margin: 0 }}>Phân bổ Trạng thái</Title>
                            </div>
                            <div className="chart-container" style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={statusData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="donut-center-text">
                                    <Title level={4} style={{ margin: 0 }}>{tasks.length}</Title>
                                    <Text type="secondary" style={{ fontSize: 10 }}>NHIỆM VỤ</Text>
                                </div>
                            </div>
                        </div>

                        <div className="chart-panel team-radar">
                            <div className="panel-header">
                                <Title level={5} style={{ margin: 0 }}>Cân bằng Đội ngũ</Title>
                            </div>
                            <div className="chart-container" style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={productivityData}>
                                        <PolarGrid stroke="#e5e7eb" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{fontSize: 8}} />
                                        <Radar name="Hoàn thành" dataKey="Done" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                                        <Radar name="Đang mở" dataKey="Active" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                                        <Tooltip />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="recent-activity-panel">
                        <div className="panel-header">
                            <Title level={5} style={{ margin: 0 }}>{t('project_detail.dashboard.recent_activity')}</Title>
                        </div>
                        <div className="recent-tasks-list">
                            {tasks.slice(0, 3).map(task => {
                                const assignee = members.find(m => m.id === task.assignedTo);
                                return (
                                    <div key={task.id} className="recent-task-row" onClick={() => openTaskDrawer(task)}>
                                        <div className="task-title-cell">
                                            <div className="task-indicator" style={{ background: task.status === 'Done' ? '#10b981' : task.status === 'WaitingApproval' ? '#f97316' : '#3b82f6'}} />
                                            <Text strong>{task.title}</Text>
                                        </div>
                                        <div className="task-assignee-cell">
                                            <Avatar src={assignee?.avatarUrl} size="small">{assignee?.fullName?.charAt(0)}</Avatar>
                                            <Text type="secondary" style={{ marginLeft: 8 }}>{assignee?.fullName || 'Unassigned'}</Text>
                                        </div>
                                        <div className="task-date-cell">
                                            <Text type="secondary">{task.deadline ? dayjs(task.deadline).format('MMM DD') : 'No deadline'}</Text>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="dashboard-right-col">
                    <div className="widget-panel gold-panel">
                        <div className="panel-header">
                            <Title level={5} style={{ margin: 0 }}>🏆 Bảng Vàng Hiệu Suất</Title>
                        </div>
                        <div className="top-performers-list">
                            {prodStats?.TopPerformers?.map((p: any, index: number) => (
                                <div key={index} className="performer-row">
                                    <div className="performer-rank">{index + 1}</div>
                                    <Avatar size="small" style={{ backgroundColor: index === 0 ? '#fbbf24' : '#94a3b8' }}>{p.name.charAt(0)}</Avatar>
                                    <div className="performer-info">
                                        <Text strong>{p.name}</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{p.count} nhiệm vụ hoàn thành</Text>
                                    </div>
                                    {index === 0 && <span className="crown-icon">👑</span>}
                                </div>
                            ))}
                            {(!prodStats?.TopPerformers || prodStats.TopPerformers.length === 0) && (
                                <Text type="secondary">Chưa có dữ liệu vinh danh.</Text>
                            )}
                        </div>
                    </div>

                    <div className="widget-panel">
                        <div className="panel-header">
                            <Title level={5} style={{ margin: 0 }}>{t('project_detail.dashboard.today_tasks')}</Title>
                            <a href="#">{t('project_detail.dashboard.see_all')}</a>
                        </div>
                        <div className="today-tasks-list">
                            {tasks.filter(t => t.status !== 'Done').slice(0, 5).map(task => {
                                const assignee = members.find(m => m.id === task.assignedTo);
                                return (
                                    <div key={task.id} className="today-task-card" onClick={() => openTaskDrawer(task)}>
                                        <div className="tt-header">
                                            <Text strong className="tt-title">{task.title}</Text>
                                            <Button type="text" icon={<EllipsisOutlined />} size="small" />
                                        </div>
                                        <div className="tt-meta">
                                            <Avatar.Group size={24}>
                                                <Avatar src={assignee?.avatarUrl} />
                                            </Avatar.Group>
                                            <span className={`status-pill ${task.status.toLowerCase()}`}>
                                                {task.status.replace(/([A-Z])/g, ' $1').trim()}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {tasks.filter(t => t.status !== 'Done').length === 0 && (
                                <Text type="secondary">No active tasks today!</Text>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Task Drawer */}
            {selectedTask && (
                <TaskDetailDrawer
                    open={taskDrawerVisible}
                    onClose={() => setTaskDrawerVisible(false)}
                    task={selectedTask}
                    groupId={groupId || ''}
                    members={members}
                    onTaskUpdate={() => {
                        fetchData();
                    }}
                    currentUserIsAdmin={currentUserIsAdmin}
                />
            )}

            {/* Create Task Modal */}
            <Modal
                title={t('project_detail.dashboard.new_task_modal')}
                open={isTaskModalVisible}
                onCancel={() => setIsTaskModalVisible(false)}
                footer={null}
                destroyOnHidden
            >
                <Form form={taskForm} layout="vertical" onFinish={handleCreateTask}>
                    <Form.Item name="title" label={t('project_detail.dashboard.task_title')} rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label={t('project_detail.dashboard.description')}>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="assignedTo" label={t('project_detail.dashboard.assign_to')}>
                                <Select placeholder={t('staff.search_placeholder')} allowClear>
                                    {members.map(m => (
                                        <Option key={m.id} value={m.id}>{m.fullName}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="priority" label={t('project_detail.dashboard.priority')} initialValue="Medium">
                                <Select>
                                    <Option value="Low">Low</Option>
                                    <Option value="Medium">Medium</Option>
                                    <Option value="High">Urgent</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startDate" label={t('project_detail.dashboard.start_date')}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="deadline" label={t('project_detail.dashboard.due_date')}>
                                <DatePicker style={{ width: '100%' }} showTime />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item className="m-0 text-right">
                        <Space>
                            <Button onClick={() => setIsTaskModalVisible(false)}>{t('project_detail.dashboard.btn_cancel')}</Button>
                            <Button type="primary" htmlType="submit">{t('project_detail.dashboard.create_task')}</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
