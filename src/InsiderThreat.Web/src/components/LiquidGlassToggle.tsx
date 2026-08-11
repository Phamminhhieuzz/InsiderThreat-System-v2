import { useTheme } from '../context/ThemeContext';
import './LiquidGlassToggle.css';

export default function LiquidGlassToggle() {
    const { liquidGlass, toggleLiquidGlass } = useTheme();

    return (
        <label className="liquid-toggle" title={liquidGlass ? 'Tắt hiệu ứng Liquid Glass' : 'Bật hiệu ứng Liquid Glass'}>
            <input 
                type="checkbox" 
                className="liquid-toggle__checkbox" 
                checked={liquidGlass}
                onChange={toggleLiquidGlass}
            />
            <div className="liquid-toggle__container">
                <div className="liquid-toggle__water">
                    <div className="liquid-toggle__bubble bubble-1"></div>
                    <div className="liquid-toggle__bubble bubble-2"></div>
                    <div className="liquid-toggle__bubble bubble-3"></div>
                </div>
                <div className="liquid-toggle__glass"></div>
                <div className="liquid-toggle__knob">
                    <div className="liquid-toggle__shine"></div>
                </div>
            </div>
        </label>
    );
}
