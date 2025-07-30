const admin = require('firebase-admin')
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

// Fix the private key formatting
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

module.exports = admin
