import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import i18n from 'i18next'
import './index.css'
import './i18n' // Import i18n
import App from './App.tsx'

import { ThemeProvider } from './context/ThemeContext.tsx'

// Đồng bộ thuộc tính lang của thẻ <html> với ngôn ngữ đang chọn.
// Nếu để lệch (ví dụ lang="en" nhưng nội dung tiếng Việt), Chrome sẽ tưởng
// trang cần dịch và tự động dịch đè lên, làm chữ bị lặp và hoa/thường lẫn lộn.
const syncHtmlLang = (lng?: string) => {
  document.documentElement.lang = (lng || 'vi').split('-')[0]
}

syncHtmlLang(i18n.resolvedLanguage || i18n.language)
i18n.on('languageChanged', syncHtmlLang)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
