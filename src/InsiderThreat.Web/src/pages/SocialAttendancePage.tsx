import { useState, useEffect } from 'react';
import BottomNavigation from '../components/BottomNavigation';
import LeftSidebar from '../components/LeftSidebar';
import AttendancePage from './AttendancePage';
import './StaffPage.css';
 // Reusing StaffPage layout styles

export default function SocialAttendancePage() {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="staffPageContainer">
            {!isMobile && <LeftSidebar />}

            <div className="staffMainWrapper" style={{ overflowY: 'auto', background: 'var(--color-bg)' }}>
                <main style={{ padding: 0, minHeight: 'calc(100vh - 60px)' }}>
                    {/* Reuse the existing AttendancePage for content */}
                    <AttendancePage />
                </main>

                {isMobile && <BottomNavigation />}
            </div>
        </div>
    );
}
