# MyTools – phần code riêng của bạn trong bản fork Genshin Optimizer

Toàn bộ tính năng tự thêm nằm trong thư mục này. Code gốc của GO chỉ bị sửa đúng
**2 chỗ nhỏ**, để gắn tính năng vào giao diện (tìm chữ `MyTools` là thấy):

| File gốc của GO | Sửa gì |
|---|---|
| `libs/gi/page-team/src/CharacterDisplay/Content.tsx` | Thêm tab **"So vũ khí"** (1 route + 1 tab + 2 dòng import) |
| `libs/gi/page-team/src/TeamSetting/index.tsx` | Thêm thẻ **"Rotation team"** dưới phần chọn đội hình |

Mọi thứ khác là file mới, nên khi gộp cập nhật từ GO gốc gần như không bao giờ xung đột.

## Các file trong thư mục

| File | Vai trò |
|---|---|
| `weaponCompare.ts` | Logic so vũ khí: liệt kê vũ khí cùng loại, tạo vũ khí "ảo" cấp tối đa, gọi `getTeamDataCalc(..., overrideWeapon)` của GO để tính, bật điều kiện passive tối đa |
| `TabWeaponCompare.tsx` | Giao diện tab "So vũ khí" |
| `teamRotation.ts` | Logic rotation: lấy giá trị Custom Multi Target của từng nhân vật, cộng lại, chia thời gian vòng; lưu lựa chọn vào `localStorage` (khóa `mytools_rotation_<teamId>`) |
| `TeamRotationCard.tsx` | Giao diện thẻ "Rotation team" |
| `format.ts` | Hàm định dạng số dùng chung |

## Chạy trên máy của bạn

Yêu cầu: **Node 24** (đúng bản ghi trong file `.nvmrc`), Git.

```bash
git clone https://github.com/<tên-bạn>/genshin-optimizer.git
cd genshin-optimizer
corepack enable          # để dùng đúng bản yarn của repo
yarn install
yarn frontend            # mở http://localhost:4200
```

Sửa file trong `MyTools/` là trang tự tải lại. Kiểm tra định dạng/lint trước khi đẩy lên:

```bash
yarn biome check --write libs/gi/page-team/src/MyTools
```

## Đồng bộ với GO gốc

Workflow `.github/workflows/mytools-sync-deploy.yml` mỗi ngày tự gộp nhánh `master` của
`frzyc/genshin-optimizer` vào bản của bạn, rồi build và đăng lên GitHub Pages. Bạn cũng có
thể bấm **Actions → MyTools - Sync GO & Deploy → Run workflow** để chạy ngay.

### Xử lý xung đột (hiếm khi xảy ra)

Nếu GO gốc sửa đúng 2 file ở bảng trên, workflow sẽ báo lỗi đỏ. Khi đó gộp tay trên máy:

```bash
git remote add upstream https://github.com/frzyc/genshin-optimizer.git   # chỉ làm lần đầu
git fetch upstream
git merge upstream/master
# mở file bị xung đột, giữ code mới của GO và thêm lại các dòng có chữ MyTools
git add . && git commit && git push
```

## Ý tưởng mở rộng

- **Tối ưu thánh di vật theo từng vũ khí:** hiện tab "So vũ khí" giữ nguyên thánh di vật đang mặc.
  Có thể gọi solver của GO (xem `CharacterDisplay/Tabs/TabOptimize`) cho top 3–5 vũ khí.
- **Thời gian buff thực tế:** thêm hệ số uptime cho từng dòng trong rotation thay vì coi buff luôn bật.
- **Xuất cấu hình gcsim:** dựng file config gcsim từ team/loadout để mô phỏng chi tiết theo thời gian.
