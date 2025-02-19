import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import validator from "validator";
import dns from "dns/promises";
import { SMTPConnection } from "smtp-connection";

export async function action({ request }: ActionFunctionArgs) {
  const { emails } = await request.json();

  const validateEmail = async (email: string) => {
    const result: Record<string, any> = { email, isValid: false };
    
    // 1. Syntactic Validity
    result.syntacticValidity = validator.isEmail(email, { rfc_5322: true });
    if (!result.syntacticValidity) return result;

    const domain = email.split("@")[1];
    
    // 2. Domain Validity
    try {
      const mxRecords = await dns.resolveMx(domain);
      result.domainValidity = mxRecords.length > 0;
    } catch {
      result.domainValidity = false;
    }
    if (!result.domainValidity) return result;

    // 3. SMTP Deliverability & 6. Mailbox Availability
    result.smtpDeliverability = await verifySmtp(email, domain);
    result.mailboxAvailable = result.smtpDeliverability;

    // 4. Authentication & Anti-Spam
    result.spf = await checkSPF(domain);
    result.dmarc = await checkDMARC(domain);
    result.authMeasures = result.spf && result.dmarc;

    // 5. User Engagement (Not implementable without data)
    result.userEngagement = "N/A (Requires external data)";

    // Final validation
    result.isValid = result.syntacticValidity &&
      result.domainValidity &&
      result.smtpDeliverability &&
      result.authMeasures;

    return result;
  };

  const results = await Promise.all(
    emails.map((email: string) => validateEmail(email))
  );

  return json({ results });
}

// SMTP Verification
async function verifySmtp(email: string, domain: string): Promise<boolean> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    const connection = new SMTPConnection({
      port: 25,
      host: mxHost,
      timeout: 10000,
    });

    await new Promise((resolve, reject) => {
      connection.on("connect", resolve);
      connection.on("error", reject);
      connection.connect();
    });

    await new Promise((resolve, reject) => {
      connection.ehlo("example.com", (err) => (err ? reject(err) : resolve(true)));
    });

    const fromAccepted = await new Promise((resolve) => {
      connection.command("MAIL FROM:<noreply@example.com>", (err) => {
        resolve(!err);
      });
    });

    if (!fromAccepted) return false;

    const toAccepted = await new Promise((resolve) => {
      connection.command(`RCPT TO:<${email}>`, (err) => {
        resolve(!err);
      });
    });

    connection.quit();
    return !!toAccepted;
  } catch {
    return false;
  }
}

// SPF Check
async function checkSPF(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(domain);
    return records.some(record => record.join("").startsWith("v=spf1"));
  } catch {
    return false;
  }
}

// DMARC Check
async function checkDMARC(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    return records.some(record => record.join("").includes("v=DMARC1"));
  } catch {
    return false;
  }
                         }
