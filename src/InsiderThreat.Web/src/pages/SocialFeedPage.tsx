import { Layout } from 'antd';
import SocialHeader from '../components/social/SocialHeader';
import LeftSidebar from '../components/social/LeftSidebar';
import FeedCenter from '../components/social/FeedCenter';
import RightSidebar from '../components/social/RightSidebar';
import styles from './SocialFeedPage.module.css';

const { Content } = Layout;

const SocialFeedPage = () => {
    return (
        <Layout className={styles.layout}>
            <SocialHeader />
            <Content className={styles.content}>
                <div className={styles.container}>
                    <LeftSidebar />
                    <FeedCenter />
                    <RightSidebar />
                </div>
            </Content>
        </Layout>
    );
};

export default SocialFeedPage;
