import React, { useState } from 'react';
import { Input, Button, DatePicker, message, Card, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { feedService } from '../../../services/feedService';
import './SurveyCreator.css';

interface SurveyCreatorProps {
    onCreated: (newSurvey: any) => void;
}

const SurveyCreator: React.FC<SurveyCreatorProps> = ({ onCreated }) => {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [endDate, setEndDate] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleAddOption = () => {
        if (options.length >= 10) {
            message.warning('Tối đa 10 lựa chọn');
            return;
        }
        setOptions([...options, '']);
    };

    const handleRemoveOption = (index: number) => {
        if (options.length <= 2) {
            message.warning('Tối thiểu 2 lựa chọn');
            return;
        }
        setOptions(options.filter((_, i) => i !== index));
    };

    const handleOptionChange = (value: string, index: number) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleCreate = async () => {
        if (!content.trim()) {
            message.error('Vui lòng nhập nội dung câu hỏi');
            return;
        }
        if (options.some(opt => !opt.trim())) {
            message.error('Vui lòng nhập đầy đủ các lựa chọn');
            return;
        }

        try {
            setLoading(true);
            const pollDurationDays = endDate ? Math.ceil((endDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24)) : 7;
            
            const newSurvey = await feedService.createPost(
                content,
                'Public',
                [],
                'Surveys',
                'Poll',
                [],
                [],
                false, // isUrgent
                '', // urgentReason
                options.filter(o => o.trim() !== ''),
                false, // multipleChoice
                pollDurationDays
            );

            message.success('Đã tạo khảo sát thành công 🚀');
            onCreated(newSurvey);
            
            // Reset
            setContent('');
            setOptions(['', '']);
            setEndDate(null);
        } catch (error: any) {
            console.error('Failed to create survey', error);
            message.error('Lỗi khi tạo khảo sát: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="survey-creator-premium">
            <Card className="creator-card">
                <div className="creator-header">
                    <span className="material-symbols-outlined">edit_square</span>
                    <h2>{t('survey.create_title', 'Thiết kế khảo sát mới')}</h2>
                </div>

                <div className="creator-body">
                    <div className="form-item">
                        <label className="input-label">📝 {t('survey.question_label', 'Câu hỏi khảo sát của bạn')}</label>
                        <Input.TextArea 
                            placeholder={t('survey.question_placeholder', 'Ví dụ: Bạn cảm thấy thế nào về môi trường làm việc hiện tại?')} 
                            rows={3}
                            value={content}
                            className="premium-textarea"
                            onChange={(e) => setContent(e.target.value)}
                        />
                    </div>

                    <div className="form-item">
                        <label className="input-label">🔘 {t('survey.options_label', 'Các phương án trả lời')}</label>
                        <div className="options-list space-y-3">
                            {options.map((opt, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <Input 
                                        placeholder={`${t('survey.option', 'Lựa chọn')} ${index + 1}`} 
                                        value={opt}
                                        className="premium-input flex-1"
                                        onChange={(e) => handleOptionChange(e.target.value, index)}
                                    />
                                    <Button 
                                        type="text" 
                                        danger 
                                        icon={<span className="material-symbols-outlined">delete</span>} 
                                        onClick={() => handleRemoveOption(index)}
                                    />
                                </div>
                            ))}
                        </div>
                        <Button 
                            type="dashed" 
                            block 
                            onClick={handleAddOption}
                            className="mt-3 flex items-center justify-center gap-2 h-10 border-blue-200 text-blue-600 hover:text-blue-700 hover:border-blue-400"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            {t('survey.add_option', 'Thêm lựa chọn')}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div className="form-item">
                            <label className="input-label">📅 {t('survey.end_date', 'Ngày kết thúc bình chọn')}</label>
                            <DatePicker 
                                className="premium-datepicker w-full" 
                                onChange={(date) => setEndDate(date)}
                                value={endDate}
                                placeholder={t('survey.select_date', 'Chọn ngày kết thúc')}
                            />
                        </div>
                        <div className="form-item">
                           <label className="input-label">🔒 {t('survey.visibility', 'Đối tượng tham gia')}</label>
                           <div className="visibility-badge">Toàn bộ doanh nghiệp 🌐</div>
                        </div>
                    </div>
                </div>

                <div className="creator-footer mt-8">
                    <Button 
                        type="primary" 
                        size="large" 
                        block 
                        loading={loading}
                        onClick={handleCreate}
                        className="premium-submit-btn"
                    >
                        {t('survey.publish', 'PHÁT HÀNH KHẢO SÁT NGAY')}
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default SurveyCreator;
