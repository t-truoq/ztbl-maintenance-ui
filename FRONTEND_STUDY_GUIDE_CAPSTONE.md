# 🎓 CẨM NANG ÔN TẬP VÀ LÀM CHỦ SOURCE CODE FRONTEND (CAPSTONE SAP490)
> **Dự án**: Universal Z-Table Data Maintenance Program with Audit and Excel Integration (`Z-MAINT`)  
> **Module**: SAP ABAP RAP / SAP Fiori / OData V4 / React  
> **Thời gian ôn tập mục tiêu**: 7 ngày (Toàn thời gian)

---

## 📑 MỤC LỤC
1. [Bản Đồ Công Nghệ & Thư Viện (Tech Stack Overview)](#1-bản-đồ-công-nghệ--thư-viện)
2. [Lộ Trình 7 Ngày Làm Chủ Source Code](#2-lộ-trình-7-ngày-làm-chủ-source-code)
3. [Luồng Hoạt Động Cốt Lõi Cần Nhớ (Core Flows)](#3-luồng-hoạt-động-cốt-lõi-cần-nhớ)
4. [Bộ 15 Câu Hỏi & Trả Lời Vấn Đáp Hội Đồng](#4-bộ-15-câu-hỏi--trả-lời-vấn-đáp-hội-đồng)
5. [Chiến Thuật & Phong Thái Bảo Vệ Đồ Án](#5-chiến-thuật--phong-thái-bảo-vệ)

---

## 1. BẢN ĐỒ CÔNG NGHỆ & THƯ VIỆN

| Công nghệ / Thư viện | Vị trí trong Source Code | Mục đích & Trả lời Hội đồng |
| :--- | :--- | :--- |
| **React 19 + TypeScript** | Thư mục `src/` | Xây dựng Single Page App linh hoạt, Dynamic UI, type-safety chống lỗi runtime lúc build. |
| **Vite 6 / 8** | `vite.config.js`, `package.json` | Build tool siêu tốc, cấu hình Proxy `/sap` để dev ở localhost và build bundle dạng BSP tương thích SAP Fiori Launchpad. |
| **`@ui5/webcomponents-react`** | `AppLayout.tsx`, `DynamicDataTable.tsx`, `CellEditControl.tsx`,... | Bộ UI Components chuẩn thiết kế **SAP Fiori Design System** (SideNavigation, Table, Button, Dialog, CheckBox, Input, DatePicker,...). Giúp giao diện React đồng nhất 100% với SAP standard. |
| **Axios** | `src/services/apiClient.ts` | Giao tiếp HTTP với OData V4 Backend, tự động quản lý Basic Auth token, Session Cookie, và `x-csrf-token`. |
| **`read-excel-file`** | `src/utils/excelImportHeaders.ts`, `ExcelPipelineTab.tsx` | Đọc file Excel `.xlsx` trực tiếp trên trình duyệt để trích xuất header và preview diff trước khi gửi lên SAP. |
| **Vitest** | Toàn bộ các file `.test.ts`, `.test.js` | Unit test tự động cho toàn bộ logic formatters, validators, payload builder (174 tests). |

---

## 2. LỘ TRÌNH 7 NGÀY LÀM CHỦ SOURCE CODE

```
[Ngày 1: Luồng Khởi động, Gọi API & Khung Sườn AppLayout]
       │
[Ngày 2: Trái tim Dynamic Metadata & Render Bảng Động]
       │
[Ngày 3: Luồng Chỉnh sửa Inline & CRUD Dữ liệu]
       │
[Ngày 4: Luồng Excel Pipeline (Upload, Diff, Confirm)]
       │
[Ngày 5: Phân quyền & Vết Audit / Rollback]
       │
[Ngày 6: Bộ 4 Ứng dụng Fiori Elements Governance]
       │
[Ngày 7: Mock Interview - Luyện tập trả lời vấn đáp]
```

---

### 🗓️ NGÀY 1: Luồng Khởi Động & Giao Tiếp SAP (API Client, Shell Layout & Auth)
* **File cần đọc**:
  - `src/App.tsx` (Root Coordinator điều phối State)
  - `src/components/AppLayout.tsx` (Khung sườn UI: Header + Sidebar danh sách bảng Z)
  - `src/services/apiClient.ts` (Hạ tầng mạng OData V4, Basic Auth, CSRF Token)
  - `src/services/tableConfigApi.ts` (Hàm `getTables()` nạp danh sách bảng)
* **Nội dung cần nắm**:
  - Khi mở app, `App.tsx` gọi `getTables()` trong `tableConfigApi.ts` để lấy danh sách bảng Z đã kích hoạt.
  - Dữ liệu bảng được truyền vào `AppLayout.tsx` để render Sidebar bên trái bằng `<SideNavigation>` và `<SideNavigationItem>`.
  - Sidebar hỗ trợ tìm kiếm nhanh (`sidebarSearch`) và thu gọn/mở rộng menu (`collapsed`).
  - `AppLayout.tsx` có đoạn code đặc biệt đo đạc độ lệch chiều cao (`measureShellOverlap`) để khi chạy trong SAP Fiori Launchpad không bị thanh Menu Header của SAP đè lên giao diện.
  - `apiClient.ts` hoạt động thế nào: Lấy `sap_credentials` từ `sessionStorage` (hoặc cookie SAP FLP), tự động gửi header `Authorization: Basic ...` và lấy `X-CSRF-Token` trước khi gọi các request `POST`/`PATCH`.

---

### 🗓️ NGÀY 2: Trái Tim "Metadata-Driven" (Render Bảng Động)
* **File cần đọc**:
  - `src/utils/fieldMeta.ts`
  - `src/components/DynamicDataTable.tsx`
  - `src/utils/displayHelpers.ts`
* **Nội dung cần nắm**:
  - **Vì sao không code cứng cột mà bảng nào cũng hiển thị được?**  
    Do hàm `loadTableContext` gọi `getFieldMeta` (lấy danh sách trường `ZFLD_CONFIG` + DDIC) $\rightarrow$ sinh ra mảng `fields: FieldMeta[]`.
  - `DynamicDataTable.tsx` dùng vòng lặp `fields.map(...)` để sinh thẻ `<TableHeaderCell>` và `<TableCell>` bằng CSS Grid động (`columnsStyle`).
  - Định dạng hiển thị: Hàm `formatCellValue()` phân loại (UUID, Date, Boolean X='', Timestamp) để đưa ra UI đẹp mắt.

---

### 🗓️ NGÀY 3: Luồng Chỉnh Sửa Inline & CRUD (Create - Update - Delete)
* **File cần đọc**:
  - `src/components/CellEditControl.tsx`
  - `src/pages/TableMaintenance/hooks/useTableMaintenance.ts`
* **Nội dung cần nắm**:
  - Khi bấm **Edit** hoặc **Add Row**, `CellEditControl.tsx` chọn control nhập liệu gì?
    - `fe_type === 'date'` $\rightarrow$ `<DatePicker>`
    - `fe_type === 'boolean'` $\rightarrow$ `<CheckBox>`
    - `fe_type === 'domain'` $\rightarrow$ `<DomainValueHelp>` (Dropdown lấy từ `DD07L`)
    - `fe_type === 'fk_select'` $\rightarrow$ `<FkValueHelp>` (Search help lấy từ check table)
    - Còn lại $\rightarrow$ `<Input>` text thông thường.
  - Khi bấm **Save**: Gọi `formatPayload()` để strip (loại bỏ) các trường hệ thống (`CREATED_AT`, `CHANGED_AT`, `MANDT`), kiểm tra ETag chống xung đột rồi gửi xuống RAP Action `createRecord`/`updateRecord`.

---

### 🗓️ NGÀY 4: Luồng Excel Pipeline
* **File cần đọc**:
  - `src/components/ExcelPipelineTab.tsx`
  - `src/services/excelPipelineApi.ts`
  - `src/utils/excelImportHeaders.ts`
* **Nội dung cần nắm**:
  - **Export**: Gọi `downloadExcel` lấy chuỗi Base64 từ SAP Backend (sinh bởi thư viện `abap2xlsx`), giải mã thành file `.xlsx` tải về máy.
  - **Upload & Diff**: Đọc file `.xlsx` $\rightarrow$ Base64 gửi lên `uploadExcel` $\rightarrow$ Backend trả về danh sách so sánh Diff (`NEW`, `CHANGED`, `DELETE`, `UNCHANGED`, `SKIPPED`, `ERROR`) $\rightarrow$ Frontend render bảng đối soát trực quan.
  - **Confirm**: Gửi `diff_json` qua action `confirmImport` để ghi nhận vào DB.

---

### 🗓️ NGÀY 5: Phân Quyền (Auth) & Vết Audit Log / Rollback
* **File cần đọc**:
  - `src/utils/authz.ts`
  - `src/components/AuditLogPanel.tsx`
  - `src/utils/auditLogHelpers.ts`
* **Nội dung cần nắm**:
  - Phân quyền: Đọc từ `ZTBL_USER_MASTER` và `ZTBL_USER_PERM`. Nếu không có quyền (ví dụ `DEV-183` bị chặn `VIEW`), Backend trả về `error_msg` $\rightarrow$ Frontend bắt lỗi và hiển thị Banner màu đỏ chặn màn hình.
  - Audit Log: Đọc từ `ZTBL_AUDIT` & `ZTBL_AUDIT_ITEM`.
  - Rollback: Khi ADMIN bấm Rollback, gọi `POST /AuditLog(AuditId=...)/rollback`, Backend hoàn tác dữ liệu cũ và ghi 1 record audit mới với `ActionType = 'R'`.

---

### 🗓️ NGÀY 6: Kiến Trúc 4 Ứng Dụng Fiori Elements Governance
* **File cần xem**: Thư mục `uiux-fiori-elements/apps/`
* **Nội dung cần nắm**:
  - **Tại sao Governance lại dùng Fiori Elements mà Table Maintenance lại dùng React?**
    - **Governance apps** (Table Config, Approval, Audit, Auth) có cấu trúc dữ liệu **cố định (Static Schema)** $\rightarrow$ Dùng chuẩn **SAP Fiori Elements (List Report / Object Page)** theo đúng chuẩn enterprise của SAP.
    - **Table Maintenance app** duy trì hàng trăm bảng Z bất kỳ với cấu trúc cột **thay đổi liên tục lúc runtime (Dynamic Schema)** $\rightarrow$ Fiori Elements chuẩn không hỗ trợ dynamic table schema $\rightarrow$ Phải dùng **React + UI5 Web Components** để render động! *(Đây là luận điểm ăn điểm tuyệt đối trước Hội đồng)*.

---

### 🗓️ NGÀY 7: Tự Vấn Đáp & Luyện Trình Bày (Dry Run)
* Tự đặt câu hỏi và trả lời to rõ ràng theo 15 câu hỏi ở phần 4.

---

## 3. LUỒNG HOẠT ĐỘNG CỐT LÕI CẦN NHỚ

### A. Luồng Render Dynamic Table (BP-02)
1. User click chọn bảng trên Sidebar trong `AppLayout.tsx`.
2. FE gọi song song:
   - `loadFieldMetaForTable()`: Lấy cấu hình cột `ZFLD_CONFIG` + kiểu dữ liệu `DDIC`.
   - `getTableData()`: Lấy tối đa 100 dòng dữ liệu bảng `target`.
3. Nếu Backend trả về `error_msg` (chặn quyền `VIEW`): FE văng lỗi $\rightarrow$ Hiện Banner đỏ `User ... is not allowed to VIEW on ...`.
4. Nếu thành công:
   - Tính toán `columnsStyle` (CSS Grid width cho từng cột dựa vào độ dài tiêu đề).
   - Render từng dòng dữ liệu và áp dụng `formatCellValue()`.

### B. Luồng Lưu Dữ Liệu Chỉnh Sửa (BP-03 & BP-04)
1. User chỉnh sửa các ô trên bảng (Inline Edit).
2. Khi bấm **Save**:
   - Chạy `validateTableData()` ở Frontend để kiểm tra rỗng các trường bắt buộc (`mandatory`).
   - Chạy `formatPayload()` để loại bỏ toàn bộ System Audit Fields (`CREATED_AT`, `CHANGED_AT`, `MANDT`).
   - Gửi payload JSON xuống Backend.
3. Backend kiểm tra cờ `APPROVAL_REQUIRED`:
   - Nếu `= ''` (Không cần duyệt): Ghi thẳng DB target + Ghi lịch sử `ZTBL_AUDIT`.
   - Nếu `= 'X'` (Cần duyệt): Không ghi DB target $\rightarrow$ Tạo bản ghi chờ duyệt `PENDING` trong `ZTBL_APRVL` $\rightarrow$ Chuyển quyền sang cho ADMIN duyệt ở ứng dụng Approval Inbox (BP-04).

---

## 4. BỘ 15 CÂU HỎI & TRẢ LỜI VẤN ĐÁP HỘI ĐỒNG

#### ❓ Câu 1: Tại sao nhóm lại kết hợp cả React và SAP Fiori Elements trong cùng một dự án?
> **Trả lời**:  
> *"Dạ thưa Hội đồng, đây là quyết định kiến trúc có chủ đích của nhóm em:*  
> *- 4 ứng dụng Quản trị (Table Config, Approval Inbox, Audit Log, Auth Management) có cấu trúc dữ liệu **cố định (Static Schema)** nên nhóm áp dụng **SAP Fiori Elements V4 OData** để tuân thủ 100% chuẩn thiết kế Enterprise và tiết kiệm công sức phát triển.*  
> *- Riêng ứng dụng Duy trì dữ liệu (Dynamic Table Maintenance), do phải duy trì bất kỳ bảng Z nào với số lượng và kiểu cột **thay đổi linh hoạt lúc runtime (Dynamic Schema)** mà Fiori Elements chuẩn không hỗ trợ, nhóm em đã chọn **React kết hợp UI5 Web Components** để toàn quyền kiểm soát việc render dynamic grid mà vẫn giữ trọn vẹn trải nghiệm giao diện SAP Fiori chuẩn."*

---

#### ❓ Câu 2: Làm thế nào mà Frontend biết bảng đó có những field nào, kiểu dữ liệu gì để render ra giao diện?
> **Trả lời**:  
> *"Dạ, hệ thống hoạt động theo cơ chế **Metadata-Driven**:*  
> *1. Khi user chọn bảng, FE gọi action `getFieldMeta` xuống SAP Backend.*  
> *2. Backend kết hợp cấu hình hiển thị trong bảng `ZFLD_CONFIG` và từ điển dữ liệu SAP DDIC (`DD03L`, `DD04T`) để trả về mảng Metadata (tên trường, nhãn label, kiểu dữ liệu `fe_type`, thứ tự `display_order`, trường khóa `is_key`).*  
> *3. Tại component `DynamicDataTable.tsx`, FE duyệt mảng `fields` này để sinh động CSS Grid Columns và các Cell tương ứng.*  
> *4. Tại `CellEditControl.tsx`, FE dựa vào `fe_type` để tự động render đúng Component nhập liệu (Datepicker cho ngày, CheckBox cho boolean, Dropdown cho Domain fixed-values, Search help cho Foreign Key)."*

---

#### ❓ Câu 3: Dữ liệu JSON khi gửi từ FE lên BE để lưu hoặc rollback có bị lỗi kiểu dữ liệu không? Nhóm xử lý thế nào?
> **Trả lời**:  
> *"Dạ, nhóm em đã xử lý chặt chẽ ở cả 2 đầu:*  
> *1. Các trường hệ thống (`CREATED_AT`, `CHANGED_AT`, `MANDT`) được Backend tự động sinh (`iv_force = abap_true`). Do đó tại hàm `formatPayload()` và `stripClientFields()`, Frontend chủ động lọc bỏ các trường này trước khi gửi JSON để tránh lỗi ép kiểu `CX_SY_CONVERSION_NO_DATE_TIME` trong ABAP.*  
> *2. Dữ liệu ngày tháng (`YYYY-MM-DD`) và timestamp (`YYYYMMDDhhmmss`) được chuẩn hóa qua bộ hàm tiện ích `abapFormatter.ts` và `displayHelpers.ts`, được bảo vệ bởi hơn 170 Unit Test cases chạy tự động bằng Vitest."*

---

#### ❓ Câu 4: Cơ chế Khóa (Locking) trên giao diện hoạt động như thế nào để tránh 2 người cùng sửa 1 bảng?
> **Trả lời**:  
> *"Dạ, ứng dụng sử dụng cơ chế **Application Lock** (`ZTBL_LOCK`):*  
> *- Khi User bắt đầu bật chế độ Edit hoặc Add Row, Frontend gọi action `acquireLock` với `sessionId` và `TTL = 300 giây`.*  
> *- Trong quá trình chỉnh sửa, FE liên tục gửi `heartbeat` định kỳ để gia hạn thời gian khóa.*  
> *- Nếu User khác vào sửa cùng lúc, Backend từ chối và FE sẽ hiển thị thanh cảnh báo màu vàng thông báo rõ ai đang giữ khóa (ví dụ: `Table is locked by user DEV-253`).*  
> *- Khi lưu hoặc hủy chỉnh sửa, FE tự động gọi `releaseLock`."*

---

#### ❓ Câu 5: Tính năng Search Help (F4) và Dropdown giá trị cố định được FE gọi và hiển thị ra sao?
> **Trả lời**:  
> *"Dạ:*  
> *- Đối với trường có Domain Fixed Values (ví dụ trạng thái A/I): FE gọi action `getDomainValues` lấy danh sách mã và mô tả từ `DD07L` rồi render thẻ `<Select>` hoặc `<ComboBox>`.*  
> *- Đối với trường có Khóa ngoại (Check Table): FE gọi action `getFkValues` để đọc dữ liệu từ bảng check table tương ứng và hiển thị hộp thoại Value Help Dialog kèm ô tìm kiếm cho người dùng chọn."*

---

#### ❓ Câu 6: Làm thế nào ứng dụng hiển thị được tiếng Việt có dấu khi Export/Import Excel?
> **Trả lời**:  
> *"Dạ, luồng Export Excel được Backend ABAP xử lý thông qua thư viện `abap2xlsx` xuất ra chuỗi nhị phân mã hóa Base64 UTF-8. Khi Frontend nhận chuỗi Base64, FE chuyển đổi thành Blob với MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` nên bảo toàn 100% font chữ và tiếng Việt có dấu."*

---

#### ❓ Câu 7: Khi User upload file Excel lên, làm sao FE biết dòng nào là Thêm mới (NEW), dòng nào là Sửa (CHANGED), dòng nào Bị xóa (DELETE)?
> **Trả lời**:  
> *"Dạ, khi user tải file Excel lên, hàm `uploadExcel` trên Backend sẽ so sánh dữ liệu trong file Excel với dữ liệu hiện tại trong Database:*  
> *- Khóa chính chưa có trong DB $\rightarrow$ Gán trạng thái `NEW`.*  
> *- Khóa chính đã có nhưng giá trị các cột khác bị đổi $\rightarrow$ Gán trạng thái `CHANGED`.*  
> *- Cột Action trong Excel ghi DELETE $\rightarrow$ Gán trạng thái `DELETE`.*  
> *- Dữ liệu giống hệt DB $\rightarrow$ Gán `UNCHANGED`.*  
> *Frontend nhận kết quả này và dùng CSS highlight màu sắc trực quan (Xanh lá cho NEW, Vàng cam cho CHANGED, Đỏ cho DELETE) để user đối soát trước khi bấm Xác nhận."*

---

#### ❓ Câu 8: Nếu người dùng không có quyền truy cập bảng (ví dụ bị chặn quyền VIEW), giao diện hiển thị thế nào?
> **Trả lời**:  
> *"Dạ, khi gọi `getTableData`, nếu user không có quyền VIEW trong bảng `ZTBL_USER_PERM`, Backend sẽ trả về `error_msg: 'User ... is not allowed to VIEW on ...'`. Hàm `getTableData` ở Frontend sẽ chủ động bắt thông điệp này và ném ra Exception, kích hoạt thanh thông báo lỗi màu đỏ (Error Banner) trên đầu trang và xóa trắng vùng dữ liệu để bảo mật."*

---

#### ❓ Câu 9: Tính năng AI Field Description trong dự án hỗ trợ người dùng như thế nào?
> **Trả lời**:  
> *"Dạ, tại Tab **Field Schema** hoặc nút **(?)** trên tiêu đề cột, khi user click vào, FE sẽ gọi action `getAiDescription`. Backend gửi ngữ cảnh (Tên trường, Data Element, Bảng chứa) tới Google Gemini API (sử dụng API Key mã hóa trong `ZAI_APIKEYS`) để sinh ra đoạn giải thích ngắn gọn, dễ hiểu về ý nghĩa nghiệp vụ của trường đó cho người dùng doanh nghiệp."*

---

#### ❓ Câu 10: ETag trong dự án dùng để làm gì và FE xử lý nó ra sao?
> **Trả lời**:  
> *"Dạ, ETag dùng cho cơ chế **Optimistic Concurrency Control** (Kiểm soát xung đột đồng thời):*  
> *- Khi đọc dữ liệu lên, FE lưu vết giá trị ETag (thường là trường `CHANGED_AT` hoặc `TIMESTAMP`).*  
> *- Khi gửi bản ghi lên để Update, FE gửi kèm ETag này.*  
> *- Nếu trong lúc user đang mở màn hình mà có người khác đã sửa bản ghi đó trước, Backend phát hiện ETag bị lệch và báo lỗi `Optimistic Lock Conflict` $\rightarrow$ FE sẽ mở hộp thoại `OptimisticLockDialog` thông báo dữ liệu đã bị thay đổi và hỏi người dùng có muốn tải lại dữ liệu mới nhất không."*

---

#### ❓ Câu 11: Unit Test của Frontend được viết bằng công cụ gì và kiểm tra những gì?
> **Trả lời**:  
> *"Dạ, nhóm em sử dụng **Vitest** kết hợp với `@testing-library/react` để viết 174 test cases tự động, tập trung kiểm tra:*  
> *1. Logic ép kiểu và định dạng ngày tháng, timestamp, UUID trong `abapFormatter.test.js` và `displayHelpers.test.js`.*  
> *2. Logic lọc bỏ system fields và kiểm tra tính hợp lệ của JSON payload trong `fieldMeta.test.js` và `recordHelpers.test.js`.*  
> *3. Logic phân quyền và kiểm tra vai trò người dùng trong `authz.test.js`.*  
> *4. Logic đọc và trích xuất header file Excel trong `excelImportHeaders.test.ts`."*

---

#### ❓ Câu 12: Làm thế nào để ứng dụng React này chạy được bên trong SAP Fiori Launchpad (FLP)?
> **Trả lời**:  
> *"Dạ, trong file `vite.config.js`, nhóm em cấu hình `base: './'` khi build production. Bundle sau khi build ra thư mục `dist/` sẽ được đóng gói dưới dạng ứng dụng SAP UI5 / BSP Application (`ZZTBL_MAINT_UI`) thông qua công cụ `@sap/ux-ui5-tooling` và file `ui5-deploy.yaml`. Từ đó, SAP Fiori Launchpad có thể cấu hình Semantic Object và Action (`#ZTableMaintenance-manage`) để nhúng trực tiếp ứng dụng vào FLP."*

---

#### ❓ Câu 13: Khi một bảng có 50 cột thì giao diện hiển thị có bị vỡ hoặc giật lag không?
> **Trả lời**:  
> *"Dạ không, vì nhóm em đã áp dụng 3 kỹ thuật tối ưu:*  
> *1. Bảng được bọc trong container có thanh cuộn ngang `overflowMode='Scroll'` với CSS Grid phân định rõ độ rộng tối thiểu (`minColWidth`) cho từng cột.*  
> *2. Giới hạn số lượng bản ghi tải về mỗi lần (`bounded read: max 100 rows`).*  
> *3. Cho phép người dùng tùy ý ẩn/hiện bớt các cột không cần thiết thông qua cấu hình `HiddenFlag` trong Tab Field Schema."*

---

#### ❓ Câu 14: Tại sao trong chế độ Edit, một số trường khóa chính (Primary Key) lại bị mờ đi không cho sửa?
> **Trả lời**:  
> *"Dạ, đối với thao tác Update dòng dữ liệu có sẵn, Khóa chính (Primary Key) là định danh bất biến của bản ghi trong cơ sở dữ liệu SAP nên `CellEditControl.tsx` sẽ tự động khóa thuộc tính `disabled = true`. Riêng trường hợp tạo mới dòng (`_isNew = true`), nếu trường khóa không phải kiểu sinh tự động (Auto-generated UUID), hệ thống sẽ mở ra cho người dùng nhập liệu bình thường."*

---

#### ❓ Câu 15: Nếu muốn nâng cấp hệ thống sau này thì nhóm đề xuất cải tiến gì ở Frontend?
> **Trả lời**:  
> *"Dạ thưa Hội đồng, nhóm em đã ghi nhận rõ trong Mục 11 của Blueprint các định hướng phát triển tiếp theo:*  
> *1. Hỗ trợ xử lý phân trang vô hạn (Virtual Scrolling) cho các bảng có hàng trăm nghìn dòng dữ liệu.*  
> *2. Cho phép người dùng kéo thả (Drag & Drop) để sắp xếp lại thứ tự cột trực tiếp trên màn hình.*  
> *3. Tích hợp thông báo đẩy thời gian thực (Push Notification / WebSocket) khi yêu cầu phê duyệt được ADMIN chấp thuận."*

---

## 5. CHIẾN THUẬT & PHONG THÁI BẢO VỆ ĐỒ ÁN

1. **Bình tĩnh, tự tin**: Trước khi trả lời, hãy cảm ơn thầy cô và nhắc lại ý chính của câu hỏi.
2. **Nguyên tắc "Top-Down"**: Nói bức tranh lớn trước (Ý nghĩa nghiệp vụ $\rightarrow$ Kiến trúc giải pháp $\rightarrow$ Tên file/hàm cụ thể trong code).
3. **Mở đúng code minh họa**: Khi thầy cô hỏi *"Code đoạn đó ở đâu?"*, hãy mở ngay file tương ứng:
   - Render Header/Sidebar $\rightarrow$ mở `AppLayout.tsx`.
   - Render Grid bảng động $\rightarrow$ mở `DynamicDataTable.tsx`.
   - Lọc bỏ System Fields $\rightarrow$ mở `fieldMeta.ts`.
   - Xử lý CSRF Token & Auth $\rightarrow$ mở `apiClient.ts`.
4. **Nhận định thực tế**: Nếu thầy cô hỏi một tính năng nâng cao mà nhóm chưa làm, hãy tự tin trả lời: *"Dạ tính năng này nhóm em đã khảo sát và đưa vào Mục 11 (Future Enhancements) của tài liệu Blueprint để phát triển ở phiên bản tiếp theo."*

---
*Chúc bạn ôn tập thật tốt và đạt điểm xuất sắc trong buổi bảo vệ Đồ án Capstone! 🎉*
