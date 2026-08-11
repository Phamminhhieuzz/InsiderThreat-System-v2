import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Checkbox, Alert } from 'antd';
import { GoogleOutlined, EyeOutlined, EyeInvisibleOutlined, ScanOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/auth';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { message } from 'antd';
import './LoginPage.css';

function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [loginValues, setLoginValues] = useState({ username: '', password: '' });
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isFocused, setIsFocused] = useState(false);
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { t } = useTranslation();

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 2;
            const y = (e.clientY / window.innerHeight - 0.5) * 2;
            setMousePos({ x, y });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const onFinish = async (values: any) => {
        setLoading(true);
        setErrorMessage(null);
        setLoginValues({ username: values.username, password: values.password });

        try {
            const response = await authService.login(values.username, values.password);
            
            // 🛡️ Kiểm tra xem có bắt buộc đổi mật khẩu không
            if (response.message === 'CHANGE_PASSWORD_REQUIRED') {
                setShowChangePassword(true);
                setLoading(false);
                return;
            }

            // Kích hoạt sự kiện storage thủ công để App.tsx cập nhật isLoggedIn ngay lập tức
            window.dispatchEvent(new Event('storage'));

            // Chuyển hướng trực tiếp tới trang Bảng tin (Feed) theo yêu cầu
            navigate('/feed');
        } catch (error: any) {
            const errMsg = error.response?.data?.message || t('auth.login_failed_desc', 'Login failed! Please check your credentials.');
            setErrorMessage(errMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    const handleValuesChange = () => {
        if (errorMessage) setErrorMessage(null);
    };

    const isError = !!errorMessage;

    const getTransform = () => {
        if (isError) return `scale(1, 0.85) translateY(20px)`; 
        if (isFocused) return `scale(1, 1.15) translateY(-20px)`; 
        return `skewX(${mousePos.x * -12}deg)`;
    };
    
    const getPupilOffset = (multiplier: number) => {
        if (isError) return { x: -1.5 * multiplier, y: 1.5 * multiplier };
        if (isFocused) return { x: 1.5 * multiplier, y: -1 * multiplier };
        return { x: mousePos.x * multiplier, y: mousePos.y * multiplier };
    };

    const transformStyle = { transform: getTransform(), transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' };

    const purpleEye = getPupilOffset(3);
    const blackEye = getPupilOffset(3.5);
    const yellowEye = getPupilOffset(4);
    const orangeEye = getPupilOffset(4.5);

    return (
        <div className="zdak-login-page">
            {/* 🛡️ Modal đổi mật khẩu bắt buộc */}
            <ChangePasswordModal 
                visible={showChangePassword}
                username={loginValues.username}
                oldPassword={loginValues.password}
                onSuccess={() => {
                    setShowChangePassword(false);
                    message.success('Đã cập nhật mật khẩu! Vui lòng đăng nhập lại.');
                }}
                onCancel={() => setShowChangePassword(false)}
            />

            {/* Toggles */}
            <div className="login-controls">
                <LanguageToggle />
                <ThemeToggle />
            </div>

            <div className="login-container-wrapper">
                {/* Left Panel: Illustration */}
                <div className="illustration-panel">
                    <div className="illustration-content">
                        <svg viewBox="0 0 400 350" fill="none" xmlns="http://www.w3.org/2000/svg" className="monster-svg">
                            
                            {/* Purple character (Back) */}
                            <g className="monster monster-purple">
                                <g className={isError ? "shake-anim" : ""}>
                                    <g style={{ ...transformStyle, transformOrigin: '127px 300px' }}>
                                        <rect x="90" y="40" width="75" height="260" rx="6" fill="#8B5CF6" />
                                        
                                        {/* Mouth */}
                                        {isError ? (
                                            <path d="M115 105 Q127 95 140 105" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none" />
                                        ) : isFocused ? (
                                            <ellipse cx="127" cy="98" rx="4" ry="7" fill="#111" />
                                        ) : (
                                            <path d="M115 95 Q127 105 140 95" stroke="#111" strokeWidth="3" strokeLinecap="round" fill="none" />
                                        )}

                                        {/* Eyes */}
                                        <circle cx="118" cy="80" r="4.5" fill="white" />
                                        <circle cx="118" cy="80" r="2.5" fill="#111" style={{ transform: `translate(${purpleEye.x}px, ${purpleEye.y}px)`, transition: 'transform 0.1s' }} />
                                        <circle cx="138" cy="80" r="4.5" fill="white" />
                                        <circle cx="138" cy="80" r="2.5" fill="#111" style={{ transform: `translate(${purpleEye.x}px, ${purpleEye.y}px)`, transition: 'transform 0.1s' }} />
                                    </g>
                                </g>
                            </g>
                            
                            {/* Black character (Middle right) */}
                            <g className="monster monster-black">
                                <g className={isError ? "shake-anim" : ""}>
                                    <g style={{ ...transformStyle, transformOrigin: '202px 300px' }}>
                                        <rect x="175" y="140" width="55" height="160" rx="6" fill="#1F2937" />
                                        
                                        <circle cx="192" cy="175" r="5.5" fill="white" />
                                        <circle cx="192" cy="175" r="3" fill="#111" style={{ transform: `translate(${blackEye.x}px, ${blackEye.y}px)`, transition: 'transform 0.1s' }} />
                                        <circle cx="212" cy="175" r="5.5" fill="white" />
                                        <circle cx="212" cy="175" r="3" fill="#111" style={{ transform: `translate(${blackEye.x}px, ${blackEye.y}px)`, transition: 'transform 0.1s' }} />
                                    </g>
                                </g>
                            </g>

                            {/* Yellow character (Front right) */}
                            <g className="monster monster-yellow">
                                <g className={isError ? "shake-anim" : ""}>
                                    <g style={{ ...transformStyle, transformOrigin: '250px 300px' }}>
                                        <path d="M220 300V230C220 190 280 190 280 230V300H220Z" fill="#FACC15" />
                                        
                                        {/* Mouth */}
                                        {isError ? (
                                            <path d="M245 265 Q260 255 275 265" stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none" />
                                        ) : isFocused ? (
                                            <ellipse cx="260" cy="263" rx="4" ry="6" fill="#111" />
                                        ) : (
                                            <path d="M245 258 Q260 268 275 258" stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none" />
                                        )}

                                        <circle cx="265" cy="235" r="3.5" fill="#111" style={{ transform: `translate(${yellowEye.x}px, ${yellowEye.y}px)`, transition: 'transform 0.1s' }} />
                                    </g>
                                </g>
                            </g>

                            {/* Orange character (Front left blob) */}
                            <g className="monster monster-orange">
                                <g className={isError ? "shake-anim" : ""}>
                                    <g style={{ ...transformStyle, transformOrigin: '115px 300px' }}>
                                        <path d="M30 300C30 180 200 180 200 300Z" fill="#F97316" />
                                        
                                        {/* Mouth */}
                                        {isError ? (
                                            <path d="M95 285 Q110 275 125 285" stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none" />
                                        ) : isFocused ? (
                                            <ellipse cx="110" cy="280" rx="6" ry="8" fill="#111" />
                                        ) : (
                                            <path d="M90 272 Q105 288 120 272" stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none" />
                                        )}

                                        {/* Eyes */}
                                        <circle cx="95" cy="255" r="4.5" fill="#111" style={{ transform: `translate(${orangeEye.x}px, ${orangeEye.y}px)`, transition: 'transform 0.1s' }} />
                                        <circle cx="125" cy="255" r="4.5" fill="#111" style={{ transform: `translate(${orangeEye.x}px, ${orangeEye.y}px)`, transition: 'transform 0.1s' }} />
                                    </g>
                                </g>
                            </g>
                        </svg>
                        <h1 className="zdak-watermark">InsiderThreat-System</h1>
                    </div>
                </div>

                {/* Right Panel: Form */}
                <div className="form-panel">
                    <div className="form-content">
                        <div className="zdak-logo">
                            <Logo width={100} height={100} showText={false} />
                        </div>

                        <h2 className="welcome-text">{t('auth.welcome_back')}</h2>
                        <p className="subtitle">{t('auth.please_enter_details')}</p>

                        {errorMessage && (
                            <Alert title="Error" description={errorMessage} type="error" showIcon closable onClose={() => setErrorMessage(null)} style={{ marginBottom: 20 }} />
                        )}

                        <Form name="zdak_login" onFinish={onFinish} onValuesChange={handleValuesChange} layout="vertical" className="zdak-form">
                            <div className="input-group">
                                <label className="input-label">{t('auth.username')}</label>
                                <Form.Item name="username" rules={[{ required: true, message: t('auth.require_username') }]}>
                                    <Input 
                                        placeholder={t('auth.username')} 
                                        variant="borderless" 
                                        className="zdak-input" 
                                        onFocus={handleFocus} 
                                        onBlur={handleBlur} 
                                    />
                                </Form.Item>
                            </div>

                            <div className="input-group">
                                <label className="input-label">{t('auth.password')}</label>
                                <Form.Item name="password" rules={[{ required: true, message: t('auth.require_password') }]}>
                                    <Input.Password 
                                        placeholder="••••••••" 
                                        variant="borderless" 
                                        className="zdak-input"
                                        onFocus={handleFocus} 
                                        onBlur={handleBlur}
                                        iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined className="eye-lashes-custom" />)}
                                    />
                                </Form.Item>
                            </div>

                            <div className="form-options">
                                <Form.Item name="remember" valuePropName="checked" noStyle>
                                    <Checkbox className="zdak-checkbox">{t('auth.remember_me')}</Checkbox>
                                </Form.Item>
                                <span className="forgot-link" onClick={() => navigate('/forgot-password')}>{t('auth.forgot_password')}</span>
                            </div>

                            <Form.Item>
                                <Button type="primary" htmlType="submit" loading={loading} block className="zdak-btn-primary">
                                    {t('auth.login')}
                                </Button>
                            </Form.Item>

                            <Form.Item>
                                <Button block icon={<ScanOutlined />} onClick={() => navigate('/face-login')} className="zdak-btn-secondary">
                                    {t('auth.face_login')}
                                </Button>
                            </Form.Item>

                        </Form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
