import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const sourceFile = path.resolve(__dirname, '..', '..', '..', '..', 'VSNCKH', 'src', 'data', 'realScheduleData.js');
const outputFile = path.resolve(workspaceRoot, 'lib', 'schedule-data.ts');

const normalizeCampus = (value) => {
  const normalized = String(value ?? '').trim();
  const map = {
    '36 Xuân La': '36 Xuân La',
    '36 XUÂN LA': '36 Xuân La',
    '36XUÂNLA': '36 Xuân La',
    '371 NHT': '371 Nguyễn Hoàng Tôn',
    '371 NHT ': '371 Nguyễn Hoàng Tôn',
    '371 Nguyễn Hoàng Tôn': '371 Nguyễn Hoàng Tôn',
    '371NHT': '371 Nguyễn Hoàng Tôn',
    '37 Xuân La': '36 Xuân La',
    '77NCT': '77 NCT',
    '77 NCT': '77 NCT',
  };
  return (map[normalized] ?? normalized) || '36 Xuân La';
};

const normalizeShift = (value) => {
  const normalized = String(value ?? '').trim();
  if (normalized === 'Buổi sáng' || normalized === 'Sáng') return 'morning';
  if (normalized === 'Buổi chiều' || normalized === 'Chiều') return 'afternoon';
  if (normalized === 'Buổi tối' || normalized === 'Tối') return 'evening';
  return 'morning';
};

const normalizeDay = (value) => {
  const normalized = String(value ?? '').trim();
  const map = {
    'Thứ 2': 2,
    'Thứ 3': 3,
    'Thứ 4': 4,
    'Thứ 5': 5,
    'Thứ 6': 6,
    'Thứ 7': 7,
  };
  return map[normalized] ?? 2;
};

const { realRooms, realScheduleRows } = await import(pathToFileURL(sourceFile).href);

const rooms = realRooms.map((room) => ({
  id: String(room.maPhong ?? ''),
  name: String(room.maPhong ?? ''),
  capacity: Number(room.sucChua ?? 0),
  building: String(room.toa ?? '36XL - Tòa A'),
  campus: normalizeCampus(room.campus),
  kind: room.hoiTruong ? 'hall' : 'classroom',
}));

const classes = realScheduleRows.map((row, index) => ({
  id: String(row.id ?? `cls-${index + 1}`),
  name: String(row.tenHocPhan ?? ''),
  size: Number(row.siSo ?? 0),
  day: normalizeDay(row.thu),
  shift: normalizeShift(row.ca),
  periods: Number((Number(row.denTiet ?? row.tuTiet ?? 0) - Number(row.tuTiet ?? 0) + 1) || 1),
  startPeriod: Number(row.tuTiet ?? 1),
  endPeriod: Number(row.denTiet ?? row.tuTiet ?? 1),
  cohort: String(row.khoa ?? 'K24'),
  courseCode: String(row.maHocPhan ?? ''),
  major: String(row.nganh ?? ''),
  className: String(row.tenLop ?? ''),
  section: String(row.lopSo ?? '1'),
}));

const content = `import type { ClassInfo, RoomInfo } from "./scheduling";

export const SHEET_ROOMS: RoomInfo[] = ${JSON.stringify(rooms, null, 2)} as RoomInfo[];

export const SHEET_CLASSES: ClassInfo[] = ${JSON.stringify(classes, null, 2)} as ClassInfo[];
`;

fs.writeFileSync(outputFile, content, 'utf8');
console.log(`Synced ${rooms.length} rooms and ${classes.length} classes from Excel data into ${path.relative(workspaceRoot, outputFile)}`);
