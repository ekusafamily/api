
// Run this script to simulate a successful M-Pesa Callback to your local server
// 1. Make sure your local server is running (node server/index.js)
// 2. Make sure you have a PENDING order in Supabase with amount 5 (or whatever you set below) 
// 3. Run: node server/simulate_callback.js

// Native fetch is available in Node.js 18+

const PORT = 3000;
const URL = `http://localhost:${PORT}/api/callback`;

const simulateCallback = async () => {
    const payload = {
        "Body": {
            "stkCallback": {
                "MerchantRequestID": "29123-312312",
                "CheckoutRequestID": "ws_CO_DMZ_1232123",
                "ResultCode": 0,
                "ResultDesc": "The service request is processed successfully.",
                "CallbackMetadata": {
                    "Item": [
                        { "Name": "Amount", "Value": 5.00 },
                        { "Name": "MpesaReceiptNumber", "Value": "QBH1234567" },
                        { "Name": "Balance", "Value": 0 },
                        { "Name": "TransactionDate", "Value": 20230514120000 },
                        { "Name": "PhoneNumber", "Value": 254702322277 }
                    ]
                }
            }
        }
    };

    try {
        const response = await fetch(URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('Callback sent. Status:', response.status);
    } catch (e) {
        console.error('Error sending callback:', e);
    }
};

simulateCallback();
