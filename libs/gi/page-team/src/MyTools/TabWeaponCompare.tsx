/**
 * MyTools – Tab "So vũ khí".
 * Xếp hạng toàn bộ vũ khí cùng loại cho nhân vật đang xem, giữ nguyên
 * thánh di vật / team / buff hiện tại, theo mục tiêu tối ưu hoặc Custom Multi Target.
 */
import { CardThemed, ImgIcon } from '@genshin-optimizer/common/ui'
import { weaponAsset } from '@genshin-optimizer/gi/assets'
import type {
  RarityKey,
  RefinementKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
  useOptConfig,
} from '@genshin-optimizer/gi/db-ui'
import { DataContext } from '@genshin-optimizer/gi/ui'
import {
  Alert,
  Box,
  Button,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPct, formatValue } from './format'
import type { WeaponCompareRow } from './weaponCompare'
import {
  applyMaxConditionals,
  evalWithWeapon,
  listCandidateWeapons,
  runWeaponCompare,
} from './weaponCompare'

type TargetOption = { id: string; label: string; path: string[] }

type RefMode = 'all' | '1' | '2' | '3' | '4' | '5'
type RarityMode = 'min3' | 'min4' | 'only4' | 'only5'

const rarityRange: Record<RarityMode, [RarityKey, RarityKey]> = {
  min3: [3, 5],
  min4: [4, 5],
  only4: [4, 4],
  only5: [5, 5],
}

const refsOf = (mode: RefMode): RefinementKey[] =>
  mode === 'all' ? [1, 2, 3, 4, 5] : [Number(mode) as RefinementKey]

const MAX_COND_HELP =
  'Nhiều passive vũ khí chỉ hoạt động khi một điều kiện đang bật (ví dụ: đủ 5 stack, vừa dùng kỹ năng). ' +
  'Nút này bật sẵn điều kiện ở mức cao nhất cho các vũ khí trong danh sách để so sánh công bằng (coi như buff luôn đầy). ' +
  'Điều kiện bạn đã tự đặt cho một vũ khí sẽ được giữ nguyên, vũ khí đang cầm không bị đổi.'

export default function TabWeaponCompare() {
  const { t } = useTranslation(['weaponNames_gen'])
  const database = useDatabase()
  const { gender } = useDBMeta()
  const { teamId, teamCharId, teamChar, loadoutDatum } =
    useContext(TeamCharacterContext)
  const { data } = useContext(DataContext)
  const characterKey = teamChar.key
  const optConfig = useOptConfig(teamChar.optConfigId)

  // ---- Danh sách mục tiêu có thể chọn ----
  const targetOptions = useMemo<TargetOption[]>(() => {
    const opts: TargetOption[] = []
    if (optConfig?.optimizationTarget?.length)
      opts.push({
        id: 'opt',
        label: 'Mục tiêu tối ưu (đang chọn ở tab Optimize)',
        path: optConfig.optimizationTarget,
      })
    teamChar.customMultiTargets.forEach((cmt, i) =>
      opts.push({
        id: `custom${i}`,
        label: `Multi-target: ${cmt.name}`,
        path: ['custom', `${i}`],
      })
    )
    return opts
  }, [optConfig?.optimizationTarget, teamChar.customMultiTargets])

  const [targetId, setTargetId] = useState<string>('')
  useEffect(() => {
    if (!targetOptions.find((o) => o.id === targetId))
      setTargetId(targetOptions[0]?.id ?? '')
  }, [targetOptions, targetId])
  const target = targetOptions.find((o) => o.id === targetId)

  const [refMode, setRefMode] = useState<RefMode>('1')
  const [rarityMode, setRarityMode] = useState<RarityMode>('min4')

  const equippedWeapon = database.teams.getLoadoutWeapon(loadoutDatum)
  const candidateKeys = useMemo(() => {
    const [min, max] = rarityRange[rarityMode]
    return listCandidateWeapons(characterKey, min, max)
  }, [characterKey, rarityMode])
  const selectedRefs = refsOf(refMode)

  // ---- Chạy so sánh ----
  const [rows, setRows] = useState<WeaponCompareRow[]>([])
  // Các mốc tinh luyện của kết quả đang hiển thị (không đổi khi bạn chỉnh ô chọn sau khi chạy)
  const [shownRefs, setShownRefs] = useState<RefinementKey[]>([1])
  const [progress, setProgress] = useState<[number, number] | undefined>()
  const [currentValue, setCurrentValue] = useState<number | undefined>()
  const [notice, setNotice] = useState('')
  const cancelRef = useRef(false)
  useEffect(
    () => () => {
      cancelRef.current = true
    },
    []
  )

  const onRun = async () => {
    if (!target) return
    cancelRef.current = false
    setNotice('')
    setRows([])
    setCurrentValue(
      evalWithWeapon(
        database,
        teamId,
        teamCharId,
        gender,
        characterKey,
        undefined, // undefined = vũ khí đang trang bị thật (đúng cấp, đúng tinh luyện)
        target.path
      )
    )
    setProgress([0, candidateKeys.length])
    const result = await runWeaponCompare({
      database,
      teamId,
      teamCharId,
      gender,
      characterKey,
      equippedWeaponKey: equippedWeapon.key,
      weaponKeys: candidateKeys,
      refinements: selectedRefs,
      targetPath: target.path,
      data,
      onProgress: (done, total) => setProgress([done, total]),
      isCancelled: () => cancelRef.current,
    })
    if (!cancelRef.current) {
      setRows(result)
      setShownRefs(selectedRefs)
    }
    setProgress(undefined)
  }

  const onMaxConditionals = () => {
    const others = candidateKeys.filter((wk) => wk !== equippedWeapon.key)
    const n = applyMaxConditionals(database, teamCharId, others, data)
    setNotice(
      n
        ? `Đã bật ${n} điều kiện ở mức tối đa cho các vũ khí chưa được bạn chỉnh. Bấm "Chạy so sánh" lại để cập nhật.`
        : 'Không có điều kiện nào cần bật thêm (các vũ khí đã được đặt điều kiện từ trước).'
    )
  }

  const best = rows.reduce(
    (m, r) => Math.max(m, ...Object.values(r.values).map((v) => v ?? 0)),
    0
  )
  const running = !!progress

  return (
    <CardThemed>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6">So sánh vũ khí</Typography>
        <Alert severity="info">
          Mỗi vũ khí được giả lập ở cấp tối đa với tinh luyện bạn chọn. Thánh di
          vật, đồng đội, buff và kẻ địch giữ nguyên như loadout hiện tại.
          Passive có điều kiện (stack, sau khi dùng kỹ năng...) chỉ được tính
          nếu đã bật cho vũ khí đó; nút "Bật điều kiện tối đa" sẽ bật giúp bạn
          (rê chuột vào nút để xem chi tiết). Vì thánh di vật không được tối ưu
          lại theo từng vũ khí, hãy coi đây là so sánh nhanh; muốn chính xác hơn
          thì chạy Optimize với vài vũ khí đứng đầu.
        </Alert>

        {!targetOptions.length && (
          <Alert severity="warning">
            Chưa có mục tiêu để so. Hãy chọn mục tiêu ở tab Optimize, hoặc tạo
            một Custom Multi Target ở tab Overview.
          </Alert>
        )}

        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>Mục tiêu</InputLabel>
            <Select
              label="Mục tiêu"
              value={target ? targetId : ''}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {targetOptions.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Tinh luyện</InputLabel>
            <Select
              label="Tinh luyện"
              value={refMode}
              onChange={(e) => setRefMode(e.target.value as RefMode)}
            >
              <MenuItem value="all">Tất cả R1 → R5</MenuItem>
              {[1, 2, 3, 4, 5].map((r) => (
                <MenuItem key={r} value={`${r}`}>
                  R{r}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Độ hiếm</InputLabel>
            <Select
              label="Độ hiếm"
              value={rarityMode}
              onChange={(e) => setRarityMode(e.target.value as RarityMode)}
            >
              <MenuItem value="min3">3★ trở lên</MenuItem>
              <MenuItem value="min4">4★ trở lên</MenuItem>
              <MenuItem value="only4">Chỉ 4★</MenuItem>
              <MenuItem value="only5">Chỉ 5★</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title={MAX_COND_HELP}>
            <span>
              <Button
                color="secondary"
                onClick={onMaxConditionals}
                disabled={running}
              >
                Bật điều kiện tối đa
              </Button>
            </span>
          </Tooltip>
          <Button onClick={onRun} disabled={!target || running}>
            Chạy so sánh ({candidateKeys.length} vũ khí
            {selectedRefs.length > 1 ? ` × ${selectedRefs.length} mốc` : ''})
          </Button>
          {running && (
            <Button color="error" onClick={() => (cancelRef.current = true)}>
              Dừng
            </Button>
          )}
        </Stack>

        {notice && <Alert severity="success">{notice}</Alert>}
        {progress && (
          <LinearProgress
            variant="determinate"
            value={(progress[0] / Math.max(progress[1], 1)) * 100}
          />
        )}

        {currentValue !== undefined && (
          <Typography>
            Vũ khí đang cầm (thực tế):{' '}
            <strong>{t(`weaponNames_gen:${equippedWeapon.key}`)}</strong> R
            {equippedWeapon.refinement} →{' '}
            <strong>{formatValue(currentValue)}</strong>
          </Typography>
        )}

        {!!rows.length && (
          <Box sx={{ overflowX: 'auto' }}>
            {shownRefs.length > 1 ? (
              <MultiRefTable
                rows={rows}
                refs={shownRefs}
                best={best}
                nameOf={(wk) => t(`weaponNames_gen:${wk}`)}
              />
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Vũ khí</TableCell>
                    <TableCell align="right">Giá trị</TableCell>
                    <TableCell align="right">So với hạng 1</TableCell>
                    <TableCell align="right">So với đang cầm</TableCell>
                    <TableCell>Ghi chú</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, i) => (
                    <WeaponRow
                      key={row.weaponKey}
                      rank={i + 1}
                      row={row}
                      name={t(`weaponNames_gen:${row.weaponKey}`)}
                      best={rows[0]?.value}
                      current={currentValue}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </CardContent>
    </CardThemed>
  )
}

function WeaponRow({
  rank,
  row,
  name,
  best,
  current,
}: {
  rank: number
  row: WeaponCompareRow
  name: string
  best: number | undefined
  current: number | undefined
}) {
  return (
    <TableRow
      sx={row.isEquipped ? { bgcolor: 'rgba(255,255,255,0.06)' } : undefined}
    >
      <TableCell>{rank}</TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ImgIcon
            size={2}
            src={weaponAsset(row.weaponKey as WeaponKey, true)}
          />
          <span>
            {name}{' '}
            <Typography component="span" variant="caption" color="warning.main">
              {'★'.repeat(row.rarity)}
            </Typography>{' '}
            R{row.refinement}
          </span>
        </Box>
      </TableCell>
      <TableCell align="right">{formatValue(row.value)}</TableCell>
      <TableCell align="right">{formatPct(row.value, best)}</TableCell>
      <TableCell align="right">{formatPct(row.value, current)}</TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {row.isEquipped && (
            <Chip size="small" color="success" label="Đang cầm" />
          )}
          {row.hasConditional && (
            <Chip size="small" variant="outlined" label="Có điều kiện" />
          )}
        </Box>
      </TableCell>
    </TableRow>
  )
}

function MultiRefTable({
  rows,
  refs,
  best,
  nameOf,
}: {
  rows: WeaponCompareRow[]
  refs: RefinementKey[]
  best: number
  nameOf: (wk: WeaponKey) => string
}) {
  const first = refs[0]
  const last = refs[refs.length - 1]
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>Vũ khí</TableCell>
          {refs.map((r) => (
            <TableCell key={r} align="right">
              R{r}
            </TableCell>
          ))}
          <TableCell align="right">
            R{last} so với R{first}
          </TableCell>
          <TableCell>Ghi chú</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => {
          const gain =
            row.values[first] && row.values[last]
              ? (row.values[last]! / row.values[first]! - 1) * 100
              : undefined
          return (
            <TableRow
              key={row.weaponKey}
              sx={
                row.isEquipped
                  ? { bgcolor: 'rgba(255,255,255,0.06)' }
                  : undefined
              }
            >
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ImgIcon size={2} src={weaponAsset(row.weaponKey, true)} />
                  <span>
                    {nameOf(row.weaponKey)}{' '}
                    <Typography
                      component="span"
                      variant="caption"
                      color="warning.main"
                    >
                      {'★'.repeat(row.rarity)}
                    </Typography>
                  </span>
                </Box>
              </TableCell>
              {refs.map((r) => {
                const v = row.values[r]
                return (
                  <TableCell key={r} align="right">
                    {row.refinements.includes(r) ? (
                      <>
                        {formatValue(v)}
                        <Typography
                          component="div"
                          variant="caption"
                          color="text.secondary"
                        >
                          {formatPct(v, best)}
                        </Typography>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                )
              })}
              <TableCell align="right">
                {gain === undefined ? '—' : `+${gain.toFixed(1)}%`}
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {row.isEquipped && (
                    <Chip size="small" color="success" label="Đang cầm" />
                  )}
                  {row.hasConditional && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label="Có điều kiện"
                    />
                  )}
                </Box>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
