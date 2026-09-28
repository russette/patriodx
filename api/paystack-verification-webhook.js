const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PAYSTACK_SECRET_KEY =
    process.env.PAYSTACK_SECRET_KEY;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;


module.exports = async function handler(req, res) {

    // Paystack sends POST requests
    if (req.method !== "POST") {
        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }

    try {

        if (
            !PAYSTACK_SECRET_KEY ||
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            console.error(
                "Verification webhook environment variables are missing."
            );

            return res.status(500).json({
                status: false,
                error: "Server configuration error"
            });
        }


        /*
        =========================================================
        VERIFY PAYSTACK WEBHOOK SIGNATURE
        =========================================================
        */

        const signature =
            req.headers["x-paystack-signature"];

        if (!signature) {

            return res.status(401).json({
                status: false,
                error: "Missing Paystack signature"
            });

        }


        const payload =
            JSON.stringify(req.body);

        const expectedSignature =
            crypto
                .createHmac(
                    "sha512",
                    PAYSTACK_SECRET_KEY
                )
                .update(payload)
                .digest("hex");


        if (
            signature !== expectedSignature
        ) {

            console.error(
                "Invalid Paystack webhook signature."
            );

            return res.status(401).json({
                status: false,
                error: "Invalid signature"
            });

        }


        /*
        =========================================================
        SUPABASE ADMIN CLIENT
        =========================================================
        */

        const supabaseAdmin =
            createClient(
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                }
            );


        const event =
            req.body;


        console.log(
            "PAYSTACK VERIFICATION WEBHOOK:",
            event.event
        );


        /*
        =========================================================
        SUCCESSFUL PAYMENT
        =========================================================
        */

        if (
            event.event === "charge.success"
        ) {

            const payment =
                event.data;


            /*
            Only process transactions created
            by our verification endpoint.
            */

            const metadata =
                payment.metadata || {};


            if (
                metadata.verification !== true
            ) {

                return res.status(200).json({
                    status: true,
                    message: "Event ignored"
                });

            }


            const userId =
                metadata.user_id;

            const verificationPlan =
                metadata.verification_plan;


            if (
                !userId ||
                !verificationPlan
            ) {

                console.error(
                    "Verification metadata missing."
                );

                return res.status(400).json({
                    status: false,
                    error: "Verification metadata missing"
                });

            }


            /*
            Determine the correct duration
            from the server-side plan.
            */

            let months;

            if (
                verificationPlan === "monthly"
            ) {

                months = 1;

            } else if (
                verificationPlan === "yearly"
            ) {

                months = 12;

            } else {

                return res.status(400).json({
                    status: false,
                    error: "Invalid verification plan"
                });

            }


            /*
            Calculate expiry.
            */

            const startedAt =
                new Date();

            const expiresAt =
                new Date(startedAt);


            expiresAt.setMonth(
                expiresAt.getMonth() + months
            );


            /*
            Save verification subscription.
            */

            const {
                error: subscriptionError
            } =
                await supabaseAdmin
                    .from(
                        "verification_subscriptions"
                    )
                    .upsert(
                        {
                            user_id:
                                userId,

                            email:
                                payment.customer?.email ||
                                "",

                            plan:
                                verificationPlan,

                            amount:
                                payment.amount / 100,

                            currency:
                                payment.currency ||
                                "GHS",

                            provider:
                                "paystack",

                            provider_reference:
                                payment.reference,

                            status:
                                "active",

                            started_at:
                                startedAt.toISOString(),

                            expires_at:
                                expiresAt.toISOString(),

                            updated_at:
                                new Date().toISOString()
                        },
                        {
                            onConflict:
                                "provider_reference"
                        }
                    );


            if (
                subscriptionError
            ) {

                console.error(
                    "VERIFICATION SUBSCRIPTION ERROR:",
                    subscriptionError
                );

                return res.status(500).json({
                    status: false,
                    error: "Unable to save verification subscription"
                });

            }


            /*
            Activate the Blue Check.
            */

            const {
                error: profileError
            } =
                await supabaseAdmin
                    .from("profiles")
                    .update({
                        is_verified:
                            true,

                        verification_plan:
                            verificationPlan,

                        verification_expires_at:
                            expiresAt.toISOString(),

                        updated_at:
                            new Date().toISOString()
                    })
                    .eq(
                        "id",
                        userId
                    );


            if (
                profileError
            ) {

                console.error(
                    "PROFILE VERIFICATION ERROR:",
                    profileError
                );

                return res.status(500).json({
                    status: false,
                    error: "Unable to activate verification"
                });

            }


            console.log(
                "PATRIODX VERIFIED:",
                userId,
                verificationPlan
            );

        }


        /*
        =========================================================
        SUBSCRIPTION CREATED
        =========================================================
        */

        if (
            event.event === "subscription.create"
        ) {

            const subscription =
                event.data;


            const userId =
                subscription.metadata?.user_id;


            if (
                userId
            ) {

                await supabaseAdmin
                    .from(
                        "verification_subscriptions"
                    )
                    .update({

                        subscription_code:
                            subscription.subscription_code,

                        customer_code:
                            subscription.customer?.customer_code,

                        updated_at:
                            new Date().toISOString()

                    })
                    .eq(
                        "user_id",
                        userId
                    )
                    .eq(
                        "status",
                        "active"
                    );

            }

        }


        /*
        =========================================================
        PAYMENT FAILED
        =========================================================
        */

        if (
            event.event === "invoice.payment_failed"
        ) {

            console.log(
                "Verification subscription payment failed."
            );

        }


        /*
        =========================================================
        SUBSCRIPTION NOT RENEWING
        =========================================================
        */

        if (
            event.event === "subscription.not_renew"
        ) {

            console.log(
                "Verification subscription will not renew."
            );

        }


        /*
        =========================================================
        SUBSCRIPTION DISABLED
        =========================================================
        */

        if (
            event.event === "subscription.disable"
        ) {

            const subscription =
                event.data;


            const subscriptionCode =
                subscription.subscription_code;


            if (
                subscriptionCode
            ) {

                await supabaseAdmin
                    .from(
                        "verification_subscriptions"
                    )
                    .update({

                        status:
                            "disabled",

                        updated_at:
                            new Date().toISOString()

                    })
                    .eq(
                        "subscription_code",
                        subscriptionCode
                    );


                /*
                Don't immediately remove the badge
                if the customer has already paid through
                their current expiry date.
                */

            }

        }


        /*
        =========================================================
        DONE
        =========================================================
        */

        return res.status(200).json({
            status: true,
            message: "Webhook processed"
        });


    } catch (error) {

        console.error(
            "PAYSTACK VERIFICATION WEBHOOK ERROR:",
            error
        );

        return res.status(500).json({
            status: false,
            error: "Webhook processing failed"
        });

    }

};
