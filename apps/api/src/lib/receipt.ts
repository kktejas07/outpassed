import PDFDocument from "pdfkit";

export type ReceiptData = {
  college: { name: string; address: string };
  receiptNo: number;
  paidAt: Date;
  student: { name: string; rollNo: string | null; hostel: string | null };
  fee: { title: string; category: string; amountPaise: number };
  payment: { amountPaise: number; method: "ONLINE" | "PROOF" | "OFFICE"; reference: string | null };
  paidSoFarPaise: number;
};

/** "INR 45,000.00": the PDF's built-in fonts have no ₹ sign. */
export const inr = (paise: number) => `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const receiptNumber = (n: number) => `OP-${String(n).padStart(6, "0")}`;

const METHOD = { ONLINE: "Online (Razorpay)", PROOF: "Bank / UPI transfer", OFFICE: "Paid at the office" } as const;

/** A one-page A5 fee receipt. */
export function receiptPdf(r: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: `Fee receipt ${receiptNumber(r.receiptNo)}`, Author: r.college.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const indigo = "#4338CA";
    const ink = "#12113A";
    const muted = "#5B5F7A";
    const W = doc.page.width - 72;

    doc.rect(0, 0, doc.page.width, 8).fill(indigo);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(15).text(r.college.name, 36, 30, { width: W });
    if (r.college.address) doc.font("Helvetica").fontSize(9).fillColor(muted).text(r.college.address, { width: W });
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(indigo).text("Fee receipt");
    doc.font("Helvetica").fontSize(10).fillColor(muted)
      .text(`Receipt ${receiptNumber(r.receiptNo)}  ·  ${r.paidAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`);
    doc.moveDown(1);

    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(muted).text(label, 36, y, { width: W * 0.42 });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10.5).fillColor(ink).text(value, 36 + W * 0.42, y, { width: W * 0.58, align: "right" });
      doc.moveDown(0.55);
      doc.moveTo(36, doc.y).lineTo(36 + W, doc.y).lineWidth(0.5).strokeColor("#E4E6F0").stroke();
      doc.moveDown(0.55);
    };

    row("Student", r.student.name);
    if (r.student.rollNo) row("Roll number", r.student.rollNo);
    if (r.student.hostel) row("Hostel", r.student.hostel);
    row("For", r.fee.title);
    row("Paid by", METHOD[r.payment.method]);
    if (r.payment.reference) row("Reference", r.payment.reference);
    row("Amount received", inr(r.payment.amountPaise), true);
    row("Total fee", inr(r.fee.amountPaise));
    row("Paid so far", inr(r.paidSoFarPaise));
    const left = Math.max(0, r.fee.amountPaise - r.paidSoFarPaise);
    row("Balance", left ? inr(left) : "Nil, fully paid", !left);

    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(8.5).fillColor(muted)
      .text("This is a computer-generated receipt and needs no signature. Issued through Outpass on behalf of the college.", 36, doc.y, { width: W });
    doc.end();
  });
}
