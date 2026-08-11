import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Tooltip } from 'antd';
import './ContributionHeatmap.css';

interface ContributionData {
    date: string;
    count: number;
}

interface Props {
    data: ContributionData[];
}

const ContributionHeatmap: React.FC<Props> = ({ data }) => {
    const days = 365; // Show 1 year
    const endDate = dayjs();
    const startDate = endDate.subtract(days, 'day');

    const calendarData = useMemo(() => {
        const statsMap = new Map(data.map(d => [d.date, d.count]));
        const result = [];
        let currentDate = startDate;

        while (currentDate.isBefore(endDate) || currentDate.isSame(endDate)) {
            const dateStr = currentDate.format('yyyy-MM-DD');
            result.push({
                date: dateStr,
                count: statsMap.get(dateStr) || 0,
                dayOfWeek: currentDate.day(),
                month: currentDate.format('MMM')
            });
            currentDate = currentDate.add(1, 'day');
        }
        return result;
    }, [data, startDate, endDate]);

    const getColor = (count: number) => {
        if (count === 0) return 'var(--heatmap-bg-0)';
        if (count < 2) return 'var(--heatmap-bg-1)';
        if (count < 5) return 'var(--heatmap-bg-2)';
        if (count < 10) return 'var(--heatmap-bg-3)';
        return 'var(--heatmap-bg-4)';
    };

    // Group by weeks for the grid
    const weeks = useMemo(() => {
        const result: any[][] = [];
        let currentWeek: any[] = [];
        
        // Pad the first week
        for (let i = 0; i < calendarData[0].dayOfWeek; i++) {
            currentWeek.push(null);
        }

        calendarData.forEach(day => {
            currentWeek.push(day);
            if (currentWeek.length === 7) {
                result.push(currentWeek);
                currentWeek = [];
            }
        });

        if (currentWeek.length > 0) result.push(currentWeek);
        return result;
    }, [calendarData]);

    return (
        <div className="contribution-heatmap">
            <div className="heatmap-header">
                <span className="heatmap-title">Project Contributions</span>
                <div className="heatmap-legend">
                    <span>Less</span>
                    <div className="legend-cells">
                        {[0, 2, 5, 8, 12].map(c => (
                            <div key={c} className="heatmap-cell" style={{ background: getColor(c) }} />
                        ))}
                    </div>
                    <span>More</span>
                </div>
            </div>
            
            <div className="heatmap-grid-container">
                <div className="heatmap-row-labels">
                    <span>Mon</span>
                    <span>Wed</span>
                    <span>Fri</span>
                </div>
                <div className="heatmap-grid">
                    {weeks.map((week, wi) => (
                        <div key={wi} className="heatmap-column">
                            {week.map((day, di) => {
                                if (!day) return <div key={di} className="heatmap-cell heatmap-cell-empty" />;
                                return (
                                    <Tooltip 
                                        key={di} 
                                        title={`${day.count} tasks completed on ${day.date}`}
                                    >
                                        <div 
                                            className="heatmap-cell" 
                                            style={{ background: getColor(day.count) }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ContributionHeatmap;
