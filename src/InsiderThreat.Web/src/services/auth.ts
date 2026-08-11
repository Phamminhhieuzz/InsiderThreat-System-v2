import { api } from './api';
import type { LoginRequest, LoginResponse, User } from '../types';

export const authService = {
    // Đăng nhập
    async login(username: string, password: string): Promise<LoginResponse> {
        const response = await api.post<LoginResponse>('/api/auth/login', {
            username,
            password,
        } as LoginRequest);

        // Lưu token và user vào localStorage
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));

        return response;
    },

    // Lưu session sau khi login thành công (dùng cho FaceID)
    setSession(user: any, token: string) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
    },

    // Đăng xuất — giữ lại RSA key pair trên thiết bị để giải mã tin nhắn cũ khi đăng nhập lại
    logout(): void {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    // Lấy user hiện tại
    getCurrentUser(): User | null {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            return JSON.parse(userStr);
        }
        return null;
    },

    // Kiểm tra đã đăng nhập chưa
    isAuthenticated(): boolean {
        return !!localStorage.getItem('token');
    },

    // Lấy token
    getToken(): string | null {
        return localStorage.getItem('token');
    },

    // Sự kiện khi thông tin user thay đổi (để đồng bộ avatar, tên... toàn app)
    dispatchUserUpdate(user: User): void {
        localStorage.setItem('user', JSON.stringify(user));
        const event = new CustomEvent('auth-user-updated', { detail: user });
        window.dispatchEvent(event);
    }
};

export default authService;

