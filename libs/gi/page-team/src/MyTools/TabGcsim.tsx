/**
 * MyTools – Tab "DPS check": tạo script gcsim từ đội hiện tại + rotation ghi tắt.
 */
import { CardThemed } from '@genshin-optimizer/common/ui'
import { useDatabase } from '@genshin-optimizer/gi/db-ui'
import {
  Alert,
  Box,
  Button,
  CardContent,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { buildGcsimScript } from './gcsimExport'

const storeKey = (teamId: string) => `mytools_gcsim_rotation_${teamId}`
const load = (teamId: string) => {
  try {
    return localStorage.getItem(storeKey(teamId)) ?? ''
  } catch {
    return ''
  }
}

export default function TabGcsim({ teamId }: { teamId: string }) {
  const database = useDatabase()
  const [rotation, setRotation] = useState(() => load(teamId))
  const [duration, setDuration] = useState(90)
  const [iterations, setIterations] = useState(1000)
  const [resist, setResist] = useState(0.1)
  const [loop, setLoop] = useState(true)
  const [fullEnergy, setFullEnergy] = useState(false)
  const [energyAmount, setEnergyAmount] = useState(1)
  const [energyMin, setEnergyMin] = useState(8)
  const [energyMax, setEnergyMax] = useState(12)
  const [copied, setCopied] = useState(false)

  const { script, warnings } = useMemo(
    () =>
      buildGcsimScript(database, teamId, {
        rotation,
        duration,
        iterations,
        enemyResist: resist,
        alwaysFullEnergy: fullEnergy,
        energyAmount,
        energyMinSec: energyMin,
        energyMaxSec: Math.max(energyMin, energyMax),
        loop,
      }),
    [
      database,
      teamId,
      rotation,
      duration,
      iterations,
      resist,
      loop,
      fullEnergy,
      energyAmount,
      energyMin,
      energyMax,
    ]
  )

  const onRotation = (v: string) => {
    setRotation(v)
    try {
      localStorage.setItem(storeKey(teamId), v)
    } catch {
      // bỏ qua
    }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontWeight: 'bold' }}>
          DPS check – tính DPS cả đội bằng gcsim
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Ghi rotation theo thứ tự nhân vật trong đội. Ký hiệu: E = skill, Q =
          burst, N = đánh thường (N3 = 3 đòn), C = đánh nặng (NC = đánh thường
          rồi đánh nặng), D = lướt, J = nhảy, Eh = giữ E, W60 = chờ 60 khung
          hình. Đổi nhân vật bằng "C2", "Char 2" hoặc "Swap Char 2". Ví dụ: C1 E
          E Q E NC NC; C2 E E; C3 E N C; C4 E
        </Typography>
        <TextField
          label="Rotation"
          multiline
          minRows={3}
          value={rotation}
          onChange={(e) => onRotation(e.target.value)}
          placeholder="C1 E E Q E NC NC  C2 E E  C3 E N C  C4 E"
        />
        <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            type="number"
            label="Thời gian (giây)"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 90)}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="number"
            label="Số lần chạy"
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value) || 1000)}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="number"
            label="Kháng địch (0.1 = 10%)"
            value={resist}
            onChange={(e) => setResist(Number(e.target.value))}
            inputProps={{ step: 0.05 }}
            sx={{ width: 190 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={fullEnergy}
                onChange={(e) => setFullEnergy(e.target.checked)}
              />
            }
            label="Luôn đủ năng lượng (burst dùng được bất cứ lúc nào)"
          />
          <TextField
            size="small"
            type="number"
            label="Năng lượng nền nhận mỗi lần"
            value={energyAmount}
            onChange={(e) => setEnergyAmount(Number(e.target.value) || 1)}
            sx={{ width: 220 }}
          />
          <TextField
            size="small"
            type="number"
            label="Mỗi từ (giây)"
            value={energyMin}
            onChange={(e) => setEnergyMin(Number(e.target.value) || 1)}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            type="number"
            label="đến (giây)"
            value={energyMax}
            onChange={(e) => setEnergyMax(Number(e.target.value) || 1)}
            sx={{ width: 130 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
              />
            }
            label="Lặp rotation đến hết thời gian"
          />
        </Box>
        {warnings.map((w) => (
          <Alert key={w} severity="info">
            {w}
          </Alert>
        ))}
        <TextField
          label="Script gcsim"
          multiline
          minRows={10}
          value={script}
          InputProps={{ readOnly: true, sx: { fontFamily: 'monospace' } }}
        />
        <Box display="flex" gap={1}>
          <Button variant="contained" onClick={copy} disabled={!script}>
            {copied ? 'Đã sao chép' : 'Sao chép script'}
          </Button>
          <Button
            variant="outlined"
            href="https://gcsim.app/simulator"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở gcsim.app
          </Button>
        </Box>
      </CardContent>
    </CardThemed>
  )
}
