const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const XLSX = require('xlsx');
const { Document, Packer, Paragraph, TextRun } = require('docx');

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'test-fixtures');
  fs.mkdirSync(outDir, { recursive: true });

  async function makePdf(fileName, lines) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(fileName, {
      x: 50,
      y: 780,
      size: 20,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: 50,
        y: 730 - index * 28,
        size: 14,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    });
    const bytes = await pdf.save();
    fs.writeFileSync(path.join(outDir, fileName), bytes);
  }

  await makePdf('sample-a.pdf', ['Hello from LocalPDF test fixture.', 'Line 2 for merge and split testing.']);
  await makePdf('sample-b.pdf', ['Second PDF fixture.', 'Used for merge, rotate, protect, and organize.']);

  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAASwAAADICAIAAADdvUsCAAADpElEQVR4nO3UMQ0AIADAMMC/5yFjRxMFvXp2ZgeA1tkOAPgZQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEhBARQkQIESFEPgCJCwKSKpJpdQAAAABJRU5ErkJggg==';
  fs.writeFileSync(path.join(outDir, 'sample.png'), Buffer.from(pngBase64, 'base64'));

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: 'LocalPDF DOCX fixture', bold: true }),
            ],
          }),
          new Paragraph('This file validates the Word to PDF flow.'),
          new Paragraph('Second paragraph to detect conversion quality issues.'),
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(outDir, 'sample.docx'), await Packer.toBuffer(doc));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Score', 'Status'],
    ['Asha', 91, 'Pass'],
    ['Ravi', 84, 'Pass'],
    ['Mina', 72, 'Pass'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Results');
  XLSX.writeFile(workbook, path.join(outDir, 'sample.xlsx'));

  fs.writeFileSync(
    path.join(outDir, 'sample.txt'),
    'LocalPDF text fixture.\nThis supports the text-to-PDF flow.\n'
  );

  console.log(`Fixtures written to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
