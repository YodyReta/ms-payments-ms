import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import Stripe = require('stripe');
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
    private readonly stripe = new Stripe(envs.stripeSecret, {
        apiVersion: '2026-08-26.dahlia',
    });
    private readonly logger = new Logger('PaymentsService');

    constructor(
        @Inject(NATS_SERVICE) private readonly client:ClientProxy
    ){}

    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {

        const {currency, items, orderId} = paymentSessionDto;
        const lineItems = items.map(item => {
            return {
                price_data: {
                    currency,
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100), // Convert to cents
                },
                quantity: item.quantity,
            }
        });

        const session  = await this.stripe.checkout.sessions.create({
            payment_intent_data: {
                metadata: {
                    orderId
                }
            },
            line_items: lineItems,
            mode: 'payment',
            success_url: envs.stripeSuccessUrl,
            cancel_url: envs.stripeCancelUrl,
        });
        //return session;
        return {
            cancelUrl: session.cancel_url,
            successUrl: session.success_url,
            url: session.url
        }
    }

    async stripeWebhook(req:Request, response: Response) {
        const sig = req.headers['stripe-signature'];
        let event: Stripe.Event;
        const endpointSecret = envs.stripeWebhookSecret;
        try {
            event = this.stripe.webhooks.constructEvent(req['rawBody'], sig, endpointSecret);
        } catch (error) {
            return response.status(400).json({ error: 'Invalid signature' });
        }
        console.log({event});
        switch (event.type) {
            case 'charge.succeeded':
                const chargeSucceeded =  event.data.object;
                const payload ={
                    stripePaymentId: chargeSucceeded.id,
                    orderId: chargeSucceeded.metadata.orderId,
                    receiptUrl: chargeSucceeded.receipt_url
                }
                this.logger.log({payload});
                this.client.emit('payment.succeeded', payload);
            break;
            default:
                console.log(`Event ${event.type} not handled`);
        }
        return response.status(200).json({sig});
    }
}
