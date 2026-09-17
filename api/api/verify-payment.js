import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

    // =========================================================
    // CORS
    // =========================================================

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );


    // =========================================================
    // OPTIONS
    // =========================================================

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }


    // =========================================================
    // POST ONLY
    // =========================================================

    if (req.method !== "POST") {

        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }


    try {

        // =====================================================
        // GET PAYMENT REFERENCE
        // =====================================================

        const {
            reference
        } = req.body || {};


        if (!reference) {

            return res.status(400).json({
                status: false,
                error: "Payment reference is required"
            });
        }


        // =====================================================
        // ENVIRONMENT VARIABLES
        // =====================================================

        const secretKey =
            process.env.PAYSTACK_SECRET_KEY;

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseServiceKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY;


        if (!secretKey) {

            console.error(
                "PAYSTACK_SECRET_KEY is missing"
            );

            return res.status(500).json({
                status: false,
                error:
                    "PAYSTACK_SECRET_KEY is not configured on Vercel"
            });
        }


        if (!supabaseUrl || !supabaseServiceKey) {

            console.error(
                "Supabase server credentials are missing"
            );

            return res.status(500).json({
                status: false,
                error:
                    "Supabase server credentials are not configured on Vercel"
            });
        }


        // =====================================================
        // CREATE SUPABASE SERVER CLIENT
        // =====================================================

        const supabase =
            createClient(
                supabaseUrl,
                supabaseServiceKey
            );


        // =====================================================
        // VERIFY PAYMENT WITH PAYSTACK
        // =====================================================

        const paystackResponse =
            await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${secretKey}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );


        const paystackResult =
            await paystackResponse.json();


        console.log(
            "Paystack verification:",
            {
                httpStatus:
                    paystackResponse.status,

                status:
                    paystackResult.status,

                message:
                    paystackResult.message,

                reference
            }
        );


        // =====================================================
        // PAYSTACK API ERROR
        // =====================================================

        if (
            !paystackResponse.ok ||
            !paystackResult.status
        ) {

            return res.status(
                paystackResponse.status || 400
            ).json({

                status: false,

                error:
                    paystackResult.message ||
                    "Unable to verify payment"

            });
        }


        // =====================================================
        // GET VERIFIED TRANSACTION
        // =====================================================

        const payment =
            paystackResult.data;


        if (!payment) {

            return res.status(400).json({

                status: false,

                error:
                    "Paystack returned no transaction data"

            });
        }


        // =====================================================
        // PAYMENT MUST BE SUCCESSFUL
        // =====================================================

        if (payment.status !== "success") {

            return res.status(400).json({

                status: false,

                error:
                    `Payment has not been completed. Paystack status: ${payment.status}`,

                data: {
                    reference:
                        payment.reference,

                    status:
                        payment.status
                }

            });
        }


        // =====================================================
        // GET CUSTOMER EMAIL
        // =====================================================

        const email =
            payment.customer?.email ||
            payment.email;


        if (!email) {

            return res.status(400).json({

                status: false,

                error:
                    "No customer email was returned by Paystack"

            });
        }


        // =====================================================
        // PAYMENT INFORMATION
        // =====================================================

        const amount =
            Number(payment.amount) / 100;

        const currency =
            payment.currency || "GHS";

        const providerReference =
            payment.reference;


        // =====================================================
        // CHECK IF THIS PAYMENT WAS ALREADY SAVED
        // =====================================================

        const {
            data: existingSubscription,
            error: existingError
        } = await supabase
            .from("subscriptions")
            .select("*")
            .eq(
                "provider_reference",
                providerReference
            )
            .maybeSingle();


        if (existingError) {

            console.error(
                "Subscription lookup error:",
                existingError
            );

            return res.status(500).json({

                status: false,

                error:
                    "Unable to check existing subscription"

            });
        }


        // =====================================================
        // PREVENT DOUBLE ACTIVATION
        // =====================================================

        if (existingSubscription) {

            return res.status(200).json({

                status: true,

                message:
                    "Payment was already verified",

                data: {

                    reference:
                        existingSubscription.provider_reference,

                    email:
                        existingSubscription.email,

                    plan:
                        existingSubscription.plan,

                    status:
                        existingSubscription.status,

                    amount:
                        existingSubscription.amount,

                    currency:
                        existingSubscription.currency,

                    expires_at:
                        existingSubscription.expires_at

                }

            });
        }


        // =====================================================
        // PLAN
        // =====================================================

        let plan = "Pro";

        if (
            payment.metadata &&
            typeof payment.metadata === "object" &&
            payment.metadata.plan
        ) {

            if (
                payment.metadata.plan === "Pro" ||
                payment.metadata.plan === "Business"
            ) {

                plan =
                    payment.metadata.plan;
            }
        }


        // =====================================================
        // SUBSCRIPTION DATES
        // =====================================================

        const startedAt =
            new Date();

        const expiresAt =
            new Date(startedAt);

        // 30-day subscription
        expiresAt.setDate(
            expiresAt.getDate() + 30
        );


        // =====================================================
        // SAVE SUBSCRIPTION
        // =====================================================

        const {
            data: subscription,
            error: insertError
        } = await supabase
            .from("subscriptions")
            .insert({

                email:
                    email,

                plan:
                    plan,

                status:
                    "active",

                provider:
                    "paystack",

                provider_reference:
                    providerReference,

                amount:
                    amount,

                currency:
                    currency,

                started_at:
                    startedAt.toISOString(),

                expires_at:
                    expiresAt.toISOString()

            })
            .select()
            .single();


        // =====================================================
        // DATABASE ERROR
        // =====================================================

        if (insertError) {

            console.error(
                "Subscription insert error:",
                insertError
            );

            return res.status(500).json({

                status: false,

                error:
                    "Payment was verified, but the subscription could not be saved",

                details:
                    insertError.message

            });
        }


        // =====================================================
        // SUCCESS
        // =====================================================

        console.log(
            "Subscription created:",
            {
                id:
                    subscription.id,

                email:
                    subscription.email,

                plan:
                    subscription.plan,

                reference:
                    subscription.provider_reference
            }
        );


        return res.status(200).json({

            status: true,

            message:
                "Payment verified and subscription activated",

            data: {

                id:
                    subscription.id,

                reference:
                    subscription.provider_reference,

                email:
                    subscription.email,

                plan:
                    subscription.plan,

                status:
                    subscription.status,

                amount:
                    subscription.amount,

                currency:
                    subscription.currency,

                started_at:
                    subscription.started_at,

                expires_at:
                    subscription.expires_at

            }

        });


    } catch (error) {

        console.error(
            "Payment verification error:",
            error
        );


        return res.status(500).json({

            status: false,

            error:
                error.message ||
                "Server error while verifying payment"

        });
    }
}
