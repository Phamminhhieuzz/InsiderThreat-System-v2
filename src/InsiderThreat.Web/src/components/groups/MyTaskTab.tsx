import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { message, Spin, Empty, Avatar, Tooltip, Tag, Button, Input, Dropdown, Space, Modal } from 'antd';
import { 
    SearchOutlined, AppstoreOutlined, UnorderedListOutlined, 
    PlusOutlined, MoreOutlined, ClockCircleOutlined, 
    CheckCircleOutlined, SwapOutlined, DeleteOutlined, EditOutlined
} from '@ant-design/icons';
import type { DropResult } from '@hello-pangea/dnd';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import dayjs from 'dayjs';
import { api } from '../../services/api';
import { signalRService } from '../../services/signalRService';
import CreateTaskModal from './CreateTaskModal';
import TaskDetailDrawer from './TaskDetailDrawer';
import ProjectMobileTabs from './ProjectMobileTabs';
import './MyTaskTab.css';
import './ProjectMobileTabs.css';

interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    progress: number;
    assignedTo?: string;
    startDate?: string;
    deadline?: string;
}

interface Column {
    id: string;
    label: string;
    color: string;
    dotColor: string;
}

const COLUMNS: (t: any) => Column[] = (t) => [
    { id: 'Todo', label: t('project_detail.task_drawer.status_todo'), color: '#8b949e', dotColor: '#8b949e' },
    { id: 'InProgress', label: t('project_detail.task_drawer.status_in_progress'), color: '#1890ff', dotColor: '#4338ca' },
    { id: 'InReview', label: t('project_detail.task_drawer.status_review'), color: '#faad14', dotColor: '#b45309' },
    { id: 'WaitingApproval', label: t('project_detail.task_drawer.status_waiting'), color: '#f97316', dotColor: '#c2410c' },
    { id: 'Done', label: t('project_detail.task_drawer.status_done'), color: '#52c41a', dotColor: '#047857' }
];

interface Member {
    id: string;
    fullName: string;
    username: string;
    avatarUrl?: string;
}

interface MyTaskTabProps {
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

export default function MyTaskTab({ activeTab, onTabChange }: MyTaskTabProps) {
    const { id: groupId } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [group, setGroup] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [showCreateTask, setShowCreateTask] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
    const [taskToEdit, setTaskToEdit] = useState<Task | undefined>(undefined);
    const [initialStatus, setInitialStatus] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const currentUserInfo = JSON.parse(localStorage.getItem('user') || '{}');
    const isCurrentAdmin = group?.adminIds?.includes(currentUserInfo.id);
    const canManageTask = !group?.isProject || isCurrentAdmin;

    const columns = useMemo(() => COLUMNS(t), [t]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tasksRes, membersRes, groupRes] = await Promise.all([
                api.get<Task[]>(`/api/groups/${groupId}/tasks`),
                api.get<Member[]>(`/api/groups/${groupId}/members-details`),
                api.get<any>(`/api/groups/${groupId}`)
            ]);
            setTasks(tasksRes);
            setMembers(membersRes);
            setGroup(groupRes);
        } catch (err) {
            message.error(t('project_detail.mytasks.load_fail', { defaultValue: 'Không thể tải danh sách công việc' }));
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

        // Join the project-specific SignalR group
        hub.invoke('JoinProjectGroup', groupId).catch(console.error);

        // Khi có thành viên khác tạo/sửa/xóa task → tải lại dữ liệu
        const handleProjectChange = (payload: any) => {
            if (payload?.groupId === groupId) {
                fetchData();
            }
        };
        hub.on('ProjectDataChanged', handleProjectChange);

        return () => {
            hub.invoke('LeaveProjectGroup', groupId).catch(console.error);
            hub.off('ProjectDataChanged', handleProjectChange);
        };
    }, [groupId]);

    const onDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        const targetStatus = destination.droppableId;
        const task = tasks.find(t => t.id === draggableId);
        if (!task) return;

        // Optimistic UI Update
        const originalTasks = [...tasks];
        const updatedTasks = tasks.map(t => t.id === draggableId ? { ...t, status: targetStatus } : t);
        setTasks(updatedTasks);

        try {
            await api.patch(`/api/groups/${groupId}/tasks/${draggableId}`, { status: targetStatus });
            message.success(t('project_detail.mytasks.move_success', { status: t(`project_detail.task_drawer.status_${targetStatus.toLowerCase()}`), defaultValue: `Đã chuyển sang ${targetStatus}` }));
        } catch (err) {
            setTasks(originalTasks);
            message.error(t('project_detail.mytasks.update_status_fail', { defaultValue: 'Không thể cập nhật trạng thái' }));
        }
    };

    const getAssignee = (userId?: string) => {
        return members.find(m => m.id === userId);
    };

    const handleDeleteTask = (taskId: string) => {
        Modal.confirm({
            title: t('project_detail.mytasks.delete_confirm_title', { defaultValue: 'Xóa nhiệm vụ?' }),
            content: t('project_detail.mytasks.delete_confirm_msg', { defaultValue: 'Hành động này không thể hoàn tác.' }),
            okText: t('project_detail.mytasks.btn_delete', { defaultValue: 'Xóa' }),
            okType: 'danger',
            cancelText: t('project_detail.dashboard.btn_cancel', { defaultValue: 'Hủy' }),
            onOk: async () => {
                try {
                    await api.delete(`/api/groups/${groupId}/tasks/${taskId}`);
                    message.success(t('project_detail.mytasks.delete_success', { defaultValue: 'Đã xóa task' }));
                    fetchData();
                } catch (err) {
                    message.error(t('project_detail.mytasks.delete_fail', { defaultValue: 'Lỗi khi xóa task' }));
                }
            }
        });
    };

    const timelineData = useMemo(() => {
        // Use group start date if available, otherwise fallback to today
        let start = group?.projectStartDate ? dayjs(group.projectStartDate) : dayjs().subtract(2, 'day');
        
        // Normalize to beginning of day
        start = start.startOf('day');

        const days = [];
        for (let i = 0; i < 7; i++) {
            days.push(start.add(i, 'day'));
        }

        // Map tasks to bubbles (only tasks within this 7-day range)
        const bubbles = tasks.filter(t => t.deadline).map(t => {
            const d = dayjs(t.deadline);
            if (d.isBefore(start) || d.isAfter(start.add(7, 'day'))) return null;
            
            const offset = d.diff(start, 'hour');
            const left = (offset / (7 * 24)) * 100;
            
            return {
                id: t.id,
                title: t.title,
                date: d.format('DD MMM'),
                left: `${left}%`,
                status: t.status
            };
        }).filter(Boolean);

        return { days, bubbles };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t => 
            !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [tasks, searchQuery]);

    if (loading) return <div className="loading-tasks"><Spin size="large" /></div>;

    return (
        <div className="myTaskTab">
            {/* Design Header */}
            <div className="myTask-topBar">
                <div className="topBar-left">
                    <span className="task-project-label">{t('project_detail.mytasks.narrative')}</span>
                    <h2 className="task-project-title">{t('project_detail.mytasks.board_title', { defaultValue: 'Bảng công việc' })}</h2>
                </div>
                <div className="topBar-right">
                    <Input 
                        prefix={<SearchOutlined />} 
                        placeholder={t('project_detail.mytasks.search')} 
                        style={{ width: 240, borderRadius: 8 }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    
                    <div className="view-switcher">
                        <Button 
                            type={viewMode === 'kanban' ? 'primary' : 'text'} 
                            icon={<AppstoreOutlined />} 
                            onClick={() => setViewMode('kanban')}
                        >
                            {t('project_detail.mytasks.board')}
                        </Button>
                        <Button 
                            type={viewMode === 'list' ? 'primary' : 'text'} 
                            icon={<UnorderedListOutlined />} 
                            onClick={() => setViewMode('list')}
                        >
                            {t('project_detail.mytasks.list')}
                        </Button>
                    </div>

                    {canManageTask && (
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => { 
                                setTaskToEdit(undefined); 
                                setInitialStatus(undefined);
                                setShowCreateTask(true); 
                            }}
                        >
                            {t('project_detail.mytasks.add_task')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Mobile Tabs Relocated Below Search Bar */}
            {activeTab && onTabChange && (
                <ProjectMobileTabs activeTab={activeTab} onTabChange={onTabChange} />
            )}

            {/* Task Calendar (Timeline Bubble) */}
            <div className="task-timeline-wrapper animate-in">
                <div className="timeline-header">
                    <h3>{t('project_detail.mytasks.calendar_title', { defaultValue: 'Task Calendar' })}</h3>
                    <Button type="text" icon={<MoreOutlined />} />
                </div>
                <div className="timeline-container">
                    <div className="timeline-row days">
                        {timelineData.days.map(d => (
                            <span key={d.toString()} className={d.isSame(dayjs(), 'day') ? 'today-label' : ''}>
                                {d.format('DD MMM')}
                            </span>
                        ))}
                    </div>
                    
                    <div className="timeline-row grid-lines">
                        {timelineData.days.map((d, i) => (
                            <div key={i} className={`grid-col ${d.isSame(dayjs(), 'day') ? 'active-col' : ''}`} />
                        ))}
                    </div>
                    
                    <div className="timeline-bubbles">
                        {timelineData.bubbles.map((b: any, i: number) => (
                            <div 
                                key={b.id} 
                                className={`t-bubble ${b.status === 'Done' ? 'gray' : 'black'}`} 
                                style={{ 
                                    left: b.left, 
                                    width: '18%', 
                                    top: 10 + (i % 3) * 30, // Stack bubbles vertically
                                    zIndex: 10
                                }}
                                onClick={() => {
                                    const task = tasks.find(t => t.id === b.id);
                                    if (task) {
                                        setSelectedTask(task);
                                        setShowDrawer(true);
                                    }
                                }}
                            >
                                <span className="t-date">{b.date}</span> {b.title}
                            </div>
                        ))}
                        {timelineData.bubbles.length === 0 && (
                            <div style={{textAlign: 'center', padding: '20px', color: '#8b949e'}}>{t('project_detail.mytasks.no_task_in_range', { defaultValue: 'Cảnh báo: Không có Task nào trong dải tuần này' })}</div>
                        )}
                    </div>
                </div>
            </div>

            <h3 className="all-tasks-header">{t('project_detail.mytasks.all_tasks_label', { defaultValue: 'All Task' })}</h3>

            {/* Kanban Board with DND */}
            {viewMode === 'kanban' && (
                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="kanbanBoard">
                        {columns.map(col => (
                            <Droppable key={col.id} droppableId={col.id}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`kanbanColumn ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                                    >
                                        <div className="colHeader">
                                            <div className="colTitle">
                                                <div className="colDot" style={{ background: col.dotColor }} />
                                                <span>{col.label}</span>
                                                <span className="colCount">
                                                    {filteredTasks.filter(t => t.status === col.id).length}
                                                </span>
                                            </div>
                                            {canManageTask && (
                                                <Button 
                                                    type="text" 
                                                    size="small" 
                                                    icon={<PlusOutlined />} 
                                                    onClick={() => {
                                                        setTaskToEdit(undefined);
                                                        setInitialStatus(col.id);
                                                        setShowCreateTask(true);
                                                    }} 
                                                />
                                            )}
                                        </div>

                                        <div className="kanbanCardsList">
                                            {filteredTasks.filter(t => t.status === col.id).map((task, index) => {
                                                const assignee = getAssignee(task.assignedTo);
                                                return (
                                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className={`modern-kCard ${snapshot.isDragging ? 'is-dragging' : ''}`}
                                                                onClick={() => {
                                                                    setSelectedTask(task);
                                                                    setShowDrawer(true);
                                                                }}
                                                            >
                                                                 <div className="kCard-tagRow">
                                                                    <Space>
                                                                        <Tag color={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'orange' : 'blue'}>
                                                                            {task.priority}
                                                                        </Tag>
                                                                        {task.deadline && (
                                                                            <span className="kCard-date">
                                                                                <ClockCircleOutlined /> {new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                                                            </span>
                                                                        )}
                                                                    </Space>
                                                                    {canManageTask && (
                                                                        <Space>
                                                                            <Button 
                                                                                type="text" 
                                                                                size="small" 
                                                                                icon={<EditOutlined style={{ fontSize: 12, color: '#1890ff' }} />} 
                                                                                onClick={(e) => { 
                                                                                    e.stopPropagation(); 
                                                                                    setTaskToEdit(task); 
                                                                                    setShowCreateTask(true); 
                                                                                }}
                                                                            />
                                                                            <Button 
                                                                                type="text" 
                                                                                size="small" 
                                                                                danger 
                                                                                icon={<DeleteOutlined style={{ fontSize: 12 }} />} 
                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                                                                className="kCard-delete-btn"
                                                                            />
                                                                        </Space>
                                                                    )}
                                                                </div>
                                                                <h4 className="kCard-title">{task.title}</h4>
                                                                {task.description && <p className="kCard-description">{task.description}</p>}
                                                                
                                                                <div className="kCard-footer">
                                                                    <div className="kCard-assignee">
                                                                        {assignee ? (
                                                                            <Tooltip title={assignee.fullName}>
                                                                                <Avatar size="small" src={assignee.avatarUrl || `https://ui-avatars.com/api/?name=${assignee.fullName}`} />
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <Avatar size="small" icon={<SwapOutlined />} />
                                                                        )}
                                                                    </div>
                                                                    <div className="kCard-actions">
                                                                        <Tooltip title={t('project_detail.mytasks.progress_tooltip', { defaultValue: 'Tiến độ' })}>
                                                                           <Tag color="cyan">{task.progress}%</Tag>
                                                                        </Tooltip>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        ))}
                    </div>
                </DragDropContext>
            )}

            {viewMode === 'list' && (
                <div className="listView modern-list animate-in">
                    <div className="list-header">
                        <div className="list-col" style={{ flex: 2 }}>{t('project_detail.mytasks.col_task', { defaultValue: 'Công việc' })}</div>
                        <div className="list-col">{t('project_detail.task_drawer.status')}</div>
                        <div className="list-col">{t('project_detail.task_drawer.assignee')}</div>
                        <div className="list-col">{t('project_detail.task_drawer.due_date')}</div>
                        <div className="list-col">{t('project_detail.task_drawer.priority')}</div>
                        <div className="list-col" style={{ width: 80 }}>{t('docs.col_action', { defaultValue: 'Thao tác' })}</div>
                    </div>
                    {filteredTasks.map(t => (
                        <div key={t.id} className="list-row" onClick={() => { setSelectedTask(t); setShowDrawer(true); }}>
                            <div className="list-col title">{t.title}</div>
                            <div className="list-col">
                                <Tag color={columns.find((c: any) => c.id === t.status)?.dotColor}>{t.status}</Tag>
                            </div>
                            <div className="list-col">
                                <Space>
                                    <Avatar size="small" src={`https://ui-avatars.com/api/?name=${getAssignee(t.assignedTo)?.fullName || 'U'}`} />
                                    <span>{getAssignee(t.assignedTo)?.fullName || '---'}</span>
                                </Space>
                            </div>
                            <div className="list-col date">{t.deadline ? new Date(t.deadline).toLocaleDateString('vi-VN') : '---'}</div>
                            <div className="list-col">
                                <Tag color={t.priority === 'High' ? 'red' : 'default'}>{t.priority}</Tag>
                            </div>
                            <div className="list-col">
                                {canManageTask ? (
                                    <Space>
                                        <Button 
                                            type="text" 
                                            icon={<EditOutlined style={{ color: '#1890ff' }} />} 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                setTaskToEdit(t); 
                                                setShowCreateTask(true); 
                                            }} 
                                        />
                                        <Button 
                                            type="text" 
                                            danger 
                                            icon={<DeleteOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteTask(t.id);
                                            }} 
                                        />
                                    </Space>
                                ) : (
                                    <span style={{ color: '#ccc', fontSize: '12px' }}>Không có quyền</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredTasks.length === 0 && <Empty description={t('project_detail.mytasks.no_task_found', { defaultValue: 'Không tìm thấy công việc' })} />}
                </div>
            )}

            {showCreateTask && (
                <CreateTaskModal
                    task={taskToEdit}
                    initialStatus={initialStatus}
                    onClose={() => {
                        setShowCreateTask(false);
                        setTaskToEdit(undefined);
                        setInitialStatus(undefined);
                    }}
                    onSubmit={() => {
                        setShowCreateTask(false);
                        setTaskToEdit(undefined);
                        setInitialStatus(undefined);
                        fetchData();
                    }}
                />
            )}

            {showDrawer && selectedTask && (
                <TaskDetailDrawer
                    open={showDrawer}
                    onClose={() => {
                        setShowDrawer(false);
                        setSelectedTask(undefined);
                    }}
                    task={selectedTask}
                    groupId={groupId || ''}
                    members={members}
                    onTaskUpdate={() => {
                        fetchData();
                        // Refetch specifically selectedTask if needed, but array update might be enough
                    }}
                />
            )}
        </div>
    );
}
