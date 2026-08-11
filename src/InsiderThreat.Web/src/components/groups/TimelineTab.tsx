import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Spin, message, Tooltip, Empty, Tag, Button, Modal, Form, DatePicker, Input, Space } from 'antd';
import { 
    CalendarOutlined, FilterOutlined, SendOutlined, 
    MoreOutlined, CheckCircleOutlined, RightOutlined, DownOutlined,
    FlagOutlined, PlusCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../services/api';
import { signalRService } from '../../services/signalRService';
import ProjectMobileTabs from './ProjectMobileTabs';
import './TimelineTab.css';
import './ProjectMobileTabs.css';

interface Task {
    id: string;
    title: string;
    status: string;
    phase?: string;
    startDate?: string;
    deadline?: string;
    createdAt?: string; // Bổ sung ngày tạo
    progress: number;
}

interface Milestone {
    name: string;
    date: string;
    isDone: boolean;
}

interface GroupInfo {
    id: string;
    name: string;
    projectStartDate?: string;
    projectEndDate?: string;
    milestones: Milestone[];
}

interface TimelineTabProps {
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

export default function TimelineTab({ activeTab, onTabChange }: TimelineTabProps) {
    const { id: groupId } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
    const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
    const [isMilestoneModalVisible, setIsMilestoneModalVisible] = useState(false);
    const [filterText, setFilterText] = useState('');
    const [scheduleForm] = Form.useForm();
    const [milestoneForm] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tasksRes, groupRes] = await Promise.all([
                api.get<Task[]>(`/api/groups/${groupId}/tasks`),
                api.get<GroupInfo>(`/api/groups/${groupId}`)
            ]);
            setTasks(tasksRes);
            setGroup(groupRes);
            
            // Auto-expand all phases initially
            const phases = Array.from(new Set(tasksRes.map(t => t.phase || 'General')));
            const initialExpanded: Record<string, boolean> = {};
            phases.forEach(p => initialExpanded[p] = true);
            setExpandedPhases(initialExpanded);
        } catch (err) {
            message.error(t('project_detail.timeline.load_fail', { defaultValue: 'Lỗi khi tải dữ liệu lộ trình' }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (groupId) fetchData();
    }, [groupId]);

    // === Real-time sync: join project group & listen for changes ===
    useEffect(() => {
        if (!groupId) return;
        const hub = signalRService.getConnection();
        if (!hub) return;

        hub.invoke('JoinProjectGroup', groupId).catch(console.error);

        const handleChange = (payload: any) => {
            if (payload?.groupId === groupId) fetchData();
        };
        hub.on('ProjectDataChanged', handleChange);

        return () => {
            hub.invoke('LeaveProjectGroup', groupId).catch(console.error);
            hub.off('ProjectDataChanged', handleChange);
        };
    }, [groupId]);

    const togglePhase = (phase: string) => {
        setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
    };

    const handleUpdateSchedule = async (values: any) => {
        try {
            await api.patch(`/api/groups/${groupId}`, {
                projectStartDate: values.range[0].toISOString(),
                projectEndDate: values.range[1].toISOString()
            });
            message.success(t('project_detail.timeline.update_success', { defaultValue: 'Cập nhật lộ trình dự án thành công' }));
            setIsScheduleModalVisible(false);
            fetchData();
        } catch (err) {
            message.error(t('project_detail.timeline.update_fail', { defaultValue: 'Lỗi khi cập nhật lộ trình' }));
        }
    };

    const handleAddMilestone = async (values: any) => {
        try {
            const currentMilestones = group?.milestones || [];
            const newMilestone: Milestone = {
                name: values.name,
                date: values.date.toISOString(),
                isDone: false
            };
            
            await api.patch(`/api/groups/${groupId}`, {
                ...group,
                milestones: [...currentMilestones, newMilestone]
            });
            
            message.success(t('project_detail.timeline.milestone_success', { defaultValue: 'Đã thêm cột mốc dự án' }));
            setIsMilestoneModalVisible(false);
            milestoneForm.resetFields();
            fetchData();
        } catch (err) {
            message.error(t('project_detail.timeline.milestone_fail', { defaultValue: 'Lỗi khi thêm cột mốc' }));
        }
    };

    const handleExport = () => {
        message.loading(t('project_detail.timeline.exporting', { defaultValue: 'Đang chuẩn bị dữ liệu xuất bản...' }), 1.5).then(() => {
            message.success(t('project_detail.timeline.export_success', { defaultValue: 'Đã xuất bản lộ trình dự án (PDF/CSV)' }));
        });
    };

    // Calculate project duration for scaling
    const timelineScale = useMemo(() => {
        let start = group?.projectStartDate ? dayjs(group.projectStartDate) : null;
        let end = group?.projectEndDate ? dayjs(group.projectEndDate) : null;

        // If project dates are not defined, or we need to find the range from tasks
        if (!start || !end) {
            tasks.forEach(t => {
                const dates = [t.startDate, t.deadline, t.createdAt].filter(Boolean).map(d => dayjs(d));
                dates.forEach(d => {
                    if (!start || d.isBefore(start)) start = d;
                    if (!end || d.isAfter(end)) end = d;
                });
            });
            
            if (!start) start = dayjs().startOf('week');
            if (!end) end = start.add(2, 'week');
        }

        start = start.startOf('day');
        end = end.endOf('day');

        // Total columns if daily: end - start + 1
        return { start, end, totalDays: Math.max(1, end.diff(start, 'day') + 1) };
    }, [group, tasks]);

    const timeLabels = useMemo(() => {
        const labels = [];
        let current = timelineScale.start;
        const totalDays = timelineScale.totalDays;
        
        // If the project is short (< 14 days), show every day. Otherwise, show every week.
        const step = totalDays < 14 ? 1 : 7;
        const format = totalDays < 14 ? 'DD MMM' : 'MMM DD';

        // Limit range if needed to exactly match totalDays slots
        while (labels.length < timelineScale.totalDays && current.isBefore(timelineScale.end.add(1, 'hour'))) {
            labels.push(current.format(format));
            current = current.add(step, 'day');
        }
        return labels;
    }, [timelineScale]);

    const tasksByPhase = useMemo(() => {
        const grouped: Record<string, Task[]> = {};
        const filtered = tasks.filter(t => 
            t.title.toLowerCase().includes(filterText.toLowerCase())
        );
        filtered.forEach(task => {
            const phase = task.phase || 'General';
            if (!grouped[phase]) grouped[phase] = [];
            grouped[phase].push(task);
        });
        return grouped;
    }, [tasks, filterText]);

    const getBarStyles = (task: Task) => {
        // Fallback dates: use createdAt if dates are missing
        const taskStart = dayjs(task.startDate || task.createdAt);
        const taskEnd = dayjs(task.deadline || task.startDate || task.createdAt);
        
        const startOffset = taskStart.diff(timelineScale.start, 'day');
        let duration = taskEnd.diff(taskStart, 'day') + 1; // Inclusive duration
        if (duration <= 0) duration = 1; 
        
        const leftPercent = (startOffset / timelineScale.totalDays) * 100;
        const widthPercent = (duration / timelineScale.totalDays) * 100;
        
        // Hide only if completely outside and no fallback
        if (isNaN(leftPercent) || (!task.startDate && !task.deadline && !task.createdAt)) {
            return { display: 'none' };
        }

        return {
            left: `${Math.max(0, Math.min(98, leftPercent))}%`,
            width: `${Math.max(2, Math.min(100 - leftPercent, widthPercent))}%`,
            opacity: (!task.startDate || !task.deadline) ? 0.6 : 1, // Mờ hơn nếu dùng ngày mặc định
            borderStyle: (!task.startDate || !task.deadline) ? 'dashed' : 'solid'
        };
    };

    const getStatusColor = (status: string) => {
        switch(status?.toLowerCase()) {
            case 'done': return '#10b981';
            case 'inprogress': return '#3b82f6';
            case 'inreview': return '#faad14';
            default: return 'var(--color-border)'; // Dynamic color
        }
    };

    if (loading) return <div className="loading-tasks"><Spin size="large" /></div>;

    return (
        <div className="timelineTab animate-in">
            <div className="timeline-header">
                <div className="header-info">
                    <Tag color="blue" className="glass-tag">Q3 Roadmap</Tag>
                    <h2 className="timeline-title">{t('project_detail.timeline.title')}</h2>
                </div>
                <div className="timeline-actions">
                    <Input 
                        placeholder={t('project_detail.mytasks.search')} 
                        prefix={<FilterOutlined />} 
                        style={{ width: 200, marginRight: 8 }}
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                    />
                    <Button icon={<FlagOutlined />} onClick={() => setIsMilestoneModalVisible(true)}>{t('project_detail.timeline.btn_milestone', { defaultValue: 'Thêm cột mốc' })}</Button>
                    <Button icon={<SendOutlined />} onClick={handleExport}>{t('project_detail.timeline.btn_export', { defaultValue: 'Xuất bản' })}</Button>
                    <Button type="primary" icon={<CalendarOutlined />} onClick={() => setIsScheduleModalVisible(true)}>{t('project_detail.timeline.btn_schedule', { defaultValue: 'Lập lịch' })}</Button>
                </div>
            </div>

            {/* Mobile Tabs Relocated Below Search Bar */}
            {activeTab && onTabChange && (
                <ProjectMobileTabs activeTab={activeTab} onTabChange={onTabChange} />
            )}

            <div className="timeline-container">
                <div className="timeline-body-wrapper">
                    {/* Left Panel: Phases & Tasks */}
                    <div className="tl-left-panel">
                        <div className="tl-col-heading">{t('project_detail.timeline.col_tasks', { defaultValue: 'NHIỆM VỤ DỰ ÁN' })}</div>
                        {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => (
                            <div key={phase} className="tl-phase-group">
                                <div className="tl-phase-header" onClick={() => togglePhase(phase)}>
                                    {expandedPhases[phase] ? <DownOutlined /> : <RightOutlined />}
                                    <span className="phase-name">{phase}</span>
                                </div>
                                {expandedPhases[phase] && phaseTasks.map(t => (
                                    <div key={t.id} className="tl-task-item">
                                        <span className="task-dot" style={{ background: getStatusColor(t.status) }} />
                                        <span className="task-name">{t.title}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Right Panel: Gantt View */}
                    <div className="tl-gantt-panel">
                        <div className="tl-time-header">
                            {timeLabels.map(label => (
                                <div key={label} className="tl-time-col">{label}</div>
                            ))}
                        </div>

                        <div className="tl-gantt-content">
                            {/* Milestone vertical lines Overlay */}
                            {group?.milestones?.map((m, i) => {
                                const mDate = dayjs(m.date);
                                if (mDate.isBefore(timelineScale.start) || mDate.isAfter(timelineScale.end)) return null;
                                const offset = mDate.diff(timelineScale.start, 'day');
                                const left = (offset / timelineScale.totalDays) * 100;
                                return (
                                    <div key={i} className="tl-milestone-line" style={{ left: `${left}%` }}>
                                        <div className="line-label">
                                            <FlagOutlined /> <span>{m.name}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => (
                                <div key={phase + '-gantt'} className="tl-phase-track">
                                    <div className="tl-phase-empty-row" />
                                    {expandedPhases[phase] && phaseTasks.map(t => (
                                        <div key={t.id + '-bar'} className="tl-bar-row">
                                            <div className="tl-bar-container">
                                                <Tooltip title={`${t.title}: ${t.progress}% | ${dayjs(t.startDate).format('DD/MM')} - ${dayjs(t.deadline).format('DD/MM')}`}>
                                                    <div className="tl-task-bar" style={{
                                                        ...getBarStyles(t),
                                                        background: getStatusColor(t.status),
                                                        borderColor: getStatusColor(t.status)
                                                    }}>
                                                        {t.progress > 0 && <div className="tl-bar-progress" style={{ width: `${t.progress}%` }} />}
                                                        <span className="tl-bar-label">{t.progress}%</span>
                                                    </div>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Milestones */}
            <div className="tl-milestones-footer">
                <h3 className="footer-title">{t('project_detail.timeline.milestones_title', { defaultValue: 'Cột mốc quan trọng' })}</h3>
                <div className="milestone-grid">
                    {group?.milestones && group.milestones.length > 0 ? (
                        group.milestones.map((m, i) => (
                            <div key={i} className={`milestone-card ${m.isDone ? 'is-done' : ''}`}>
                                <CheckCircleOutlined className="m-icon" />
                                <div className="m-info">
                                    <div className="m-name">{m.name}</div>
                                    <div className="m-date">{dayjs(m.date).format('DD MMM')}</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-milestones" onClick={() => setIsMilestoneModalVisible(true)}>
                             <PlusCircleOutlined /> <span>{t('project_detail.timeline.no_milestones', { defaultValue: 'Chưa có cột mốc nào. Thêm ngay!' })}</span>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                title={t('project_detail.timeline.schedule_modal_title', { defaultValue: 'Cấu hình Lộ trình Dự án' })}
                open={isScheduleModalVisible}
                onCancel={() => setIsScheduleModalVisible(false)}
                onOk={() => scheduleForm.submit()}
                okText={t('project_detail.task_drawer.save')}
                cancelText={t('project_detail.dashboard.btn_cancel')}
            >
                <Form
                    form={scheduleForm}
                    layout="vertical"
                    onFinish={handleUpdateSchedule}
                    initialValues={{
                        range: group?.projectStartDate && group?.projectEndDate ? 
                            [dayjs(group.projectStartDate), dayjs(group.projectEndDate)] : []
                    }}
                >
                    <p>{t('project_detail.timeline.schedule_desc', { defaultValue: 'Chọn khoảng thời gian tổng thể của dự án để căn chỉnh biểu đồ Gantt.' })}</p>
                    <Form.Item name="range" label={t('project_detail.timeline.project_range', { defaultValue: 'Thời gian dự án' })} rules={[{ required: true, message: t('attendance.placeholder_network') }]}>
                        <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t('project_detail.timeline.milestone_modal_title', { defaultValue: 'Thêm Cột mốc Dự án' })}
                open={isMilestoneModalVisible}
                onCancel={() => setIsMilestoneModalVisible(false)}
                onOk={() => milestoneForm.submit()}
                okText={t('project_detail.task_drawer.save')}
            >
                <Form form={milestoneForm} layout="vertical" onFinish={handleAddMilestone}>
                    <Form.Item name="name" label={t('project_detail.timeline.milestone_name', { defaultValue: 'Tên cột mốc' })} rules={[{ required: true }]}>
                        <Input placeholder="ví dụ: Hoàn thành thiết kế UI" />
                    </Form.Item>
                    <Form.Item name="date" label={t('project_detail.timeline.milestone_date', { defaultValue: 'Ngày diễn ra' })} rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
