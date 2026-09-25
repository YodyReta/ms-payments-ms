import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import Stripe = require('stripe');

@Injectable()
export class PaymentsService {
    private readonly stripe = new Stripe(envs.stripeSecret, {
        apiVersion: '2026-08-26.dahlia',
    });

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
        return session;
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
                const chargeSucceeded = event.data.object as Stripe.Charge;
                break;
            default:
                console.log(`Event ${event.type} not handled`);
        }
        return response.status(200).json({sig});
    }
}
