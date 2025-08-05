const admin = require('../config/Firebase') // from your firebase.js
const { FireBaseNotificationError } = require('./errors')
const sendPushNotification = async (token, title, body, data = {}) => {
  const message = {
    token, // device's FCM token
    notification: {
      title,
      body,
    },
    data, // optional custom payload
    android: {
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
    },
  }

  try {
    const response = await admin.messaging().send(message)
    console.log('Successfully sent message:', response)
    return response
  } catch (error) {
    throw new FireBaseNotificationError(error.message)
  }
}

module.exports = sendPushNotification
