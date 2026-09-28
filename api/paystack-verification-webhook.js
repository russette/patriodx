const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {

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
            return res.status(500).json({
                status: false,
                error: "Server configuration error"
            });
        }

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

        if (signature !== expectedSignature) {
            return res.status(401).json({
                status: false,
                error: "Invalid signature"
            });
        }

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

        const event = req.body;

        console.log(
            "PAYSTACK EVENT:",
            event.event
        );


        /*
        =========================================================
        SUCCESSFUL VERIFICATION PAYMENT
        =========================================================
        */

        if (event.event === "charge.success") {

            const payment = event.data || {};
            const metadata = payment.metadata || {};

            if (metadata.verification !== true) {

                return res.status(200).json({
                    status: true,
                    message: "Event ignored"
                });

            }

            const userId =
                metadata.user_id;

            const verificationPlan =
                metadata.verification_plan;


            if (!userId || !verificationPlan) {

                console.error(
                    "Missing verification metadata:",
                    metadata
                );

                return res.status(400).json({
                    status: false,
                    error: "Verification metadata missing"
                });

            }


            /*
            =====================================================
            DETERMINE PLAN DURATION
            =====================================================
            */

            let months;

            if (verificationPlan === "monthly") {
                months = 1;
            } else if (verificationPlan === "yearly") {
                months = 12;
            } else {
                return res.status(400).json({
                    status: false,
                    error: "Invalid verification plan"
                });
            }


            /*
            =====================================================
            CALCULATE EXPIRY
            =====================================================
            */

            const startedAt = new Date();

            const expiresAt = new Date(startedAt);

            expiresAt.setMonth(
                expiresAt.getMonth() + months
            );


            /*
            =====================================================
            SAVE VERIFICATION SUBSCRIPTION
            =====================================================
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


            if (subscriptionError) {

                console.error(
                    "SUBSCRIPTION SAVE ERROR:",
                    subscriptionError
                );

                return res.status(500).json({
                    status: false,
                    error: "Unable to save verification subscription"
                });

            }


            /*
            =====================================================
            ACTIVATE BLUE CHECK
            =====================================================
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


            if (profileError) {

                console.error(
                    "PROFILE UPDATE ERROR:",
                    profileError
                );

                return res.status(500).json({
                    status: false,
                    error: "Unable to activate verification"
                });

            }


            console.log(
                "BLUE CHECK ACTIVATED:",
                userId,
                verificationPlan
            );

        }


        /*
        =========================================================
        SUBSCRIPTION CREATED
        =========================================================
        */

        if (event.event === "subscription.create") {

    const subscription =
        event.data || {};

    const subscriptionCode =
        subscription.subscription_code;

    const customerCode =
        subscription.customer?.customer_code;

    const email =
        subscription.customer?.email;


    if (
        subscriptionCode &&
        email
    ) {

        const {
            data: verificationSubscription,
            error: lookupError
        } =
            await supabaseAdmin
                .from("verification_subscriptions")
                .select("id")
                .eq("email", email)
                .eq("status", "active")
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                )
                .limit(1)
                .maybeSingle();


        if (lookupError) {

            console.error(
                "SUBSCRIPTION LOOKUP ERROR:",
                lookupError
            );

        } else if (verificationSubscription) {

            const {
                error: updateError
            } =
                await supabaseAdmin
                    .from("verification_subscriptions")
                    .update({

                        subscription_code:
                            subscriptionCode,

                        customer_code:
                            customerCode || null,

                        updated_at:
                            new Date().toISOString()

                    })
                    .eq(
                        "id",
                        verificationSubscription.id
                    );


            if (updateError) {

                console.error(
                    "SUBSCRIPTION LINK ERROR:",
                    updateError
                );

            } else {

                console.log(
                    "VERIFICATION SUBSCRIPTION LINKED:",
                    subscriptionCode
                );

            }

        } else {

            console.log(
                "No matching verification subscription found."
            );

        }

    }

}
        /*
        =========================================================
        RECURRING PAYMENT SUCCESS
        =========================================================
        */

        if (event.event === "invoice.update") {

            console.log(
                "Verification invoice updated."
            );

        }


        /*
        =========================================================
        PAYMENT FAILED
        =========================================================
        */

        if (event.event === "invoice.payment_failed") {

            console.log(
                "Verification payment failed."
            );

        }


        /*
        =========================================================
        SUBSCRIPTION NOT RENEWING
        =========================================================
        */

        if (event.event === "subscription.not_renew") {

            console.log(
                "Verification subscription will not renew."
            );

        }


        /*
        =========================================================
        SUBSCRIPTION DISABLED
        =========================================================
        */

        if (event.event === "subscription.disable") {

            const subscription =
                event.data || {};

            const subscriptionCode =
                subscription.subscription_code;


            if (subscriptionCode) {

                const {
                    error
                } =
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


                if (error) {

                    console.error(
                        "DISABLE UPDATE ERROR:",
                        error
                    );

                }

            }

        }


        return res.status(200).json({
            status: true,
            message: "Webhook processed"
        });


    } catch (error) {

        console.error(
            "PAYSTACK WEBHOOK ERROR:",
            error
        );

        return res.status(500).json({
            status: false,
            error: "Webhook processing failed"
        });

    }

};
