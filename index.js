
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configure Environment (Load from parent .env)
dotenv.config({ path: '../.env' });

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Supabase (Admin Context for server-side updates)
// Note: In production, use a SERVICE_ROLE_KEY. For this demo, we'll try to use the ANON KEY 
// but RLS might block updates unless we adjust policies or use the Service Role Key.
// For now, let's assume the user will provide the SERVICE_ROLE_KEY or we adjust RLS.
// Actually, since this is a "backend", it should really use the Service Key to bypass RLS.
// But we don't have it yet. Let's use the provided keys and see.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('M-Pesa Callback Server is Running');
});

// Callback Endpoint
app.post('/api/callback', async (req, res) => {
    console.log('----- M-PESA CALLBACK RECEIVED -----');
    console.log(JSON.stringify(req.body, null, 2));

    const { Body } = req.body;

    if (!Body || !Body.stkCallback) {
        return res.status(400).send('Invalid Callback format');
    }

    const { ResultCode, ResultDesc, CallbackMetadata, MerchantRequestID, CheckoutRequestID } = Body.stkCallback;

    // External Reference was passed as 'order_<timestamp>' or 'test_<timestamp>'
    // But M-Pesa doesn't always return our external reference in the main body easier.
    // It returns MerchantRequestID and CheckoutRequestID.
    // Ideally, we stored CheckoutRequestID in our database when we initiated payment.
    // For this simple implementation, we might need to rely on matching by metadata (if available) or 
    // we need to update our initiate logic to store the CheckoutRequestID returned by the initial API call.

    // Let's assume for this MVP we just log it. 
    // To properly update the order, we need to map M-Pesa's ID to our Order ID.
    // STRATEGY CHECK: The initiate API response gave us `TransactionReference` (which might be CheckoutRequestID).
    // Let's update our frontend to save that ID.

    if (ResultCode === 0) {
        // SUCCESS
        const amountItem = CallbackMetadata.Item.find(item => item.Name === 'Amount');
        const mpesaReceiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
        const phoneItem = CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber');

        const amount = amountItem ? amountItem.Value : 0;
        const mpesaReceipt = mpesaReceiptItem ? mpesaReceiptItem.Value : 'N/A';
        const phone = phoneItem ? phoneItem.Value : 'N/A';

        console.log(`✅ Payment Successful! Receipt: ${mpesaReceipt}, Amount: ${amount}`);

        // Normalize Phone: M-Pesa sends 2547..., we might have stored 07...
        // Let's try to match the last 9 digits to be safe
        const last9Digits = phone.toString().slice(-9);

        // Find the most recent pending order with matching amount AND phone number ending in...
        const { data: orders, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('payment_status', 'pending')
            .eq('total_amount', amount)
            .order('created_at', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error('Error fetching orders:', fetchError);
        } else if (orders && orders.length > 0) {
            // Check phone match manually since we don't have exact format guarantee
            const order = orders.find(o => o.phone_number.includes(last9Digits));

            if (order) {
                console.log(`Found Matching Order: ${order.id}. Updating...`);
                const { error: updateError } = await supabase
                    .from('orders')
                    .update({
                        payment_status: 'paid',
                        mpesa_receipt: mpesaReceipt
                    })
                    .eq('id', order.id);

                if (updateError) console.error('Error updating order:', updateError);
                else console.log('✅ Order updated to PAID!');
            } else {
                console.log('⚠️ Pending order found with matching amount, but phone number did not match.');
                console.log(`Callback Phone: ${phone} (last 9: ${last9Digits})`);
                console.log(`Order Phone: ${orders[0].phone_number}`);
            }
        } else {
            console.log('⚠️ No matching pending order found for this payment.');
        }

    } else {
        console.log(`❌ Payment Failed/Cancelled. Code: ${ResultCode}, Desc: ${ResultDesc}`);
        // Optional: Update most recent pending order to 'failed' if we could match it
    }

    res.json({ result: 'received' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
