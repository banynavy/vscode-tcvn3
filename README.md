# TCVN3 Editor

**Tác giả:** Cánh Trắng  
**Phiên bản:** 0.2.0  
**Mã extension:** `canh-trang.tcvn3-editor`

Hiển thị và chỉnh sửa file `.lua`, `.ini`, `.txt` mã **TCVN3 tiếng Việt trộn GBK tiếng Trung** trong VS Code và các trình soạn thảo tương thích. Chữ hiển thị bằng Unicode với font thông thường; khi nhấn **Ctrl+S**, extension lưu lại đúng bảng mã gốc.

## Cài đặt

Trong VS Code hoặc Qoder IDE, mở **Extensions → … → Install from VSIX…** và chọn `TCVN3-Editor-0.2.0.vsix`. Gói ZIP chia sẻ còn có `install.cmd` để cài vào các IDE đã có trên máy.

Sau khi cài, mở lại file cần sửa. Nếu IDE chưa nhận bản mới, lưu công việc đang làm rồi dùng **Developer: Reload Window**.

## Sử dụng

1. Mở file TCVN3/GBK như bình thường. Tab tự chuyển sang bản xem Unicode, thanh trạng thái hiện **✓ TCVN3+GBK**.
2. Sửa tiếng Việt và nhấn **Ctrl+S**. Dữ liệu trên đĩa vẫn là TCVN3/GBK. Chỉ báo UTF-8 của IDE là bảng mã bản xem trong bộ nhớ.
3. Xem thông tin lưu bằng **Ctrl+Shift+P → TCVN3: Xem nhật ký lưu file**.
4. Tìm chữ có dấu trong nhiều file bằng **TCVN3: Tìm chữ có dấu trong thư mục**, hoặc bấm phải thư mục trong Explorer. Tìm kiếm toàn thư mục mặc định của IDE không giải mã dữ liệu legacy trên đĩa.

Các lệnh khác:

- **TCVN3: Mở dạng TCVN3 (Unicode)**: mở thủ công file đang xem hoặc file được chọn trong Explorer, kể cả file chỉ có ASCII.
- **TCVN3: Mở dạng gốc (byte)**: trở về cách mở thông thường của IDE. Nếu chữ hiện `�`, hãy dùng lệnh mở TCVN3 trước khi sửa và lưu.

File UTF-8 và UTF-16 tiếp tục dùng cách mở thông thường. File ASCII không tự mở qua TCVN3 theo mặc định. Có thể mở thủ công, hoặc cấu hình các thư mục legacy bằng `tcvn3.projectFolders`.

## Sao lưu và định dạng

- Lần lưu có thay đổi đầu tiên trong phiên tạo bản sao gốc tại **`.tcvn3-editor/backups` trong thư mục người dùng**, nằm ngoài thư mục mã nguồn. File thay đổi từ bên ngoài sẽ được sao lưu lại trước lần lưu kế tiếp.
- Mỗi file có một thư mục sao lưu bằng mã định danh; không chép tên thư mục nguồn vào cấu trúc sao lưu. Tên file và thời điểm giúp tìm bản cần khôi phục.
- Có thể đặt nơi sao lưu riêng bằng `tcvn3.backupDir` trong Settings.
- Giữ byte các dòng không sửa, kiểu xuống dòng CRLF/LF/CR của các dòng tương ứng, không thêm BOM. Không có thay đổi byte thì không ghi lại file hoặc tạo sao lưu.
- Emoji và ký tự không mã hóa được bị từ chối lưu; file trên đĩa không đổi.
- TCVN3 chỉ có bảy chữ hoa riêng: Ă Â Ê Ô Ơ Ư Đ. Chữ hoa có dấu thanh như Á, Ệ dùng byte chữ thường; extension cảnh báo khi lưu.
- Cụm byte mơ hồ giữa TCVN3 và GBK được suy đoán theo ngữ cảnh; một số cụm ngắn có thể hiển thị sai nghĩa. Extension kiểm tra khứ hồi đúng byte trước khi mở.

## Thiết lập

Trong Settings, tìm **TCVN3**:

| Thiết lập | Mặc định | Tác dụng |
|---|---|---|
| `tcvn3.autoOpen` | `true` | Tự mở file legacy dưới dạng Unicode |
| `tcvn3.fileExtensions` | `.lua`, `.ini`, `.txt` | Đuôi file được tự mở và tìm kiếm |
| `tcvn3.projectFolders` | `[]` | Các đoạn đường dẫn do người dùng chọn, cho phép tự mở cả file ASCII |
| `tcvn3.backupDir` | trống | Nơi sao lưu riêng; để trống dùng thư mục người dùng |

Ví dụ cho một thư mục legacy do bạn chọn:

```json
{
  "tcvn3.projectFolders": ["/legacy-files/"]
}
```

Có thể dùng dấu `/` hoặc `\` trong cấu hình đường dẫn.

## Quyền riêng tư

Extension xử lý file tại máy, không có mã gửi dữ liệu lên mạng hay telemetry. Gói cài không chứa đường dẫn dự án phát triển, tên máy, tài khoản máy, dữ liệu dự án, bộ thử hoặc nhật ký của tác giả. Nhật ký hoạt động thông thường hiện tên file, không ghi đường dẫn nguồn đầy đủ.

Thông tin tác giả và biểu tượng được giữ lại để nhận diện bản phát hành. Khi chia sẻ, dùng gói VSIX hoặc ZIP phát hành; các bản sao lưu và log trên máy của bạn là dữ liệu riêng.
