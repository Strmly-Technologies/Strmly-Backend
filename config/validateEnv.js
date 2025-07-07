const validateEnv = () => {
  const requiredVars = [
    'PORT',
    'MONGODB_URI',
    'JWT_SECRET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ]

  const missingVars = requiredVars.filter((varName) => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`)
    })
    console.error('\n Please check .env.example for reference')
    console.error('\n For Razorpay integration, you need:')
    console.error('   - RAZORPAY_KEY_ID: Your Razorpay API key ID')
    console.error('   - RAZORPAY_KEY_SECRET: Your Razorpay API key secret')
    process.exit(1)
  }

  // Validate Razorpay key format
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID
  if (
    !razorpayKeyId.startsWith('rzp_test_') &&
    !razorpayKeyId.startsWith('rzp_live_')
  ) {
    console.error(
      '❌ Invalid RAZORPAY_KEY_ID format. It should start with "rzp_test_" or "rzp_live_"'
    )
    process.exit(1)
  }

  console.log('✅ All environment variables are set')
  console.log(
    `✅ Razorpay integration configured (${razorpayKeyId.startsWith('rzp_test_') ? 'Test' : 'Live'} mode)`
  )
}

module.exports = validateEnv
