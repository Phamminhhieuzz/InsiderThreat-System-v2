import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

export default function BackButton() {
    const navigate = useNavigate();
    return (
        <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ marginBottom: 16 }}
        >
            Quay lại
        </Button>
    );
}
