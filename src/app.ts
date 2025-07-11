import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { WFP, WFP_CONFIG } from 'overshom-wayforpay';

dotenv.config();

WFP_CONFIG.DEFAULT_PAYMENT_CURRENCY = 'UAH';

const wfp = new WFP({
    MERCHANT_ACCOUNT: process.env.WAYFORPAY_MERCHANT_ACCOUNT || '',
    MERCHANT_SECRET_KEY: process.env.WAYFORPAY_MERCHANT_SECRET_KEY || '',
    MERCHANT_DOMAIN_NAME: process.env.WAYFORPAY_MERCHANT_DOMAIN_NAME || '',
    SERVICE_URL: process.env.WAYFORPAY_SERVICE_URL || '',
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for test page
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        res.json({
            message: 'WayForPay Test App',
            version: '1.0.0',
            endpoints: {
                testInterface: 'GET / (HTML interface)',
                createPayment: 'POST /create-payment',
                webhook: 'POST /webhook/wayforpay',
                testPayment: 'GET /test-payment',
            }
        });
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.post('/create-payment', async (req, res) => {
    try {
        const {
            amount,
            currency = 'UAH',
            productName = 'Test Product',
            customerEmail,
            customerName
        } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount is required and must be greater than 0'
            });
        }

        const orderReference = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        const paymentData = {
            orderReference,
            productName: [productName],
            productCount: [1],
            productPrice: [amount],
            currency,
            ...(customerEmail && { clientEmail: customerEmail }),
            ...(customerName && { clientFirstName: customerName.split(' ')[0], clientLastName: customerName.split(' ')[1] || '' })
        };

        console.log('Creating payment with data:', paymentData);
        
        const response = await wfp.createInvoiceUrl(paymentData);
        
        if (response.error) {
            return res.status(400).json({
                success: false,
                error: response.error,
                message: 'Failed to create payment link'
            });
        }

        const invoice = response.value;
        
        return res.json({
            success: true,
            data: {
                orderReference,
                amount,
                currency,
                productName,
                invoiceUrl: invoice?.invoiceUrl,
                qrCode: invoice?.qrCode,
                reason: (invoice as any)?.reason || 'Ok',
                reasonCode: (invoice as any)?.reasonCode || 1100
            }
        });
    } catch (error) {
        console.error('Error creating payment:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to create payment'
        });
    }
});

app.post('/webhook/wayforpay', (req, res) => {
    try {
        console.log('Received webhook:', JSON.stringify(req.body, null, 2));
        
        const webhookData = wfp.parseAndVerifyIncomingWebhook(req.body);
        
        console.log('Verified webhook data:', webhookData);
        
        if (webhookData.transactionStatus === 'Approved') {
            console.log(`Payment approved for order: ${webhookData.orderReference}`);
            console.log(`Amount: ${webhookData.amount} ${webhookData.currency}`);

        } else if (webhookData.transactionStatus === 'Declined') {
            console.log(`Payment declined for order: ${webhookData.orderReference}`);
            console.log(`Reason: ${webhookData.reasonCode} - ${webhookData.reason}`);
        } else {
            console.log(`Payment status: ${webhookData.transactionStatus} for order: ${webhookData.orderReference}`);
        }
        
        const webhookResponse = wfp.prepareSignedWebhookResponse(webhookData);
        
        res.json(webhookResponse);
    } catch (error) {
        console.error('Error processing webhook:', error);
        
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Invalid webhook data'
        });
    }
});

app.listen(PORT, () => {
    console.log(`WayForPay Test Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

export default app; 