import nodemailer from "nodemailer";
import { config } from "../config.js";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

function createTransport() {
  if (config.smtp.host) {
    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true
  });
}

const transporter = createTransport();

export async function sendEmail(input: SendEmailInput) {
  const result = await transporter.sendMail({
    from: input.from ?? config.smtp.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? input.html.replace(/<[^>]*>/g, " ")
  });
  const info = result as {
    messageId?: string;
    response?: string;
    message?: unknown;
  };

  return {
    messageId: info.messageId,
    response: info.response ?? JSON.stringify(info.message ?? {})
  };
}
