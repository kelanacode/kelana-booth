import * as childProcess from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * Printing on Windows through the printer's own driver (Canon's SELPHY CP1000
 * driver on the booth laptop). Each call runs a small PowerShell script:
 * System.Drawing for the print itself, so the paper size and the placement are
 * exact, and the spooler cmdlets (Get-Printer / Get-PrintJob) for status. The
 * arguments travel in environment variables, never inside the script text.
 */

const SCRIPT_HEADER = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`;

/**
 * Sets $printerName from PB_PRINTER. A booth set up on Ubuntu stores its CUPS
 * queue name (e.g. SELPHY_CP1000), which Windows names "Canon SELPHY CP1000":
 * when the configured printer is not installed but exactly one SELPHY is, use it.
 */
const RESOLVE_PRINTER = `
$printerName = $env:PB_PRINTER
if (-not (Get-Printer -Name $printerName -ErrorAction SilentlyContinue)) {
  $selphy = @(Get-Printer | Where-Object { $_.Name -match 'SELPHY' })
  if ($selphy.Count -eq 1) { $printerName = $selphy[0].Name }
}
`;

const LIST_SCRIPT = `${SCRIPT_HEADER}
try {
  $printers = @(Get-Printer | ForEach-Object { [pscustomobject]@{ name = [string]$_.Name; jobs = [int]$_.JobCount } })
  ConvertTo-Json -InputObject $printers -Compress
} catch { [Console]::Error.Write($_.Exception.Message); exit 1 }
`;

const STATE_SCRIPT = `${SCRIPT_HEADER}
try {
${RESOLVE_PRINTER}
  $printer = Get-Printer -Name $printerName
  $jobs = @(Get-PrintJob -PrinterName $printerName | ForEach-Object {
    [pscustomobject]@{ id = [int]$_.Id; status = [string]$_.JobStatus; user = [string]$_.UserName; size = [long]$_.Size }
  })
  [pscustomobject]@{ printer = [string]$printer.Name; status = [string]$printer.PrinterStatus; offline = [bool]$printer.WorkOffline; jobs = $jobs } | ConvertTo-Json -Compress -Depth 3
} catch { [Console]::Error.Write($_.Exception.Message); exit 1 }
`;

const CANCEL_SCRIPT = `${SCRIPT_HEADER}
try {
  Remove-PrintJob -PrinterName $env:PB_PRINTER -ID ([int]$env:PB_JOB)
} catch { [Console]::Error.Write($_.Exception.Message); exit 1 }
`;

/**
 * Prints PB_IMAGE (a borderless print sheet) on PB_PRINTER's PB_PAPER paper,
 * portrait, and writes `{ printer, id }` (the printer used and the spooler job
 * id) as JSON. Canon's driver lays the SELPHY page out as many pixels wide as
 * the printer prints (1248 at 317 dpi for the postcard), so the sheet is fitted
 * to the page width and keeps its shape, top-aligned: one sheet pixel is one
 * printed pixel, and the rows that run past the page bottom are off the card
 * and get clipped.
 */
export const WINDOWS_PRINT_SCRIPT = `${SCRIPT_HEADER}
try {
${RESOLVE_PRINTER}
  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Image]::FromFile($env:PB_IMAGE)
  try {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = $env:PB_DOCUMENT
    $doc.PrinterSettings.PrinterName = $printerName
    if (-not $doc.PrinterSettings.IsValid) { throw "Printer '$printerName' was not found." }
    $paper = $doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -like "$($env:PB_PAPER)*" } | Select-Object -First 1
    if (-not $paper) { throw "The printer has no '$($env:PB_PAPER)' paper size." }
    $doc.DefaultPageSettings.PaperSize = $paper
    $doc.DefaultPageSettings.Landscape = $false
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.OriginAtMargins = $false
    $doc.PrinterSettings.Copies = [int16]$env:PB_COPIES
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $script:landscape = $false
    $doc.add_PrintPage({
      param($sender, $page)
      if ($page.PageBounds.Width -ge $page.PageBounds.Height) { $script:landscape = $true; $page.Cancel = $true; return }
      $area = $page.PageSettings.PrintableArea
      $g = $page.Graphics
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($image, (New-Object System.Drawing.RectangleF(0, 0, $area.Width, ($area.Width * $image.Height / $image.Width))))
      $page.HasMorePages = $false
    })
    $doc.Print()
    if ($script:landscape) { throw 'The printer driver gave a landscape page; check its paper settings.' }
  } finally { $image.Dispose() }
  $job = Get-PrintJob -PrinterName $printerName | Where-Object { $_.DocumentName -eq $env:PB_DOCUMENT } | Select-Object -Last 1
  [pscustomobject]@{ printer = $printerName; id = $(if ($job) { [string]$job.Id } else { '' }) } | ConvertTo-Json -Compress
} catch { [Console]::Error.Write($_.Exception.Message); exit 1 }
`;

const scriptFiles = new Map<string, Promise<string>>();

/** Writes `script` to a temp .ps1 named by its content (once per run) and returns the path. */
const scriptFile = (script: string): Promise<string> => {
  const hash = createHash('sha1').update(script).digest('hex').slice(0, 16);
  let file = scriptFiles.get(hash);
  if (!file) {
    file = (async () => {
      const dir = path.join(os.tmpdir(), 'photo-booth-printer');
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, `${hash}.ps1`);
      await fs.writeFile(target, script, 'utf8');
      return target;
    })();
    file.catch(() => scriptFiles.delete(hash));
    scriptFiles.set(hash, file);
  }
  return file;
};

export const runPowerShell = async (
  script: string,
  env: Record<string, string> = {},
  timeoutMs = 20000
): Promise<string> => {
  const file = await scriptFile(script);
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { timeout: timeoutMs, windowsHide: true, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
};

export interface WindowsPrinterSummary {
  name: string;
  jobs: number;
}

export interface WindowsPrintJob {
  id: number;
  status: string;
  user: string;
  size: number;
}

export interface WindowsPrinterState {
  /** The installed printer actually read (see RESOLVE_PRINTER). */
  printer: string;
  status: string;
  offline: boolean;
  jobs: WindowsPrintJob[];
}

export const listWindowsPrinters = async (): Promise<WindowsPrinterSummary[]> =>
  JSON.parse((await runPowerShell(LIST_SCRIPT)) || '[]') as WindowsPrinterSummary[];

export const readWindowsPrinter = async (printer: string): Promise<WindowsPrinterState> =>
  JSON.parse(await runPowerShell(STATE_SCRIPT, { PB_PRINTER: printer })) as WindowsPrinterState;

/**
 * Prints an image file; resolves with the printer used and the spooler job id
 * ('' when the job already left the queue).
 */
export const printOnWindows = async (options: {
  printer: string;
  imagePath: string;
  paper: string;
  copies: number;
  documentName: string;
}): Promise<{ printer: string; id: string }> =>
  JSON.parse(
    await runPowerShell(
      WINDOWS_PRINT_SCRIPT,
      {
        PB_PRINTER: options.printer,
        PB_IMAGE: options.imagePath,
        PB_PAPER: options.paper,
        PB_COPIES: String(options.copies),
        PB_DOCUMENT: options.documentName,
      },
      90000
    )
  ) as { printer: string; id: string };

export const cancelWindowsJob = async (printer: string, id: number): Promise<void> => {
  await runPowerShell(CANCEL_SCRIPT, { PB_PRINTER: printer, PB_JOB: String(id) });
};

/** Job ids carry their printer (`<printer>#<spooler id>`) so a job can be cancelled from its id alone. */
export const encodeWindowsJobId = (printer: string, id: string): string => `${printer}#${id}`;

export const decodeWindowsJobId = (jobId: string): { printer: string; id: string } | null => {
  const at = jobId.lastIndexOf('#');
  return at > 0 ? { printer: jobId.slice(0, at), id: jobId.slice(at + 1) } : null;
};

/** Spooler id used when the job had already left the queue by the time it was looked up. */
export const FINISHED_JOB = 'done';

const STOPPED =
  /error|paused|offline|notavailable|paperjam|paperout|paperproblem|manualfeed|notoner|dooropen|userintervention|outofmemory|pendingdeletion|outputbinfull/i;
const BUSY = /printing|processing|busy|ioactive|warmingup|initialization/i;

/** idle / printing / stopped from Get-Printer's PrinterStatus and the jobs' JobStatus. */
export const windowsPrinterState = (
  status: string,
  jobStatuses: string[]
): 'idle' | 'printing' | 'stopped' => {
  if (STOPPED.test(status)) return 'stopped';
  if (BUSY.test(status) || jobStatuses.some((job) => /printing/i.test(job))) return 'printing';
  return 'idle';
};

/** The CUPS-style printer-state-reasons the booth's attention banner keys off. */
const REASONS: Array<[RegExp, string]> = [
  [/paperout/i, 'media-empty'],
  [/paperproblem|manualfeed/i, 'media-needed'],
  [/paperjam/i, 'media-jam'],
  [/notoner/i, 'marker-supply-empty'],
  [/tonerlow/i, 'marker-supply-low'],
  [/dooropen/i, 'cover-open'],
  [/offline|notavailable/i, 'offline'],
  [/paused/i, 'paused'],
];

export const windowsReasons = (statuses: string[], offline: boolean): string[] => {
  const text = statuses.join(' ');
  const reasons = REASONS.filter(([pattern]) => pattern.test(text)).map(([, token]) => token);
  if (offline && !reasons.includes('offline')) {
    reasons.push('offline');
  }
  return reasons;
};

/**
 * A job's state from its JobStatus. The spooler drops a job once it has
 * printed, so a job that is no longer listed counts as completed.
 */
export const windowsJobState = (
  status: string | undefined
): 'queued' | 'processing' | 'completed' | 'canceled' => {
  if (status === undefined) return 'completed';
  if (/deleting|deleted/i.test(status)) return 'canceled';
  if (/printed|complete/i.test(status)) return 'completed';
  if (/printing/i.test(status)) return 'processing';
  return 'queued';
};
