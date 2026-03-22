import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
] as const;

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetRange(months: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return { from, to };
}

function getActivePreset(from: Date, to: Date): number | null {
  const now = new Date();
  const dayDiff = Math.abs(to.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (dayDiff > 2) return null;

  for (const preset of PRESETS) {
    const expected = getPresetRange(preset.months);
    const fromDiff = Math.abs(from.getTime() - expected.from.getTime()) / (1000 * 60 * 60 * 24);
    if (fromDiff < 2) return preset.months;
  }
  return null;
}

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
  compact?: boolean;
}

export default function DateRangePicker({ from, to, onChange, compact }: DateRangePickerProps) {
  const activePreset = getActivePreset(from, to);

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) return;
    onChange({ from, to, [field]: date });
  };

  const inputClass = compact
    ? 'h-8 w-full sm:w-[130px] text-xs'
    : 'w-full sm:w-[150px]';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex rounded-lg border p-0.5 gap-0.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.months}
            variant={activePreset === preset.months ? 'default' : 'ghost'}
            size="xs"
            onClick={() => onChange(getPresetRange(preset.months))}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-[200px] sm:flex-none">
        <Input
          type="date"
          className={inputClass}
          value={formatDateInput(from)}
          onChange={(e) => handleDateChange('from', e.target.value)}
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">-</span>
        <Input
          type="date"
          className={inputClass}
          value={formatDateInput(to)}
          onChange={(e) => handleDateChange('to', e.target.value)}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
