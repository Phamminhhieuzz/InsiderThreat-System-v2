import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Các vật thể bị coi là nguy cơ ghi hình tài liệu.
// COCO không có nhãn riêng cho "máy ảnh": máy ảnh cầm tay thường được nhận
// thành 'cell phone' hoặc 'remote', nên phải bắt cả hai nhãn này.
const SUSPICIOUS_CLASSES = ['cell phone', 'remote', 'laptop', 'tv'];

// Ngưỡng chắc chắn. Hạ thấp để nhạy hơn, đổi lại dễ báo nhầm hơn.
const MIN_SCORE = 0.3;

// Kích thước ảnh đưa vào AI. Ảnh nhỏ thì suy luận nhanh hơn nhiều lần mà vẫn
// đủ để nhận ra vật thể lớn ở gần camera.
const DETECT_WIDTH = 320;
const DETECT_HEIGHT = 240;

// Thời gian tối thiểu giữ khóa kể từ lần cuối nhìn thấy vật thể.
// Phải tính bằng mili giây chứ không đếm số khung hình: khi tốc độ quét tăng
// lên, đếm khung hình sẽ nhả khóa chỉ sau một phần tư giây, đủ để chụp xong.
const LOCK_HOLD_MS = 3000;

// Cache toàn cục model AI để không phải tải lại mỗi lần mở popup xem tài liệu (tiết kiệm 20 giây mỗi lần)
let globalModelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export const preloadPhoneDetectorModel = () => {
    if (!globalModelPromise) {
        globalModelPromise = (async () => {
            // Ưu tiên WebGL (chạy trên GPU). Không có WebGL mới lùi về CPU.
            // Thiếu bước này, TensorFlow có thể im lặng chạy bằng CPU và chậm hàng chục lần.
            try {
                await tf.setBackend('webgl');
            } catch {
                await tf.setBackend('cpu');
            }
            await tf.ready();

            // 'lite_mobilenet_v2' là biến thể nhẹ nhất, đủ chính xác cho vật thể ở gần.
            const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

            // Chạy thử một khung hình trắng: lần suy luận đầu luôn tốn thời gian
            // biên dịch shader, làm xong trước thì lần quét thật sẽ phản hồi ngay.
            const warmup = tf.zeros([DETECT_HEIGHT, DETECT_WIDTH, 3], 'int32') as tf.Tensor3D;
            await model.detect(warmup as unknown as HTMLCanvasElement);
            warmup.dispose();

            return model;
        })();
    }
    return globalModelPromise;
};

export function usePhoneDetector(enabled = true) {
    const [isPhoneDetected, setIsPhoneDetected] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(enabled);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraGranted, setCameraGranted] = useState(!enabled); // Giả lập đã cấp quyền nếu không yêu cầu

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const requestAnimationFrameId = useRef<number | null>(null);
    const lastThreatAtRef = useRef(0);

    useEffect(() => {
        if (!enabled) {
            setIsLoadingAI(false);
            setCameraGranted(true);
            return;
        }

        let isMounted = true;

        const detectFrame = async () => {
            if (!isMounted) return;
            const video = videoRef.current;
            const model = modelRef.current;
            const canvas = canvasRef.current;
            if (!video || !model || !canvas) return;

            if (video.paused || video.ended) return;

            try {
                // Thu nhỏ khung hình trước khi đưa vào AI: đây là phần tăng tốc lớn nhất.
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);

                    // Giới hạn số hộp trả về và lọc ngưỡng ngay trong model
                    // để bớt việc xử lý thừa sau khi suy luận.
                    const predictions = await model.detect(canvas, 8, MIN_SCORE);

                    const threatFound = predictions.some(p => SUSPICIOUS_CLASSES.includes(p.class));

                    if (threatFound) {
                        // Khóa ngay từ khung hình đầu tiên thấy vật thể: ưu tiên bảo vệ tài liệu
                        // hơn là chờ xác nhận, vì chỉ cần một giây là chụp xong.
                        lastThreatAtRef.current = Date.now();
                        setIsPhoneDetected(true);
                    } else if (lastThreatAtRef.current > 0
                        && Date.now() - lastThreatAtRef.current >= LOCK_HOLD_MS) {
                        // Chỉ mở lại khi đã đủ khoảng lặng tính bằng thời gian thực.
                        // Nếu vật thể chỉ khuất trong chốc lát (nghiêng máy, rung tay)
                        // thì tài liệu vẫn phải bị che.
                        lastThreatAtRef.current = 0;
                        setIsPhoneDetected(false);
                    }
                }
            } catch (error) {
                console.error("Lỗi khi quét frame:", error);
            }

            requestAnimationFrameId.current = requestAnimationFrame(() => detectFrame());
        };

        const initializeDetector = async () => {
            try {
                const [stream, model] = await Promise.all([
                    // Xin độ phân giải vừa phải: quay 4K rồi thu nhỏ chỉ tổ tốn công.
                    navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }
                    }),
                    preloadPhoneDetectorModel()
                ]);

                if (!isMounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                modelRef.current = model;

                // Khung vẽ trung gian dùng lại cho mọi khung hình, không tạo mới mỗi lần.
                const canvas = document.createElement('canvas');
                canvas.width = DETECT_WIDTH;
                canvas.height = DETECT_HEIGHT;
                canvasRef.current = canvas;

                const videoElement = document.createElement('video');
                videoElement.srcObject = stream;
                videoElement.muted = true;
                videoElement.setAttribute('playsinline', 'true');

                // Đặt video vào DOM nhưng làm trong suốt để trình duyệt không ngắt frame
                videoElement.style.position = 'absolute';
                videoElement.style.opacity = '0';
                videoElement.style.pointerEvents = 'none';
                videoElement.style.width = '10px';
                videoElement.style.height = '10px';
                document.body.appendChild(videoElement);

                await videoElement.play();
                videoRef.current = videoElement;

                setCameraGranted(true);
                setIsLoadingAI(false);

                detectFrame();

            } catch (err: any) {
                console.error("Lỗi khởi tạo Camera hoặc AI:", err);
                if (!isMounted) return;
                setIsLoadingAI(false);
                setCameraGranted(false);
                setCameraError(`Hệ thống không thể khởi tạo: ${err.message || err.toString()}`);
            }
        };

        initializeDetector();

        return () => {
            isMounted = false;
            if (requestAnimationFrameId.current) {
                cancelAnimationFrame(requestAnimationFrameId.current);
            }
            if (videoRef.current) {
                if (videoRef.current.srcObject) {
                    const stream = videoRef.current.srcObject as MediaStream;
                    stream.getTracks().forEach(track => track.stop());
                }
                if (document.body.contains(videoRef.current)) {
                    document.body.removeChild(videoRef.current);
                }
            }
            canvasRef.current = null;
        };
    }, [enabled]);

    return { isPhoneDetected, isLoadingAI, cameraError, cameraGranted };
}
