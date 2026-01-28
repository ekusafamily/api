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
// Callback Endpoint
app.post('/api/callback', async (req, res) => {
    console.log('----- M-PESA CALLBACK RECEIVED -----');
    console.log(JSON.stringify(req.body, null, 2));

    const { Body, response } = req.body;

    // 1. Handle Lipia Online Format (Priority)
    if (response && response.Status === 'Success') {
        const { MpesaReceiptNumber, Amount, ExternalReference, Phone } = response;
        console.log(`✅ Lipia Payment Success! Receipt: ${MpesaReceiptNumber}, Order ID: ${ExternalReference}`);

        // Update Order by ID (Direct Match!)
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                payment_status: 'paid',
                mpesa_receipt: MpesaReceiptNumber,
                phone_number: Phone
            })
            .eq('id', ExternalReference);

        if (updateError) console.error('Error updating order:', updateError);
        else console.log('✅ Order updated to PAID!');

        return res.json({ result: 'success' });
    }

    // 2. Handle Standard Safaricom Format (Fallback)
    if (Body && Body.stkCallback) {
        const { ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

        if (ResultCode === 0) {
            const amountItem = CallbackMetadata.Item.find(item => item.Name === 'Amount');
            const mpesaReceiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
            const phoneItem = CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber');

            const amount = amountItem ? amountItem.Value : 0;
            const mpesaReceipt = mpesaReceiptItem ? mpesaReceiptItem.Value : 'N/A';
            const phone = phoneItem ? phoneItem.Value : 'N/A';

            console.log(`✅ Standard Payment Success! Receipt: ${mpesaReceipt}, Amount: ${amount}`);

            // Normalization & Fuzzy Match Logic
            const last9Digits = phone.toString().slice(-9);

            const { data: orders } = await supabase
                .from('orders')
                .select('*')
                .eq('payment_status', 'pending')
                .eq('total_amount', amount)
                .order('created_at', { ascending: false })
                .limit(1);

            if (orders && orders.length > 0) {
                const order = orders.find(o => o.phone_number.includes(last9Digits));
                if (order) {
                    await supabase.from('orders').update({ payment_status: 'paid', mpesa_receipt: mpesaReceipt }).eq('id', order.id);
                    console.log('✅ Order updated to PAID (Fuzzy Match)!');
                }
            }
        } else {
            console.log(`❌ Payment Failed. Code: ${ResultCode}`);
        }
        return res.json({ result: 'received' });
    }

    console.log('⚠️ Unknown Callback Format');
    res.status(400).send('Unknown Format');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
