# LabPrint - Hệ Thống Phân Tích Chỉ Số pH Mỹ Phẩm Bằng AI

Dự án fullstack hỗ trợ phân tích hình ảnh máy đo pH, tự động nhận diện Mã số mẫu và Lần đo thông qua Google Gemini AI hoặc OCR.Space API, tối ưu chất lượng ảnh tiết kiệm mực in và tự động gom nhóm để in báo cáo A4 chuyên nghiệp.

---

## 🛠 Cấu trúc dự án
* **/backend:** Máy chủ Python FastAPI tái cấu trúc mô-đun hóa (`services/`):
  * `services/gemini_service.py`: Xử lý phân tích bằng Google Gemini 3.5 Flash SDK.
  * `services/ocr_space_service.py`: Xử lý phân tích bằng OCR.Space API (Engine 3) & bộ trích xuất regex văn bản thô.
  * `main.py`: Tự động điều hướng Provider dựa vào biến môi trường `OCR_PROVIDER`.
* **/frontend:** Ứng dụng Next.js (React + Tailwind CSS) cung cấp giao diện tải ảnh, cắt ảnh (4:3), sửa đổi thông tin và in ấn báo cáo.

---

## ⚙️ Thiết lập Bộ xử lý OCR (OCR Provider)

Trong tệp `backend/.env` (hoặc biến môi trường trên Render), bạn có thể lựa chọn dịch vụ nhận diện:

```env
# Chọn Provider: 'gemini' (Mặc định) hoặc 'ocr_space'
OCR_PROVIDER=gemini

# Khóa Google Gemini API
GEMINI_API_KEY=AIzaSy...

# Khóa OCR.Space API (nếu dùng provider ocr_space)
OCR_SPACE_API_KEY=K86109868088957
```

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

4. Thiết lập biến môi trường tệp `.env` trong thư mục `backend/`.

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
2. Tải lên ảnh chụp cốc đo pH (có nhãn ghi mã mẫu).
3. Nhấp **Bắt đầu nhận diện AI** để quét ảnh.
4. Kiểm tra kết quả trong biểu mẫu A4 và bấm **In tất cả các trang** để kết xuất PDF/In giấy.
