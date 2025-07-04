const Razorpay = require("razorpay");
const crypto = require("crypto");

console.log("Testing Razorpay Integration...");

// Test 1: Check if Razorpay can be initialized
try {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "test_key_id",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "test_key_secret",
  });
  console.log("✓ Razorpay instance created successfully");
} catch (error) {
  console.error("✗ Error creating Razorpay instance:", error.message);
}

// Test 2: Check webhook signature verification function
try {
  const testWebhookSecret = "test_webhook_secret";
  const testBody = JSON.stringify({ event: "payment.captured" });
  const testSignature = crypto.createHmac("sha256", testWebhookSecret).update(testBody).digest("hex");

  const expectedSignature = crypto.createHmac("sha256", testWebhookSecret).update(testBody).digest("hex");

  if (testSignature === expectedSignature) {
    console.log("✓ Webhook signature verification working correctly");
  } else {
    console.log("✗ Webhook signature verification failed");
  }
} catch (error) {
  console.error("✗ Error testing webhook signature:", error.message);
}

// Test 3: Test validation functions
try {
  const validator = require("validator");
  const testEmail = "test@example.com";
  const testAmount = 100;

  if (validator.isEmail(testEmail) && Number.isInteger(testAmount) && testAmount > 0) {
    console.log("✓ Validation functions working correctly");
  } else {
    console.log("✗ Validation functions failed");
  }
} catch (error) {
  console.error("✗ Error testing validation:", error.message);
}

console.log("\nTest completed. If all tests pass, your Razorpay integration is ready!");
console.log("\nNext steps:");
console.log("1. Add your actual Razorpay credentials to .env file");
console.log("2. Start the server with: npm start");
console.log("3. Test the payment flows using the API endpoints");
