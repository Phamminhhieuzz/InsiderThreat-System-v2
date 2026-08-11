import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Typography, Button, Spin, Avatar, Badge, Tag, Tooltip, Calendar, Modal, Form, Input, DatePicker, notification } from 'antd';
import { 
    CheckCircleOutlined, 
    ClockCircleOutlined, 
    ExclamationCircleOutlined, 
    PlayCircleOutlined,
    RocketOutlined,
    CalendarOutlined,
    SafetyCertificateOutlined,
    BellOutlined,
    ArrowRightOutlined,
    FileTextOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    BarChart, Bar,
    PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
    AreaChart, Area
} from 'recharts';
import { api } from '../services/api';
import { authService } from '../services/auth';
import NavigationBar from '../components/NavigationBar';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import './WorkspacePage.css';


dayjs.extend(relativeTime);

export default function WorkspacePage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState<any>(authService.getCurrentUser());

    // Listen to user profile updates
    useEffect(() => {
        const handleUserUpdate = (e: any) => {
            setCurrentUser(e.detail);
        };
        window.addEventListener('auth-user-updated', handleUserUpdate);
        return () => window.removeEventListener('auth-user-updated', handleUserUpdate);
    }, []);

    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(dayjs());
    const [conversations, setConversations] = useState<any[]>([]);
    const [unreadTotal, setUnreadTotal] = useState(0);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

    const isManagerial = useMemo(() => {
        const role = currentUser?.role?.toLowerCase() || '';
        const pos = currentUser?.position?.toLowerCase() || '';
        return role.includes('admin') || 
            role.includes('manager') || 
            role.includes('quản lý') ||
            role.includes('director') ||
            role.includes('giám đốc') ||
            pos.includes('trưởng phòng');
    }, [currentUser]);

    interface PersonalReminder {
        id: string;
        title: string;
        date: string;
        reminded: boolean;
    }
    const [reminders, setReminders] = useState<PersonalReminder[]>([]);
    const [isAddReminderVisible, setIsAddReminderVisible] = useState(false);
    const [reminderForm] = Form.useForm();

    // Day Events Modal State
    const [isDayEventsModalVisible, setIsDayEventsModalVisible] = useState(false);
    const [selectedDayEvents, setSelectedDayEvents] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);

    // Load initial reminders
    useEffect(() => {
        if (currentUser?.id) {
            const saved = localStorage.getItem(`reminders_${currentUser.id}`);
            if (saved) setReminders(JSON.parse(saved));
        }
    }, [currentUser?.id]);

    // Check reminders every 10 seconds
    useEffect(() => {
        const checkInterval = setInterval(() => {
            const now = dayjs();
            let changed = false;
            const newReminders = reminders.map(r => {
                if (!r.reminded && dayjs(r.date).isBefore(now)) {
                    notification.success({
                        message: 'Nhắc nhở công việc',
                        description: r.title,
                        placement: 'topRight',
                        duration: 0,
                    });
                    changed = true;
                    return { ...r, reminded: true };
                }
                return r;
            });

            if (changed) {
                setReminders(newReminders);
                localStorage.setItem(`reminders_${currentUser?.id}`, JSON.stringify(newReminders));
            }
        }, 10000); // 10s checks

        return () => clearInterval(checkInterval);
    }, [reminders, currentUser?.id]);

    useEffect(() => {
        fetchWorkspaceData();
        const timer = setInterval(() => setCurrentTime(dayjs()), 60000);
        return () => clearInterval(timer);
    }, []);

    const fetchWorkspaceData = async () => {
        try {
            setLoading(true);
            const res = await api.get<any>('/api/groups/my-tasks');
            setStats(res);
            
            // Fetch real conversations
            if (currentUser?.id) {
                const convs = await api.get<any[]>(`/api/messages/conversations?userId=${currentUser.id}`);
                setConversations(convs.slice(0, 5)); // Show top 5
                const total = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
                setUnreadTotal(total);
            }

            // Fetch pending leave if managerial
            if (isManagerial) {
                const pending = await api.get<any[]>('/api/LeaveRequests/pending');
                setPendingLeaveCount(pending.length);
            }
        } catch (err) {
            console.error('Failed to load workspace data', err);
            message.error(t('workspace.load_error', 'Lỗi khi tải dữ liệu không gian làm việc'));
        } finally {
            setLoading(false);
        }
    };

    const getGreeting = () => {
        const hour = dayjs().hour();
        if (hour < 12) return 'Chào buổi sáng';
        if (hour < 18) return 'Chào buổi chiều';
        return 'Chào buổi tối';
    };

    const statusData = useMemo(() => {
        if (!stats?.statusStats) return [];
        const counts: Record<string, number> = { Todo: 0, InProgress: 0, InReview: 0, WaitingApproval: 0, Done: 0 };
        stats.statusStats.forEach((s: { status: string; count: number }) => {
            if (counts[s.status] !== undefined) counts[s.status] += s.count;
        });

        return [
            { name: 'Cần làm', value: counts['Todo'], color: '#94a3b8' },
            { name: 'Đang làm', value: counts['InProgress'], color: '#3b82f6' },
            { name: 'Đang xét', value: counts['InReview'], color: '#f59e0b' },
            { name: 'Xong', value: counts['Done'], color: '#10b981' }
        ].filter(d => d.value > 0);
    }, [stats]);

    const timelineData = useMemo(() => {
        if (!stats?.tasks) return [];
        const days = [];
        for (let i = 0; i < 7; i++) {
            days.push(dayjs().startOf('week').add(i, 'day'));
        }

        return days.map(d => {
            const count = stats.tasks.filter((t: any) => t.deadline && dayjs(t.deadline).isSame(d, 'day')).length;
            return {
                day: d.format('ddd'),
                tasks: count,
                isToday: d.isSame(dayjs(), 'day')
            };
        });
    }, [stats]);

    const handleAddReminder = (values: any) => {
        const newR: PersonalReminder = {
            id: Date.now().toString(),
            title: values.title,
            date: values.dateTime.toISOString(),
            reminded: false
        };
        const updated = [...reminders, newR];
        setReminders(updated);
        localStorage.setItem(`reminders_${currentUser?.id}`, JSON.stringify(updated));
        setIsAddReminderVisible(false);
        reminderForm.resetFields();
        message.success(t('workspace.reminder_added', 'Tạo nhắc nhở thành công'));
    };

    const calendarCellRender = (current: dayjs.Dayjs, info: any) => {
        if (info.type === 'date') {
            const dateTasks = stats?.Tasks?.filter((t: any) => t.deadline && dayjs(t.deadline).isSame(current, 'day')) || [];
            const dateReminders = reminders.filter(r => dayjs(r.date).isSame(current, 'day'));
            
            // Project Level Events
            const projectEvents: any[] = [];
            stats?.UserGroups?.forEach((g: any) => {
                if (g.isProject) {
                    if (g.projectStartDate && dayjs(g.projectStartDate).isSame(current, 'day')) {
                        projectEvents.push({ type: 'start', name: g.name, id: g.id });
                    }
                    if (g.projectEndDate && dayjs(g.projectEndDate).isSame(current, 'day')) {
                        projectEvents.push({ type: 'end', name: g.name, id: g.id });
                    }
                    g.milestones?.forEach((m: any) => {
                        if (m.date && dayjs(m.date).isSame(current, 'day')) {
                            projectEvents.push({ type: 'milestone', name: m.name, projectName: g.name, id: g.id });
                        }
                    });
                }
            });

            return (
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    {dateTasks.map((item: any) => (
                        <div 
                            key={`task-${item.id}`} 
                            style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', marginBottom: '2px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/groups/${item.groupId}?tab=mytask`); }}
                        >
                            <RocketOutlined style={{ marginRight: '4px' }}/>{item.title}
                        </div>
                    ))}
                    {projectEvents.map((ev: any, idx: number) => (
                        <div 
                            key={`project-ev-${ev.id}-${idx}`}
                            style={{ 
                                fontSize: '10px', padding: '2px 4px', borderRadius: '4px', 
                                background: ev.type === 'milestone' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                                color: ev.type === 'milestone' ? '#ef4444' : '#10b981', 
                                marginBottom: '2px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                borderLeft: `2px solid ${ev.type === 'milestone' ? '#ef4444' : '#10b981'}`
                            }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/groups/${ev.id}`); }}
                        >
                            {ev.type === 'start' && `🚀 START: ${ev.name}`}
                            {ev.type === 'end' && `🏁 END: ${ev.name}`}
                            {ev.type === 'milestone' && `🚩 ${ev.name}`}
                        </div>
                    ))}
                    {dateReminders.map((item) => (
                        <div 
                            key={`rem-${item.id}`} 
                            style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                            <BellOutlined style={{ marginRight: '4px' }}/>
                            {dayjs(item.date).format('HH:mm')} - {item.title}
                        </div>
                    ))}
                </div>
            );
        }
        return info.originNode;
    };

    const handleDateSelect = (date: dayjs.Dayjs) => {
        // Collect all events for the selected date
        const dateTasks = stats?.Tasks?.filter((t: any) => t.deadline && dayjs(t.deadline).isSame(date, 'day')) || [];
        const dateReminders = reminders.filter(r => dayjs(r.date).isSame(date, 'day'));
        const projectEvents: any[] = [];
        
        stats?.UserGroups?.forEach((g: any) => {
            if (g.isProject) {
                if (g.projectStartDate && dayjs(g.projectStartDate).isSame(date, 'day')) {
                    projectEvents.push({ type: 'start', name: g.name, id: g.id });
                }
                if (g.projectEndDate && dayjs(g.projectEndDate).isSame(date, 'day')) {
                    projectEvents.push({ type: 'end', name: g.name, id: g.id });
                }
                g.milestones?.forEach((m: any) => {
                    if (m.date && dayjs(m.date).isSame(date, 'day')) {
                        projectEvents.push({ type: 'milestone', name: m.name, projectName: g.name, id: g.id });
                    }
                });
            }
        });

        const allEvents = [
            ...dateTasks.map((t: any) => ({ ...t, eventType: 'task' })),
            ...projectEvents.map((p: any) => ({ ...p, eventType: 'project' })),
            ...dateReminders.map((r: any) => ({ ...r, eventType: 'reminder' }))
        ];

        if (allEvents.length > 0) {
            setSelectedDate(date);
            setSelectedDayEvents(allEvents);
            setIsDayEventsModalVisible(true);
        }
    };

    if (loading || !stats) {
        return (
            <div className="workspace-layout-wrapper">
                <NavigationBar hideSearch={true} />
                <div className="flex flex-1 items-center justify-center">
                    <Spin size="large" />
                </div>
            </div>
        );
    }

    return (
        <div className="workspace-layout-wrapper">
            <NavigationBar hideSearch={true} />
            
            <div className="social-layout">
                <LeftSidebar />

                <div className="workspace-main-content">
                    {/* Hero Banner */}
                    <div className="workspace-hero-banner fade-in-up">
                        <div className="banner-glow-effect" />
                        <div className="banner-content">
                            <div className="greeting-text">
                                <p className="text-blue-400 font-bold tracking-widest uppercase text-xs mb-2">Workspace Personal Command Center</p>
                                <h1>{getGreeting()}, {currentUser?.fullName?.split(' ').pop()}! 👋</h1>
                                <div className="quick-action-dock">
                                    <div className="action-card-glass" onClick={() => navigate('/projects')}>
                                        <RocketOutlined /> {t('workspace.btn_projects', 'Dự án')}
                                    </div>
                                    <div className="action-card-glass" onClick={() => navigate('/my-leave')}>
                                        <CalendarOutlined /> {t('workspace.btn_leave', 'Nghỉ phép')}
                                    </div>
                                    <div className="action-card-glass" onClick={() => navigate('/attendance')}>
                                        <HistoryOutlined /> {t('workspace.btn_attendance', 'Điểm danh')}
                                    </div>
                                    {isManagerial && (
                                        <Badge count={pendingLeaveCount} offset={[0, 0]} overflowCount={99} style={{ display: 'block' }}>
                                            <div className="action-card-glass" onClick={() => navigate('/leave-approvals')} style={{ background: 'rgba(59, 130, 246, 0.2)', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
                                                <CheckCircleOutlined /> {t('workspace.btn_approvals', 'Duyệt nghỉ phép')}
                                            </div>
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="hidden md:block text-right">
                                <div className="text-4xl font-black text-white">{currentTime.format('HH:mm')}</div>
                                <div className="text-blue-200 mt-1">{currentTime.format('dddd, DD MMMM')}</div>
                            </div>
                        </div>
                    </div>

                    {/* Productivity Pulse */}
                    <div className="productivity-grid">
                        <div className="glass-stat-card fade-in-up" style={{ animationDelay: '0.1s' }}>
                            <div className="stat-icon-wrapper blue-glow"><ClockCircleOutlined /></div>
                            <div className="text-gray-500 text-sm font-medium">Tổng nhiệm vụ</div>
                            <div className="text-3xl font-bold mt-1Value">{stats.totalTasks}</div>
                            <div className="text-xs text-blue-500 mt-2 font-semibold">Tăng 12% so với tuần trước</div>
                        </div>
                        <div className="glass-stat-card fade-in-up" style={{ animationDelay: '0.2s' }}>
                            <div className="stat-icon-wrapper green-glow"><CheckCircleOutlined /></div>
                            <div className="text-gray-500 text-sm font-medium">Hoàn thành</div>
                            <div className="text-3xl font-bold mt-1">{stats.onTimeCount}</div>
                            <div className="text-xs text-green-500 mt-2 font-semibold">Hiệu suất: {Math.round((stats.onTimeCount / stats.totalTasks) * 100 || 0)}%</div>
                        </div>
                        <div className="glass-stat-card fade-in-up" style={{ animationDelay: '0.3s' }}>
                            <div className="stat-icon-wrapper orange-glow"><CalendarOutlined /></div>
                            <div className="text-gray-500 text-sm font-medium">Nghỉ phép còn lại</div>
                            <div className="text-3xl font-bold mt-1">{currentUser?.annualLeaveBalance || 0}</div>
                            <div className="text-xs text-orange-500 mt-2 font-semibold">Ngày phép năm {dayjs().year()}</div>
                        </div>
                        <div className="glass-stat-card fade-in-up" style={{ animationDelay: '0.4s' }}>
                            <div className="stat-icon-wrapper red-glow"><ExclamationCircleOutlined /></div>
                            <div className="text-gray-500 text-sm font-medium">Vi phạm/Cảnh báo</div>
                            <div className="text-3xl font-bold mt-1">0</div>
                            <div className="text-xs text-gray-400 mt-2 font-semibold">Hệ thống ghi nhận an toàn</div>
                        </div>
                    </div>

                    <div className="workspace-section-container">
                        {/* Task List Section */}
                        <div className="glass-panel fade-in-up" style={{ animationDelay: '0.5s' }}>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold" style={{ color: isDarkMode ? '#ffffff' : 'inherit' }}>Nhiệm vụ ưu tiên</h3>
                                <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/groups')} className="dark:text-blue-400">Xem tất cả</Button>
                            </div>
                            
                            <div className="space-y-2">
                                {(stats.tasks === undefined || stats.tasks.length === 0) && (
                                    <div className="text-center py-10 text-gray-400">Bạn không có nhiệm vụ nào cần làm ngay.</div>
                                )}
                                {stats.tasks?.slice(0, 5).map((task: any) => (
                                    <div key={task.id} className="premium-list-item" onClick={() => navigate(`/groups/${task.groupId}?tab=mytask`)}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-xl ${task.status === 'InProgress' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {task.status === 'InProgress' ? <PlayCircleOutlined /> : <ClockCircleOutlined />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold item-title truncate" style={{ color: isDarkMode ? '#ffffff' : '#000000' }}>{task.title}</div>
                                                <div className="text-xs item-deadline" style={{ color: isDarkMode ? '#94a3b8' : '#4b5563' }}>{t('workspace.deadline', 'Hạn chót')}: {dayjs(task.deadline).format('DD MMM')}</div>
                                            </div>
                                        </div>
                                        <Tag color={task.status === 'InProgress' ? 'blue' : 'default'} style={{ fontWeight: '600' }}>{task.status}</Tag>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-6">
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Lịch trình trong tuần</h4>
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={timelineData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={isDarkMode ? 0.05 : 0.1} />
                                            <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} stroke={isDarkMode ? '#94a3b8' : '#64748b'} />
                                            <YAxis axisLine={false} tickLine={false} fontSize={12} stroke={isDarkMode ? '#94a3b8' : '#64748b'} hide />
                                            <RechartsTooltip 
                                                cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} 
                                                contentStyle={{ 
                                                    borderRadius: 12, 
                                                    border: 'none', 
                                                    boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
                                                    background: isDarkMode ? '#1e293b' : '#ffffff',
                                                    color: isDarkMode ? '#f1f5f9' : '#0f172a'
                                                }} 
                                            />
                                            <Bar dataKey="tasks" radius={[4, 4, 0, 0]}>
                                                {timelineData.map((d: any, i: number) => (
                                                    <Cell key={i} fill={d.isToday ? '#3b82f6' : (isDarkMode ? '#334155' : '#cbd5e1')} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Security Sidebar */}
                        <div className="space-y-6">
                            <div className="glass-panel fade-in-up security-badge-section" style={{ animationDelay: '0.6s' }}>
                                <div className={`security-ring ${(currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) || currentUser?.faceImageUrl ? 'verified' : ''}`}>
                                    {(currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) || currentUser?.faceImageUrl ? (
                                        <SafetyCertificateOutlined className="status-check-icon" />
                                    ) : (
                                        <ExclamationCircleOutlined className="status-check-icon text-orange-400" />
                                    )}
                                </div>
                                <h3 className="font-bold text-lg">Trạng thái định danh</h3>
                                <p className="text-sm text-gray-500 mt-1 mb-4">
                                    {(currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) || currentUser?.faceImageUrl 
                                        ? 'Tài khoản của bạn đã được xác thực Face ID mức độ cao.' 
                                        : 'Vui lòng thiết lập Face ID trong hồ sơ để tăng cường bảo mật.'}
                                </p>
                                <Button type={(currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) || currentUser?.faceImageUrl ? "default" : "primary"} block shape="round" onClick={() => navigate('/profile')}>
                                    {(currentUser?.faceEmbeddings && currentUser.faceEmbeddings.length > 0) || currentUser?.faceImageUrl ? 'Quản lý bảo mật' : 'Thiết lập ngay'}
                                </Button>
                            </div>

                            <div className="glass-panel fade-in-up" style={{ animationDelay: '0.7s' }}>
                                <h3 className="font-bold mb-4 flex items-center justify-between">
                                    Tin nhắn mới
                                    <Badge count={unreadTotal} overflowCount={9} />
                                </h3>
                                <div className="space-y-4">
                                    {conversations.length === 0 && (
                                        <div className="text-center py-4 text-gray-400 text-sm">Không có tin nhắn mới.</div>
                                    )}
                                    {conversations.map(conv => (
                                        <div key={conv.id} className="flex gap-3 cursor-pointer group" onClick={() => navigate(`/chat?userId=${conv.id}`)}>
                                            <Badge dot={conv.unreadCount > 0} color="blue" offset={[-2, 34]}>
                                                <Avatar src={conv.avatar} />
                                            </Badge>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm group-hover:text-blue-500 transition-colors">{conv.fullName || conv.username}</span>
                                                    <span className="text-[10px] text-gray-400">{dayjs(conv.lastMessageTime).format('HH:mm')}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessage}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Personal Calendar Section */}
                    <div className="glass-panel fade-in-up mt-6" style={{ animationDelay: '0.8s' }}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-bold">Lịch cá nhân & Nhắc nhở</h3>
                                <p className="text-sm text-gray-500 mt-1">Quản lý nhiệm vụ (Tasks) và nhắc nhở cá nhân</p>
                            </div>
                            <Button type="primary" icon={<BellOutlined />} onClick={() => setIsAddReminderVisible(true)}>
                                Tạo Nhắc Nhở
                            </Button>
                        </div>
                        <div className="calendar-container premium-calendar">
                            <Calendar cellRender={calendarCellRender} onSelect={handleDateSelect} />
                        </div>
                    </div>
                </div>
                
                <BottomNavigation />
            </div>

            <Modal
                title="Tạo Nhắc Nhở Cá Nhân"
                open={isAddReminderVisible}
                onCancel={() => { setIsAddReminderVisible(false); reminderForm.resetFields(); }}
                footer={null}
                centered
            >
                <Form
                    form={reminderForm}
                    layout="vertical"
                    onFinish={handleAddReminder}
                >
                    <Form.Item name="title" label="Nội dung nhắc nhở" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}>
                        <Input placeholder="Ví dụ: Kiểm tra tiến độ dự án Alpha..." />
                    </Form.Item>
                    <Form.Item name="dateTime" label="Thời gian nhắc" rules={[{ required: true, message: 'Chọn thời gian' }]}>
                        <DatePicker 
                            showTime 
                            format="DD/MM/YYYY HH:mm" 
                            className="w-full" 
                            size="large" 
                            inputReadOnly 
                            popupClassName="mobile-date-picker-popup"
                        />
                    </Form.Item>
                    <Form.Item className="mt-6 mb-0 text-right">
                        <Button onClick={() => setIsAddReminderVisible(false)} className="mr-3">Hủy</Button>
                        <Button type="primary" htmlType="submit">Lưu Nhắc Nhở</Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Day Events Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CalendarOutlined style={{ color: '#3b82f6' }} />
                        <span>Lịch trình ngày {selectedDate?.format('DD/MM/YYYY')}</span>
                    </div>
                }
                open={isDayEventsModalVisible}
                onCancel={() => setIsDayEventsModalVisible(false)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setIsDayEventsModalVisible(false)}>
                        Đóng
                    </Button>
                ]}
                centered
                width={500}
                className="day-events-modal"
            >
                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                    {selectedDayEvents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                            Không có sự kiện nào trong ngày này.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {selectedDayEvents.map((ev, idx) => (
                                <div 
                                    key={idx} 
                                    className="event-detail-item"
                                    style={{ 
                                        padding: '12px', 
                                        borderRadius: '12px', 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        cursor: ev.eventType !== 'reminder' ? 'pointer' : 'default',
                                        transition: 'all 0.2s'
                                    }}
                                    onClick={() => {
                                        if (ev.eventType === 'task') navigate(`/groups/${ev.groupId}?tab=mytask`);
                                        if (ev.eventType === 'project') navigate(`/groups/${ev.id}`);
                                    }}
                                >
                                    <div style={{ 
                                        width: '40px', height: '40px', borderRadius: '10px', 
                                        display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center',
                                        background: ev.eventType === 'task' ? 'rgba(59, 130, 246, 0.1)' : 
                                                   ev.eventType === 'project' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                                        color: ev.eventType === 'task' ? '#3b82f6' : 
                                               ev.eventType === 'project' ? '#10b981' : '#a855f7'
                                    }}>
                                        {ev.eventType === 'task' && <RocketOutlined />}
                                        {ev.eventType === 'project' && <RocketOutlined />}
                                        {ev.eventType === 'reminder' && <BellOutlined />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {ev.eventType === 'project' && ev.type === 'milestone' ? `Cột mốc: ${ev.name}` : 
                                             ev.eventType === 'project' ? `${ev.type.toUpperCase()}: ${ev.name}` : ev.title}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                            {ev.eventType === 'task' && `Nhiệm vụ trong dự án`}
                                            {ev.eventType === 'project' && `Dự án quan trọng`}
                                            {ev.eventType === 'reminder' && `Nhắc nhở cá nhân lúc ${dayjs(ev.date).format('HH:mm')}`}
                                        </div>
                                    </div>
                                    <div style={{ color: '#94a3b8' }}>
                                        <ArrowRightOutlined />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
