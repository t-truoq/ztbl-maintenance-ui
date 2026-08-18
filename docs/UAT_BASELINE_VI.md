# Z-Table Maintenance UI — UAT Baseline

> Tài liệu nền để soạn lại file UAT cho project `ztbl-maintenance-ui`.
> Ngày rà soát: 18/08/2026.

## 1. Mục đích và phạm vi

Ứng dụng cung cấp màn hình bảo trì động cho các bảng SAP Z. Danh sách bảng, cấu trúc field, kiểu dữ liệu, khóa, domain và foreign key được lấy từ cấu hình/metadata của SAP backend; UI không hard-code theo một bảng duy nhất.

Phạm vi UAT gồm:

- Đăng nhập local Basic Auth và tự động nhận diện SSO khi chạy trên SAP Fiori Launchpad.
- Chọn bảng Z đang active và tải dữ liệu.
- Tìm kiếm, lọc, tạo, sửa, xóa một hoặc nhiều record.
- Nhập liệu theo metadata: text, số thập phân, ngày, checkbox, domain và foreign-key value help.
- Validation field bắt buộc, khóa bản ghi/bảng và xử lý optimistic lock.
- Approval workflow cho bảng có `ApprovalRequired`.
- Excel download, upload, preview diff và confirm import.
- Audit log, xem chi tiết, bulk audit và rollback dành cho admin.
- Field Schema, AI field description, Repository Info và xuất PDF data dictionary.
- Phân quyền theo user và theo bảng.

Không thuộc phạm vi xác nhận độc lập của frontend: logic nghiệp vụ ABAP, dữ liệu DDIC, cấu hình quyền SAP, cấu hình approval, chất lượng nội dung AI và hiệu năng backend. Các phần này cần tester xác nhận trên hệ thống UAT.

## 2. Thông tin project

| Hạng mục | Giá trị |
|---|---|
| Tên project | `ztbl-maintenance-ui` |
| Frontend | React 19, TypeScript, Vite 8 |
| UI | UI5 Web Components for React |
| HTTP/API | Axios + `fetch`, OData V4 |
| Test | Vitest, Testing Library, jsdom |
| Chạy local | `http://localhost:3000` |
| SAP app | `ZZTBL_MAINT_UI` |
| Deployment | UI5 tooling lên ABAP repository |
| Table service | `/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001` |
| Excel service | `/sap/opu/odata4/sap/zsb_excel_pl/srvd/sap/zsd_excel_pipeline/0001` |

## 3. Người dùng và dữ liệu chuẩn bị

### 3.1 Tài khoản

Chuẩn bị tối thiểu:

| Role | Mục đích |
|---|---|
| Viewer | Chỉ xem dữ liệu, không create/update/delete/upload |
| Maintainer | Có quyền create/update/delete theo một bảng được cấp |
| Upload user | Có quyền Excel upload/confirm import |
| Admin | Có quyền đầy đủ và rollback audit |
| User 1 + User 2 | Kiểm tra khóa đồng thời và optimistic lock |
| User có approval | Gửi thay đổi vào approval workflow |

Tên user, quyền và kết quả thực tế phải ghi theo hệ thống UAT; không dùng các user mặc định trong source làm tiêu chuẩn nghiệm thu.

### 3.2 Bảng và record

Chuẩn bị ít nhất:

1. Một bảng active, không approval.
2. Một bảng active có `ApprovalRequired = X`.
3. Một bảng có mandatory field, numeric/date/boolean field.
4. Một bảng có domain value.
5. Một bảng có foreign key value help.
6. Một bảng có record đang được bảng khác tham chiếu để test lỗi delete FK.
7. Một bảng có đủ record để test bulk update/delete và Excel.
8. Một bảng inactive để xác nhận không hiển thị trong danh sách.

## 4. Luồng nghiệp vụ tổng quát

```text
Login/SSO
  -> Welcome Dashboard
  -> Chọn bảng active
  -> Load metadata + data + quyền
  -> Table Data
       -> Filter/Search
       -> Create/Edit/Delete
       -> Save trực tiếp hoặc gửi Approval
  -> Excel / Field Schema / Audit Log / Repository Info
```

## 5. Danh sách test case UAT

Trạng thái ban đầu của tất cả test case là `Not Run`. Tester ghi `Pass`, `Fail` hoặc `Blocked`, kèm evidence và message backend nếu có.

### A. Login, dashboard và chọn bảng

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-001 | Mở app local khi chưa đăng nhập | Hiển thị local sign-in prompt; chưa gọi/hiển thị dữ liệu bảng. |
| UAT-002 | Đăng nhập bằng credential hợp lệ | Prompt đóng, dashboard tải danh sách bảng active. Username hiển thị đúng. |
| UAT-003 | Đăng nhập bằng credential không hợp lệ | Không vào được app; hiển thị lỗi rõ ràng; không lưu session hợp lệ. |
| UAT-004 | Refresh trang sau khi đăng nhập local | Session hiện tại được giữ trong session storage; app không hỏi lại trong cùng session. |
| UAT-005 | Mở app trên FLP với SSO hợp lệ | Bỏ qua local login, probe SAP thành công và hiển thị app. |
| UAT-006 | Session SAP hết hạn trong lúc dùng | Hiển thị trạng thái session expired/đăng xuất; credential/cache local được xóa. |
| UAT-007 | Dashboard không có bảng active hoặc API lỗi | Hiển thị trạng thái rỗng/lỗi phù hợp, không làm treo toàn bộ app. |
| UAT-008 | Chọn một bảng rồi quay lại dashboard | Bảng được chọn mở đúng; nút Back giải phóng table lock nếu user đang edit. |
| UAT-009 | Kiểm tra bảng inactive | Bảng inactive không xuất hiện trong danh sách chọn. |

### B. Quyền truy cập

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-010 | Viewer mở bảng được phép xem | Xem được data; các thao tác không được cấp quyền bị ẩn hoặc disabled. |
| UAT-011 | User không có quyền view mở bảng | Hiển thị `Access Denied`; không cho xem dữ liệu. |
| UAT-012 | Maintainer create record | Nút/luồng Create khả dụng; lưu thành công khi dữ liệu hợp lệ. |
| UAT-013 | User không có create thử tạo record | Không thể tạo; backend/UI báo thiếu quyền. |
| UAT-014 | User có update/delete đúng cấu hình bảng | Update/delete hoạt động đúng theo quyền. |
| UAT-015 | User không có update hoặc delete | Nút tương ứng bị khóa/không thực hiện được; không phát sinh thay đổi backend. |
| UAT-016 | Upload user mở tab Excel | Có thể upload/confirm theo quyền; user không có quyền không thể thực hiện. |

### C. Table Data và đọc dữ liệu

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-020 | Mở bảng lần đầu | Tải field metadata và record data; tiêu đề, cột và label đúng cấu hình. |
| UAT-021 | Search toàn bộ record | Chỉ hiển thị các record có giá trị chứa chuỗi tìm kiếm, không phân biệt hoa thường. |
| UAT-022 | Filter theo key field | Lọc đúng theo giá trị key; filter nhiều field kết hợp theo AND. |
| UAT-023 | Clear filter/search | Trả lại toàn bộ dataset ban đầu. |
| UAT-024 | Mở rộng bộ filter | Hiển thị thêm filter field theo yêu cầu; kết quả lọc vẫn chính xác. |
| UAT-025 | Kiểm tra format field | Date, decimal, boolean và label hiển thị theo metadata/định dạng được cấu hình. |
| UAT-026 | Reload data | Dữ liệu mới nhất từ backend được tải; filter và trạng thái lỗi được xử lý rõ ràng. |

### D. Create, edit, delete và validation

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-030 | Mở form Create | Hiển thị field đúng schema; field system/generated không yêu cầu user nhập. |
| UAT-031 | Create với dữ liệu hợp lệ | Record được tạo; thông báo thành công; danh sách refresh và audit được tạo. |
| UAT-032 | Create thiếu mandatory field | Không gửi request hoặc backend từ chối; nêu đúng field thiếu. |
| UAT-033 | Nhập sai numeric/date/format | Hiển thị validation error; không lưu dữ liệu không hợp lệ. |
| UAT-034 | Chọn domain value | Value help/dropdown hiển thị giá trị hợp lệ; lưu đúng code/value. |
| UAT-035 | Chọn foreign-key value | Value help tải được; chọn record hợp lệ và lưu đúng key. |
| UAT-036 | Edit một record bằng dialog | Chỉ field được phép sửa thay đổi; lưu thành công và dữ liệu cập nhật đúng. |
| UAT-037 | Edit inline một record | Add row, sửa cell, xóa draft row, Cancel và Save hoạt động đúng. |
| UAT-038 | Edit inline nhiều record | Gửi bulk update; tất cả record hợp lệ cập nhật đúng; lỗi từng record được nêu rõ. |
| UAT-039 | Delete một record | Có confirm dialog; xác nhận xóa record; cancel không thay đổi dữ liệu. |
| UAT-040 | Delete nhiều record | Có confirm; bulk delete xử lý đúng số lượng record và refresh danh sách. |
| UAT-041 | Delete record bị FK tham chiếu | Không xóa record; hiển thị FK error dễ hiểu; dữ liệu vẫn còn. |
| UAT-042 | Save không thay đổi | Không phát sinh update; hiển thị `No changes to save` hoặc tương đương. |
| UAT-043 | Thử sửa system/client field | Field bị readonly/không gửi sai payload; `MANDT`/`CLIENT` không được gửi trong CRUD. |

### E. Lock và concurrent editing

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-050 | User 1 bắt đầu edit bảng | Table lock được giữ trong phiên edit. |
| UAT-051 | User 2 mở cùng bảng khi User 1 đang edit | Hiển thị cảnh báo người đang edit; User 2 không thể bắt đầu thao tác bị khóa. |
| UAT-052 | User 1 Save/Cancel/Back | Lock được giải phóng; user khác có thể edit. |
| UAT-053 | Hai user sửa cùng record | Optimistic lock phát hiện xung đột; hiển thị dialog refresh; không ghi đè âm thầm. |
| UAT-054 | User thay đổi field khác trong lúc có concurrent change | Merge chỉ giữ thay đổi hợp lệ; field đã bị user khác thay đổi bị chặn và thông báo rõ. |
| UAT-055 | Record bị xóa bởi user khác trước khi Save | Save thất bại với thông báo record không còn tồn tại; không tạo record ngoài ý muốn. |

### F. Approval workflow

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-060 | Mở bảng có Approval Required | Dashboard/header hiển thị dấu hiệu approval. |
| UAT-061 | Create/update/delete record approval | Thay đổi gửi approval request, hiển thị document/request ID nếu backend trả về. |
| UAT-062 | Record đang pending approval | Không tạo request trùng; hiển thị record đang chờ admin duyệt và trạng thái pending. |
| UAT-063 | Admin xử lý approval ngoài UI rồi reload | Trạng thái data/pending được cập nhật đúng sau refresh. |
| UAT-064 | Thao tác trên bảng không approval | Lưu trực tiếp, không hiển thị thông báo approval request. |

### G. Excel

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-070 | Download template | File Excel được tải về đúng tên bảng/schema. |
| UAT-071 | Download current data | File chứa dữ liệu hiện tại và header đúng thứ tự. |
| UAT-072 | Upload file đúng tên/định dạng | File được nhận, diff preview hiển thị create/update/error đúng. |
| UAT-073 | Upload sai tên bảng hoặc extension | Bị từ chối với thông báo rõ; không import dữ liệu. |
| UAT-074 | Upload thiếu header/field hoặc sai thứ tự | Preview báo lỗi cấu trúc/field; không confirm được khi lỗi chưa xử lý. |
| UAT-075 | Preview dữ liệu có lỗi validation | Mỗi row/error được hiển thị; không commit row lỗi. |
| UAT-076 | Confirm import toàn bộ row hợp lệ | Backend xử lý đúng create/update; thông báo số lượng thành công/lỗi/approval. |
| UAT-077 | Confirm import có approval | Hiển thị request ID và trạng thái waiting for ADMIN approval. |
| UAT-078 | Upload file lớn/chứa nhiều row | UI không mất trạng thái; kết quả chunk/bulk và lỗi từng row được tổng hợp đúng. |
| UAT-079 | CSRF/session hết hạn khi upload | Có thông báo xác thực phù hợp; retry CSRF không tạo duplicate import. |

### H. Field Schema, AI và Repository Info

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-080 | Mở Field Schema | Hiển thị field name, label, key, mandatory, type, domain/FK và thông tin readonly đúng metadata. |
| UAT-081 | Load AI field descriptions | Mô tả tải on-demand, hiển thị đúng field; lỗi AI không làm hỏng table data. |
| UAT-082 | Reload AI description | Có thể force refresh; cache session không hiển thị dữ liệu cũ khi refresh thành công. |
| UAT-083 | Export PDF data dictionary | PDF được tạo, chứa table info, field metadata và AI description nếu đã tải. |
| UAT-084 | Mở Repository Info | Hiển thị repository/inventory information và object list; lỗi parse vẫn có thông báo dễ hiểu. |

### I. Audit Log và rollback

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-090 | Mở Audit Log | Log đúng table, có action, user, thời gian, record key và audit ID. |
| UAT-091 | Lọc/phân trang audit | Kết quả lọc và pagination đúng; không trộn audit của bảng khác. |
| UAT-092 | Xem audit detail | Hiển thị old/new value, field thay đổi, record key; format dễ đối chiếu. |
| UAT-093 | Xem bulk audit | Có thể mở child items, phân biệt operation bulk và từng row. |
| UAT-094 | Export audit Excel | File export có header, action, record và changed fields đúng. |
| UAT-095 | Admin rollback audit đủ điều kiện | Có confirm; rollback thành công; tạo audit rollback tương ứng; data quay về trạng thái đúng. |
| UAT-096 | User thường hoặc audit không đủ điều kiện rollback | Nút rollback không có/disabled; không gọi rollback backend. |
| UAT-097 | Rollback audit đã rollback | Không cho rollback lần hai; trạng thái lịch sử được hiển thị đúng. |

### J. Logout, triển khai và khả năng phục hồi

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-100 | Logout local | Credential, selected table và domain cache được xóa; quay về login. |
| UAT-101 | Logout trên FLP | Gọi SAP logoff; session không còn truy cập được app. |
| UAT-102 | API trả 401/403 | Hiển thị lỗi/quyền phù hợp; không để UI ở trạng thái loading vô hạn. |
| UAT-103 | Refresh sau deployment | Tải đúng asset mới; không còn cache JavaScript/CSS phiên bản cũ. |
| UAT-104 | Kiểm tra responsive màn hình | Header, filter, table, dialog và tab dùng được ở độ rộng chuẩn UAT. |
| UAT-105 | Kiểm tra ngôn ngữ | Các chuỗi ứng dụng và message chính hiển thị theo ngôn ngữ được cấu hình. |

## 6. Quy tắc nghiệm thu

- `Pass`: kết quả thực tế khớp expected result và có evidence.
- `Fail`: hành vi khác expected result, có bước tái hiện và message/request liên quan.
- `Blocked`: thiếu quyền, thiếu dữ liệu, backend/service chưa sẵn sàng hoặc không thể thực hiện; ghi rõ người phụ trách xử lý.
- Không đánh dấu Pass chỉ dựa trên unit test frontend cho các case cần SAP backend, quyền, approval, audit hoặc deployment.
- Với thao tác ghi dữ liệu, ghi lại: table name, record key, user, thời gian, request/approval ID và trạng thái sau refresh.

## 7. Evidence cần đính kèm

1. Screenshot trước và sau thao tác.
2. Tên file Excel upload/download, kèm bản checksum nếu cần.
3. Record key và expected value sau create/update/delete.
4. Audit ID hoặc approval request ID.
5. User/role đang test.
6. Browser, URL môi trường UAT và thời điểm test.
7. Console/network log cho các case Fail hoặc Blocked, không đính kèm password/token.

## 8. Trạng thái kỹ thuật tại thời điểm lập baseline

Đã chạy trong repository:

- `npm test`: **Pass — 16 test files, 173 tests**.
- `npm run build`: **Pass**.
- `npm run lint`: **Pass**, có cảnh báo bundle `index.js` lớn hơn 500 kB sau minify.

Các kết quả trên chỉ xác nhận frontend build/unit behavior; không thay thế UAT tích hợp SAP.

## 9. Checklist trước khi bắt đầu UAT chính thức

- [ ] Xác nhận URL và client của môi trường UAT.
- [ ] Xác nhận backend TableConfig/Excel Pipeline đang hoạt động.
- [ ] Chuẩn bị user/role theo mục 3.1.
- [ ] Chuẩn bị bảng test theo mục 3.2.
- [ ] Xác định dữ liệu baseline và record key không được phép xóa.
- [ ] Xác nhận quy trình reset dữ liệu sau mỗi nhóm test.
- [ ] Xác nhận người duyệt approval và admin rollback.
- [ ] Tạo bản copy file UAT chính thức từ danh sách test case ở mục 5.

