import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LeftSidebar from '../components/LeftSidebar';
import BottomNavigation from '../components/BottomNavigation';
import GroupDashboardTab from '../components/groups/GroupDashboardTab';
import MyTaskTab from '../components/groups/MyTaskTab';
import TimelineTab from '../components/groups/TimelineTab';
import FilesTab from '../components/groups/FilesTab';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import SynchroHeader from '../components/SynchroHeader';
import './GroupDetailPage.css';


const TABS = [
    { key: 'dashboard', label: 'project_detail.tabs.dashboard', icon: 'dashboard' },
    { key: 'mytask', label: 'project_detail.tabs.mytasks', icon: 'task_alt' },
    { key: 'timeline', label: 'project_detail.tabs.timeline', icon: 'timeline' },
    { key: 'files', label: 'project_detail.tabs.files', icon: 'folder' },
];

export default function GroupDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [groupName, setGroupName] = useState<string>('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const fetchGroupName = async () => {
            try {
                const res = await api.get<any>(`/api/groups/${id}`);
                setGroupName(res.name || res.Name || '');
            } catch (err) {
                console.error('Failed to fetch group name', err);
            }
        };
        if (id) fetchGroupName();
    }, [id]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <GroupDashboardTab />;
            case 'mytask': return <MyTaskTab />;
            case 'timeline': return <TimelineTab />;
            case 'files': return <FilesTab />;
            default: return null;
        }
    };

    const handleDeleteProject = async () => {
        const confirmDelete = window.confirm(t('groups.confirm_delete_msg', { name: groupName }));
        if (!confirmDelete) return;

        try {
            await api.delete(`/api/groups/${id}`);
            navigate('/groups');
        } catch (err) {
            console.error('Failed to delete project', err);
            alert(t('groups.delete_fail', 'Xóa dự án thất bại.'));
        }
    };

    return (
        <div className="groupDetail-container">
            {/* DEBUG MARKER */}
            {!isMobile && <LeftSidebar defaultCollapsed={true} />}
            
            <div className="groupDetail-main-wrapper">
                <main className="groupDetail">
                    {/* Header Section */}
                    {/* HEADER THEO THIẾT KẾ MỚI */}
                    <SynchroHeader 
                        breadcrumb={[
                            { label: t('project_detail.breadcrumbs.workspace') },
                            { label: t('project_detail.breadcrumbs.projects') },
                            { label: groupName || t('library.loading'), active: true }
                        ]} 
                    />

                    <div className="groupDetail-top-section">
                        {/* Sub-Header / Tab Navigation */}
                        <div className="groupDetail-tabs-wrapper">
                            <div className="groupDetail-tabs">
                                {TABS.map(tab => (
                                    <button
                                        key={tab.key}
                                        className={`tabItem ${activeTab === tab.key ? 'active' : ''}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        <span className="material-symbols-outlined">{tab.icon}</span>
                                        {t(tab.label)}
                                    </button>
                                ))}
                            </div>
                            <div className="project-actions">
                                <button className="proj-action-btn">
                                    <span className="material-symbols-outlined">settings</span>
                                </button>
                                {!['1', '2', '3', '4'].includes(id || '') && (
                                    <button 
                                        className="proj-action-btn delete" 
                                        onClick={handleDeleteProject}
                                        title={t('project_detail.header.btn_delete')}
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                )}
                                <button className="proj-action-btn">
                                    <span className="material-symbols-outlined">more_horiz</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="groupDetail-body">
                        {renderContent()}
                    </div>
                </main>
            </div>
            
            {isMobile && <BottomNavigation />}
        </div>
    );
}
