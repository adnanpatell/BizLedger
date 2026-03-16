import { PrismaClient, TransactionType, PaymentStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/bizledger";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...");

  // Create business
  const business = await prisma.business.upsert({
    where: { id: "default-business" },
    update: {
      name: "Pearl Consultant Inc.",
      taxNumber: "74252 5553 RT0001",
      address: "1440 33 St NW, Edmonton, AB T6T 0V4",
      currency: "CAD",
      province: "AB",
    },
    create: {
      id: "default-business",
      name: "Pearl Consultant Inc.",
      taxNumber: "74252 5553 RT0001",
      address: "1440 33 St NW, Edmonton, AB T6T 0V4",
      currency: "CAD",
      province: "AB",
    },
  });

  console.log("Business created:", business.name);

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { id: "cat-consulting" },
      update: {},
      create: { id: "cat-consulting", name: "Consulting Fee", type: "INCOME", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-client-payment" },
      update: {},
      create: { id: "cat-client-payment", name: "Client Payment", type: "INCOME", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-software" },
      update: {},
      create: { id: "cat-software", name: "Software Subscription", type: "EXPENSE", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-office" },
      update: {},
      create: { id: "cat-office", name: "Office Supplies", type: "EXPENSE", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-professional" },
      update: {},
      create: { id: "cat-professional", name: "Professional Services", type: "BOTH", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-travel" },
      update: {},
      create: { id: "cat-travel", name: "Travel & Transport", type: "EXPENSE", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-utilities" },
      update: {},
      create: { id: "cat-utilities", name: "Utilities", type: "EXPENSE", businessId: business.id },
    }),
    prisma.category.upsert({
      where: { id: "cat-maintenance" },
      update: {},
      create: { id: "cat-maintenance", name: "Maintenance", type: "EXPENSE", businessId: business.id },
    }),
  ]);

  console.log("Categories created:", categories.length);

  // Helper to calc tax
  const tax = (amount: number, rate: number) => {
    const taxAmt = parseFloat((amount * rate / 100).toFixed(2));
    return { gstAmount: taxAmt, totalAmount: parseFloat((amount + taxAmt).toFixed(2)) };
  };

  // Seed transactions Oct 2025 – Mar 2026
  // Pearl Consultant Inc. — Edmonton AB — industrial/oilfield supply consulting
  const transactions = [
    // August 2025 — actual receipts from invoices
    { date: new Date("2025-08-06"), invoiceNumber: "15150", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - Unleaded 48.764L (GST included)", amountExclGst: 54.30, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // September 2025
    { date: new Date("2025-09-15"), invoiceNumber: "2025-9-15", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - 30GB (Rogers network)", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // October 2025
    { date: new Date("2025-10-24"), invoiceNumber: "2025-15", companyName: "Singlesource Project Management Inc", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "3/4\" F9202 Crane Ball Valves x5 — supply & delivery", amountExclGst: 105.20, gstRate: 5, paymentStatus: "PENDING" as PaymentStatus },
    { date: new Date("2025-10-05"), invoiceNumber: "2025-14", companyName: "2607407 Alberta Ltd", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Industrial valve supply and procurement", amountExclGst: 320.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-10-15"), invoiceNumber: "EXP-OCT-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Oct", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-10-20"), invoiceNumber: "EXP-OCT-02", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - site visit", amountExclGst: 61.43, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-10-28"), invoiceNumber: "EXP-OCT-03", companyName: "Staples Business Depot", type: "EXPENSE" as TransactionType, categoryId: "cat-office", description: "Office supplies and printer paper", amountExclGst: 87.62, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // November 2025 — Swift Supply invoice
    { date: new Date("2025-11-17"), invoiceNumber: "3208620", companyName: "Swift Oilfield Supply Inc.", type: "EXPENSE" as TransactionType, categoryId: "cat-professional", description: "Ball valves, SCH80 nipples, FS elbow (1-1/2\" fittings) — Job #1332653", amountExclGst: 216.63, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-11-01"), invoiceNumber: "2025-16", companyName: "Precision Drilling Corp", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Oilfield parts procurement and supply consulting", amountExclGst: 480.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-11-10"), invoiceNumber: "2025-17", companyName: "Bonavista Energy", type: "INCOME" as TransactionType, categoryId: "cat-client-payment", description: "Industrial valve supply — November order", amountExclGst: 650.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-11-15"), invoiceNumber: "EXP-NOV-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Nov", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-11-22"), invoiceNumber: "EXP-NOV-02", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - client site Edson", amountExclGst: 71.43, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-11-28"), invoiceNumber: "EXP-NOV-03", companyName: "ATCO Gas", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Office gas bill - Nov", amountExclGst: 112.38, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // December 2025
    { date: new Date("2025-12-05"), invoiceNumber: "2025-18", companyName: "Paramount Resources Ltd", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Wellsite equipment sourcing and supply", amountExclGst: 1250.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-12-12"), invoiceNumber: "2025-19", companyName: "Pengrowth Energy", type: "INCOME" as TransactionType, categoryId: "cat-client-payment", description: "Pipe fittings and valve supply", amountExclGst: 875.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-12-15"), invoiceNumber: "EXP-DEC-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Dec", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-12-18"), invoiceNumber: "EXP-DEC-02", companyName: "Swift Oilfield Supply Inc.", type: "EXPENSE" as TransactionType, categoryId: "cat-professional", description: "SCH40 pipe and fittings restock", amountExclGst: 389.45, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-12-20"), invoiceNumber: "EXP-DEC-03", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - site visit Nisku", amountExclGst: 54.30, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2025-12-22"), invoiceNumber: "2025-20", companyName: "Singlesource Project Management Inc", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Year-end procurement consulting retainer", amountExclGst: 500.00, gstRate: 5, paymentStatus: "PENDING" as PaymentStatus },
    { date: new Date("2025-12-30"), invoiceNumber: "EXP-DEC-04", companyName: "ATCO Gas", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Office gas bill - Dec", amountExclGst: 145.71, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // January 2026
    { date: new Date("2026-01-08"), invoiceNumber: "2026-01", companyName: "Cenovus Energy", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Oilfield valve and fitting supply — Q1 order", amountExclGst: 1840.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-01-12"), invoiceNumber: "2026-02", companyName: "Bonavista Energy", type: "INCOME" as TransactionType, categoryId: "cat-client-payment", description: "Industrial supply January run", amountExclGst: 620.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-01-15"), invoiceNumber: "EXP-JAN-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Jan", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-01-18"), invoiceNumber: "EXP-JAN-02", companyName: "Swift Oilfield Supply Inc.", type: "EXPENSE" as TransactionType, categoryId: "cat-professional", description: "Ball valves and threaded fittings", amountExclGst: 310.75, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-01-22"), invoiceNumber: "EXP-JAN-03", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - client visit Leduc", amountExclGst: 66.67, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-01-25"), invoiceNumber: "2026-03", companyName: "Pengrowth Energy", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "SCH80 pipe supply and installation advisory", amountExclGst: 975.00, gstRate: 5, paymentStatus: "PENDING" as PaymentStatus },
    { date: new Date("2026-01-28"), invoiceNumber: "EXP-JAN-04", companyName: "ATCO Gas", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Office gas bill - Jan", amountExclGst: 168.57, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // February 2026
    { date: new Date("2026-02-04"), invoiceNumber: "2026-04", companyName: "Paramount Resources Ltd", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Wellsite supply run — Edson area", amountExclGst: 1420.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-02-10"), invoiceNumber: "2026-05", companyName: "Cenovus Energy", type: "INCOME" as TransactionType, categoryId: "cat-client-payment", description: "Q1 procurement retainer Feb", amountExclGst: 800.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-02-15"), invoiceNumber: "EXP-FEB-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Feb", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-02-18"), invoiceNumber: "EXP-FEB-02", companyName: "Swift Oilfield Supply Inc.", type: "EXPENSE" as TransactionType, categoryId: "cat-professional", description: "Elbow fittings and gaskets restock", amountExclGst: 178.20, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-02-22"), invoiceNumber: "EXP-FEB-03", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - site visits", amountExclGst: 54.30, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-02-25"), invoiceNumber: "2026-06", companyName: "Singlesource Project Management Inc", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Crane ball valve supply x10", amountExclGst: 210.40, gstRate: 5, paymentStatus: "PENDING" as PaymentStatus },
    { date: new Date("2026-02-28"), invoiceNumber: "EXP-FEB-04", companyName: "ATCO Gas", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Office gas bill - Feb", amountExclGst: 134.29, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },

    // March 2026
    { date: new Date("2026-03-05"), invoiceNumber: "2026-07", companyName: "Bonavista Energy", type: "INCOME" as TransactionType, categoryId: "cat-client-payment", description: "Industrial fittings supply — March", amountExclGst: 740.00, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-03-08"), invoiceNumber: "2026-08", companyName: "Cenovus Energy", type: "INCOME" as TransactionType, categoryId: "cat-consulting", description: "Procurement consulting Q1 closeout", amountExclGst: 950.00, gstRate: 5, paymentStatus: "PENDING" as PaymentStatus },
    { date: new Date("2026-03-10"), invoiceNumber: "EXP-MAR-01", companyName: "LEMBEI BENEFIT APEGA", type: "EXPENSE" as TransactionType, categoryId: "cat-utilities", description: "Monthly phone plan - Mar", amountExclGst: 42.90, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-03-12"), invoiceNumber: "EXP-MAR-02", companyName: "Swift Oilfield Supply Inc.", type: "EXPENSE" as TransactionType, categoryId: "cat-professional", description: "SA-106B nipples and valves", amountExclGst: 245.80, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
    { date: new Date("2026-03-14"), invoiceNumber: "EXP-MAR-03", companyName: "Costco Sherwood Park #544", type: "EXPENSE" as TransactionType, categoryId: "cat-travel", description: "Fuel - client site Nisku", amountExclGst: 54.30, gstRate: 5, paymentStatus: "PAID" as PaymentStatus },
  ];

  let created = 0;
  for (const tx of transactions) {
    const { gstAmount, totalAmount } = tax(tx.amountExclGst, tx.gstRate);
    await prisma.transaction.create({
      data: {
        ...tx,
        gstAmount,
        totalAmount,
        businessId: business.id,
      },
    });
    created++;
  }

  console.log(`Created ${created} transactions`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
