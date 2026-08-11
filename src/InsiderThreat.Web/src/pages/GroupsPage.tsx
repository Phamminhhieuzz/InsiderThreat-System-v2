import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import { userService } from '../services/userService';
import { api, API_BASE_URL } from '../services/api';
import type { User } from '../types';
import './GroupsPage.css';


interface Group {
    id: string;
    name: string;
    members: number;
    description: string;
    privacy: 'PRIVATE' | 'PUBLIC';
    category: string;
    coverImage?: string;
    adminIds?: string[];
}

export default function GroupsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    const MOCK_GROUPS: Group[] = [
        {
            id: '1',
            name: t('groups.group1_name', 'Phòng Phát Triển Sản Phẩm'),
            members: 55,
            description: t('groups.group1_desc', 'Nơi thảo luận về chiến lược sản phẩm và đổi mới sáng tạo.'),
            privacy: 'PRIVATE',
            category: t('groups.cat_department', 'Phòng ban'),
            coverImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=200&fit=crop',
            adminIds: []
        },
        {
            id: '2',
            name: t('groups.group2_name', 'Hội Những Người Thích Cà Phê'),
            members: 120,
            description: t('groups.group2_desc', 'Chia sẻ các loại cà phê ngon, địa điểm thú vị và mẹo pha chế.'),
            privacy: 'PUBLIC',
            category: t('groups.cat_hobby', 'Sở thích'),
            coverImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=200&fit=crop',
            adminIds: []
        },
        {
            id: '3',
            name: t('groups.group3_name', 'Kỹ thuật & Công nghệ'),
            members: 88,
            description: t('groups.group3_desc', 'Chia sẻ kiến thức kỹ thuật, debug tips và best practices.'),
            privacy: 'PUBLIC',
            category: t('groups.cat_expertise', 'Chuyên môn'),
            coverImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=200&fit=crop',
            adminIds: []
        },
        {
            id: '4',
            name: t('groups.group4_name', 'HR & Văn hóa doanh nghiệp'),
            members: 32,
            description: t('groups.group4_desc', 'Cập nhật chính sách, hoạt động nội bộ và văn hóa công ty.'),
            privacy: 'PRIVATE',
            category: t('groups.cat_department', 'Phòng ban'),
            coverImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=200&fit=crop',
            adminIds: []
        },
    ];

    // Hooks for UI state
    const [groups, setGroups] = useState<Group[]>(MOCK_GROUPS);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ 
        name: '', description: '', privacy: 'Public', 
        startDate: '', endDate: '', members: [] as User[] 
    });
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [searchUserQuery, setSearchUserQuery] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (showCreate) {
            userService.getAllUsers().then(setAllUsers).catch(console.error);
        }
    }, [showCreate]);

    useEffect(() => {
        const loadGroups = async () => {
            try {
                const fetchedGroups = await api.get<any[]>('/api/groups?isProject=false');
                const realGroups = fetchedGroups
                    .filter(p => !['1', '2', '3', '4'].includes(p.id))
                    .map(p => ({
                        id: p.id,
                        name: p.name,
                        description: p.description,
                        members: p.memberIds?.length || 1,
                        category: p.type === 'Team' ? 'Nhóm' : 'Cộng đồng',
                        privacy: (p.privacy || 'PUBLIC').toUpperCase() as 'PUBLIC' | 'PRIVATE',
                        coverImage: p.coverUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=200&fit=crop',
                        adminIds: p.adminIds || []
                    }));
                setGroups([...realGroups, ...MOCK_GROUPS]);
            } catch (err) {
                console.error("Failed to fetch groups", err);
            }
        };
        loadGroups();
    }, []);

    const handleAccessGroup = (groupId: string) => {
        // Cộng đồng (Community) -> Chuyển trực tiếp đến kênh Chat/Thảo luận
        navigate(`/chat?groupId=${groupId}`);
    };

    const handleDeleteGroup = async (e: React.MouseEvent, group: Group) => {
        e.stopPropagation();
        
        const confirmDelete = window.confirm(t('groups.confirm_delete_msg', { name: group.name }));
        if (!confirmDelete) return;

        try {
            await api.delete(`/api/groups/${group.id}`);
            setGroups(groups.filter(g => g.id !== group.id));
        } catch (err) {
            console.error('Failed to delete group', err);
            alert(t('groups.delete_fail', 'Xóa nhóm thất bại.'));
        }
    };

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
                    <div className="groupsHeader">
                        <div>
                            <h1 className="groupsTitle">{t('groups.title', 'Cộng đồng')}</h1>
                            <p className="groupsSubtitle">{t('groups.subtitle', 'Khám phá và kết nối với các đồng nghiệp cùng sở thích.')}</p>
                        </div>
                        <button className="createGroupBtn" onClick={() => setShowCreate(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>group_add</span>
                            {t('groups.btn_create_group', 'TẠO NHÓM MỚI')}
                        </button>
                    </div>

                    {/* "Your Groups" Section */}
                    <div className="sectionTitle">{t('groups.section_your_groups', 'Nhóm của bạn')}</div>
                    <div className="groupsGrid">
                        {groups.map(group => (
                            <div key={group.id} className="groupCard">
                                <div className="groupCoverWrap">
                                    {group.coverImage ? (
                                        <img src={group.coverImage} alt={group.name} className="groupCoverImg" />
                                    ) : (
                                        <div className="groupCoverPlaceholder">
                                            <span className="material-symbols-outlined">groups</span>
                                        </div>
                                    )}
                                    <span className={`privacyBadge ${group.privacy === 'PRIVATE' ? 'badgePrivate' : 'badgePublic'}`}>
                                        {group.privacy}
                                    </span>
                                    {!['1', '2', '3', '4'].includes(group.id) && group.adminIds?.includes(currentUser.id) && (
                                        <button 
                                            className="deleteGroupBtn" 
                                            onClick={(e) => handleDeleteGroup(e, group)}
                                            title={t('groups.btn_delete')}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                        </button>
                                    )}
                                </div>
                                <div className="groupBody">
                                    <div className="groupName">{group.name}</div>
                                    <div className="groupMeta">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>group</span>
                                        {group.members} {t('groups.members_count', 'THÀNH VIÊN')}
                                        {group.category && <> • {group.category}</>}
                                    </div>
                                    <div className="groupDesc">{group.description}</div>
                                    <button className="accessBtn" onClick={() => handleAccessGroup(group.id)}>
                                        {t('groups.btn_access', 'TRUY CẬP')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Create Group Modal */}
                    {showCreate && (
                        <div className="modalBackdrop" onClick={() => setShowCreate(false)}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <h3 className="modalTitle">{t('groups.modal_title', 'Tạo nhóm mới')}</h3>
                                <div className="formRow">
                                    <label className="formLabel">{t('groups.lbl_group_name', 'Tên nhóm')}</label>
                                    <input
                                        className="formInput"
                                        placeholder={t('groups.placeholder_name', "Nhập tên nhóm...")}
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>
                                <div className="formRow">
                                    <label className="formLabel">Mô tả</label>
                                    <textarea
                                        className="formTextarea"
                                        placeholder="Mô tả ngắn về nội dung nhóm..."
                                        value={form.description}
                                        onChange={e => setForm({ ...form, description: e.target.value })}
                                    />
                                </div>

                                <div className="formRow">
                                    <label className="formLabel">Thêm thành viên nhóm</label>
                                    <div className="membersInputWrap" style={{ position: 'relative' }}>
                                        <input
                                            className="formInput"
                                            placeholder="Nhập tên hoặc email tài khoản thực tế..."
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
                                    <label className="formLabel">{t('groups.lbl_privacy', 'Quyền riêng tư')}</label>
                                    <select
                                        className="formInput"
                                        value={form.privacy}
                                        onChange={e => setForm({ ...form, privacy: e.target.value })}
                                    >
                                        <option value="Public">{t('groups.privacy_public', 'Công khai')}</option>
                                        <option value="Private">{t('groups.privacy_private', 'Riêng tư')}</option>
                                    </select>
                                </div>
                                <div className="modalActions">
                                    <button className="btnCancel" onClick={() => setShowCreate(false)}>{t('groups.btn_cancel', 'Hủy')}</button>
                                    <button 
                                        className="btnCreate" 
                                        onClick={async () => {
                                            if (!form.name.trim()) {
                                                alert('Vui lòng nhập tên nhóm!');
                                                return;
                                            }
                                            
                                            try {
                                                const groupData = {
                                                    name: form.name,
                                                    description: form.description || 'Nhóm mới',
                                                    type: 'Community',
                                                    isProject: false,
                                                    privacy: form.privacy,
                                                    memberIds: form.members.map(m => m.id || (m as any).Id)
                                                };
                                                
                                                // Post to backend API
                                                const p = await api.post<any>('/api/groups', groupData);
                                                
                                                const newGroup: Group = {
                                                    id: p.id,
                                                    name: p.name,
                                                    description: p.description,
                                                    members: p.memberIds?.length || 1,
                                                    category: 'Dự án',
                                                    privacy: (p.privacy || 'PRIVATE').toUpperCase() as 'PUBLIC' | 'PRIVATE',
                                                    coverImage: p.coverUrl || `https://picsum.photos/seed/${Date.now()}/400/200`
                                                };
                                                
                                                setGroups([newGroup, ...groups]);
                                                setForm({ 
                                                    name: '', description: '', privacy: 'Public', 
                                                    startDate: '', endDate: '', members: [] 
                                                });
                                                setSearchUserQuery('');
                                                setShowCreate(false);
                                            } catch (err) {
                                                console.error('Create group failed', err);
                                                alert('Lỗi khi tạo nhóm.');
                                            }
                                        }}
                                    >
                                        {t('groups.btn_confirm_create', 'Tạo nhóm mới')}
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
