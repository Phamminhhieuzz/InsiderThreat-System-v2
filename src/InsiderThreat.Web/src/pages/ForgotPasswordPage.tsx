import { useState } from 'react';
import { Button, Input, message, Card, Typography, Alert, Steps } from 'antd';
import { LockOutlined, ArrowLeftOutlined, SafetyOutlined, MailOutlined, InfoCircleOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import './ForgotPasswordPage.css';


const { Title } = Typography;

function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [email, setEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otpTokenId, setOtpTokenId] = useState('');
    const [loading, setLoading] = useState(false);
    const { theme } = useTheme();
    const { t } = useTranslation();

    const isDarkMode = theme === 'dark';

    const handleSendOtp = async () => {
        if (!email) {
            message.warning('Vui lòng nhập email');
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/auth/forgot-password', { email });
            message.success('OTP đã được gửi đến email của bạn!');
            setCurrentStep(1);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Gửi OTP thất bại');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode) {
            message.warning(t('auth.require_otp', 'Vui lòng nhập mã OTP'));
            return;
        }

        setLoading(true);
        try {
            const response = await api.post<{ message: string; token: string }>('/api/auth/verify-otp', { email, code: otpCode });
            setOtpTokenId(response.token);
            message.success(t('auth.otp_valid', 'OTP hợp lệ!'));
            setCurrentStep(2);
        } catch (error: any) {
            message.error(error.response?.data?.message || t('auth.otp_invalid', 'OTP không hợp lệ'));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || !confirmPassword) {
            message.warning(t('auth.require_all_info', 'Vui lòng nhập đầy đủ thông tin'));
            return;
        }

        if (newPassword !== confirmPassword) {
            message.error(t('auth.password_mismatch', 'Mật khẩu xác nhận không khớp'));
            return;
        }

        if (newPassword.length < 6) {
            message.error(t('auth.password_length', 'Mật khẩu phải có ít nhất 6 ký tự'));
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/auth/reset-password', {
                otpTokenId,
                newPassword
            });
            message.success(t('auth.reset_success', 'Reset mật khẩu thành công! Đang chuyển đến trang đăng nhập...'));
            setTimeout(() => navigate('/login'), 2000);
        } catch (error: any) {
            message.error(error.response?.data?.message || t('auth.reset_failed', 'Reset mật khẩu thất bại'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="forgot-password-page">
             <div className="fp-controls">
                <LanguageToggle />
                <ThemeToggle />
            </div>

            <div className="fp-card">
                {/* Header Icon - Replaced with official Logo */}
                <div className="fp-header-icon">
                    <Logo width={80} height={80} showText={false} />
                </div>

                {/* Progress Steps */}
                <div className="fp-steps">
                    <div className={`fp-step ${currentStep >= 0 ? 'active' : ''}`}>
                        <div className="step-icon">
                            <MailOutlined />
                        </div>
                        <span>{t('auth.enter_email', 'NHẬP EMAIL')}</span>
                    </div>
                    <div className="step-line"></div>
                    <div className={`fp-step ${currentStep >= 1 ? 'active' : ''}`}>
                        <div className="step-icon">
                            <SafetyOutlined />
                        </div>
                        <span>{t('auth.verify_otp', 'XÁC THỰC OTP')}</span>
                    </div>
                    <div className="step-line"></div>
                    <div className={`fp-step ${currentStep >= 2 ? 'active' : ''}`}>
                        <div className="step-icon">
                            <LockOutlined />
                        </div>
                        <span>{t('auth.set_new_password', 'ĐẶT MẬT KHẨU')}</span>
                    </div>
                </div>

                {/* Step Content */}
                <div className="fp-content">
                    {currentStep === 0 && (
                        <div className="step-item">
                            <div className="info-box">
                                <InfoCircleOutlined className="info-icon" />
                                <div className="info-text">
                                    <strong>{t('auth.email_instruction_title', 'Nhập email đã đăng ký')}</strong>
                                    <p>{t('auth.email_instruction_desc', 'Chúng tôi sẽ gửi mã OTP đến email của bạn để xác thực yêu cầu cấp lại mật khẩu.')}</p>
                                </div>
                            </div>

                            <div className="field-group">
                                <label className="field-label">{t('auth.your_email', 'ĐỊA CHỈ EMAIL')}</label>
                                <Input
                                    size="large"
                                    placeholder="Email của bạn"
                                    prefix={<span style={{ color: '#94a3b8' }}>@</span>}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="fp-input"
                                />
                            </div>

                            <Button
                                type="primary"
                                loading={loading}
                                onClick={handleSendOtp}
                                className="fp-btn-primary"
                            >
                                {t('auth.send_otp', 'Gửi mã OTP')} <RightOutlined style={{ fontSize: 12, marginLeft: 4 }} />
                            </Button>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="step-item">
                             <div className="info-box success">
                                <SafetyOutlined className="info-icon" />
                                <div className="info-text">
                                    <strong>{t('auth.check_email', 'Kiểm tra email của bạn')}</strong>
                                    <p>{t('auth.otp_sent_to', { email, defaultValue: `Mã OTP đã được gửi đến ${email}.` })}</p>
                                </div>
                            </div>

                            <div className="field-group">
                                <label className="field-label">{t('auth.enter_otp', 'MÃ XÁC THỰC OTP')}</label>
                                <Input
                                    size="large"
                                    placeholder="6 chữ số"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value)}
                                    maxLength={6}
                                    className="fp-input"
                                />
                            </div>

                            <Button
                                type="primary"
                                loading={loading}
                                onClick={handleVerifyOtp}
                                className="fp-btn-primary"
                            >
                                {t('auth.verify_otp', 'Xác thực OTP')} <RightOutlined style={{ fontSize: 12, marginLeft: 4 }} />
                            </Button>
                            
                            <div style={{ textAlign: 'center', marginTop: 12 }}>
                                <span className="fp-link-resend" onClick={() => setCurrentStep(0)}>
                                    {t('auth.resend_otp', 'Gửi lại mã OTP')}
                                </span>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="step-item">
                             <div className="info-box">
                                <LockOutlined className="info-icon" />
                                <div className="info-text">
                                    <strong>{t('auth.create_new_password', 'Tạo mật khẩu mới')}</strong>
                                    <p>{t('auth.password_length', 'Mật khẩu phải có ít nhất 6 ký tự để đảm bảo an toàn.')}</p>
                                </div>
                            </div>

                            <div className="field-group">
                                <label className="field-label">{t('auth.new_password', 'MẬT KHẨU MỚI')}</label>
                                <Input.Password
                                    size="large"
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="fp-input"
                                />
                            </div>

                            <div className="field-group">
                                <label className="field-label">{t('auth.confirm_password', 'XÁC NHẬN MẬT KHẨU')}</label>
                                <Input.Password
                                    size="large"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="fp-input"
                                />
                            </div>

                            <Button
                                type="primary"
                                loading={loading}
                                onClick={handleResetPassword}
                                className="fp-btn-primary"
                            >
                                {t('auth.reset_password', 'Đặt lại mật khẩu')} <RightOutlined style={{ fontSize: 12, marginLeft: 4 }} />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Footer Link */}
                <div className="fp-footer">
                    <span className="fp-back-link" onClick={() => navigate('/login')}>
                        <ArrowLeftOutlined style={{ marginRight: 8 }} />
                        {t('auth.back_to_login', 'Quay lại Đăng nhập Mật khẩu')}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default ForgotPasswordPage;
