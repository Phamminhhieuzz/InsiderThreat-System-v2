import { useTranslation } from 'react-i18next';
import './LanguageToggle.css';

export default function LanguageToggle() {
    const { i18n } = useTranslation();
    
    // i18n.language might be 'en-US' or 'vi-VN', so we use startsWith
    const isEn = i18n.resolvedLanguage?.startsWith('en') || i18n.language?.startsWith('en');

    const toggleLanguage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        i18n.changeLanguage(isEn ? 'vi' : 'en');
    };

    return (
        <div className="lang-toggle" title={`Chuyển sang ${isEn ? 'Tiếng Việt' : 'English'}`} onClick={toggleLanguage}>
            <div className={`lang-toggle__track ${isEn ? 'is-en' : 'is-vi'}`}>
                <span className="lang-toggle__text vi">VI</span>
                <span className="lang-toggle__text en">EN</span>
                <div className="lang-toggle__thumb"></div>
            </div>
        </div>
    );
}
