import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function daysFromNow(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  const email = "demo@duetracker.local";
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Demo Owner",
      passwordHash
    },
    create: {
      email,
      name: "Demo Owner",
      passwordHash
    }
  });

  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      members: {
        some: { userId: user.id }
      },
      name: "Acme Receivables"
    }
  });

  const workspace =
    existingWorkspace ??
    (await prisma.workspace.create({
      data: {
        name: "Acme Receivables",
        legalName: "Acme Advisory LLC",
        currency: "USD",
        senderName: "Acme Billing",
        senderEmail: "billing@acme.test",
        defaultReminderSchedule: [-3, 0, 3, 7, 14],
        members: {
          create: {
            userId: user.id,
            role: "OWNER"
          }
        }
      }
    }));

  await prisma.reminderTemplate.upsert({
    where: {
      id:
        (
          await prisma.reminderTemplate.findFirst({
            where: { workspaceId: workspace.id, channel: "EMAIL" }
          })
        )?.id ?? "seed-template"
    },
    update: {
      name: "Professional reminder",
      subject: "Payment reminder for invoice {invoice_number}",
      body:
        "Hi {client_name},<br><br>This is a friendly reminder that invoice {invoice_number} for {amount} is due on {due_date}. Please let us know if anything is needed on your side.<br><br>Thanks,<br>{workspace_name}"
    },
    create: {
      workspaceId: workspace.id,
      name: "Professional reminder",
      channel: "EMAIL",
      subject: "Payment reminder for invoice {invoice_number}",
      body:
        "Hi {client_name},<br><br>This is a friendly reminder that invoice {invoice_number} for {amount} is due on {due_date}. Please let us know if anything is needed on your side.<br><br>Thanks,<br>{workspace_name}"
    }
  });

  const clients = [];
  for (const client of [
    {
      name: "Mira Shah",
      email: "mira@example.com",
      phone: "+1 555 0110",
      company: "Northstar Labs",
      notes: "Retainer client. Prefers concise reminders."
    },
    {
      name: "Jon Bell",
      email: "jon@example.com",
      phone: "+1 555 0188",
      company: "Bell Construction",
      notes: "Usually pays by bank transfer."
    },
    {
      name: "Priya Nair",
      email: "priya@example.com",
      phone: "+1 555 0144",
      company: "Nair Studio",
      notes: "Quarterly design advisory invoices."
    }
  ]) {
    const existing = await prisma.client.findFirst({
      where: { workspaceId: workspace.id, email: client.email }
    });
    clients.push(
      existing
        ? await prisma.client.update({
            where: { id: existing.id },
            data: client
          })
        : await prisma.client.create({
            data: {
              ...client,
              workspaceId: workspace.id
            }
          })
    );
  }

  const existingInvoice = await prisma.invoice.findFirst({
    where: { workspaceId: workspace.id, invoiceNumber: "INV-2026-0001" }
  });

  if (!existingInvoice) {
    await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: clients[0].id,
        invoiceNumber: "INV-2026-0001",
        amount: new Prisma.Decimal(2400),
        currency: "USD",
        issueDate: daysFromNow(-38),
        dueDate: daysFromNow(-8),
        description: "Monthly product strategy retainer",
        status: "OVERDUE",
        reminderSchedule: [-3, 0, 3, 7, 14],
        lineItems: {
          create: [
            {
              description: "Strategy retainer",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(2400),
              amount: new Prisma.Decimal(2400)
            }
          ]
        },
        reminderLogs: {
          create: [
            {
              workspaceId: workspace.id,
              recipient: clients[0].email,
              subject: "Payment reminder for invoice INV-2026-0001",
              body: "Seed reminder log",
              status: "SENT",
              scheduledOffsetDays: 3
            }
          ]
        }
      }
    });

    const partiallyPaid = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: clients[1].id,
        invoiceNumber: "INV-2026-0002",
        amount: new Prisma.Decimal(5200),
        currency: "USD",
        issueDate: daysFromNow(-20),
        dueDate: daysFromNow(4),
        description: "Site audit and reporting",
        status: "PARTIALLY_PAID",
        reminderSchedule: [],
        lineItems: {
          create: [
            {
              description: "Audit",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(4200),
              amount: new Prisma.Decimal(4200)
            },
            {
              description: "Report package",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(1000),
              amount: new Prisma.Decimal(1000)
            }
          ]
        }
      }
    });

    await prisma.payment.create({
      data: {
        invoiceId: partiallyPaid.id,
        amount: new Prisma.Decimal(1500),
        paidAt: daysFromNow(-2),
        note: "Initial bank transfer"
      }
    });

    await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: clients[2].id,
        invoiceNumber: "INV-2026-0003",
        amount: new Prisma.Decimal(1800),
        currency: "USD",
        issueDate: daysFromNow(-3),
        dueDate: daysFromNow(10),
        description: "Brand review sprint",
        status: "UNPAID",
        reminderSchedule: [-3, 0, 7],
        lineItems: {
          create: [
            {
              description: "Brand review sprint",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(1800),
              amount: new Prisma.Decimal(1800)
            }
          ]
        }
      }
    });
  }

  const existingActivities = await prisma.activity.count({
    where: { workspaceId: workspace.id }
  });
  if (existingActivities === 0) {
    await prisma.activity.createMany({
      data: [
        {
          workspaceId: workspace.id,
          userId: user.id,
          type: "WORKSPACE_CREATED",
          title: "Acme Receivables ready"
        },
        {
          workspaceId: workspace.id,
          userId: user.id,
          type: "CLIENT_CREATED",
          title: "Demo clients loaded"
        },
        {
          workspaceId: workspace.id,
          userId: user.id,
          type: "INVOICE_CREATED",
          title: "Demo invoices loaded"
        }
      ]
    });
  }

  console.log("Seed complete");
  console.log(`Demo login: ${email} / DemoPass123!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
