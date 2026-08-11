// Type definitions matching Server models

export interface User {
    id?: string;
    username: string;
    role: string;
    fullName: string;
    email?: string;
    department?: string;
    position?: string;
    bio?: string;
    phoneNumber?: string;
    passwordHash?: string;
    publicKey?: string;
    avatarUrl?: string;
    faceEmbeddings?: number[];
    faceImageUrl?: string;
    managerId?: string;
    annualLeaveBalance?: number;
}

export interface LogEntry {
    id?: string;
    logType: string;
    severity: string;
    message: string;
    computerName: string;
    ipAddress: string;
    actionTaken: string;
    deviceId?: string | null;
    deviceName?: string | null;
    timestamp: string;
}

export interface Device {
    id?: string;
    deviceId: string;
    deviceName: string;
    description?: string;
    isAllowed: boolean;
    addedAt?: string;
}

export interface UsbAlert {
    deviceId: string;
    deviceName: string;
    computerName: string;
    ipAddress: string;
    timestamp: string;
    message: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: User;
    message?: string;
}

export interface AttendanceLog {
    id: string;
    userId: string;
    userName: string;
    checkInTime: string;
    method: string;
}

export interface MediaFile {
    type: string;
    url: string;
    thumbnailUrl?: string;
    fileName?: string;
    fileSize?: number;
}

export interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    authorAvatarUrl?: string;
    content: string;
    mediaFiles: MediaFile[];
    privacy: string;
    likedBy: string[];
    savedBy: string[];
    commentCount: number;
    shareCount: number;
    createdAt: string;
    updatedAt?: string;
    category?: string;
    type?: string;
    linkInfo?: LinkMetadata;
    isPinned?: boolean;
    reactions?: Record<string, string[]>;
    allowedRoles?: string[];
    allowedDepartments?: string[];
    isHidden?: boolean;
    isUrgent?: boolean;
    urgentReason?: string;
    pollOptions?: { text: string; voterIds: string[] }[];
    multipleChoice?: boolean;
    pollEndsAt?: string;
}

export interface LinkMetadata {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
}

export interface Comment {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl?: string;
    content: string;
    parentCommentId?: string;
    createdAt: string;
    reactions?: Record<string, string[]>;
    likedBy?: string[];
}

export interface LeaveRequest {
    id?: string;
    userId: string;
    userName: string;
    managerId?: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    approvedBy?: string;
    approvedAt?: string;
    rejectionReason?: string;
    createdAt?: string;
}
