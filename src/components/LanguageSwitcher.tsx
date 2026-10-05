// App chạy duy nhất tiếng Việt. Giữ component này như một no-op để các trang
// đã import (auth pages, ...) không vỡ; không render UI nào nữa.
export const LanguageSwitcher = () => null;
