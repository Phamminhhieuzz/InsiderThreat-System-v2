/**
 * Antd Static API Bridge
 * 
 * Ant Design v5 requires message/notification/modal to be consumed via
 * App.useApp() hook for proper theme context. This module provides a bridge
 * so that existing static calls (message.error(), etc.) still work with theme.
 * 
 * Usage: Import { staticMessage } from this file instead of { message } from 'antd'
 * Or use the AntdStaticProvider component to auto-configure antd's static methods.
 */

import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

let staticMessage: MessageInstance;
let staticNotification: NotificationInstance;
let staticModal: Omit<ModalStaticFunctions, 'warn'>;

export const setStaticInstances = (
    msg: MessageInstance,
    notif: NotificationInstance,
    mdl: Omit<ModalStaticFunctions, 'warn'>
) => {
    staticMessage = msg;
    staticNotification = notif;
    staticModal = mdl;
};

export { staticMessage, staticNotification, staticModal };
