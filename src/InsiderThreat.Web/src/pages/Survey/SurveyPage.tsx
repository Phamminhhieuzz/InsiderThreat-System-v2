import React, { useState, useEffect } from 'react';
import { message, Spin, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import NavigationBar from '../../components/NavigationBar';
import LeftSidebar from '../../components/LeftSidebar';
import ChatSidebar from '../../components/chat/ChatSidebar';
import BottomNavigation from '../../components/BottomNavigation';
import { feedService } from '../../services/feedService';
import { authService } from '../../services/auth';
import PostCard from '../../components/social/PostCard';
import SurveyCreator from './components/SurveyCreator';
import './SurveyPage.css';


const { TabPane } = Tabs;

const SurveyPage: React.FC = () => {
    const { t } = useTranslation();
    const user = authService.getCurrentUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Giám đốc' || user?.role === 'Director';

    const [surveys, setSurveys] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active');

    const fetchSurveys = async () => {
        try {
            setLoading(true);
            const data = await feedService.getPosts(); // I'll filter for Category: "Surveys"
            const filtered = data.posts.filter((p: any) => p.category === 'Surveys');
            setSurveys(filtered);
        } catch (error) {
            console.error('Failed to fetch surveys', error);
            message.error('Không thể tải danh sách khảo sát');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSurveys();
    }, []);

    const handleSurveyCreated = (newSurvey: any) => {
        setSurveys([newSurvey, ...surveys]);
        setActiveTab('active');
    };

    const handlePostUpdated = (postId: string, updatedPost: any) => {
        setSurveys(prev => prev.map(p => p.id === postId ? updatedPost : p));
    };

    const handlePostDeleted = (postId: string) => {
        setSurveys(prev => prev.filter(p => p.id !== postId));
    };

    return (
        <div className="survey-layout-wrapper">
            <NavigationBar />
            
            <div className="social-layout">
                <LeftSidebar />

                <div className="feed-wrapper">
                    <div className="survey-container">
                        {/* Header Banner - Liquid Glass */}
                        <div className="survey-hero-banner">
                            <div className="banner-glow-effect" />
                            <div className="banner-content">
                                <div className="flex items-center gap-5">
                                    <div className="hero-icon">🗳️</div>
                                    <div>
                                        <h1 className="text-3xl font-black text-white tracking-tight">TRUNG TÂM KHẢO SÁT</h1>
                                        <p className="text-blue-100/90 font-medium mt-1">Lắng nghe và thấu hiểu để xây dựng văn hóa doanh nghiệp vững mạnh 🚀</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="survey-tabs-container">
                            <Tabs activeKey={activeTab} onChange={setActiveTab} centered className="premium-tabs">
                                <TabPane 
                                    tab={<span><span className="material-symbols-outlined align-middle mr-2">explore</span>{t('survey.active', 'Khảo sát đang diễn ra')}</span>} 
                                    key="active" 
                                />
                                {isAdmin && (
                                    <TabPane 
                                        tab={<span><span className="material-symbols-outlined align-middle mr-2">add_task</span>{t('survey.create', 'Tạo khảo sát mới')}</span>} 
                                        key="create" 
                                    />
                                )}
                                <TabPane 
                                    tab={<span><span className="material-symbols-outlined align-middle mr-2">analytics</span>{t('survey.all', 'Tất cả khảo sát')}</span>} 
                                    key="all" 
                                />
                            </Tabs>
                        </div>

                        <div className="survey-content-area">
                            {activeTab === 'create' && isAdmin ? (
                                <SurveyCreator onCreated={handleSurveyCreated} />
                            ) : loading ? (
                                <div className="flex justify-center py-20"><Spin size="large" /></div>
                            ) : (
                                <div className="space-y-6">
                                    {surveys.length === 0 ? (
                                        <div className="empty-survey-state">
                                            <div className="empty-icon">🍃</div>
                                            <h3>{t('survey.no_surveys', 'Chưa có khảo sát nào')}</h3>
                                            <p>{t('survey.check_later', 'Vui lòng quay lại sau hoặc liên hệ HR để biết thêm chi tiết.')}</p>
                                        </div>
                                    ) : (
                                        surveys.map(item => (
                                            <PostCard 
                                                key={item.id} 
                                                post={item} 
                                                onPostUpdated={handlePostUpdated}
                                                onPostDeleted={handlePostDeleted}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <ChatSidebar onContactClick={() => {}} />
            </div>

            <BottomNavigation />
        </div>
    );
};

export default SurveyPage;
