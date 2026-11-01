# MyTools – phần code riêng của bạn trong bản fork Genshin Optimizer

Toàn bộ tính năng tự thêm nằm trong thư mục này. Code gốc của GO chỉ bị sửa đúng
**2 chỗ nhỏ**, để gắn tính năng vào giao diện (tìm chữ `MyTools` là thấy):

| File gốc của GO | Sửa gì |
|---|---|
| `libs/gi/page-team/src/CharacterDisplay/Content.tsx` | Thêm tab **"So vũ khí"** (1 route + 1 tab + 2 dòng import) |

Mọi thứ khác là file mới, nên khi gộp cập nhật từ GO gốc gần như không bao giờ xung đột.

## Các file trong thư mục

| File | Vai trò |
|---|---|
| `weaponCompare.ts` | Logic so vũ khí: liệt kê vũ khí cùng loại, tạo vũ khí "ảo" cấp tối đa, gọi `getTeamDataCalc(..., overrideWeapon)` của GO để tính, bật điều kiện passive tối đa |
| `TabWeaponCompare.tsx` | Giao diện tab "So vũ khí" |
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
- **Xuất cấu hình gcsim:** dựng file config gcsim từ team/loadout để mô phỏng chi tiết theo thời gian.

## Vũ khí tốt nhất (tab Optimize)

- `BestWeaponCard.tsx` + `bestWeapon.ts`: thẻ nằm dưới nút Generate trong tab Optimize (hook 1 dòng ở `TabOptimize/index.tsx`, đánh dấu `// MyTools`).
- Với mỗi vũ khí ứng viên, chạy `GOSolver` đầy đủ (cùng mục tiêu, bộ lọc chỉ số, kho thánh di vật) rồi xếp hạng theo build tốt nhất. Vũ khí đang cầm dùng đúng cấp/tinh luyện thật làm mốc.
