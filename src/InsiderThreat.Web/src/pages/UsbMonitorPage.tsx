import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';


const { Title } = Typography;

function UsbMonitorPage() {
    const { t } = useTranslation();
    return (
        <div style={{ padding: 24 }}>
            <Title level={2}>USB Monitor Page</Title>
            <p>Coming soon...</p>
        </div>
    );
}

export default UsbMonitorPage;
