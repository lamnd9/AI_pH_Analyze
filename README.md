# LabPrint - Hệ Thống Phân Tích Chỉ Số pH Mỹ Phẩm Bằng AI

Dự án fullstack hỗ trợ phân tích hình ảnh máy đo pH, tự động nhận diện Mã số mẫu và Lần đo thông qua Google Gemini AI (mô hình `gemini-3.1-pro-preview` / `gemini-3.5-flash`), tối ưu chất lượng ảnh tiết kiệm mực in và tự động gom nhóm để in báo cáo A4 chuyên nghiệp.

---

## 🛠 Cấu trúc dự án
* **/backend:** Máy chủ Python FastAPI chịu trách nhiệm xử lý làm sáng, tương phản ảnh bằng Pillow và giao tiếp với Google Gemini API.
* **/frontend:** Ứng dụng Next.js (React + Tailwind CSS) cung cấp giao diện tải ảnh, cắt ảnh (4:3), sửa đổi thông tin và in ấn báo cáo.

---

## 🚀 Hướng dẫn khởi chạy dự án tại máy Local

### BƯỚC 1: Khởi chạy Python Backend

1. Mở terminal và di chuyển vào thư mục backend:
   ```bash
   cd backend
   ```

2. Tạo và kích hoạt môi trường ảo (Virtual Environment):
   * **Trên macOS / Linux:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   * **Trên Windows:**
     ```cmd
     python -m venv venv
     venv\Scripts\activate
     ```

3. Cài đặt các thư viện phụ thuộc:
   ```bash
   pip install -r requirements.txt
   ```

4. Thiết lập biến môi trường:
   * Tạo tệp tên là `.env` trong thư mục `backend/`
   * Thêm khóa Gemini API của bạn vào đó:
     ```env
     GEMINI_API_KEY=mã_api_key_gemini_của_bạn
     ```

5. Khởi động server FastAPI:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   * *Mặc định Backend sẽ chạy tại địa chỉ: `http://localhost:8000`*

---

### BƯỚC 2: Khởi chạy Frontend Next.js

1. Mở một cửa sổ Terminal mới và di chuyển vào thư mục frontend:
   ```bash
   cd frontend
   ```

2. Cài đặt các gói thư viện Node.js:
   ```bash
   npm install
   ```

3. Khởi chạy máy chủ phát triển (Development Server):
   ```bash
   npm run dev
   ```
   * *Mặc định Frontend sẽ chạy tại địa chỉ: `http://localhost:3000`*

---

## 🔍 Kiểm tra hoạt động
1. Mở trình duyệt web và truy cập địa chỉ: [http://localhost:3000](http://localhost:3000).
2. Tải lên ảnh chụp cốc đo pH (có nhãn ghi mã mẫu nằm trong khung màu xanh).
3. Nhấp **Bắt đầu nhận diện AI** để quét ảnh.
4. Di chuột qua card ảnh, bấm **Crop (Cắt ảnh)** nếu cần điều chỉnh vùng hiển thị khớp khung in 4:3.
5. Kiểm tra kết quả trong biểu mẫu A4 và bấm **In tất cả các trang** để kết xuất PDF/In giấy.
