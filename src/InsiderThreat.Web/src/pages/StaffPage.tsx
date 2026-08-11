import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { userService } from '../services/userService';
import { API_BASE_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import type { User } from '../types';
import BottomNavigation from '../components/BottomNavigation';
import LeftSidebar from '../components/LeftSidebar';
import './StaffPage.css';


function getInitials(name: string) {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
    '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
    '#0891b2', '#d97706', '#dc2626', '#65a30d', '#9333ea'
];
function getColor(name: string) {
    let h = 0; for (const c of name) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length;
    return AVATAR_COLORS[h];
}

// Removed static DEPARTMENTS_DATA

export default function StaffPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const userProfile = authService.getCurrentUser();
    const isAdmin = userProfile?.role?.toLowerCase().includes('admin') ||
                    userProfile?.role?.toLowerCase() === 'giám đốc' ||
                    userProfile?.role?.toLowerCase() === 'director' ||
                    userProfile?.username?.toLowerCase() === 'admin';
    const [users, setUsers] = useState<User[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);

        userService.getAllUsers()
            .then(data => setUsers(data))
            .catch(() => { })
            .finally(() => setLoading(false));

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Dynamically calculate department statistics based on fetched users
    const dynamicDepartments = useMemo(() => {
        const counts: Record<string, number> = {};
        users.forEach(u => {
            if (u.department) {
                counts[u.department] = (counts[u.department] || 0) + 1;
            }
        });

        // Base departments with their specific icons/colors
        const defaultDepts = [
            { id: 'marketing', name: 'Marketing', count: 0, icon: 'groups', color: '#3b82f6' },
            { id: 'tech', name: t('staff.dept_tech', 'Kỹ thuật'), count: 0, icon: 'code', color: '#8b5cf6' },
            { id: 'accounting', name: t('staff.dept_accounting', 'Kế toán'), count: 0, icon: 'account_balance', color: '#f59e0b' },
            { id: 'hr', name: t('staff.dept_hr', 'Nhân sự'), count: 0, icon: 'badge', color: '#10b981' }
        ];

        defaultDepts.forEach(d => {
            if (counts[d.name]) {
                d.count = counts[d.name];
                delete counts[d.name];
            }
        });

        // Add any additional departments from the database
        const extraDepts = Object.entries(counts).map(([name, count]) => ({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name: name,
            count: count,
            icon: 'domain',
            color: '#64748b' // default slate color
        }));

        return [...defaultDepts, ...extraDepts];
    }, [users, t]);

    const getAvatarUrl = (user: User) => {
        if (!user.avatarUrl) return '';
        if (user.avatarUrl.startsWith('http')) return user.avatarUrl;
        return `${API_BASE_URL}${user.avatarUrl}`;
    };

    const getRoleClass = (roleOrPosition?: string) => {
        if (!roleOrPosition) return 'role-staff';
        const r = roleOrPosition.toLowerCase();
        if (r.includes('admin')) return 'role-admin';
        if (r.includes('quản lý') || r.includes('manager') || r.includes('trưởng phòng') || r.includes('phó phòng')) return 'role-manager';
        if (r.includes('giám đốc') || r.includes('director')) return 'role-director';
        return 'role-staff';
    };

    const suggestions = users.slice(0, 3);

    return (
        <div className="staffPageContainer">
            {!isMobile && <LeftSidebar />}

            <div className="staffMainWrapper">
                {/* Header */}
                <header className="staffHeaderMobile">
                    <div className="headerLeft">
                        <h1 className="staffTitleMobile">{t('staff.title', 'Nhân sự')}</h1>
                    </div>
                    <div className="headerActions">
                        <button className="actionBtn orgChartBtn" onClick={() => navigate('/org-chart')}>
                            <span className="material-symbols-outlined">account_tree</span>
                            <span>{t('staff.view_chart', 'Sơ đồ tổ chức')}</span>
                        </button>
                        {isAdmin && (
                            <button className="actionBtn configBtn" onClick={() => navigate('/org-chart/config')}>
                                <span className="material-symbols-outlined">settings_accessibility</span>
                            </button>
                        )}
                        <button className="actionBtn addStaffBtnPrimary">
                            <span className="material-symbols-outlined">person_add</span>
                        </button>
                    </div>
                </header>

                {/* Search */}
                <div className="staffSearchMobile">
                    <div className="staffSearchInputWrapper">
                        <span className="material-symbols-outlined">search</span>
                        <input
                            type="text"
                            placeholder={t('staff.search_placeholder', "Tìm kiếm đồng nghiệp...")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <main className="staffMainContent">
                    {/* Suggestions Section */}
                    <section className="staffSection">
                        <div className="staffSectionHeader">
                            <h2>{t('staff.section_suggestions', 'GỢI Ý LIÊN HỆ')}</h2>
                            <span className="material-symbols-outlined">chevron_right</span>
                        </div>
                        <div className="suggestionsList">
                            {suggestions.map(user => {
                                const avatarUrl = getAvatarUrl(user);
                                const name = user.fullName || user.username || 'User';
                                return (
                                    <div key={user.id} className="suggestionItem">
                                        <div className="suggestionLeft">
                                            <div
                                                className="suggestionAvatar"
                                                style={avatarUrl
                                                    ? { backgroundImage: `url(${avatarUrl})` }
                                                    : { background: getColor(name) }
                                                }
                                            >
                                                {!avatarUrl && <span>{getInitials(name)}</span>}
                                                <div className="onlineIndicator" />
                                            </div>
                                            <div className="suggestionInfo">
                                                <div className="nameBadgeRow">
                                                    <h3>{name}</h3>
                                                    {(user.position || user.role) && (
                                                        <span className={`roleBadge ${getRoleClass(user.position || user.role)}`}>
                                                            {user.position || user.role}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="statusText">{t('staff.status_online', 'ĐANG ONLINE')}</span>
                                            </div>
                                        </div>
                                        <button className="chatQuickBtn" onClick={() => navigate(`/chat?userId=${user.id}`)}>
                                            <span className="material-symbols-outlined">chat</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Departments Section */}
                    <section className="staffSection">
                        <div className="staffSectionHeader">
                            <h2>{t('staff.section_departments', 'PHÒNG BAN')}</h2>
                        </div>
                        <div className="deptGridMobile">
                            {dynamicDepartments.map((dept: any) => (
                                <div key={dept.id} className="deptCardMobile">
                                    <div className="deptIconWrapper" style={{ backgroundColor: `${dept.color}15`, color: dept.color }}>
                                        <span className="material-symbols-outlined">{dept.icon}</span>
                                    </div>
                                    <div className="deptCardInfo">
                                        <h3>{dept.name}</h3>
                                        <span>{dept.count} {t('staff.employee_count', 'nhân viên')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </main>

                {isMobile && <BottomNavigation />}
            </div>
        </div>
    );
}
