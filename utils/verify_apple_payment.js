
const verifyApplePurchase=async(purchase_token)=>{
    const requestBody={
        'receipt-data': purchase_token,
        'password': process.env.APPLE_SHARED_SECRET_KEY,
        "exclude-old-transactions": true,
    }

    console.log('Request Body for Apple verification:', requestBody)

    console.log("Trying apple production endpoint")
    try {
        let response = await fetch("https://buy.itunes.apple.com/verifyReceipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      let result = await response.json();
      if (result.status === 21007) {
        response = await fetch("https://sandbox.itunes.apple.com/verifyReceipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        result = await response.json();
      }
        console.log("Apple API Response:", result);
        if (result.status === 0) {
        console.log("Purchase is valid and completed (status=0)");
        return { valid: true, purchase: result };
        } else {
        return { valid: false, reason: `Apple status ${result.status}` };
        }

    } catch (error) {
        console.error("Error verifying Apple purchase:", error);
         return {
        valid: false,
        reason: error.message,
        }
        
    }
}

module.exports={verifyApplePurchase}