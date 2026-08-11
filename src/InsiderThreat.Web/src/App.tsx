import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { setStaticInstances } from './utils/antdStatic';

// Bridge component: captures context-aware antd APIs and stores them globally
function AntdStaticHolder() {
  const { message, notification, modal } = AntdApp.useApp();
  useEffect(() => {
    setStaticInstances(message, notification, modal);
  }, [message, notification, modal]);
  return null;
}
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsbMonitorPage from './pages/UsbMonitorPage';
import DocumentsPage from './pages/DocumentsPage';
import FaceLoginPage from './pages/FaceLoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import FeedPage from './pages/FeedPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import SurveyPage from './pages/Survey/SurveyPage';
import StaffPage from './pages/StaffPage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import InboxPage from './pages/InboxPage';
import LibraryPage from './pages/LibraryPage';
import SocialAttendancePage from './pages/SocialAttendancePage';
import MeetPage from './pages/MeetPage';
import MonitorLogsPage from './pages/MonitorLogsPage';
import WatchdogPage from './pages/WatchdogPage';
import SecurityApprovalsPage from './pages/SecurityApprovalsPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import OrgChartPage from './pages/OrgChart/OrgChartPage';
import OrgChartConfigPage from './pages/Admin/OrgChartConfigPage';
import MyLeavePage from './pages/LeaveManagement/MyLeavePage';
import LeaveApprovalsPage from './pages/LeaveManagement/LeaveApprovalsPage';
import TimesheetReportPage from './pages/LeaveManagement/TimesheetReportPage';
import WorkspacePage from './pages/WorkspacePage';
import { NotificationProvider } from './contexts/NotificationContext';
import NotificationToast from './components/NotificationToast';
import { ChatWidget } from './components/ChatWidget';
import UsbNotification from './components/UsbNotification';
import MonitorNotification from './components/MonitorNotification';
import { useTheme } from './context/ThemeContext';
import './App.css';

// Component bảo vệ route - kiểm tra đăng nhập
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// Redirect dựa trên role
function RoleBasedRedirect() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    const role = user.role?.toLowerCase();
    if (role === 'admin' || role === 'giám đốc' || role === 'director') {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/workspace" replace />;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const { theme: currentTheme } = useTheme();
  const { i18n } = useTranslation();
  const isDarkMode = currentTheme === 'dark';

  useEffect(() => {
    const handleStorageChange = () => {
      setIsLoggedIn(!!localStorage.getItem('token'));
    };
    window.addEventListener('storage', handleStorageChange);
    // Tự động kiểm tra token mỗi giây để UI phản ứng nhanh khi login/logout
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <ConfigProvider 
      locale={i18n.language === 'en' ? enUS : viVN}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563eb', // Maintain primary color
        }
      }}
    >
      <AntdApp>
        <AntdStaticHolder />
        <BrowserRouter>
          <NotificationProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/face-login" element={<FaceLoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
              <Route path="/usb-monitor" element={<PrivateRoute><UsbMonitorPage /></PrivateRoute>} />
              <Route path="/documents" element={<PrivateRoute><DocumentsPage /></PrivateRoute>} />
              <Route path="/profile/:userId" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              <Route path="/feed" element={<PrivateRoute><FeedPage /></PrivateRoute>} />
              <Route path="/surveys" element={<PrivateRoute><SurveyPage /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              <Route path="/staff" element={<PrivateRoute><StaffPage /></PrivateRoute>} />
              <Route path="/groups" element={<PrivateRoute><GroupsPage /></PrivateRoute>} />
              <Route path="/groups/:id" element={<PrivateRoute><GroupDetailPage /></PrivateRoute>} />
              <Route path="/projects" element={<PrivateRoute><ProjectsPage /></PrivateRoute>} />
              <Route path="/projects/:id" element={<PrivateRoute><ProjectDetailPage /></PrivateRoute>} />
              <Route path="/inbox" element={<PrivateRoute><InboxPage /></PrivateRoute>} />
              <Route path="/library" element={<PrivateRoute><LibraryPage /></PrivateRoute>} />
              <Route path="/attendance" element={<PrivateRoute><SocialAttendancePage /></PrivateRoute>} />
              <Route path="/meet" element={<PrivateRoute><MeetPage /></PrivateRoute>} />
              <Route path="/monitor-logs" element={<PrivateRoute><DashboardPage defaultTab="monitor-logs" /></PrivateRoute>} />
              <Route path="/watchdog" element={<PrivateRoute><DashboardPage defaultTab="watchdog" /></PrivateRoute>} />
              <Route path="/security-approvals" element={<PrivateRoute><SecurityApprovalsPage /></PrivateRoute>} />
              <Route path="/org-chart" element={<PrivateRoute><OrgChartPage /></PrivateRoute>} />
              <Route path="/my-leave" element={<PrivateRoute><MyLeavePage /></PrivateRoute>} />
              <Route path="/leave-approvals" element={<PrivateRoute><LeaveApprovalsPage /></PrivateRoute>} />
              <Route path="/timesheet" element={<PrivateRoute><TimesheetReportPage /></PrivateRoute>} />
              <Route path="/workspace" element={<PrivateRoute><WorkspacePage /></PrivateRoute>} />
              <Route path="/org-chart/config" element={<PrivateRoute><OrgChartConfigPage /></PrivateRoute>} />
              <Route path="/" element={<RoleBasedRedirect />} />
              <Route path="*" element={<RoleBasedRedirect />} />
            </Routes>
            {/* Global components */}
            <NotificationToast />
            {isLoggedIn && <ChatWidget />}
            {isLoggedIn && <UsbNotification userRole={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).role : ''} />}
            {isLoggedIn && <MonitorNotification userRole={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).role : ''} />}
          </NotificationProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
