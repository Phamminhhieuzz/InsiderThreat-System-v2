import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

const LanguageSelector = () => {
    const { i18n } = useTranslation();

    const items: MenuProps['items'] = [
        {
            key: 'vi',
            label: (
                <span>
                    🇻🇳 Tiếng Việt
                </span>
            ),
            onClick: () => i18n.changeLanguage('vi')
        },
        {
            key: 'en',
            label: (
                <span>
                    🇬🇧 English
                </span>
            ),
            onClick: () => i18n.changeLanguage('en')
        }
    ];

    const currentLanguage = i18n.language === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN';

    return (
        <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
            <button
                style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
            >
                <GlobalOutlined />
                {currentLanguage}
            </button>
        </Dropdown>
    );
};

export default LanguageSelector;
