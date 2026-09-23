/** TeacherFlow approval sender. Deploy as yourself; grant send-mail permission only. */
function initializeTeacherFlow() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TEACHERFLOW_GMAIL_SCRIPT_SECRET')) {
    properties.setProperty('TEACHERFLOW_GMAIL_SCRIPT_SECRET', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase());
  }
  console.log('Ready. Copy the secret from Project Settings > Script properties into Render. Set TEACHERFLOW_ALERT_FROM there and here to the Gmail account deploying this script.');
  MailApp.getRemainingDailyQuota(); // Requests send-mail authorization without sending a message.
}

function sendTeacherFlowTest() {
  var from = PropertiesService.getScriptProperties().getProperty('TEACHERFLOW_ALERT_FROM');
  if (!validEmail_(from)) throw new Error('Set TEACHERFLOW_ALERT_FROM in Script properties to the Gmail account deploying this script.');
  MailApp.sendEmail({to: from, subject: 'TeacherFlow email setup test', body: 'Your TeacherFlow Google sender can send email. Next, connect it in Render and check an approval email from TeacherFlow.', name: 'TeacherFlow'});
  console.log('Test submitted to Google. Check the sender account inbox and spam folder.');
}

function doGet() {
  return json_({service: 'TeacherFlow approval sender', version: 1});
}

function doPost(event) {
  var lock;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (typeof raw !== 'string' || raw.length > 12000) return json_({status: 'review', code: 'invalid'});
    var request = JSON.parse(raw);
    var now = Date.now();
    if (!request || typeof request.key !== 'string' || !/^teacherflow-approval\/[a-f0-9-]{36}$/.test(request.key) ||
        !Number.isSafeInteger(request.timestamp) || Math.abs(now - request.timestamp) > 300000 ||
        !Number.isSafeInteger(request.firstAttempt) || request.firstAttempt > now + 300000 || now - request.firstAttempt >= 22 * 3600000 ||
        typeof request.payload !== 'string' || request.payload.length > 7000 || !/^[a-f0-9]{64}$/.test(request.signature || '')) {
      return json_({status: 'review', code: 'invalid'});
    }
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('TEACHERFLOW_GMAIL_SCRIPT_SECRET');
    var from = properties.getProperty('TEACHERFLOW_ALERT_FROM');
    if (!/^[a-f0-9]{64}$/.test(secret || '') || !validEmail_(from)) return json_({status: 'review', code: 'setup'});
    var signed = request.key + '\n' + request.firstAttempt + '\n' + request.timestamp + '\n' + request.payload;
    var expected = hex_(Utilities.computeHmacSha256Signature(signed, secret, Utilities.Charset.UTF_8));
    var difference = 0;
    for (var i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ request.signature.charCodeAt(i);
    if (difference) return json_({status: 'review', code: 'unauthorized'});
    var mail = JSON.parse(request.payload);
    if (!mail || mail.from !== from || !Array.isArray(mail.to) || mail.to.length !== 1 || !validEmail_(mail.to[0]) ||
        mail.subject !== 'Your TeacherFlow beta access is approved' || typeof mail.text !== 'string' || mail.text.length > 6000 ||
        mail.text.indexOf('https://teacherflow-beta.onrender.com/request-access') === -1) return json_({status: 'review', code: 'invalid-mail'});

    lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) { lock = null; return json_({status: 'retry', code: 'busy'}); }
    var recordKey = 'delivery_' + hash_(request.key);
    var fingerprint = hash_(request.payload);
    var saved = properties.getProperty(recordKey);
    if (saved) {
      var record = JSON.parse(saved);
      if (record.fingerprint !== fingerprint) return json_({status: 'review', code: 'conflict'});
      if (record.state === 'accepted') return json_({status: 'accepted', id: recordKey});
      // A prior send may have succeeded even if its receipt was lost. Never send it again automatically.
      return json_({status: 'review', code: 'uncertain'});
    }
    if (MailApp.getRemainingDailyQuota() < 1) return json_({status: 'retry', code: 'quota'});
    // Only fingerprints and status are stored; no recipient addresses, application text or credentials.
    properties.setProperty(recordKey, JSON.stringify({state: 'sending', fingerprint: fingerprint, at: now}));
    try {
      MailApp.sendEmail({to: mail.to[0], subject: mail.subject, body: mail.text, name: 'TeacherFlow'});
      properties.setProperty(recordKey, JSON.stringify({state: 'accepted', fingerprint: fingerprint, at: now}));
      return json_({status: 'accepted', id: recordKey});
    } catch (error) {
      // Retain 'sending' when Google rejects or interrupts an attempt; the owner reviews it.
      return json_({status: 'review', code: 'uncertain'});
    }
  } catch (error) {
    return json_({status: 'review', code: 'setup-or-record-error'});
  } finally {
    if (lock) lock.releaseLock();
  }
}

function validEmail_(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email);
}
function hash_(text) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function hex_(bytes) { return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join(''); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
