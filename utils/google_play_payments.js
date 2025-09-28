
const { google } = require('googleapis')
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
const packageName = process.env.GOOGLE_PACKAGE_NAME
// Replace escaped newlines in private key
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
})

async function verifyGooglePurchase(productId, purchaseToken) {
  const authClient = await auth.getClient()
  const androidPublisher = google.androidpublisher({
    version: 'v3',
    auth: authClient,
  })

  console.log(`productId: ${productId}, purchaseToken: ${purchaseToken}`)
  try {
    const res = await androidPublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    })

    const purchase = res.data
    console.log('purchase', purchase);

    if (purchase.purchaseState === 0) {
      // Check if already acknowledged
      if (purchase.acknowledgementState === 0) {
        await androidPublisher.purchases.products.acknowledge({
          packageName,
          productId: productId,
          token: purchaseToken,
          requestBody: {},
        })
      }

      return {
        valid: true,
        purchase,
      }
    } else {
      return {
        valid: false,
        reason: 'Purchase not completed',
        purchase,
      }
    }
  } catch (err) {
    console.error('Error verifying purchase:', err.message)
    return {
      valid: false,
      reason: err.message,
    }
  }
}

module.exports = verifyGooglePurchase