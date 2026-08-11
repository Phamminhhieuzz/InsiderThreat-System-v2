import React from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import styles from './WelcomeSection.module.css';
import welcomeBannerImg from '../assets/welcome-banner.png';

const WelcomeSection: React.FC = () => {
    const { t } = useTranslation();
    const user = authService.getCurrentUser();
    const hour = new Date().getHours();

    let greeting = '';
    if (hour < 12) {
        greeting = t('common.good_morning', 'Chào buổi sáng');
    } else if (hour < 18) {
        greeting = t('common.good_afternoon', 'Chào buổi chiều');
    } else {
        greeting = t('common.good_evening', 'Chào buổi tối');
    }

    return (
        <div className={styles.welcomeSection}>
            <img
                src={welcomeBannerImg}
                alt="Welcome banner"
                className={styles.backgroundImage}
            />
            <div className={styles.overlay} />
            <div className={styles.content}>
                <div className={styles.tagBadge}>
                    <span className={styles.tagDot} />
                    BẢNG TIN NÓNG HỔI
                </div>
                <h1 className={styles.greeting}>
                    {greeting}, <span className={styles.name}>{user?.fullName || user?.username}</span>
                </h1>
                <p className={styles.subtitle}>
                    {t('feed.explore_insights', 'Khám phá những tin tức mới nhất từ mạng lưới của bạn.')}
                </p>
            </div>
        </div>
    );
};

export default WelcomeSection;
