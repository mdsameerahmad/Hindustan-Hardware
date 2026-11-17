import nodemailer, { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static transporter: Transporter | null = null;

  /**
   * Returns a singleton nodemailer transporter configured with environment variables.
   */
  private static getTransporter(): Transporter | null {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!user || !pass) {
      return null;
    }

    if (!this.transporter) {
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = Number(process.env.SMTP_PORT) || 465;
      const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
    }

    return this.transporter;
  }

  /**
   * Sends an email using configured SMTP transporter.
   * If SMTP is not yet configured, logs a helpful warning and resolves gracefully without throwing.
   */
  public static async sendMail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
    const transporter = this.getTransporter();

    if (!transporter) {
      console.warn(
        `[EmailService] SMTP credentials not set (SMTP_USER / SMTP_PASS). Email skipped: "${options.subject}" to ${options.to}`
      );
      return { success: false };
    }

    const fromName = process.env.SMTP_FROM_NAME || 'Hindustan Hardware';
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromAddress = `"${fromName}" <${fromEmail}>`;

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
        html: options.html,
      });

      console.info(`[EmailService] Email sent successfully to ${options.to}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`[EmailService] Failed to send email to ${options.to}:`, error);
      return { success: false };
    }
  }

  /**
   * Helper template to send Order Confirmation email to customer.
   */
  public static async sendOrderConfirmation(
    to: string,
    order: {
      orderNumber: string;
      customerName?: string;
      total: number;
      items: Array<{ name: string; quantity: number; price: number }>;
      shippingAddress?: {
        street?: string;
        city?: string;
        state?: string;
        postalCode?: string;
      };
    }
  ) {
    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${item.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right;">₹${item.price.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; color: #f59e0b;">Hindustan Hardware</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">Order Confirmation</p>
        </div>

        <div style="padding: 24px; background-color: #ffffff; color: #334155;">
          <p style="font-size: 16px;">Hello <strong>${order.customerName || 'Valued Customer'}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.5;">Thank you for your order! We have received your order <strong>#${order.orderNumber}</strong> and our team is preparing it for dispatch.</p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 13px;">Item</th>
                <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; text-align: center; font-size: 13px;">Qty</th>
                <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; text-align: right; font-size: 13px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 12px; font-weight: bold; text-align: right; font-size: 15px;">Total Amount:</td>
                <td style="padding: 12px; font-weight: bold; text-align: right; font-size: 16px; color: #b45309;">₹${order.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          ${
            order.shippingAddress
              ? `
            <div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border-radius: 6px;">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #0f172a;">Shipping Address:</h4>
              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.4;">
                ${order.shippingAddress.street || ''}<br/>
                ${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''} - ${order.shippingAddress.postalCode || ''}
              </p>
            </div>
          `
              : ''
          }

          <p style="margin-top: 28px; font-size: 13px; color: #64748b; text-align: center;">
            If you have any questions or require support, reply to this email or visit our store.
          </p>
        </div>
      </div>
    `;

    return this.sendMail({
      to,
      subject: `Order Confirmed: #${order.orderNumber} - Hindustan Hardware`,
      html,
    });
  }

  /**
   * Helper template to send Order Status Update email (e.g. Dispatched / Delivered).
   */
  public static async sendOrderStatusUpdate(
    to: string,
    orderNumber: string,
    newStatus: string,
    notes?: string
  ) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; color: #f59e0b;">Hindustan Hardware</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">Order Status Update</p>
        </div>

        <div style="padding: 24px; background-color: #ffffff; color: #334155;">
          <p style="font-size: 16px;">Hello,</p>
          <p style="font-size: 14px; line-height: 1.5;">Your order <strong>#${orderNumber}</strong> status has been updated to:</p>
          <div style="margin: 20px 0; text-align: center;">
            <span style="display: inline-block; padding: 8px 18px; font-size: 16px; font-weight: bold; background-color: #fef3c7; color: #92400e; border-radius: 9999px; text-transform: uppercase;">
              ${newStatus}
            </span>
          </div>
          ${notes ? `<p style="font-size: 13px; color: #64748b; background-color: #f8fafc; padding: 12px; border-radius: 6px;">${notes}</p>` : ''}
          <p style="margin-top: 28px; font-size: 13px; color: #64748b; text-align: center;">
            Thank you for shopping with Hindustan Hardware!
          </p>
        </div>
      </div>
    `;

    return this.sendMail({
      to,
      subject: `Update on Order #${orderNumber}: ${newStatus.toUpperCase()}`,
      html,
    });
  }

  /**
   * Helper template to send Password Reset Recovery email.
   */
  public static async sendPasswordResetEmail(to: string, resetLink: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; color: #f59e0b;">Hindustan Hardware</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">Password Reset Request</p>
        </div>

        <div style="padding: 24px; background-color: #ffffff; color: #334155;">
          <p style="font-size: 16px;">Hello,</p>
          <p style="font-size: 14px; line-height: 1.5;">We received a request to reset your password for your Hindustan Hardware account. Click the button below to choose a new password:</p>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${resetLink}" style="background-color: #f59e0b; color: #0f172a; padding: 12px 28px; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.4;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${resetLink}" style="color: #b45309; word-break: break-all;">${resetLink}</a>
          </p>

          <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
      </div>
    `;

    return this.sendMail({
      to,
      subject: 'Reset Your Password - Hindustan Hardware',
      html,
    });
  }
}
