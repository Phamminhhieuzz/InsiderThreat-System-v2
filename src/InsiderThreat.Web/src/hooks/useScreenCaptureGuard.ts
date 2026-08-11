import { useState, useEffect, useRef } from 'react';

export type CaptureRiskReason =
    | 'printscreen'      // Bấm phím Print Screen
    | 'window-blur'      // Cửa sổ mất tiêu điểm (thường do công cụ cắt màn hình chiếm quyền)
    | 'page-hidden'      // Chuyển tab hoặc thu nhỏ cửa sổ
    | 'print-shortcut'   // Ctrl+P
    | 'save-shortcut';   // Ctrl+S

const REASON_LABEL: Record<CaptureRiskReason, string> = {
    'printscreen': 'Nhấn phím Print Screen',
    'window-blur': 'Cửa sổ mất tiêu điểm (nghi dùng công cụ cắt màn hình)',
    'page-hidden': 'Rời khỏi tab đang xem tài liệu',
    'print-shortcut': 'Dùng tổ hợp in tài liệu (Ctrl+P)',
    'save-shortcut': 'Dùng tổ hợp lưu trang (Ctrl+S)',
};

// Thời gian giữ khóa sau một hành vi khả nghi rời rạc như bấm Print Screen.
const LOCK_HOLD_MS = 4000;

/**
 * Phát hiện các dấu hiệu người dùng đang tìm cách chụp lại tài liệu.
 *
 * Giới hạn cần biết: trình duyệt KHÔNG có quyền chặn chụp màn hình ở cấp hệ
 * điều hành, cũng không nhận được thông báo khi ảnh đã được chụp. Hook này chỉ
 * bắt các dấu hiệu quan sát được rồi che tài liệu ngay lập tức và ghi log —
 * đủ để răn đe và truy vết, không phải một lớp chặn tuyệt đối.
 */
export function useScreenCaptureGuard(
    enabled = true,
    onRisk?: (reason: CaptureRiskReason, label: string) => void
) {
    const [isCaptureRisk, setIsCaptureRisk] = useState(false);
    const [lastReason, setLastReason] = useState<CaptureRiskReason | null>(null);
    const holdTimerRef = useRef<number | null>(null);
    const onRiskRef = useRef(onRisk);

    // Giữ tham chiếu mới nhất để không phải gắn lại toàn bộ sự kiện mỗi lần render.
    useEffect(() => { onRiskRef.current = onRisk; }, [onRisk]);

    useEffect(() => {
        if (!enabled) {
            setIsCaptureRisk(false);
            return;
        }

        const clearHold = () => {
            if (holdTimerRef.current !== null) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
            }
        };

        const raise = (reason: CaptureRiskReason, sticky: boolean) => {
            setLastReason(reason);
            setIsCaptureRisk(true);
            onRiskRef.current?.(reason, REASON_LABEL[reason]);

            clearHold();
            if (!sticky) {
                // Hành vi rời rạc: che một lúc rồi trả lại tài liệu.
                holdTimerRef.current = window.setTimeout(() => setIsCaptureRisk(false), LOCK_HOLD_MS);
            }
            // sticky = true: giữ che cho tới khi người dùng quay lại cửa sổ.
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Print Screen chỉ báo ở keyup trên phần lớn trình duyệt, nhưng bắt cả hai cho chắc.
            if (e.key === 'PrintScreen') {
                raise('printscreen', false);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                raise('print-shortcut', false);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                raise('save-shortcut', false);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'PrintScreen') raise('printscreen', false);
        };

        // Công cụ cắt màn hình của Windows (Win+Shift+S) chiếm tiêu điểm khỏi trình
        // duyệt. Không bắt được tổ hợp phím đó, nhưng bắt được lúc mất tiêu điểm.
        const handleBlur = () => raise('window-blur', true);
        const handleFocus = () => { clearHold(); setIsCaptureRisk(false); };

        const handleVisibility = () => {
            if (document.hidden) raise('page-hidden', true);
            else { clearHold(); setIsCaptureRisk(false); }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearHold();
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled]);

    return { isCaptureRisk, lastReason, lastReasonLabel: lastReason ? REASON_LABEL[lastReason] : null };
}
