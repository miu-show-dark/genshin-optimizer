/**
 * MyTools – thẻ "Vũ khí tốt nhất" trong tab Optimize.
 * Chạy tối ưu thánh di vật cho TỪNG vũ khí ứng viên (cùng mục tiêu, bộ lọc,
 * kho thánh di vật với nút Generate) rồi xếp hạng vũ khí theo build tốt nhất.
 */
import { CardThemed, ImgIcon } from '@genshin-optimizer/common/ui'
import { weaponAsset } from '@genshin-optimizer/gi/assets'
import type { RarityKey, RefinementKey } from '@genshin-optimizer/gi/consts'
import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
} from '@genshin-optimizer/gi/db-ui'
import { DataContext, useNumWorkers } from '@genshin-optimizer/gi/ui'
import {
  Alert,
  Box,
  Button,
  CardContent,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useContext, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BestWeaponProgress, BestWeaponRow } from './bestWeapon'
import { runBestWeaponSearch } from './bestWeapon'
import { formatPct, formatValue } from './format'
import { listCandidateWeapons } from './weaponCompare'
import {
  listWeaponConditions,
  loadWeaponCondOverrides,
} from './weaponConditions'

type RarityMode = 'only4' | 'only5' | 'min4'
const rarityRange: Record<RarityMode, [RarityKey, RarityKey]> = {
  only4: [4, 4],
  only5: [5, 5],
  min4: [4, 5],
}

export default function BestWeaponCard({
  optConfig,
  getArts,
  disabled,
}: {
  optConfig: OptConfig
  /** Lấy kho thánh di vật theo đúng bộ lọc hiện tại của tab Optimize */
  getArts: (cfg: OptConfig) => ICachedArtifact[]
  /** Đang chạy Generate bình thường */
  disabled: boolean
}) {
  const { t } = useTranslation(['weaponNames_gen'])
  const database = useDatabase()
  const { gender } = useDBMeta()
  const { teamId, teamCharId, teamChar, loadoutDatum } =
    useContext(TeamCharacterContext)
  const { data } = useContext(DataContext)
  const [maxWorkers] = useNumWorkers()
  const characterKey = teamChar.key

  const [refinement, setRefinement] = useState<RefinementKey>(1)
  const [rarityMode, setRarityMode] = useState<RarityMode>('only4')
  const [rows, setRows] = useState<BestWeaponRow[]>([])
  const [progress, setProgress] = useState<BestWeaponProgress>()
  const [running, setRunning] = useState(false)
  const cancelled = useRef(false)
  const cancelSolver = useRef<() => void>(() => {})

  const equippedWeapon = database.teams.getLoadoutWeapon(loadoutDatum)
  const candidates = useMemo(() => {
    const [min, max] = rarityRange[rarityMode]
    return listCandidateWeapons(characterKey, min, max)
  }, [characterKey, rarityMode])

  const canRun = !!optConfig.optimizationTarget?.length && !disabled

  const run = async () => {
    cancelled.current = false
    setRunning(true)
    setRows([])
    const overrides = loadWeaponCondOverrides(teamCharId)
    try {
      const result = await runBestWeaponSearch({
        database,
        teamId,
        teamCharId,
        gender,
        characterKey,
        equippedWeaponKey: equippedWeapon?.key,
        equippedWeapon,
        weaponKeys: candidates,
        refinement,
        optConfig,
        arts: getArts(optConfig),
        maxWorkers,
        condFor: (wk) => {
          const values = overrides[wk]
          return values
            ? { conds: listWeaponConditions(wk, data), values }
            : undefined
        },
        onProgress: setProgress,
        onRow: (row) =>
          setRows((r) =>
            [...r, row].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
          ),
        registerCancel: (c) => (cancelSolver.current = c),
        isCancelled: () => cancelled.current,
      })
      setRows(result)
    } finally {
      setRunning(false)
      setProgress(undefined)
    }
  }
  const cancel = () => {
    cancelled.current = true
    cancelSolver.current()
  }

  const base = rows.find((r) => r.isEquipped)?.value
  const best = rows[0]?.value

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontWeight: 'bold' }}>
          Vũ khí tốt nhất (tối ưu thánh di vật cho từng vũ khí)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Với mỗi vũ khí, chạy tối ưu thánh di vật đầy đủ theo mục tiêu, bộ lọc
          và kho thánh di vật ở trên rồi xếp hạng. Vũ khí đang cầm được tính
          theo đúng cấp/tinh luyện thật làm mốc; các vũ khí khác giả lập ở cấp
          tối đa. Điều kiện passive lấy từ tab So vũ khí (nếu bạn đã chọn).
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Độ hiếm</InputLabel>
            <Select
              label="Độ hiếm"
              value={rarityMode}
              disabled={running}
              onChange={(e) => setRarityMode(e.target.value as RarityMode)}
            >
              <MenuItem value="only4">Chỉ 4★</MenuItem>
              <MenuItem value="only5">Chỉ 5★</MenuItem>
              <MenuItem value="min4">4★ + 5★</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Tinh luyện</InputLabel>
            <Select
              label="Tinh luyện"
              value={refinement}
              disabled={running}
              onChange={(e) => setRefinement(e.target.value as RefinementKey)}
            >
              {([1, 2, 3, 4, 5] as RefinementKey[]).map((r) => (
                <MenuItem key={r} value={r}>
                  R{r}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            color={running ? 'error' : 'success'}
            disabled={!running && !canRun}
            onClick={running ? cancel : run}
          >
            {running
              ? 'Dừng'
              : `Tìm vũ khí tốt nhất (${candidates.length + 1} vũ khí)`}
          </Button>
        </Box>
        {!optConfig.optimizationTarget?.length && (
          <Alert severity="info">Chọn mục tiêu tối ưu trước.</Alert>
        )}
        {running && progress && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={(progress.done / Math.max(1, progress.total)) * 100}
            />
            <Typography variant="caption">
              {progress.done}/{progress.total}
              {progress.current
                ? ` – đang tối ưu ${t(`weaponNames_gen:${progress.current}`)}`
                : ''}
            </Typography>
          </Box>
        )}
        {rows.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Vũ khí</TableCell>
                <TableCell align="right">Build tốt nhất</TableCell>
                <TableCell align="right">% so với tốt nhất</TableCell>
                <TableCell align="right">% so với đang cầm</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.weaponKey} selected={row.isEquipped}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <ImgIcon
                        size={2}
                        src={weaponAsset(row.weaponKey, true)}
                      />
                      {t(`weaponNames_gen:${row.weaponKey}`)} R{row.refinement}
                      {row.isEquipped && ' (đang cầm)'}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{formatValue(row.value)}</TableCell>
                  <TableCell align="right">
                    {formatPct(row.value, best)}
                  </TableCell>
                  <TableCell align="right">
                    {formatPct(row.value, base)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </CardThemed>
  )
}
