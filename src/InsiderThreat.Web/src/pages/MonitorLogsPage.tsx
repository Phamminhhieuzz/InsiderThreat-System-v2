import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import JSZip from 'jszip';
import { 
    SecurityScanOutlined, 
    CameraOutlined, 
    WarningOutlined, 
    KeyOutlined, 
    ReloadOutlined,
    SearchOutlined,
    DesktopOutlined,
    UserOutlined,
    ArrowLeftOutlined,
    ClockCircleOutlined,
    HomeOutlined,
    GlobalOutlined,
    FileZipOutlined,
    DeleteOutlined,
    FileSearchOutlined,
    InboxOutlined,
    ExportOutlined,
    PieChartOutlined,
    LineChartOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import { Table, Tag, Card, Row, Col, Statistic, Select, Input, Space, Button, Typography, Avatar, Badge, App, Breadcrumb, Modal, Checkbox, Upload, Empty } from 'antd';
import { monitorService } from '../services/monitorService';
import type { ColumnsType } from 'antd/es/table';
import { useTheme } from '../context/ThemeContext';
import './MonitorLogsPage.css';
import type { MonitorLog, MonitorSummary } from '../services/monitorService';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend, 
    BarChart, Bar
} from 'recharts';
import BottomNavigation from '../components/BottomNavigation';

const { Dragger } = Upload;
const { Title, Text } = Typography;
const { Option } = Select;

// Grouped machine info derived from logs
interface MachineInfo {
    computerName: string;
    computerUser: string;
    ipAddress: string;
    totalAlerts: number;
    criticalAlerts: number;
    keywordAlerts: number;
    screenshotAlerts: number;
    documentLeakAlerts: number;
    lastActivity: string;
    latestKeyword?: string;
}

const MonitorLogsPage: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [loading, setLoading] = useState(false);
    const [allLogs, setAllLogs] = useState<MonitorLog[]>([]);
    const [summary, setSummary] = useState<MonitorSummary | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const navigate = useNavigate();

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Two-level navigation state
    const [selectedMachine, setSelectedMachine] = useState<MachineInfo | null>(null);

    // Detail view state
    const [detailPage, setDetailPage] = useState(1);
    const [detailPageSize] = useState(20);
    const [detailLogs, setDetailLogs] = useState<MonitorLog[]>([]);
    const [detailTotal, setDetailTotal] = useState(0);
    const [logType, setLogType] = useState<string | undefined>(undefined);
    const [minSeverity, setMinSeverity] = useState<number | undefined>(undefined);

    // Machine list search
    const [machineSearch, setMachineSearch] = useState('');

    // Archive view state
    const [archiveLogs, setArchiveLogs] = useState<MonitorLog[]>([]);
    const [isArchiveMode, setIsArchiveMode] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [archiveFileName, setArchiveFileName] = useState('');
    const [selectedArchiveMachine, setSelectedArchiveMachine] = useState<MachineInfo | null>(null);

    // Load all logs to build machine list
    const loadOverview = async () => {
        setLoading(true);
        try {
            const [logsRes, summaryRes] = await Promise.all([
                monitorService.getLogs({ pageSize: 500 }),
                monitorService.getSummary()
            ]);
            setAllLogs(logsRes.data);
            setSummary(summaryRes);
        } catch (error) {
            console.error('Failed to load monitor logs:', error);
            message.error(t('monitor.load_error', 'Không thể tải dữ liệu giám sát'));
        } finally {
            setLoading(false);
        }
    };

    // Load detail logs for a specific machine
    const loadDetailLogs = async (computerName: string, computerUser: string) => {
        setLoading(true);
        try {
            const res = await monitorService.getLogs({
                computerName,
                computerUser,
                logType,
                minSeverity,
                page: detailPage,
                pageSize: detailPageSize,
            });
            setDetailLogs(res.data);
            setDetailTotal(res.totalCount);
        } catch (error) {
            console.error('Failed to load detail logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOverview();
    }, []);

    useEffect(() => {
        if (selectedMachine) {
            loadDetailLogs(selectedMachine.computerName, selectedMachine.computerUser);
        }
    }, [selectedMachine, detailPage, logType, minSeverity]);

    // 📊 PHÂN TÍCH DỮ LIỆU BIỂU ĐỒ
    const chartData = useMemo(() => {
        if (!allLogs || allLogs.length === 0) return { trend: [], types: [], topMachines: [] };

        const hourlyMap = new Map();
        const typeMap = new Map();
        const machineMap = new Map();

        allLogs.forEach(log => {
            // 1. Xu hướng theo giờ
            const hour = dayjs(log.timestamp).format('HH:00');
            hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);

            // 2. Tỉ lệ loại vi phạm
            typeMap.set(log.logType, (typeMap.get(log.logType) || 0) + 1);

            // 3. Top máy rủi ro
            machineMap.set(log.computerName, (machineMap.get(log.computerName) || 0) + 1);
        });

        const trend = Array.from(hourlyMap.entries())
            .map(([time, count]) => ({ time, count }))
            .sort((a, b) => a.time.localeCompare(b.time));

        const types = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }));
        
        const topMachines = Array.from(machineMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return { trend, types, topMachines };
    }, [allLogs]);

    // 📊 PHÂN TÍCH DỮ LIỆU BIỂU ĐỒ CHI TIẾT (Cho máy đang chọn)
    const detailChartData = useMemo(() => {
        if (!detailLogs || detailLogs.length === 0) return { trend: [], types: [] };

        const hourlyMap = new Map();
        const typeMap = new Map();

        detailLogs.forEach(log => {
            const hour = dayjs(log.timestamp).format('HH:00');
            hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
            typeMap.set(log.logType, (typeMap.get(log.logType) || 0) + 1);
        });

        const trend = Array.from(hourlyMap.entries())
            .map(([time, count]) => ({ time, count }))
            .sort((a, b) => a.time.localeCompare(b.time));

        const types = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }));

        return { trend, types };
    }, [detailLogs]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#f5222d'];

    // Build machine list from all logs
    const machines: MachineInfo[] = useMemo(() => {
        const map = new Map<string, MachineInfo>();
        for (const log of allLogs) {
            const key = `${log.computerName}||${log.computerUser}`;
            if (!map.has(key)) {
                map.set(key, {
                    computerName: log.computerName,
                    computerUser: log.computerUser || 'Unknown',
                    ipAddress: log.ipAddress,
                    totalAlerts: 0,
                    criticalAlerts: 0,
                    keywordAlerts: 0,
                    screenshotAlerts: 0,
                    documentLeakAlerts: 0,
                    lastActivity: log.timestamp,
                    latestKeyword: undefined,
                });
            }
            const m = map.get(key)!;
            m.totalAlerts++;
            if (log.severityScore >= 7) m.criticalAlerts++;
            if (log.logType === 'KeywordDetected') {
                m.keywordAlerts++;
                if (!m.latestKeyword && log.detectedKeyword) m.latestKeyword = log.detectedKeyword;
            }
            if (log.logType === 'Screenshot') m.screenshotAlerts++;
            if (log.logType === 'DocumentLeak') {
                m.documentLeakAlerts++;
                if (!m.latestKeyword) m.latestKeyword = '[RÒ RỈ TÀI LIỆU]';
            }
            if (new Date(log.timestamp) > new Date(m.lastActivity)) {
                m.lastActivity = log.timestamp;
            }
        }
        return Array.from(map.values()).sort((a, b) => 
            new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
        );
    }, [allLogs]);

    // Filter machines by search
    const filteredMachines = useMemo(() => {
        if (!machineSearch) return machines;
        const q = machineSearch.toLowerCase();
        return machines.filter(m => 
            m.computerName.toLowerCase().includes(q) ||
            m.computerUser.toLowerCase().includes(q) ||
            m.ipAddress.toLowerCase().includes(q)
        );
    }, [machines, machineSearch]);

    const getSeverityColor = (score: number) => {
        if (score >= 9) return '#ff4d4f';
        if (score >= 7) return '#faad14';
        if (score >= 5) return '#1890ff';
        return '#52c41a';
    };

    const getRiskLevel = (machine: MachineInfo) => {
        if (machine.criticalAlerts > 5) return { color: '#ff4d4f', text: 'Nguy hiểm', status: 'error' as const };
        if (machine.criticalAlerts > 0) return { color: '#faad14', text: 'Cảnh báo', status: 'warning' as const };
        if (machine.totalAlerts > 0) return { color: '#1890ff', text: 'Bình thường', status: 'processing' as const };
        return { color: '#52c41a', text: 'An toàn', status: 'success' as const };
    };

    // ─── Mobile View Component ──────────────────────
    const renderMobileLogItem = (log: MonitorLog) => (
        <Card size="small" key={log.id || Math.random()} style={{ marginBottom: 12, borderRadius: 12, borderLeft: `4px solid ${getSeverityColor(log.severityScore)}`, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Tag color={getSeverityColor(log.severityScore)} style={{ fontWeight: 'bold' }}>{log.severityScore}/10</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(log.timestamp).format('HH:mm:ss DD/MM')}</Text>
            </div>
            <div style={{ marginBottom: 6 }}>
                <Tag color="blue">{log.logType}</Tag>
            </div>
            <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, lineHeight: '1.5' }}>
                {log.detectedKeyword && <Text type="danger" strong>[{log.detectedKeyword}] </Text>}
                {log.messageContext || log.message}
            </div>
            <div style={{ fontSize: 11, color: '#8c8c8c', fontStyle: 'italic' }}>
                {log.applicationName} {log.windowTitle ? ` - ${log.windowTitle}` : ''}
            </div>
        </Card>
    );

    const handleMachineClick = (machine: MachineInfo) => {
        setSelectedMachine(machine);
        setDetailPage(1);
        setLogType(undefined);
        setMinSeverity(undefined);
    };

    const handleBack = () => {
        setSelectedMachine(null);
        setSelectedArchiveMachine(null);
        setDetailLogs([]);
        setDetailTotal(0);
    };

    // 📂 PHÂN TÍCH MÁY TÍNH TRONG FILE ZIP (Offline Analysis)
    const archiveMachines = useMemo(() => {
        if (!isArchiveMode || archiveLogs.length === 0) return [];
        const map = new Map<string, MachineInfo>();
        
        archiveLogs.forEach(log => {
            const key = `${log.computerName}||${log.computerUser}`;
            if (!map.has(key)) {
                map.set(key, {
                    computerName: log.computerName,
                    computerUser: log.computerUser || 'Unknown',
                    ipAddress: log.ipAddress || 'Offline',
                    totalAlerts: 0,
                    criticalAlerts: 0,
                    keywordAlerts: 0,
                    screenshotAlerts: 0,
                    documentLeakAlerts: 0,
                    lastActivity: log.timestamp,
                });
            }
            const m = map.get(key)!;
            m.totalAlerts++;
            if (log.severityScore >= 7) m.criticalAlerts++;
            if (log.logType === 'KeywordDetected') m.keywordAlerts++;
            if (log.logType === 'Screenshot') m.screenshotAlerts++;
            if (new Date(log.timestamp) > new Date(m.lastActivity)) m.lastActivity = log.timestamp;
        });
        
        return Array.from(map.values()).sort((a, b) => b.totalAlerts - a.totalAlerts);
    }, [archiveLogs, isArchiveMode]);

    // Lọc log của máy đang chọn trong Archive
    const filteredArchiveLogs = useMemo(() => {
        if (!selectedArchiveMachine) return [];
        return archiveLogs.filter(l => 
            l.computerName === selectedArchiveMachine.computerName && 
            l.computerUser === selectedArchiveMachine.computerUser
        );
    }, [archiveLogs, selectedArchiveMachine]);

    const handleArchiveLogs = () => {
        let clearAfterExport = false;
        const targetDesc = selectedMachine 
            ? `máy [${selectedMachine.computerName}] - người dùng [${selectedMachine.computerUser}]`
            : "toàn bộ máy tính";

        Modal.confirm({
            title: `Nén & Lưu trữ Nhật ký - ${selectedMachine ? "Máy cục bộ" : "Toàn bộ"}`,
            icon: <FileZipOutlined style={{ color: '#722ed1' }} />,
            content: (
                <div>
                    <p>Hệ thống sẽ gom logs của <strong>{targetDesc}</strong> thành một file nén (.zip) để bạn tải về.</p>
                    <Checkbox onChange={(e) => clearAfterExport = e.target.checked}>
                        <Text type="danger">Xóa log tương ứng trên Server sau khi nén thành công</Text>
                    </Checkbox>
                </div>
            ),
            okText: 'Bắt đầu nén',
            cancelText: 'Hủy',
            okButtonProps: { style: { backgroundColor: '#722ed1' } },
                onOk: async () => {
                const hide = message.loading('Đang xử lý nén dữ liệu...', 0);
                try {
                    const blobData = await monitorService.archiveLogs({
                        computerName: selectedMachine?.computerName,
                        computerUser: selectedMachine?.computerUser,
                        clearLogs: clearAfterExport
                    });
                    
                    const url = window.URL.createObjectURL(blobData);
                    const link = document.createElement('a');
                    link.href = url;
                    
                    // Tên file tải về
                    const timeStr = dayjs().format('YYYYMMDD_HHmm');
                    const fileName = selectedMachine 
                        ? `Log_${selectedMachine.computerName}_${selectedMachine.computerUser}_${timeStr}.zip`
                        : `InsiderThreat_FullBackup_${timeStr}.zip`;

                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                    
                    message.success(`Đã đóng gói thành công: ${fileName}`);
                    if (clearAfterExport) {
                        loadOverview();
                    }
                } catch (error: any) {
                    console.error('Archive failed:', error);
                    message.error('Lỗi khi nén dữ liệu: ' + (error.response?.data?.message || 'Lỗi server'));
                } finally {
                    hide();
                }
            }
        });
    };

    const handleUploadArchive = async (file: any) => {
        const hide = message.loading('Đang giải nén dữ liệu lưu trữ...', 0);
        try {
            // Get the actual file object (handle antd UploadFile)
            const actualFile = file.originFileObj || file;
            
            console.log('📂 [DEBUG] Processing file:', {
                name: actualFile.name,
                size: actualFile.size,
                type: actualFile.type,
                lastModified: new Date(actualFile.lastModified).toLocaleString()
            });

            if (actualFile.size === 0) {
                throw new Error('Tệp rỗng (0 bytes).');
            }

            const reader = new FileReader();
            const zipBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = () => reject(new Error('Lỗi khi đọc file bằng FileReader'));
                reader.readAsArrayBuffer(actualFile);
            });

            console.log(`📂 [DEBUG] File loaded into buffer: ${zipBuffer.byteLength} bytes`);

            // Check Magic Bytes
            const header = new Uint8Array(zipBuffer.slice(0, 4));
            const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
            console.log(`📂 [DEBUG] Header Hex: ${headerHex}`);

            // ZIP signature is PK (0x50 0x4B)
            const isZip = header[0] === 0x50 && header[1] === 0x4B;
            
            // Check if it's a JSON file (starts with { or [)
            const isJson = header[0] === 0x7B || header[0] === 0x5B;

            if (!isZip) {
                if (isJson) {
                    throw new Error(`Đây có vẻ là một tệp JSON, không phải tệp ZIP. Vui lòng nén tệp JSON này lại hoặc xuất tệp mới từ hệ thống.`);
                }
                throw new Error(`Tệp không phải định dạng ZIP hợp lệ (Header: ${headerHex}). Vui lòng kiểm tra lại.`);
            }

            const zip = new JSZip();
            const contents = await zip.loadAsync(zipBuffer, { 
                checkCRC32: true,
                createFolders: false
            });
            
            // Find the JSON file inside the ZIP
            const jsonFile = Object.values(contents.files).find(f => f.name.endsWith('.json'));
            if (!jsonFile) {
                // List all files for debugging
                const allFiles = Object.keys(contents.files).join(', ');
                console.error('❌ [DEBUG] No JSON found. Files in ZIP:', allFiles);
                throw new Error(`Không tìm thấy tệp dữ liệu .json bên trong file nén! (Các tệp tìm thấy: ${allFiles || 'không có'})`);
            }

            console.log(`📄 [DEBUG] Found entry: ${jsonFile.name}`);

            const jsonStr = await jsonFile.async('string');
            let rawData: any[] = [];
            
            try {
                const parsed = JSON.parse(jsonStr);
                rawData = Array.isArray(parsed) ? parsed : (parsed.data || []);
            } catch (e: any) {
                throw new Error(`Lỗi khi giải mã JSON bên trong file nén: ${e.message}`);
            }

            // 🛡️ CHUẨN HÓA DỮ LIỆU (Normalize PascalCase to camelCase)
            const normalizedLogs: MonitorLog[] = rawData.map((item: any) => ({
                id: item.id || item.Id,
                logType: item.logType || item.LogType || 'Unknown',
                severity: item.severity || item.Severity || 'Info',
                severityScore: item.severityScore !== undefined ? item.severityScore : (item.SeverityScore || 0),
                message: item.message || item.Message || '',
                computerName: item.computerName || item.ComputerName || 'Unknown',
                ipAddress: item.ipAddress || item.IpAddress || '',
                actionTaken: item.actionTaken || item.ActionTaken || '',
                detectedKeyword: item.detectedKeyword || item.DetectedKeyword,
                messageContext: item.messageContext || item.MessageContext,
                applicationName: item.applicationName || item.ApplicationName,
                windowTitle: item.windowTitle || item.WindowTitle,
                computerUser: item.computerUser || item.ComputerUser,
                timestamp: item.timestamp || item.Timestamp || new Date().toISOString()
            }));
            
            setArchiveLogs(normalizedLogs);
            setIsArchiveMode(true);
            setArchiveFileName(actualFile.name);
            setUploadModalVisible(false);
            message.success(`Đã mở thành công bản lưu trữ: ${actualFile.name} (${normalizedLogs.length} bản ghi)`);
        } catch (error: any) {
            console.error('❌ [DEBUG] Archive Parse Error:', error);
            message.error({
                content: (
                    <div style={{ textAlign: 'left' }}>
                        <Text strong>Lỗi khi xử lý file nén:</Text>
                        <br />
                        <Text type="danger" style={{ fontSize: '12px' }}>{error.message || 'Lỗi không xác định'}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: '11px' }}>Vui lòng tải về bản log mới nhất từ Server và thử lại.</Text>
                    </div>
                ),
                duration: 6
            });
        } finally {
            hide();
        }
        return false; // Prevent auto upload
    };

    // ─── Detail View Columns ──────────────────────────
    const columns = [
        {
            title: t('monitor.timestamp', 'Thời gian'),
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm:ss'),
        },
        {
            title: t('monitor.type', 'Loại'),
            dataIndex: 'logType',
            key: 'logType',
            width: 150,
            render: (type: string) => {
                switch (type) {
                    case 'Screenshot':
                        return <Tag icon={<CameraOutlined />} color="cyan">{t('monitor.type_screenshot', 'Chụp màn hình')}</Tag>;
                    case 'KeywordDetected':
                        return <Tag icon={<KeyOutlined />} color="purple">{t('monitor.type_keyword', 'Từ khóa nhạy cảm')}</Tag>;
                    case 'NetworkDisconnect':
                        return <Tag icon={<GlobalOutlined />} color="error">{t('monitor.type_network', 'Mất kết nối')}</Tag>;
                    case 'DocumentLeak':
                        return <Tag icon={<WarningOutlined />} color="#f5222d" style={{ animation: 'pulse 2s infinite' }}>RÒ RỈ TÀI LIỆU</Tag>;
                    default:
                        return <Tag>{type}</Tag>;
                }
            }
        },
        {
            title: t('monitor.severity', 'Mức độ'),
            dataIndex: 'severityScore',
            key: 'severityScore',
            width: 100,
            render: (score: number) => (
                <Tag color={getSeverityColor(score)} style={{ fontWeight: 'bold' }}>
                    {score}/10
                </Tag>
            )
        },
        {
            title: t('monitor.content', 'Nội dung/Bối cảnh'),
            key: 'content',
            render: (record: MonitorLog) => (
                <Space orientation="vertical" size={2}>
                    {record.detectedKeyword && (
                        <Text strong type="danger">
                            <KeyOutlined /> {t('monitor.keyword', 'Từ khóa')}: {record.detectedKeyword}
                        </Text>
                    )}
                    <div style={{ maxWidth: '400px', whiteSpace: 'pre-wrap' }}>
                        {record.messageContext || record.message}
                    </div>
                    {(record.applicationName || record.windowTitle) && (
                        <Text type="secondary" style={{ fontSize: '11px', fontStyle: 'italic' }}>
                            {record.applicationName} {record.windowTitle ? ` - ${record.windowTitle}` : ''}
                        </Text>
                    )}
                </Space>
            )
        },
        {
            title: t('monitor.assessment', 'Đánh giá rủi ro'),
            dataIndex: 'actionTaken',
            key: 'actionTaken',
            width: 250,
            render: (text: string) => <Text style={{ fontSize: '13px' }}>{text}</Text>
        }
    ];

    // ─── RENDER ──────────────────────────
    return (
        <div className={`monitor-logs-container ${isMobile ? 'mobile' : ''} ${isDark ? 'dark' : ''}`}>

            {/* 📱 Header & Navigation */}
            <div className={`monitor-header ${isMobile ? 'mobile' : ''}`}>
                <div>
                    {selectedMachine ? (
                        <Breadcrumb items={[
                            { title: <span onClick={handleBack} style={{ cursor: 'pointer', color: 'var(--color-primary)' }}><HomeOutlined /> {!isMobile && 'Tất cả máy tính'}</span> },
                            { title: <span style={{ color: 'var(--color-text-main)' }}><DesktopOutlined /> {selectedMachine.computerName}</span> },
                        ]} />
                    ) : null}
                    <Title level={isMobile ? 4 : 2} className="monitor-title">
                        <SecurityScanOutlined /> {selectedMachine 
                            ? (isMobile ? 'Chi tiết' : `Chi tiết giám sát - ${selectedMachine.computerName}`)
                            : (isMobile ? 'Giám sát Agent' : t('monitor.title', 'Giám sát Agent Máy tính Cá nhân'))
                        }
                    </Title>
                </div>
                <Space wrap={isMobile} style={{ width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>

                    
                    {!isMobile && !isArchiveMode && (
                        <>
                            <Button
                                icon={<FileSearchOutlined />}
                                onClick={() => setUploadModalVisible(true)}
                                style={{ borderColor: '#faad14', color: '#faad14' }}
                            >
                                Mở ZIP
                            </Button>
                            <Button
                                icon={<FileZipOutlined />}
                                onClick={handleArchiveLogs}
                                style={{ borderColor: '#722ed1', color: '#722ed1' }}
                            >
                                Nén Log
                            </Button>
                        </>
                    )}

                    <Button
                        type="primary" 
                        icon={<ReloadOutlined />} 
                        onClick={selectedMachine ? () => loadDetailLogs(selectedMachine.computerName, selectedMachine.computerUser) : loadOverview} 
                        loading={loading}
                    >
                        {!isMobile && t('common.refresh', 'Làm mới')}
                    </Button>
                </Space>
            </div>

            {/* 📊 Summary Stats */}
            <Row gutter={[12, 12]} style={{ marginBottom: isMobile ? '16px' : '24px' }}>
                <Col span={isMobile ? 12 : 6}>
                    <Card size="small" className="stat-card total" variant="borderless">
                        <Statistic
                            title="Tổng hôm nay"
                            value={summary?.totalToday || 0}
                            styles={{ content: { fontSize: isMobile ? 20 : 24 } }}
                            className="stat-value total"
                            prefix={<SecurityScanOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={isMobile ? 12 : 6}>
                    <Card size="small" className="stat-card critical" variant="borderless">
                        <Statistic
                            title="Nguy hiểm"
                            value={summary?.criticalToday || 0}
                            styles={{ content: { fontSize: isMobile ? 20 : 24 } }}
                            className="stat-value critical"
                            prefix={<WarningOutlined />}
                        />
                    </Card>
                </Col>
                {!isMobile && (
                    <>
                        <Col span={6}>
                            <Card className="stat-card screenshots" variant="borderless">
                                <Statistic title="Ảnh chụp" value={summary?.screenshotsToday || 0} className="stat-value screenshots" prefix={<CameraOutlined />} />
                            </Card>
                        </Col>
                        <Col span={6}>
                            <Card className="stat-card keywords" variant="borderless">
                                <Statistic title="Từ khóa" value={summary?.keywordsToday || 0} className="stat-value keywords" prefix={<KeyOutlined />} />
                            </Card>
                        </Col>
                    </>
                )}
            </Row>

            {/* 📈 ANALYTICS DASHBOARD (Responsive) */}
            {!selectedMachine && !isArchiveMode && allLogs.length > 0 && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col xs={24} lg={12}>
                        <Card title={<Space><LineChartOutlined /> Xu hướng</Space>} size="small" className="chart-card">
                            <div style={{ width: '100%', height: isMobile ? 180 : 300 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={chartData.trend}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#333' : '#f0f0f0'} />
                                        <XAxis dataKey="time" hide={isMobile} stroke={isDark ? '#888' : '#666'} />
                                        <YAxis axisLine={false} tickLine={false} style={{ fontSize: '10px' }} stroke={isDark ? '#888' : '#666'} />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#1E1E1E' : '#fff',
                                                borderColor: isDark ? '#333' : '#eee',
                                                color: isDark ? '#fff' : '#000'
                                            }}
                                        />
                                        <Area type="monotone" dataKey="count" stroke="var(--color-primary)" fill="var(--color-primary-light)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>
                    {!isMobile && (
                        <>
                            <Col xs={24} md={12} lg={6}>
                                <Card title={<Space><PieChartOutlined /> Loại vi phạm</Space>} size="small" className="chart-card">
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={chartData.types} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                                                    {chartData.types.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip 
                                                    contentStyle={{ 
                                                        backgroundColor: isDark ? '#1E1E1E' : '#fff',
                                                        borderColor: isDark ? '#333' : '#eee'
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} md={12} lg={6}>
                                <Card title={<Space><BarChartOutlined /> Top rủi ro</Space>} size="small" className="chart-card">
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer>
                                            <BarChart layout="vertical" data={chartData.topMachines}>
                                                <XAxis type="number" hide />
                                                <YAxis dataKey="name" type="category" width={80} style={{ fontSize: '11px' }} stroke={isDark ? '#888' : '#666'} />
                                                <Tooltip 
                                                    contentStyle={{ 
                                                        backgroundColor: isDark ? '#1E1E1E' : '#fff',
                                                        borderColor: isDark ? '#333' : '#eee'
                                                    }}
                                                />
                                                <Bar dataKey="count" fill="#ff4d4f" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </Col>
                        </>
                    )}
                </Row>
            )}

            {/* ═══════ MAIN CONTENT (Mobile Optimized) ═══════ */}
            <div style={{ marginTop: 8 }}>
                {isArchiveMode ? (
                    /* 📁 Archive View */
                    selectedArchiveMachine ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Button icon={<ArrowLeftOutlined />} onClick={() => setSelectedArchiveMachine(null)}>Danh sách máy</Button>
                                {isMobile && <Tag color="orange">Offline</Tag>}
                            </div>
                            {isMobile ? (
                                filteredArchiveLogs.map(log => renderMobileLogItem(log))
                            ) : (
                                <Card className="chart-card">
                                    <Table columns={columns} dataSource={filteredArchiveLogs} size="small" rowKey={(r) => `${r.timestamp}-${Math.random()}`} />
                                </Card>
                            )}
                        </>
                    ) : (
                        <Row gutter={[12, 12]}>
                            {archiveMachines.map(m => (
                                <Col span={24} key={m.computerName + m.computerUser}>
                                    <Card onClick={() => setSelectedArchiveMachine(m)} hoverable size="small" style={{ borderLeft: '4px solid #faad14', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Space><Avatar icon={<DesktopOutlined />} style={{ background: '#faad14' }} /> <Text strong>{m.computerName}</Text></Space>
                                            <Badge count={m.totalAlerts} color="#faad14" />
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    )
                ) : selectedMachine ? (
                    /* 💻 Detail View */
                    <div>
                        {/* Detail Analytics Header (Hide on tiny screens if needed) */}
                        {!isMobile && detailLogs.length > 0 && (
                            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                <Col span={16}>
                                    <Card title="Hoạt động gần đây" size="small" className="chart-card">
                                        <div style={{ height: 150 }}>
                                            <ResponsiveContainer>
                                                <AreaChart data={detailChartData.trend}>
                                                    <XAxis dataKey="time" hide stroke={isDark ? '#888' : '#666'} />
                                                    <Tooltip 
                                                        contentStyle={{ 
                                                            backgroundColor: isDark ? '#1E1E1E' : '#fff',
                                                            borderColor: isDark ? '#333' : '#eee'
                                                        }}
                                                    />
                                                    <Area type="monotone" dataKey="count" stroke="var(--color-primary)" fill="var(--color-primary-light)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>
                                </Col>
                                <Col span={8}>
                                    <Card title="Loại vi phạm" size="small" className="chart-card">
                                        <div style={{ height: 150 }}>
                                            <ResponsiveContainer>
                                                <PieChart>
                                                    <Pie data={detailChartData.types} dataKey="value" nameKey="name" outerRadius={50} fill="var(--color-primary)" />
                                                    <Tooltip 
                                                        contentStyle={{ 
                                                            backgroundColor: isDark ? '#1E1E1E' : '#fff',
                                                            borderColor: isDark ? '#333' : '#eee'
                                                        }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>
                                </Col>
                            </Row>
                        )}

                        {isMobile ? (
                            <>
                                {detailLogs.map(log => renderMobileLogItem(log))}
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, gap: 12 }}>
                                    <Button disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)}>Trước</Button>
                                    <Tag style={{ margin: 0, display: 'flex', alignItems: 'center', background: 'var(--color-surface)', color: 'var(--color-text-main)', borderColor: 'var(--color-border)' }}>Trang {detailPage}</Tag>
                                    <Button disabled={detailLogs.length < detailPageSize} onClick={() => setDetailPage(p => p + 1)}>Sau</Button>
                                </div>
                            </>
                        ) : (
                            <Card className="chart-card">
                                <Table columns={columns} dataSource={detailLogs} rowKey="id" loading={loading} pagination={{ current: detailPage, total: detailTotal, onChange: p => setDetailPage(p) }} />
                            </Card>
                        )}
                    </div>
                ) : (
                    /* 🖥️ Machine List */
                    <Row gutter={[12, 12]}>
                        {filteredMachines.map(machine => (
                            <Col xs={24} sm={12} lg={8} key={machine.computerName + machine.computerUser}>
                                <Card 
                                    onClick={() => handleMachineClick(machine)} 
                                    hoverable 
                                    size="small" 
                                    className="machine-card"
                                    style={{ borderLeft: `4px solid ${getRiskLevel(machine).color}` }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Space>
                                            <Avatar icon={<DesktopOutlined />} style={{ backgroundColor: getRiskLevel(machine).color }} />
                                            <div>
                                                <Text strong style={{ color: 'var(--color-text-main)' }}>{machine.computerName}</Text>
                                                <br />
                                                <Text style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{machine.computerUser}</Text>
                                            </div>
                                        </Space>
                                        <div style={{ textAlign: 'right' }}>
                                            <Badge count={machine.totalAlerts} overflowCount={99} color="var(--color-primary)" />
                                            {machine.criticalAlerts > 0 && <div style={{ color: '#ff4d4f', fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>{machine.criticalAlerts} critical</div>}
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                )}
            </div>

            {/* 📁 Upload Modal */}
            <Modal title="Mở Nhật ký Lưu trữ (.zip)" open={uploadModalVisible} onCancel={() => setUploadModalVisible(false)} footer={null} width={isMobile ? '95%' : 600}>
                <Dragger name="file" accept=".zip" beforeUpload={handleUploadArchive} showUploadList={false}>
                    <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#faad14' }} /></p>
                    <p className="ant-upload-text">Kéo thả tệp ZIP vào đây</p>
                </Dragger>
            </Modal>
            </div>    );
};

export default MonitorLogsPage;
