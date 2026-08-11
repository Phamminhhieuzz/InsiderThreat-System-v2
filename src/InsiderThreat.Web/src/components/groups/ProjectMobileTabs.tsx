import React from 'react';
import { useTranslation } from 'react-i18next';
import './ProjectMobileTabs.css';

export const PROJECT_TABS = [
    { key: 'dashboard', label: 'project_detail.tabs.dashboard', icon: 'dashboard' },
    { key: 'mytask', label: 'project_detail.tabs.mytasks', icon: 'task_alt' },
    { key: 'timeline', label: 'project_detail.tabs.timeline', icon: 'timeline' },
    { key: 'files', label: 'project_detail.tabs.files', icon: 'folder' },
];

interface ProjectMobileTabsProps {
    activeTab: string;
    onTabChange: (key: string) => void;
}

export default function ProjectMobileTabs({ activeTab, onTabChange }: ProjectMobileTabsProps) {
    const { t } = useTranslation();

    return (
        <div className="project-mobile-tabs-container">
            <div className="project-mobile-tabs-scroll">
                {PROJECT_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`mobile-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => onTabChange(tab.key)}
                    >
                        <span className="material-symbols-outlined">{tab.icon}</span>
                        <span className="mobile-tab-label">{t(tab.label)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
