/**
 * MyTools – tùy chọn "Tìm cả vũ khí tốt nhất" cho nút Tạo Build của tab Optimize.
 */
import { CardThemed } from '@genshin-optimizer/common/ui'
import {
  CardContent,
  Checkbox,
  FormControlLabel,
  Typography,
} from '@mui/material'
import type { BestWeaponOptions } from './bestWeaponGenerate'

export default function BestWeaponCard({
  options,
  setOptions,
  disabled,
}: {
  options: BestWeaponOptions
  setOptions: (o: BestWeaponOptions) => void
  disabled: boolean
}) {
  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', flexDirection: 'column' }}>
        <FormControlLabel
          disabled={disabled}
          control={
            <Checkbox
              checked={options.enabled}
              onChange={(e) =>
                setOptions({ ...options, enabled: e.target.checked })
              }
            />
          }
          label={
            <Typography sx={{ fontWeight: 'bold' }}>
              Tìm cả vũ khí tốt nhất khi bấm Tạo Build
            </Typography>
          }
        />
        <Typography variant="caption" color="text.secondary">
          Khi bật, nút Tạo Build thử TỪNG vũ khí cùng loại trong kho của bạn
          (đúng cấp, tinh luyện thật), mỗi vũ khí tối ưu thánh di vật đầy đủ
          theo mục tiêu, bộ lọc và kho thánh di vật ở trên. Kết quả là các build
          gồm vũ khí + 5 thánh di vật, xếp theo sát thương, hiện ở danh sách bên
          dưới (đặt số build bằng nút "N Builds"). Thời gian chạy ≈ một lần tạo
          build × số vũ khí, nên hãy lọc bớt thánh di vật trước.
        </Typography>
        {options.enabled && (
          <FormControlLabel
            disabled={disabled}
            control={
              <Checkbox
                checked={options.includeOthers}
                onChange={(e) =>
                  setOptions({ ...options, includeOthers: e.target.checked })
                }
              />
            }
            label="Gồm cả vũ khí đang trang bị cho nhân vật khác"
          />
        )}
      </CardContent>
    </CardThemed>
  )
}
