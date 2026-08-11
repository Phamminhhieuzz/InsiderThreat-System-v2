import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { App, Select, Input, Button, DatePicker, Avatar, Space } from 'antd';
import { api } from '../../services/api';
import './CreateTaskModal.css';

interface Member {
    id: string;
    fullName: string;
    avatarUrl?: string;
}

interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    progress?: number;
    assignedTo?: string;
    startDate?: string;
    deadline?: string;
}

interface CreateTaskModalProps {
    onClose: () => void;
    onSubmit: () => void;
    task?: Task; // Optional task for editing
    initialStatus?: string; // Optional initial status for new tasks
}

export default function CreateTaskModal({ onClose, onSubmit, task, initialStatus }: CreateTaskModalProps) {
    const isEdit = !!task;
    const { id: groupId } = useParams<{ id: string }>();
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState(initialStatus || 'Todo');
    const [startDate, setStartDate] = useState<any>(null);
    const [dueDate, setDueDate] = useState<any>(null);
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('Normal');
    const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignedTo || null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<number>(task?.progress || 0);

    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setDescription(task.description || '');
            setStatus(task.status);
            setPriority(task.priority);
            setStartDate(task.startDate ? dayjs(task.startDate) : null);
            setDueDate(task.deadline ? dayjs(task.deadline) : null);
            setAssigneeId(task.assignedTo || null);
        } else if (initialStatus) {
            setStatus(initialStatus);
        }
    }, [task, initialStatus]);

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const res = await api.get<Member[]>(`/api/groups/${groupId}/members-details`);
                setMembers(res);
            } catch (err) {
                console.error('Failed to fetch members', err);
            }
        };
        if (groupId) fetchMembers();
    }, [groupId]);

    const handleSave = async () => {
        if (!title.trim()) {
            message.warning('Vui lòng nhập tiêu đề task');
            return;
        }

        setLoading(true);
        try {
            const taskData = {
                title: title.trim(),
                description: description.trim(),
                status,
                priority,
                progress,
                startDate: startDate ? startDate.toISOString() : null,
                deadline: dueDate ? dueDate.toISOString() : null,
                assignedTo: assigneeId
            };

            if (isEdit) {
                await api.patch(`/api/groups/${groupId}/tasks/${task!.id}`, taskData);
                message.success('Cập nhật task thành công');
            } else {
                await api.post(`/api/groups/${groupId}/tasks`, taskData);
                message.success('Tạo task thành công');
            }
            onSubmit();
            onClose();
        } catch (err: any) {
            console.error('Task creation failed:', err.response?.data || err);
            const errorMsg = err.response?.data?.message || 'Không thể tạo task. Vui lòng kiểm tra lại dữ liệu.';
            message.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="taskModal-overlay" onClick={onClose}>
            <div className="taskModal-content" onClick={e => e.stopPropagation()}>
                <div className="taskModal-header">
                    <h2>{isEdit ? 'Chỉnh Sửa Task' : 'Tạo Task Mới'}</h2>
                    <button className="iconBtn" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="taskModal-body">
                    <div className="taskForm-row">
                        <label>Tiêu đề</label>
                        <Input 
                            size="large"
                            placeholder="Tên công việc cần thực hiện..." 
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="taskForm-row">
                        <label><span className="material-symbols-outlined">check_circle</span> Trang thái</label>
                        <Select 
                            value={status} 
                            style={{ width: '100%' }}
                            onChange={setStatus}
                        >
                            <Select.Option value="Todo">To-do</Select.Option>
                            <Select.Option value="InProgress">Đang thực hiện</Select.Option>
                            <Select.Option value="InReview">Đang xem xét</Select.Option>
                            <Select.Option value="Done">Hoàn thành</Select.Option>
                        </Select>
                    </div>

                    <div className="taskForm-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label><span className="material-symbols-outlined">start</span> Bắt đầu</label>
                            <DatePicker 
                                style={{ width: '100%' }} 
                                onChange={setStartDate} 
                                value={startDate}
                                format="DD/MM/YYYY"
                                placeholder="Chọn ngày"
                            />
                        </div>
                        <div>
                            <label><span className="material-symbols-outlined">event</span> Kết thúc</label>
                            <DatePicker 
                                style={{ width: '100%' }} 
                                onChange={setDueDate} 
                                value={dueDate}
                                format="DD/MM/YYYY"
                                placeholder="Chọn ngày"
                            />
                        </div>
                    </div>

                    {isEdit && (
                        <div className="taskForm-row">
                            <label><span className="material-symbols-outlined">analytics</span> Tiến độ (%)</label>
                            <Input 
                                type="number" 
                                min={0} 
                                max={100} 
                                value={progress} 
                                onChange={e => setProgress(Number(e.target.value))} 
                            />
                        </div>
                    )}

                    <div className="taskForm-row">
                        <label><span className="material-symbols-outlined">person</span> Người thực hiện</label>
                        <Select
                            placeholder="Chọn thành viên"
                            style={{ width: '100%' }}
                            onChange={setAssigneeId}
                            value={assigneeId}
                        >
                            {members.map(m => (
                                <Select.Option key={m.id} value={m.id}>
                                    <Space>
                                        <Avatar size="small" src={m.avatarUrl || `https://ui-avatars.com/api/?name=${m.fullName}`} />
                                        {m.fullName}
                                    </Space>
                                </Select.Option>
                            ))}
                        </Select>
                    </div>

                    <div className="taskForm-row">
                        <label><span className="material-symbols-outlined">local_fire_department</span> Ưu tiên</label>
                        <Select value={priority} onChange={setPriority} style={{ width: '100%' }}>
                            <Select.Option value="Low">Thấp</Select.Option>
                            <Select.Option value="Normal">Trung bình</Select.Option>
                            <Select.Option value="Urgent">Khẩn cấp</Select.Option>
                        </Select>
                    </div>

                    <div className="taskForm-row descriptionRow">
                        <label><span className="material-symbols-outlined">notes</span> Mô tả chi tiết</label>
                        <Input.TextArea 
                            rows={4}
                            placeholder="Nhập ghi chú hoặc yêu cầu chi tiết..." 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>
                </div>

                <div className="taskModal-footer">
                    <div className="footer-actions">
                        <Button onClick={onClose}>Hủy bỏ</Button>
                        <Button type="primary" loading={loading} onClick={handleSave}>
                            {isEdit ? 'Cập nhật Task' : 'Lưu Task'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

