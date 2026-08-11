import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <label className="theme-toggle" title={`Chuyển sang chế độ ${isDark ? 'sáng' : 'tối'}`}>
            <input 
                type="checkbox" 
                className="theme-toggle__checkbox" 
                checked={isDark}
                onChange={toggleTheme}
            />
            <div className="theme-toggle__container">
                <div className="theme-toggle__stars"></div>
                <div className="theme-toggle__clouds"></div>
                
                <div className="theme-toggle__knob">
                    <div className="theme-toggle__moon-craters">
                        <div className="crater crater-1"></div>
                        <div className="crater crater-2"></div>
                        <div className="crater crater-3"></div>
                    </div>
                </div>
            </div>
        </label>
    );
}
