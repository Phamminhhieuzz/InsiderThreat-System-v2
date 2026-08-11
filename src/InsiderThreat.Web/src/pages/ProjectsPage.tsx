import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import { userService } from '../services/userService';
import { api, API_BASE_URL } from '../services/api';
import type { User } from '../types';
import './ProjectsPage.css';


interface Project {
    id: string;
    name: string;
    members: number;
    description: string;
    privacy: 'PRIVATE' | 'PUBLIC';
    category: string;
    coverImage?: string;
    status: string;
    memberAvatars?: string[];
    startDate?: string;
    endDate?: string;
    createdAt?: string;
}

const KANBAN_COLUMNS = [
    { id: 'New', title: 'Dự án mới', status: 'New', colorClass: 'kanban-col-new' },
    { id: 'InProgress', title: 'Đang thực hiện', status: 'InProgress', colorClass: 'kanban-col-progress' },
    { id: 'OnHold', title: 'Tạm dừng', status: 'OnHold', colorClass: 'kanban-col-hold' },
    { id: 'Completed', title: 'Hoàn thành', status: 'Completed', colorClass: 'kanban-col-done' }
];

export default function ProjectsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    
    // Hooks for UI state
    const [projects, setProjects] = useState<Project[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ 
        name: '', description: '', privacy: 'Public', 
        startDate: '', endDate: '', members: [] as User[] 
    });
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [searchUserQuery, setSearchUserQuery] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [activeTab, setActiveTab] = useState('New'); // For mobile Kanban tabs
    
    // View and Filter State
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [privacyFilter, setPrivacyFilter] = useState('Tất cả quyền');
    const [timeFilter, setTimeFilter] = useState('Tuần này');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch users first so we can map avatars
                const users = await userService.getAllUsers();
                setAllUsers(users);

                const fetchedProjects = await api.get<any[]>('/api/groups?isProject=true');
                
                const realProjects = fetchedProjects.map(p => {
                    // Match member IDs to fetched user objects
                    const memberIds = p.memberIds || [];
                    const matchedUsers = memberIds.map((id: string) => users.find(u => u.id === id)).filter(Boolean) as User[];
                    
                    const avatars = matchedUsers.slice(0, 3).map(u => 
                        u.avatarUrl?.startsWith('http') ? u.avatarUrl 
                        : (u.avatarUrl ? `${API_BASE_URL}${u.avatarUrl}` : `https://ui-avatars.com/api/?name=${u.fullName || u.username}&background=random&color=fff&size=32`)
                    );
                    
                    return {
                        id: p.id,
                        name: p.name,
                        description: p.description,
                        members: memberIds.length || 1,
                        category: 'Dự án',
                        privacy: (p.privacy || 'PUBLIC').toUpperCase() as 'PUBLIC' | 'PRIVATE',
                        coverImage: p.coverUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=200&fit=crop',
                        status: p.status || 'New',
                        startDate: p.projectStartDate,
                        endDate: p.projectEndDate,
                        createdAt: p.createdAt,
                        memberAvatars: avatars.length > 0 ? avatars : [`https://ui-avatars.com/api/?name=P&background=random&color=fff&size=32`]
                    };
                });
                setProjects(realProjects);
            } catch (err) {
                console.error("Failed to fetch initial page data", err);
            }
        };

        fetchInitialData();
    }, []);

    const handleAccessProject = (projectId: string) => {
        navigate(`/projects/${projectId}`);
    };

    const handleDeleteProject = async (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        const confirmDelete = window.confirm(`Bạn có chắc muốn xóa dự án ${project.name}?`);
        if (!confirmDelete) return;

        try {
            await api.delete(`/api/groups/${project.id}`);
            setProjects(projects.filter(p => p.id !== project.id));
        } catch (err) {
            console.error('Failed to delete project', err);
            alert('Xóa dự án thất bại.');
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
        e.dataTransfer.setData('projectId', projectId);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newStatus: string) => {
        e.preventDefault();
        const projectId = e.dataTransfer.getData('projectId');
        if (!projectId) return;

        const projectToMove = projects.find(p => p.id === projectId);
        if (!projectToMove || projectToMove.status === newStatus) return;

        // Optimistic UI update
        setProjects(prevProjects => 
            prevProjects.map(p => p.id === projectId ? { ...p, status: newStatus } : p)
        );

        try {
            await api.patch(`/api/groups/${projectId}`, { status: newStatus });
        } catch (err) {
            console.error("Failed to update project status", err);
            // Revert on failure
            setProjects(prevProjects => 
                prevProjects.map(p => p.id === projectId ? { ...p, status: projectToMove.status } : p)
            );
            alert("Không thể cập nhật trạng thái dự án.");
        }
    };

    const getFilteredProjects = () => {
        let filtered = [...projects];

        // Privacy Filter
        if (privacyFilter === 'Công khai') {
            filtered = filtered.filter(p => p.privacy === 'PUBLIC');
        } else if (privacyFilter === 'Riêng tư') {
            filtered = filtered.filter(p => p.privacy === 'PRIVATE');
        }

        // Time Filter (Simplistic mock logic for now, in real app would use date comparisons)
        if (timeFilter === 'Tuần này') {
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(p => {
                const created = p.createdAt ? new Date(p.createdAt) : new Date();
                return created >= oneWeekAgo;
            });
        } else if (timeFilter === 'Tháng này') {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = filtered.filter(p => {
                const created = p.createdAt ? new Date(p.createdAt) : new Date();
                return created >= startOfMonth;
            });
        }

        return filtered;
    };

    const displayProjects = getFilteredProjects();

    const filteredUsers = searchUserQuery 
        ? allUsers.filter(u => 
            (u.fullName?.toLowerCase().includes(searchUserQuery.toLowerCase()) || 
             u.username.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
             u.email?.toLowerCase().includes(searchUserQuery.toLowerCase())) &&
            !form.members.find(m => m.id === u.id)
          ).slice(0, 5)
        : [];

    const getAvatarUrl = (user: User) => {
        if (!user.avatarUrl) return `https://ui-avatars.com/api/?name=${user.username}`;
        if (user.avatarUrl.startsWith('http')) return user.avatarUrl;
        return `${API_BASE_URL}${user.avatarUrl}`;
    };

    return (
        <div className="groupsPage-container">
            {!isMobile && <LeftSidebar />}

            <div className="groupsPage-main-wrapper">
                <div className="groupsPage">
                    {/* Header */}
                    <div className="groupsHeader" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '24px' }}>
                        <div>
                            <h1 className="groupsTitle">Dự án / Tất cả dự án</h1>
                            <p className="groupsSubtitle">Quản lý và theo dõi tiến độ công việc theo Kanban.</p>
                        </div>
                        {/* We hide the old create button here, now moved to toolbar */}
                    </div>

                    {/* Top Control Bar Area */}
                    <div className="boardToolbar">
                        <div className="viewToggles">
                            <button 
                                className={`viewBtn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                            >
                                <span className="material-symbols-outlined">view_list</span> {isMobile ? '' : 'List View'}
                            </button>
                            <button 
                                className={`viewBtn ${viewMode === 'board' ? 'active' : ''}`}
                                onClick={() => setViewMode('board')}
                            >
                                <span className="material-symbols-outlined">grid_view</span> {isMobile ? '' : 'Board View'}
                            </button>
                        </div>
                        <div className="filterControls">
                            <div className="filterGroup">
                                <span className="material-symbols-outlined" style={{fontSize: 18}}>person</span>
                                <select 
                                    className="filterSelect"
                                    value={privacyFilter}
                                    onChange={(e) => setPrivacyFilter(e.target.value)}
                                >
                                    <option>Tất cả quyền</option>
                                    <option>Công khai</option>
                                    <option>Riêng tư</option>
                                </select>
                            </div>
                            {!isMobile && (
                                <div className="filterGroup">
                                    <select 
                                        className="filterSelect"
                                        value={timeFilter}
                                        onChange={(e) => setTimeFilter(e.target.value)}
                                    >
                                        <option>Tất cả</option>
                                        <option>Tuần này</option>
                                        <option>Tháng này</option>
                                    </select>
                                </div>
                            )}
                            <button className="createCardBtn" onClick={() => setShowCreate(true)}>
                                <span>{isMobile ? '+' : '+ TẠO DỰ ÁN MỚI'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Mobile Kanban Tabs */}
                    {isMobile && viewMode === 'board' && (
                        <div className="mobileKanbanTabs">
                            {KANBAN_COLUMNS.map(col => (
                                <button 
                                    key={col.id}
                                    className={`mobileTabItem ${activeTab === col.status ? 'active' : ''} ${col.colorClass}`}
                                    onClick={() => setActiveTab(col.status)}
                                >
                                    {col.title.split(' ')[0]} {/* Short title for mobile */}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Content Area - Switch between Board and List */}
                    {viewMode === 'board' ? (
                        <div className="kanbanBoard">
                            {KANBAN_COLUMNS
                                .filter(col => !isMobile || col.status === activeTab)
                                .map(col => {
                                const columnProjects = displayProjects.filter(p => p.status === col.status);
                                return (
                                    <div key={col.id} className="kanbanColumn">
                                        <div className="kanbanColumnHeader">
                                            <div className="kColTitle">
                                                <span className="material-symbols-outlined" style={{fontSize: 16}}>add</span>
                                                {col.title}
                                            </div>
                                            <div className={`kColBadge ${col.colorClass}`}>{columnProjects.length}</div>
                                        </div>
                                        <div 
                                            className="kanbanColumnBody"
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleDrop(e, col.status)}
                                        >
                                            {columnProjects.map(project => (
                                                <div 
                                                    key={project.id} 
                                                    className="kanbanCard" 
                                                    onClick={() => handleAccessProject(project.id)}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, project.id)}
                                                >
                                                    <div className="kCardTopBar">
                                                        <div className="kCardTags">
                                                            <span className={`kTag kTagStatus ${col.colorClass}`}>
                                                                <span className="material-symbols-outlined" style={{fontSize: 12}}>interests</span>
                                                                {col.title}
                                                            </span>
                                                            <span className={`kTag kTagPrivacy ${project.privacy === 'PRIVATE' ? 'tagPrivate' : 'tagPublic'}`}>
                                                                | {project.privacy === 'PRIVATE' ? 'Private' : 'Public'}
                                                            </span>
                                                        </div>
                                                        <button className="kCardMenuBtn" onClick={(e) => { e.stopPropagation(); handleDeleteProject(e, project); }} title="Xóa dự án">
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </div>

                                                    <div className="kCardMain">
                                                        <div className="kCardIconWrapper">
                                                            <span className="material-symbols-outlined">rocket_launch</span>
                                                        </div>
                                                        <div className="kCardInfo">
                                                            <div className="kCardTitle">{project.name}</div>
                                                            <div className="kCardId">ID: PRJ-{project.id?.substring(0, 4).toUpperCase()}</div>
                                                        </div>
                                                    </div>

                                                    <div className="kCardDatesWrapper" style={{ minHeight: '44px' }}>
                                                        <div className="kCardDateRow">
                                                            <span className="material-symbols-outlined" style={{fontSize: 14}}>event_note</span>
                                                            <span>Tạo ngày: {project.createdAt ? new Date(project.createdAt).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</span>
                                                        </div>
                                                        
                                                        <div className="kCardDateRow">
                                                            <span className="material-symbols-outlined" style={{fontSize: 14}}>calendar_today</span>
                                                            {(project.startDate || project.endDate) ? (
                                                                <span>Hạn: {project.startDate ? new Date(project.startDate).toLocaleDateString('vi-VN') : '...'} - {project.endDate ? new Date(project.endDate).toLocaleDateString('vi-VN') : '...'}</span>
                                                            ) : (
                                                                <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '11px' }}>
                                                                    Chưa thiết lập hạn
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="kCardFooter">
                                                        <div className="kCardMembers">
                                                            <div className="kCardAvatars">
                                                                {project.memberAvatars?.map((avatar, i) => (
                                                                    <img key={i} src={avatar} alt="Member" className="kCardAvatarImg" />
                                                                ))}
                                                            </div>
                                                            {project.members} Thành viên
                                                        </div>
                                                        <div className="kCardPrice">
                                                            <button className="kAccessBtn">Truy cập</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="listViewContainer">
                            {isMobile ? (
                                <div className="mobileProjectCards">
                                    {displayProjects.map(project => (
                                        <div key={project.id} className="mobileProjCard" onClick={() => handleAccessProject(project.id)}>
                                            <div className="mProjCardHeader">
                                                <div className="mProjIcon">
                                                    <span className="material-symbols-outlined">rocket_launch</span>
                                                </div>
                                                <div className="mProjMeta">
                                                    <div className="mProjName">{project.name}</div>
                                                    <div className="mProjId">PRJ-{project.id?.substring(0, 4).toUpperCase()}</div>
                                                </div>
                                                <span className={`mProjStatus ${KANBAN_COLUMNS.find(c => c.status === project.status)?.colorClass}`}>
                                                    {KANBAN_COLUMNS.find(c => c.status === project.status)?.title.split(' ')[0]}
                                                </span>
                                            </div>
                                            <div className="mProjCardBody">
                                                <div className="mProjDateInfo">
                                                    <span className="material-symbols-outlined">calendar_month</span>
                                                    <span>{project.startDate ? new Date(project.startDate).toLocaleDateString('vi-VN') : '...'} - {project.endDate ? new Date(project.endDate).toLocaleDateString('vi-VN') : '...'}</span>
                                                </div>
                                                <div className="mProjMembers">
                                                    <div className="mProjAvatars">
                                                        {project.memberAvatars?.map((av, i) => (
                                                            <img key={i} src={av} alt="M" />
                                                        ))}
                                                    </div>
                                                    <span>{project.members} Thành viên</span>
                                                </div>
                                            </div>
                                            <div className="mProjCardFooter">
                                                <span className={`mPrivacyTag ${project.privacy === 'PRIVATE' ? 'isPrivate' : 'isPublic'}`}>
                                                    {project.privacy === 'PRIVATE' ? 'Riêng tư' : 'Công khai'}
                                                </span>
                                                <div className="mProjActions">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(e, project); }}>
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                    <button className="mAccessBtn">Truy cập</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <table className="projectsListTable">
                                    <thead>
                                        <tr>
                                            <th>Tên dự án</th>
                                            <th>Ngày khởi tạo</th>
                                            <th>Trạng thái</th>
                                            <th>Thành viên</th>
                                            <th>Thời hạn</th>
                                            <th>Quyền</th>
                                            <th>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayProjects.map(project => (
                                            <tr key={project.id} onClick={() => handleAccessProject(project.id)} className="clickableRow">
                                                <td>
                                                    <div className="listProjectTitle">
                                                        <span className="material-symbols-outlined projIcon">rocket_launch</span>
                                                        <div>
                                                            <div className="pName">{project.name}</div>
                                                            <div className="pId">PRJ-{project.id?.substring(0, 4).toUpperCase()}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500, color: '#4b5563' }}>
                                                        {project.createdAt ? new Date(project.createdAt).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`listStatusBadge ${KANBAN_COLUMNS.find(c => c.status === project.status)?.colorClass}`}>
                                                        {KANBAN_COLUMNS.find(c => c.status === project.status)?.title}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="listMembers">
                                                        <div className="listAvatars">
                                                            {project.memberAvatars?.map((av, i) => (
                                                                <img key={i} src={av} alt="M" />
                                                            ))}
                                                        </div>
                                                        <span>{project.members} CTV</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="listDates">
                                                        {project.startDate ? new Date(project.startDate).toLocaleDateString('vi-VN') : '...'} - {project.endDate ? new Date(project.endDate).toLocaleDateString('vi-VN') : '...'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`privacyTag ${project.privacy === 'PRIVATE' ? 'isPrivate' : 'isPublic'}`}>
                                                        {project.privacy === 'PRIVATE' ? 'Riêng tư' : 'Công khai'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="listActions">
                                                        <button className="rowActionBtn" onClick={(e) => { e.stopPropagation(); handleDeleteProject(e, project); }}>
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                        <button className="rowActionBtn access" onClick={(e) => { e.stopPropagation(); handleAccessProject(project.id); }}>
                                                            <span className="material-symbols-outlined">login</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {displayProjects.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                                    Không có dự án nào khớp với bộ lọc.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Create Project Modal */}
                    {showCreate && (
                        <div className="modalBackdrop" onClick={() => setShowCreate(false)}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <h3 className="modalTitle">Tạo dự án mới</h3>
                                <div className="formRow">
                                    <label className="formLabel">Tên dự án</label>
                                    <input
                                        className="formInput"
                                        placeholder="Nhập tên dự án..."
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>
                                <div className="formRow">
                                    <label className="formLabel">Mô tả</label>
                                    <textarea
                                        className="formTextarea"
                                        placeholder="Khái quát thông tin dự án..."
                                        value={form.description}
                                        onChange={e => setForm({ ...form, description: e.target.value })}
                                    />
                                </div>
                                
                                <div className="formRowGroup">
                                    <div className="formRow">
                                        <label className="formLabel">Thời gian bắt đầu</label>
                                        <input
                                            type="date"
                                            className="formInput"
                                            value={form.startDate}
                                            onChange={e => setForm({ ...form, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div className="formRow">
                                        <label className="formLabel">Thời gian kết thúc</label>
                                        <input
                                            type="date"
                                            className="formInput"
                                            value={form.endDate}
                                            onChange={e => setForm({ ...form, endDate: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="formRow">
                                    <label className="formLabel">Thêm thành viên</label>
                                    <div className="membersInputWrap" style={{ position: 'relative' }}>
                                        <input
                                            className="formInput"
                                            placeholder="Tìm theo tên hoặc email..."
                                            value={searchUserQuery}
                                            onChange={e => setSearchUserQuery(e.target.value)}
                                        />
                                        <button className="addMemberBtn"><span className="material-symbols-outlined">search</span></button>
                                        
                                        {/* Dropdown for search results */}
                                        {filteredUsers.length > 0 && (
                                            <div className="userSearchResults">
                                                {filteredUsers.map(user => (
                                                    <div 
                                                        key={user.id} 
                                                        className="userResultItem"
                                                        onClick={() => {
                                                            setForm({ ...form, members: [...form.members, user] });
                                                            setSearchUserQuery('');
                                                        }}
                                                    >
                                                        <img src={getAvatarUrl(user)} alt="Avatar" />
                                                        <div className="userInfoBlock">
                                                            <div className="uName">{user.fullName || user.username}</div>
                                                            <div className="uEmail">{user.email || `@${user.username}`}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="selectedMembers">
                                        {form.members.map(member => (
                                            <span key={member.id} className="memberTag">
                                                <img src={getAvatarUrl(member)} alt="Avatar" />
                                                {member.fullName || member.username}
                                                <button 
                                                    className="removeTag"
                                                    onClick={() => setForm({ ...form, members: form.members.filter(m => m.id !== member.id) })}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="formRow">
                                    <label className="formLabel">Quyền riêng tư</label>
                                    <select
                                        className="formInput"
                                        value={form.privacy}
                                        onChange={e => setForm({ ...form, privacy: e.target.value })}
                                    >
                                        <option value="Public">Công khai</option>
                                        <option value="Private">Riêng tư</option>
                                    </select>
                                </div>
                                <div className="modalActions">
                                    <button className="btnCancel" onClick={() => setShowCreate(false)}>Hủy</button>
                                    <button 
                                        className="btnCreate" 
                                        onClick={async () => {
                                            if (!form.name.trim()) {
                                                alert('Vui lòng nhập tên dự án!');
                                                return;
                                            }
                                            
                                            try {
                                                const projectData = {
                                                    name: form.name,
                                                    description: form.description || 'Dự án mới',
                                                    type: 'Project',
                                                    isProject: true,
                                                    privacy: form.privacy,
                                                    projectStartDate: form.startDate ? new Date(form.startDate).toISOString() : null,
                                                    projectEndDate: form.endDate ? new Date(form.endDate).toISOString() : null,
                                                    memberIds: form.members.map(m => m.id || (m as any).Id)
                                                };
                                                
                                                const p = await api.post<any>('/api/groups', projectData);
                                                
                                                const newProject: Project = {
                                                    id: p.id,
                                                    name: p.name,
                                                    description: p.description,
                                                    members: p.memberIds?.length || 1,
                                                    category: 'Dự án',
                                                    privacy: (p.privacy || 'PRIVATE').toUpperCase() as 'PUBLIC' | 'PRIVATE',
                                                    coverImage: p.coverUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
                                                    status: p.status || 'New',
                                                    startDate: p.projectStartDate,
                                                    endDate: p.projectEndDate,
                                                    createdAt: p.createdAt || new Date().toISOString(),
                                                    memberAvatars: Array.from({length: Math.min(p.memberIds?.length || 1, 3)}).map((_, i) => 
                                                        `https://ui-avatars.com/api/?name=M${i+1}&background=random&color=fff&size=32`
                                                    )
                                                };
                                                
                                                setProjects([newProject, ...projects]);
                                                setForm({ 
                                                    name: '', description: '', privacy: 'Public', 
                                                    startDate: '', endDate: '', members: [] 
                                                });
                                                setSearchUserQuery('');
                                                setShowCreate(false);
                                            } catch (err) {
                                                console.error('Create project failed', err);
                                                alert('Lỗi khi tạo dự án.');
                                            }
                                        }}
                                    >
                                        Khởi tạo
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <BottomNavigation />
        </div>
    );
}
