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
  console.log('=== verifyGooglePurchase START ===')
  console.log('Input Params:', { productId, purchaseToken, packageName })

  const authClient = await auth.getClient()
  console.log('Auth client created successfully')

  const androidPublisher = google.androidpublisher({
    version: 'v3',
    auth: authClient,
  })
  console.log('Android Publisher API client initialized')

  try {
    console.log('Calling purchases.products.get...')
    const res = await androidPublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    })

    const purchase = res.data
    console.log('Google API Response (purchase):', purchase)

    if (purchase.purchaseState === 0) {
      console.log('Purchase is completed (purchaseState=0)')

      // Check acknowledgement state
      if (purchase.acknowledgementState === 0) {
        console.log('Purchase not acknowledged yet. Acknowledging now...')
        await androidPublisher.purchases.products.acknowledge({
          packageName,
          productId: productId,
          token: purchaseToken,
          requestBody: {},
        })
        console.log('Purchase acknowledged successfully')
      } else {
        console.log('Purchase already acknowledged')
      }

      console.log('=== verifyGooglePurchase END (valid purchase) ===')
      return {
        valid: true,
        purchase,
      }
    } else {
      console.log('Purchase not completed. purchaseState:', purchase.purchaseState)
      console.log('=== verifyGooglePurchase END (invalid purchase) ===')
      return {
        valid: false,
        reason: 'Purchase not completed',
        purchase,
      }
    }
  } catch (err) {
    console.error('Error verifying purchase:', err.message)
    console.error('Full error object:', err)
    console.log('=== verifyGooglePurchase END (error) ===')
    return {
      valid: false,
      reason: err.message,
    }
  }
}

module.exports = verifyGooglePurchase
