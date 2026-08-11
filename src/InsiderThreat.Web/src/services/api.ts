import axios from 'axios';

// API Base URL - đọc từ biến môi trường (tự động chọn dev/production)
// Development: http://localhost:5038  (file .env)
// Production:  https://tuyen-thda.io.vn  (file .env.production)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://tuyen-thda.io.vn';

// Tạo axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 seconds default timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor: Tự động gắn JWT token vào mọi request
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Interceptor: Xử lý lỗi response
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Chỉ redirect nếu KHÔNG PHẢI đang ở trang login hoặc forgot-password
            const currentPath = window.location.pathname;
            const isAuthPage = currentPath === '/login' ||
                currentPath === '/face-login' ||
                currentPath === '/forgot-password';

            if (!isAuthPage) {
                // Unauthorized - xóa token và redirect về login
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Export API methods
export const api = {
    get: <T>(url: string, config?: any) => apiClient.get<T>(url, config).then((res) => res.data),
    post: <T>(url: string, data?: any, config?: any) => apiClient.post<T>(url, data, config).then((res) => res.data),
    put: <T>(url: string, data?: any, config?: any) => apiClient.put<T>(url, data, config).then((res) => res.data),
    patch: <T>(url: string, data?: any, config?: any) => apiClient.patch<T>(url, data, config).then((res) => res.data),
    delete: <T>(url: string) => apiClient.delete<T>(url).then((res) => res.data),
    postForm: <T>(url: string, data: FormData) => apiClient.post<T>(url, data, {
        headers: { 
            'Content-Type': undefined // Quan trọng: Để axios tự động set Content-Type và boundary cho FormData
        }
    }).then((res) => res.data),
};

export default api;
