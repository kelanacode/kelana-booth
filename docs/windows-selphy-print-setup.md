# Canon SELPHY CP1000 on Windows — print setup

The booth can print on Windows through Canon's own SELPHY CP1000 driver. The
Ubuntu setup (CUPS + Gutenprint) is in `ubuntu-selphy-print-setup.md`.

## 1. Set up

1. Install Canon's SELPHY CP1000 driver and connect the printer by USB.
   Windows lists it as **Canon SELPHY CP1000**.
2. In **Admin → Setup → Printer**: turn on **Enable physical printing** and
   pick **Canon SELPHY CP1000** under *Detected printers*. (A booth that still
   has the Ubuntu queue name `SELPHY_CP1000` prints too: when the configured
   printer is not installed but exactly one SELPHY is, Windows printing uses
   that one.)
3. Press **Send Test Print**.

Print release mode (manual batch or automatic) works the same as on Ubuntu.

## 2. Print layout

Every print is laid out by `apps/booth/renderer/src/lib/printSheet.ts`:

| | Size | Pixels at 300 dpi |
| --- | --- | --- |
| Sheet (white) | 100 × 150 mm | 1181 × 1772 |
| Frame box | 97 × 140 mm, 1.5 mm from the left, 4.5 mm from the top | 1146 × 1654 at (18, 53) |

The framed photo is resized into the frame box (a landscape frame is turned a
quarter turn first). Canon's driver enlarges the page about 5.7% for
borderless printing (it lays a 100 mm page out 1248 px wide, the printer's own
print width), and the 100 × 150 mm sheet covers that. Tuned with test prints on
the booth's CP1000 (Nov 2026): the frame fills the card with no white edge,
and about 1 mm of its left and right edges runs past the card.

## 3. Frame size to upload

Design frames at the frame box's size: **97 × 140 mm = 1146 × 1654 px**
(portrait; 1654 × 1146 for landscape). Other shapes are stretched into the box
(a 100 × 148 mm frame is squeezed about 2.5% in height); the frame editor shows
a warning for that.

Keep text, logos, the QR code and thin border lines at least **3 mm** from the
left and right edges and **2 mm** from the top and bottom, and let the
background run all the way to the edges.

## 4. How the app prints

`apps/booth/electron/printer/WindowsPrinter.ts` runs small PowerShell scripts:

- **Print:** System.Drawing selects the driver's `P borderless 4x6" 100x148mm`
  paper, portrait, and draws the sheet fitted to the page width, top-aligned:
  one sheet pixel per printed pixel. This matches how Canon's Easy-PhotoPrint
  printed the same file during tuning.
- **Status and jobs:** `Get-Printer` / `Get-PrintJob`. The spooler drops a job
  once it has printed, so a job that leaves the queue counts as completed.

Arguments go to the scripts in environment variables, never in the script text.
