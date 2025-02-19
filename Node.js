const emailValidator = require('email-validator');
const dns = require('dns');
const { SMTPClient } = require('smtp-client');
const blacklistCheck = require('blacklist-check');
const { promisify } = require('util');
const resolveMx = promisify(dns.resolveMx);

// Function to validate each email
const validateEmail = async (email) => {
  const results = {
    email,
    isValid: false,
    errors: [],
  };

  // 1. Syntactic Validity (RFC 5322 Compliance)
  if (!emailValidator.validate(email)) {
    results.errors.push('Syntactic Invalid');
    return results;
  }

  // 2. Domain Validity
  const domain = email.split('@')[1];
  try {
    const mxRecords = await resolveMx(domain);
    if (mxRecords.length === 0) {
      results.errors.push('Invalid Domain');
      return results;
    }
  } catch (err) {
    results.errors.push('Domain Lookup Failed');
    return results;
  }

  // 3. SMTP Deliverability
  const mxRecords = await resolveMx(domain);
  const smtpClient = new SMTPClient({
    host: mxRecords[0].exchange,
    port: 25,
    tls: true,
  });

  try {
    await smtpClient.connect();
    await smtpClient.greet();
    await smtpClient.mail({ from: 'test@example.com' });
    await smtpClient.rcpt({ to: email });
    await smtpClient.quit();
  } catch (err) {
    results.errors.push('SMTP Deliverability Failed');
    return results;
  }

  // 4. Authentication & Anti-Spam Measures (SPF, DKIM, DMARC)
  try {
    const txtRecords = await promisify(dns.resolveTxt)(domain);
    const spfRecord = txtRecords.some(record => record[0].includes('v=spf1'));
    const dkimRecord = txtRecords.some(record => record[0].includes('v=DKIM1'));
    if (!spfRecord || !dkimRecord) {
      results.errors.push('Authentication Failed (SPF/DKIM)');
    }
  } catch (err) {
    results.errors.push('Anti-Spam Check Failed');
  }

  // 5. Reputation & Blacklist Status
  try {
    const blacklistStatus = await blacklistCheck(email);
    if (blacklistStatus.blacklisted) {
      results.errors.push('Blacklisted');
      return results;
    }
  } catch (err) {
    results.errors.push('Blacklist Check Failed');
  }

  // 6. Mailbox Availability (SMTP validation already checks this, but you can add additional checks here if needed)
  
  // Final result
  results.isValid = results.errors.length === 0;
  return results;
};

// Validate multiple emails
const validateEmails = async (emails) => {
  const emailList = emails.split(',');
  const results = await Promise.all(emailList.map(email => validateEmail(email)));
  return results;
};

// Example usage: Pass a comma-separated list of emails
const emailsToCheck = 'email1@example.com,email2@example.com';
validateEmails(emailsToCheck).then(results => {
  console.log(JSON.stringify(results, null, 2));
}).catch(err => {
  console.error('Error validating emails:', err);
});
