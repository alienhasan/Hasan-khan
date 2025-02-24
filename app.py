from flask import Flask, request, jsonify
   import smtplib

   app = Flask(__name__)

   @app.route('/test-email', methods=['POST'])
   def test_email():
       email = request.form.get('email')
       domain = email.split('@')[1]

       try:
           # Find MX record for the domain
           mx_records = smtplib.SMTP().getmx(domain)
           if not mx_records:
               return jsonify({"status": "error", "message": "No MX records found"})

           # Connect to the SMTP server
           smtp_server = mx_records[0][1]
           smtp = smtplib.SMTP(smtp_server, timeout=10)
           smtp.helo()
           smtp.mail('test@yourdomain.com')
           code, _ = smtp.rcpt(email)
           smtp.quit()

           if code == 250:
               return jsonify({"status": "success", "message": "Mailbox exists"})
           else:
               return jsonify({"status": "error", "message": "Mailbox does not exist"})
       except Exception as e:
           return jsonify({"status": "error", "message": str(e)})

   if __name__ == '__main__':
       app.run(debug=True)
