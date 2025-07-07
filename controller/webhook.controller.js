const crypto = require('crypto')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const Withdrawal = require('../models/Withdrawal')

const handleRazorpayWebhook = async (req, res) => {
  try {
    const receivedSignature = req.headers['x-razorpay-signature']
    const body = JSON.stringify(req.body)

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')

    if (receivedSignature !== expectedSignature) {
      console.error('Invalid webhook signature')
      return res.status(400).json({ error: 'Invalid signature' })
    }

    const event = req.body

    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity)
        break

      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity)
        break

      case 'payout.processed':
        await handlePayoutProcessed(event.payload.payout.entity)
        break

      case 'payout.failed':
        await handlePayoutFailed(event.payload.payout.entity)
        break

      case 'payout.reversed':
        await handlePayoutReversed(event.payload.payout.entity)
        break

      default:
        console.log(`Unhandled webhook event: ${event.event}`)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}

const handlePaymentCaptured = async (payment) => {
  try {
    const transaction = await WalletTransaction.findOne({
      razorpay_payment_id: payment.id,
    })

    if (transaction && transaction.status !== 'completed') {
      transaction.status = 'completed'
      await transaction.save()

      const wallet = await Wallet.findById(transaction.wallet_id)
      if (wallet && wallet.last_transaction_at < transaction.createdAt) {
        const amount = payment.amount / 100
        wallet.balance += amount
        wallet.total_loaded += amount
        wallet.last_transaction_at = new Date()
        await wallet.save()
      }
    }
  } catch (error) {
    console.error('Error handling payment captured:', error)
  }
}

const handlePaymentFailed = async (payment) => {
  try {
    const transaction = await WalletTransaction.findOne({
      razorpay_payment_id: payment.id,
    })

    if (transaction) {
      transaction.status = 'failed'
      await transaction.save()
    }
  } catch (error) {
    console.error('Error handling payment failed:', error)
  }
}

const handlePayoutProcessed = async (payout) => {
  try {
    const withdrawal = await Withdrawal.findOne({
      razorpay_payout_id: payout.id,
    })

    if (withdrawal) {
      withdrawal.status = 'processed'
      withdrawal.processed_at = new Date()
      withdrawal.utr = payout.utr
      await withdrawal.save()

      await WalletTransaction.findOneAndUpdate(
        { 'metadata.withdrawal_id': withdrawal._id },
        { status: 'completed' }
      )
    }
  } catch (error) {
    console.error('Error handling payout processed:', error)
  }
}

const handlePayoutFailed = async (payout) => {
  try {
    const withdrawal = await Withdrawal.findOne({
      razorpay_payout_id: payout.id,
    })

    if (withdrawal) {
      withdrawal.status = 'failed'
      withdrawal.failure_reason = payout.failure_reason || 'Payout failed'
      await withdrawal.save()

      const wallet = await Wallet.findById(withdrawal.wallet_id)
      if (wallet) {
        wallet.balance += withdrawal.amount
        wallet.total_withdrawn -= withdrawal.amount
        await wallet.save()

        const refundTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: withdrawal.creator_id,
          transaction_type: 'credit',
          transaction_category: 'refund',
          amount: withdrawal.amount,
          currency: 'INR',
          description: `Refund for failed withdrawal: ${withdrawal.reference_id}`,
          balance_before: wallet.balance - withdrawal.amount,
          balance_after: wallet.balance,
          status: 'completed',
          metadata: {
            withdrawal_id: withdrawal._id,
            refund_reason: 'withdrawal_failed',
          },
        })

        await refundTransaction.save()
      }
    }
  } catch (error) {
    console.error('Error handling payout failed:', error)
  }
}

const handlePayoutReversed = async (payout) => {
  try {
    await handlePayoutFailed(payout)
  } catch (error) {
    console.error('Error handling payout reversed:', error)
  }
}

module.exports = {
  handleRazorpayWebhook,
}
